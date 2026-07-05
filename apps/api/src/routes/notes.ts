import { FastifyInstance } from 'fastify';
import { NoteType, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { z } from 'zod';
import { env } from '../config.js';
import { getUserId } from '../middleware/auth.js';
import { accessibleNoteWhere } from '../services/note-access-service.js';
import {
  hasNativeNoteSnapshotChanged,
  normalizeNativeNoteContent,
  normalizeStringArray
} from '../services/note-content-service.js';
import {
  cleanupDictationWithOpenRouter,
  transcribeWithOpenRouter
} from '../services/notes-transcription-service.js';

const tagsSchema = z
  .array(z.string().min(1).max(32))
  .max(24)
  .transform((tags) =>
    Array.from(
      new Set(
        tags
          .map((tag) => tag.trim().toLowerCase())
          .filter((tag) => tag.length > 0)
      )
    )
  );

const nativeContentSchema = {
  contentBlocks: z.unknown().optional().nullable(),
  contentText: z.string().max(500000).optional().nullable(),
  contentHtml: z.string().max(500000).optional().nullable(),
  contentVersion: z.number().int().min(1).max(20).optional()
};

const folderCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().trim().max(32).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(100000).optional()
});

const folderUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    color: z.string().trim().max(32).optional().nullable(),
    parentId: z.string().uuid().optional().nullable(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    archived: z.boolean().optional()
  })
  .refine(
    (payload) =>
      payload.name !== undefined ||
      payload.color !== undefined ||
      payload.parentId !== undefined ||
      payload.sortOrder !== undefined ||
      payload.archived !== undefined,
    {
      message: 'Informe ao menos um campo para atualizar.'
    }
  );

const noteCreateSchema = z.object({
  title: z.string().min(1).max(180),
  content: z.string().max(500000).optional().nullable(),
  ...nativeContentSchema,
  type: z.nativeEnum(NoteType).optional(),
  tags: tagsSchema.optional(),
  pinned: z.boolean().optional(),
  folderId: z.string().uuid().optional().nullable(),
  workspaceId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable()
});

const noteUpdateSchema = z
  .object({
    title: z.string().min(1).max(180).optional(),
    content: z.string().max(500000).optional().nullable(),
    ...nativeContentSchema,
    type: z.nativeEnum(NoteType).optional(),
    tags: tagsSchema.optional(),
    pinned: z.boolean().optional(),
    folderId: z.string().uuid().optional().nullable(),
    workspaceId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    taskId: z.string().uuid().optional().nullable(),
    archived: z.boolean().optional(),
    saveSource: z.enum(['manual', 'autosave', 'restore', 'system']).optional()
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.content !== undefined ||
      payload.contentBlocks !== undefined ||
      payload.contentText !== undefined ||
      payload.contentHtml !== undefined ||
      payload.contentVersion !== undefined ||
      payload.type !== undefined ||
      payload.tags !== undefined ||
      payload.pinned !== undefined ||
      payload.folderId !== undefined ||
      payload.workspaceId !== undefined ||
      payload.projectId !== undefined ||
      payload.taskId !== undefined ||
      payload.archived !== undefined,
    {
      message: 'Informe ao menos um campo para atualizar.'
    }
  );

const noteAudioTranscriptionSchema = z.object({
  audioBase64: z.string().min(32).max(25_000_000),
  mimeType: z.string().trim().min(3).max(120).optional(),
  language: z.string().trim().min(2).max(16).optional(),
  mode: z.enum(['transcript', 'note']).optional(),
  context: z.string().trim().max(280).optional().nullable()
});

const noteDictationCleanupSchema = z.object({
  text: z.string().trim().min(1).max(50000)
});

const noteDictationSessionSchema = z.object({
  noteId: z.string().uuid().optional().nullable(),
  language: z.string().trim().min(2).max(16).optional(),
  encoding: z.enum(['linear16']).optional(),
  sampleRate: z.coerce.number().int().min(8000).max(96000).optional()
});

const noteRevisionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(120).optional()
});

const noteRevisionRestoreParamsSchema = z.object({
  noteId: z.string().uuid(),
  revisionId: z.string().uuid()
});

const noteRevisionCreateSchema = z.object({
  source: z.string().trim().min(1).max(60).optional()
});

const MAX_NOTES_AUDIO_BYTES = 10 * 1024 * 1024;
const NOTE_BLOCKS_TOO_LARGE_ERROR = 'note_content_blocks_too_large';
const DICTATION_SESSION_TTL_MS = 2 * 60 * 1000;

const dictationSessions = new Map<
  string,
  {
    clerkUserId: string;
    noteId: string | null;
    language: string;
    encoding?: 'linear16';
    sampleRate?: number;
    expiresAt: number;
  }
>();

const NOTE_RELATION_INCLUDE = {
  folder: {
    select: {
      id: true,
      name: true,
      parentId: true
    }
  },
  workspace: true,
  project: true,
  task: {
    select: {
      id: true,
      title: true,
      status: true
    }
  }
} as const;

const NOTE_REVISION_CORE_SELECT = {
  id: true,
  title: true,
  content: true,
  contentBlocks: true,
  contentText: true,
  contentHtml: true,
  contentVersion: true,
  type: true,
  tags: true,
  pinned: true,
  folderId: true,
  workspaceId: true,
  projectId: true,
  taskId: true
} as const;

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readNumber(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return value;
}

function readStringArray(...values: unknown[]) {
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }

    const rows = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);

    if (rows.length > 0) {
      return Array.from(new Set(rows)).slice(0, 15);
    }
  }

  return [];
}

function unwrapWebhookPayload(payload: unknown) {
  let candidate: unknown = payload;

  if (Array.isArray(candidate)) {
    candidate = candidate[0] ?? {};
  }

  if (candidate && typeof candidate === 'object' && 'json' in (candidate as Record<string, unknown>)) {
    const jsonValue = (candidate as Record<string, unknown>).json;
    if (jsonValue && typeof jsonValue === 'object') {
      candidate = jsonValue;
    }
  }

  return candidate && typeof candidate === 'object' ? (candidate as Record<string, any>) : {};
}

function normalizeTranscriptionWebhookResponse(payload: unknown) {
  const root = unwrapWebhookPayload(payload);
  const body = (root.body ?? {}) as Record<string, any>;
  const data = (root.data ?? body.data ?? {}) as Record<string, any>;
  const note = (
    root.note ??
    root.structuredNote ??
    body.note ??
    body.structuredNote ??
    data.note ??
    data.structuredNote ??
    {}
  ) as Record<string, any>;

  const transcript = readString(
    root.transcript,
    root.text,
    root.output,
    root.message,
    body.transcript,
    body.text,
    body.output,
    body.message,
    data.transcript,
    data.text,
    data.output,
    data.message,
    note.transcript,
    note.text
  );

  const titleSuggestion = readString(
    root.titleSuggestion,
    body.titleSuggestion,
    data.titleSuggestion,
    note.titleSuggestion,
    note.title
  );
  const structuredContent = readString(
    root.structuredContent,
    body.structuredContent,
    data.structuredContent,
    note.structuredContent,
    note.content,
    root.content,
    body.content,
    data.content
  );
  const tags = readStringArray(root.tags, body.tags, data.tags, note.tags);
  const confidence =
    readNumber(root.confidence) ??
    readNumber(body.confidence) ??
    readNumber(data.confidence) ??
    readNumber(note.confidence);
  const durationMs =
    readNumber(root.durationMs) ??
    readNumber(body.durationMs) ??
    readNumber(data.durationMs) ??
    readNumber(root.processingMs) ??
    readNumber(body.processingMs) ??
    readNumber(data.processingMs);

  return {
    transcript,
    titleSuggestion,
    structuredContent,
    tags,
    confidence,
    durationMs
  };
}

async function createNoteRevisionSnapshot(
  db: any,
  note: {
    id: string;
    title: string;
    content: string | null;
    contentBlocks: unknown | null;
    contentText: string | null;
    contentHtml: string | null;
    contentVersion: number;
    type: NoteType;
    tags: string[];
    pinned: boolean;
    folderId: string | null;
    workspaceId: string | null;
    projectId: string | null;
    taskId: string | null;
  },
  source: string
) {
  await db.noteRevision.create({
    data: {
      noteId: note.id,
      title: note.title,
      content: note.content,
      contentBlocks: note.contentBlocks as any,
      contentText: note.contentText,
      contentHtml: note.contentHtml,
      contentVersion: note.contentVersion,
      type: note.type,
      tags: note.tags,
      pinned: note.pinned,
      folderId: note.folderId,
      workspaceId: note.workspaceId,
      projectId: note.projectId,
      taskId: note.taskId,
      source
    }
  });
}

function isNativeContentPayloadError(error: unknown) {
  return error instanceof Error && error.message === NOTE_BLOCKS_TOO_LARGE_ERROR;
}

async function validateNoteRelations(
  prisma: PrismaClient,
  clerkUserId: string,
  input: {
    folderId?: string | null;
    workspaceId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
  }
) {
  const folderId = input.folderId ?? null;
  const workspaceId = input.workspaceId ?? null;
  const projectId = input.projectId ?? null;
  const taskId = input.taskId ?? null;

  const [folder, workspace, project, task] = await Promise.all([
    folderId
      ? prisma.noteFolder.findFirst({
          where: {
            id: folderId,
            clerkUserId,
            archivedAt: null
          },
          select: { id: true }
        })
      : Promise.resolve(null),
    workspaceId
      ? prisma.workspace.findFirst({
          where: {
            id: workspaceId,
            clerkUserId
          },
          select: { id: true }
        })
      : Promise.resolve(null),
    projectId
      ? prisma.project.findFirst({
          where: {
            id: projectId,
            workspace: { clerkUserId }
          },
          select: {
            id: true,
            workspaceId: true
          }
        })
      : Promise.resolve(null),
    taskId
      ? prisma.task.findFirst({
          where: {
            id: taskId,
            workspace: { clerkUserId }
          },
          select: {
            id: true,
            workspaceId: true,
            projectId: true
          }
        })
      : Promise.resolve(null)
  ]);

  if (folderId && !folder) {
    return 'folder_not_found';
  }
  if (workspaceId && !workspace) {
    return 'workspace_not_found';
  }
  if (projectId && !project) {
    return 'project_not_found';
  }
  if (taskId && !task) {
    return 'task_not_found';
  }
  if (workspaceId && project && project.workspaceId !== workspaceId) {
    return 'project_workspace_mismatch';
  }
  if (workspaceId && task && task.workspaceId !== workspaceId) {
    return 'task_workspace_mismatch';
  }
  if (projectId && task && task.projectId !== projectId) {
    return 'task_project_mismatch';
  }

  return null;
}

function cleanupExpiredDictationSessions() {
  const now = Date.now();
  for (const [sessionId, session] of dictationSessions.entries()) {
    if (session.expiresAt <= now) {
      dictationSessions.delete(sessionId);
    }
  }
}

function createDictationSession(input: {
  clerkUserId: string;
  noteId?: string | null;
  language?: string | null;
  encoding?: 'linear16';
  sampleRate?: number | null;
}) {
  cleanupExpiredDictationSessions();

  const sessionId = randomUUID();
  const expiresAt = Date.now() + DICTATION_SESSION_TTL_MS;
  dictationSessions.set(sessionId, {
    clerkUserId: input.clerkUserId,
    noteId: input.noteId ?? null,
    language: input.language?.trim() || 'pt-BR',
    encoding: input.encoding,
    sampleRate: input.sampleRate ?? undefined,
    expiresAt
  });

  return {
    sessionId,
    expiresAt: new Date(expiresAt).toISOString(),
    wsPath: '/notes/dictation-stream',
    wsProtocols: ['operis-dictation-session', sessionId]
  };
}

function extractDictationSessionId(request: { headers: Record<string, string | string[] | undefined> }) {
  const rawProtocol = request.headers['sec-websocket-protocol'];
  const protocols = (Array.isArray(rawProtocol) ? rawProtocol.join(',') : rawProtocol ?? '')
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean);
  const markerIndex = protocols.indexOf('operis-dictation-session');
  const sessionId = markerIndex >= 0 ? protocols[markerIndex + 1] : undefined;
  return sessionId && z.string().uuid().safeParse(sessionId).success ? sessionId : null;
}

function consumeDictationSession(sessionId: string | null) {
  if (!sessionId) {
    return null;
  }

  cleanupExpiredDictationSessions();
  const session = dictationSessions.get(sessionId);
  dictationSessions.delete(sessionId);

  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  return session;
}

function createDeepgramLiveUrl(session: {
  language: string;
  encoding?: 'linear16';
  sampleRate?: number;
}) {
  const params = new URLSearchParams({
    model: env.DEEPGRAM_MODEL,
    language: session.language,
    smart_format: 'true',
    punctuate: 'true',
    interim_results: 'true',
    endpointing: '450',
    vad_events: 'true',
    utterance_end_ms: '1000',
    channels: '1'
  });

  if (session.encoding) {
    params.set('encoding', session.encoding);
    params.set('sample_rate', String(session.sampleRate ?? 48000));
  }

  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function sendSocketJson(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function registerNoteRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post('/notes/dictation-session', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const payload = noteDictationSessionSchema.parse(request.body ?? {});

    if (!env.DEEPGRAM_API_KEY) {
      return reply.code(503).send({
        message: 'Ditado em tempo real não configurado. Defina DEEPGRAM_API_KEY no backend.'
      });
    }

    if (payload.noteId) {
      const note = await prisma.note.findFirst({
        where: accessibleNoteWhere(clerkUserId, { id: payload.noteId }),
        select: { id: true }
      });

      if (!note) {
        return reply.code(404).send({
          message: 'Nota não encontrada.'
        });
      }
    }

    const session = createDictationSession({
      clerkUserId,
      noteId: payload.noteId ?? null,
      language: payload.language ?? 'pt-BR',
      encoding: payload.encoding,
      sampleRate: payload.sampleRate
    });

    return {
      ok: true,
      provider: 'deepgram',
      model: env.DEEPGRAM_MODEL,
      language: payload.language ?? 'pt-BR',
      ...session
    };
  });

  app.get('/notes/dictation-stream', { websocket: true }, (clientSocket, request) => {
    if (!env.DEEPGRAM_API_KEY) {
      sendSocketJson(clientSocket, {
        type: 'operis.error',
        message: 'Deepgram não configurado no backend.'
      });
      clientSocket.close(1011, 'Deepgram not configured');
      return;
    }

    const session = consumeDictationSession(extractDictationSessionId(request));
    if (!session) {
      sendSocketJson(clientSocket, {
        type: 'operis.error',
        message: 'Sessão de ditado expirada. Tente iniciar novamente.'
      });
      clientSocket.close(1008, 'Expired session');
      return;
    }

    const deepgramSocket = new WebSocket(createDeepgramLiveUrl(session), {
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`
      }
    });
    const pendingAudio: WebSocket.RawData[] = [];
    let deepgramReady = false;
    let closed = false;
    let keepAliveTimer: NodeJS.Timeout | null = null;

    const closeBoth = (code = 1000, reason = 'closed') => {
      if (closed) return;
      closed = true;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(JSON.stringify({ type: 'CloseStream' }));
        deepgramSocket.close(code, reason);
      } else if (deepgramSocket.readyState === WebSocket.CONNECTING) {
        deepgramSocket.close();
      }
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(code, reason);
      }
    };

    deepgramSocket.on('open', () => {
      deepgramReady = true;
      sendSocketJson(clientSocket, {
        type: 'operis.ready',
        provider: 'deepgram',
        model: env.DEEPGRAM_MODEL,
        encoding: session.encoding ?? 'auto',
        sampleRate: session.sampleRate ?? null
      });
      keepAliveTimer = setInterval(() => {
        if (deepgramSocket.readyState === WebSocket.OPEN) {
          deepgramSocket.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 5000);

      while (pendingAudio.length > 0 && deepgramSocket.readyState === WebSocket.OPEN) {
        const chunk = pendingAudio.shift();
        if (chunk) {
          deepgramSocket.send(chunk);
        }
      }
    });

    deepgramSocket.on('message', (message) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(message.toString());
      }
    });

    deepgramSocket.on('close', (code, reason) => {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      const reasonText = reason.toString();
      if (code !== 1000) {
        app.log.warn({ code, reason: reasonText }, 'Deepgram dictation stream closed');
        sendSocketJson(clientSocket, {
          type: 'operis.error',
          message: reasonText
            ? `Deepgram encerrou o ditado: ${reasonText}`
            : `Deepgram encerrou o ditado com código ${code}.`
        });
      }
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(code || 1000, reasonText || 'Deepgram stream closed');
      }
    });

    deepgramSocket.on('error', (error) => {
      app.log.error({ err: error }, 'Deepgram dictation stream failed');
      sendSocketJson(clientSocket, {
        type: 'operis.error',
        message: 'Falha na conexão realtime com a Deepgram.'
      });
      closeBoth(1011, 'Deepgram error');
    });

    clientSocket.on('message', (message, isBinary) => {
      if (!isBinary) {
        const text = message.toString();
        if (text === 'close' || text.includes('CloseStream')) {
          closeBoth(1000, 'client requested close');
        }
        return;
      }

      if (deepgramReady && deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(message);
      } else {
        pendingAudio.push(message);
      }
    });

    clientSocket.on('close', () => closeBoth(1000, 'client closed'));
    clientSocket.on('error', () => closeBoth(1011, 'client socket error'));
  });

  app.get('/notes/transcription-capabilities', async () => {
    const provider = env.DEEPGRAM_API_KEY
      ? 'deepgram'
      : env.OPENROUTER_API_KEY
        ? 'openrouter'
        : env.NOTES_TRANSCRIBE_WEBHOOK_URL
          ? 'webhook'
          : 'disabled';

    return {
      enabled: provider !== 'disabled',
      provider,
      realtime: provider === 'deepgram',
      model: provider === 'deepgram' ? env.DEEPGRAM_MODEL : env.OPENROUTER_TRANSCRIBE_MODEL,
      maxAudioBytes: MAX_NOTES_AUDIO_BYTES,
      maxAudioMB: Math.round((MAX_NOTES_AUDIO_BYTES / 1024 / 1024) * 10) / 10
    };
  });

  app.post('/notes/transcribe-audio', async (request, reply) => {
    const payload = noteAudioTranscriptionSchema.parse(request.body);

    if (!env.OPENROUTER_API_KEY && !env.NOTES_TRANSCRIBE_WEBHOOK_URL) {
      return reply.code(503).send({
        message:
          'Transcrição de áudio não configurada. Defina OPENROUTER_API_KEY no backend.'
      });
    }

    const estimatedBytes = Math.floor((payload.audioBase64.length * 3) / 4);
    if (estimatedBytes > MAX_NOTES_AUDIO_BYTES) {
      return reply.code(413).send({
        message: `Áudio excede limite de ${Math.round(MAX_NOTES_AUDIO_BYTES / 1024 / 1024)}MB.`
      });
    }

    if (env.OPENROUTER_API_KEY) {
      try {
        const normalized = await transcribeWithOpenRouter({
          apiKey: env.OPENROUTER_API_KEY,
          model: env.OPENROUTER_TRANSCRIBE_MODEL,
          audioBase64: payload.audioBase64,
          mimeType: payload.mimeType ?? 'audio/webm',
          language: payload.language ?? 'pt-BR',
          timeoutMs: env.NOTES_TRANSCRIBE_TIMEOUT_MS
        });

        return {
          ok: true,
          provider: 'openrouter',
          transcript: normalized.transcript,
          titleSuggestion: normalized.titleSuggestion,
          structuredContent: normalized.structuredContent,
          tags: normalized.tags,
          confidence: normalized.confidence,
          durationMs: normalized.durationMs
        };
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return reply.code(504).send({
            message: 'Tempo limite excedido aguardando resposta da OpenRouter.'
          });
        }

        return reply.code(502).send({
          message: `Falha ao chamar OpenRouter STT: ${(error as Error).message}`
        });
      }
    }

    const webhookUrl = env.NOTES_TRANSCRIBE_WEBHOOK_URL;
    if (!webhookUrl) {
      return reply.code(503).send({
        message: 'Transcrição de áudio não configurada. Defina OPENROUTER_API_KEY no backend.'
      });
    }

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortController.abort(),
      env.NOTES_TRANSCRIBE_TIMEOUT_MS
    );

    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.NOTES_TRANSCRIBE_WEBHOOK_SECRET
            ? { 'x-webhook-secret': env.NOTES_TRANSCRIBE_WEBHOOK_SECRET }
            : {})
        },
        body: JSON.stringify({
          source: 'execution-os-notes',
          requestedAt: new Date().toISOString(),
          mode: payload.mode ?? 'note',
          context: payload.context ?? null,
          audio: {
            base64: payload.audioBase64,
            mimeType: payload.mimeType ?? 'audio/webm',
            bytesEstimate: estimatedBytes,
            language: payload.language ?? 'pt-BR'
          }
        }),
        signal: abortController.signal
      });

      const rawText = await webhookResponse.text();
      if (!webhookResponse.ok) {
        return reply.code(502).send({
          message: `Webhook de transcrição retornou erro (${webhookResponse.status}).`,
          detail: rawText.slice(0, 600)
        });
      }

      let parsed: unknown = {};
      try {
        parsed = rawText.trim().length > 0 ? JSON.parse(rawText) : {};
      } catch {
        parsed = { text: rawText };
      }

      const normalized = normalizeTranscriptionWebhookResponse(parsed);
      if (!normalized.transcript && !normalized.structuredContent) {
        return reply.code(502).send({
          message: 'Webhook retornou resposta sem conteúdo utilizável de transcrição.'
        });
      }

      return {
        ok: true,
        provider: 'webhook',
        transcript: normalized.transcript,
        titleSuggestion: normalized.titleSuggestion,
        structuredContent: normalized.structuredContent,
        tags: normalized.tags,
        confidence: normalized.confidence,
        durationMs: normalized.durationMs
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return reply.code(504).send({
          message: 'Tempo limite excedido aguardando resposta do webhook de transcrição.'
        });
      }

      return reply.code(502).send({
        message: `Falha ao chamar webhook de transcrição: ${(error as Error).message}`
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  });

  app.post('/notes/cleanup-dictation', async (request, reply) => {
    const payload = noteDictationCleanupSchema.parse(request.body);

    try {
      const result = await cleanupDictationWithOpenRouter({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_CLEANUP_MODEL,
        text: payload.text,
        timeoutMs: Math.min(env.NOTES_TRANSCRIBE_TIMEOUT_MS, 45000)
      });

      return {
        ok: true,
        provider: result.provider,
        model: result.model,
        text: result.text,
        usage: result.usage
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return reply.code(504).send({
          message: 'Tempo limite excedido limpando a transcrição.'
        });
      }

      return reply.code(502).send({
        message: `Falha ao limpar transcrição: ${(error as Error).message}`
      });
    }
  });

  app.get('/note-folders', async (request) => {
    const clerkUserId = getUserId(request);
    const query = z
      .object({
        includeArchived: z.coerce.boolean().optional()
      })
      .parse(request.query);

    return prisma.noteFolder.findMany({
      where: {
        clerkUserId,
        archivedAt: query.includeArchived ? undefined : null
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
  });

  app.post('/note-folders', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const payload = folderCreateSchema.parse(request.body);

    if (payload.parentId) {
      const parent = await prisma.noteFolder.findFirst({
        where: {
          id: payload.parentId,
          clerkUserId,
          archivedAt: null
        },
        select: {
          id: true
        }
      });
      if (!parent) {
        return reply.code(400).send({
          message: 'Pasta pai inválida.'
        });
      }
    }

    const folder = await prisma.noteFolder.create({
      data: {
        clerkUserId,
        name: payload.name.trim(),
        color: payload.color ?? '#4f7cff',
        parentId: payload.parentId ?? null,
        sortOrder: payload.sortOrder ?? 0
      }
    });

    return reply.code(201).send(folder);
  });

  app.patch('/note-folders/:folderId', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const payload = folderUpdateSchema.parse(request.body);

    const currentFolder = await prisma.noteFolder.findFirst({
      where: {
        id: params.folderId,
        clerkUserId
      },
      select: {
        id: true
      }
    });

    if (!currentFolder) {
      return reply.code(404).send({
        message: 'Pasta não encontrada.'
      });
    }

    if (payload.parentId === params.folderId) {
      return reply.code(400).send({
        message: 'Uma pasta não pode ser filha dela mesma.'
      });
    }

    if (payload.parentId) {
      const parent = await prisma.noteFolder.findFirst({
        where: {
          id: payload.parentId,
          archivedAt: null
        },
        select: {
          id: true
        }
      });

      if (!parent) {
        return reply.code(400).send({
          message: 'Pasta pai inválida.'
        });
      }

      const folders = await prisma.noteFolder.findMany({
        select: {
          id: true,
          parentId: true
        }
      });
      const parentMap = new Map(folders.map((folder) => [folder.id, folder.parentId]));
      let cursor: string | null = payload.parentId;
      while (cursor) {
        if (cursor === params.folderId) {
          return reply.code(400).send({
            message: 'Estrutura inválida: ciclo detectado na árvore de pastas.'
          });
        }
        cursor = parentMap.get(cursor) ?? null;
      }
    }

    return prisma.noteFolder.update({
      where: {
        id: params.folderId
      },
      data: {
        name: payload.name?.trim(),
        color: payload.color,
        parentId: payload.parentId,
        sortOrder: payload.sortOrder,
        archivedAt:
          payload.archived === undefined ? undefined : payload.archived ? new Date() : null
      }
    });
  });

  app.delete('/note-folders/:folderId', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ folderId: z.string().uuid() }).parse(request.params);

    const folder = await prisma.noteFolder.findFirst({
      where: {
        id: params.folderId,
        clerkUserId
      },
      select: {
        id: true
      }
    });

    if (!folder) {
      return reply.code(404).send({
        message: 'Pasta não encontrada.'
      });
    }

    await prisma.$transaction([
      prisma.note.updateMany({
        where: {
          folderId: params.folderId
        },
        data: {
          folderId: null
        }
      }),
      prisma.noteFolder.updateMany({
        where: {
          parentId: params.folderId
        },
        data: {
          parentId: null
        }
      }),
      prisma.noteFolder.delete({
        where: {
          id: params.folderId
        }
      })
    ]);

    return { ok: true };
  });

  app.get('/notes', async (request) => {
    const clerkUserId = getUserId(request);
    const query = z
      .object({
        type: z.nativeEnum(NoteType).optional(),
        folderId: z.string().uuid().optional(),
        workspaceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        taskId: z.string().uuid().optional(),
        q: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional()
      })
      .parse(request.query);

    return prisma.note.findMany({
      where: {
        archivedAt: null,
        type: query.type,
        folderId: query.folderId,
        workspaceId: query.workspaceId,
        projectId: query.projectId,
        taskId: query.taskId,
        AND: [
          {
            OR: [
              { workspace: { clerkUserId } },
              { workspaceId: null, folder: { clerkUserId } },
              { workspaceId: null, folderId: null, clerkUserId }
            ]
          },
          ...(query.q
            ? [
                {
                  OR: [
                    { title: { contains: query.q, mode: 'insensitive' as const } },
                    { contentText: { contains: query.q, mode: 'insensitive' as const } },
                    { content: { contains: query.q, mode: 'insensitive' as const } },
                    { tags: { has: query.q.toLowerCase() } }
                  ]
                }
              ]
            : [])
        ]
      },
      include: {
        ...NOTE_RELATION_INCLUDE
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: query.limit ?? 250
    });
  });

  app.post('/notes', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const payload = noteCreateSchema.parse(request.body);
    let nativeContent;
    try {
      nativeContent = normalizeNativeNoteContent({
        content: payload.content ?? null,
        contentBlocks: payload.contentBlocks,
        contentText: payload.contentText ?? null,
        contentHtml: payload.contentHtml ?? null,
        contentVersion: payload.contentVersion
      });
    } catch (error) {
      if (isNativeContentPayloadError(error)) {
        return reply.code(413).send({
          error: NOTE_BLOCKS_TOO_LARGE_ERROR,
          message: 'Conteúdo da nota excede o limite permitido.'
        });
      }
      throw error;
    }

    const relationError = await validateNoteRelations(prisma, clerkUserId, {
      folderId: payload.folderId ?? null,
      workspaceId: payload.workspaceId ?? null,
      projectId: payload.projectId ?? null,
      taskId: payload.taskId ?? null
    });
    if (relationError) {
      return reply.code(422).send({
        error: relationError,
        message: 'Vínculo inválido para esta nota.'
      });
    }

    const note = await prisma.note.create({
      data: {
        clerkUserId,
        title: payload.title.trim(),
        content: nativeContent.content,
        contentBlocks: nativeContent.contentBlocks as any,
        contentText: nativeContent.contentText,
        contentHtml: nativeContent.contentHtml,
        contentVersion: nativeContent.contentVersion,
        type: payload.type ?? NoteType.geral,
        tags: payload.tags ?? [],
        pinned: payload.pinned ?? false,
        folderId: payload.folderId ?? null,
        workspaceId: payload.workspaceId ?? null,
        projectId: payload.projectId ?? null,
        taskId: payload.taskId ?? null
      },
      include: {
        ...NOTE_RELATION_INCLUDE
      }
    });

    await createNoteRevisionSnapshot(prisma, note, 'create');

    return reply.code(201).send(note);
  });

  app.patch('/notes/:noteId', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ noteId: z.string().uuid() }).parse(request.params);
    const payload = noteUpdateSchema.parse(request.body);
    const current = await prisma.note.findFirst({
      where: accessibleNoteWhere(clerkUserId, { id: params.noteId }),
      select: {
        ...NOTE_REVISION_CORE_SELECT
      }
    });

    if (!current) {
      return reply.code(404).send({
        message: 'Nota não encontrada.'
      });
    }

    const isNativeBlockUpdate = payload.contentBlocks !== undefined;
    let nativeContent;
    try {
      nativeContent = normalizeNativeNoteContent({
        content: isNativeBlockUpdate
          ? payload.content ?? null
          : payload.content === undefined
            ? current.content
            : payload.content,
        contentBlocks: isNativeBlockUpdate ? payload.contentBlocks : current.contentBlocks,
        contentText: isNativeBlockUpdate
          ? payload.contentText ?? null
          : payload.contentText === undefined
            ? current.contentText
            : payload.contentText,
        contentHtml: isNativeBlockUpdate
          ? payload.contentHtml ?? null
          : payload.contentHtml === undefined
            ? current.contentHtml
            : payload.contentHtml,
        contentVersion:
          payload.contentVersion === undefined ? current.contentVersion : payload.contentVersion
      });
    } catch (error) {
      if (isNativeContentPayloadError(error)) {
        return reply.code(413).send({
          error: NOTE_BLOCKS_TOO_LARGE_ERROR,
          message: 'Conteúdo da nota excede o limite permitido.'
        });
      }
      throw error;
    }
    if (payload.content !== undefined && payload.contentBlocks === undefined) {
      nativeContent.content = payload.content;
    }

    const nextSnapshot = {
      title: payload.title?.trim() ?? current.title,
      content: nativeContent.content,
      contentBlocks: nativeContent.contentBlocks,
      contentText: nativeContent.contentText,
      contentHtml: nativeContent.contentHtml,
      contentVersion: nativeContent.contentVersion,
      type: payload.type ?? current.type,
      tags: payload.tags ?? current.tags,
      pinned: payload.pinned ?? current.pinned,
      folderId: payload.folderId === undefined ? current.folderId : payload.folderId,
      workspaceId: payload.workspaceId === undefined ? current.workspaceId : payload.workspaceId,
      projectId: payload.projectId === undefined ? current.projectId : payload.projectId,
      taskId: payload.taskId === undefined ? current.taskId : payload.taskId
    };
    const relationChanged =
      payload.folderId !== undefined ||
      payload.workspaceId !== undefined ||
      payload.projectId !== undefined ||
      payload.taskId !== undefined;
    if (relationChanged) {
      const relationError = await validateNoteRelations(prisma, clerkUserId, {
        folderId: nextSnapshot.folderId,
        workspaceId: nextSnapshot.workspaceId,
        projectId: nextSnapshot.projectId,
        taskId: nextSnapshot.taskId
      });
      if (relationError) {
        return reply.code(422).send({
          error: relationError,
          message: 'Vínculo inválido para esta nota.'
        });
      }
    }
    const changed = hasNativeNoteSnapshotChanged(current, nextSnapshot);
    const saveSource = payload.saveSource ?? 'manual';

    const updated = await prisma.note.update({
      where: {
        id: params.noteId
      },
      data: {
        title: payload.title?.trim(),
        content:
          payload.content === undefined && payload.contentBlocks === undefined
            ? undefined
            : nativeContent.content,
        contentBlocks: payload.contentBlocks === undefined ? undefined : (nativeContent.contentBlocks as any),
        contentText:
          payload.contentText === undefined && payload.contentBlocks === undefined
            ? undefined
            : nativeContent.contentText,
        contentHtml:
          payload.contentHtml === undefined && payload.contentBlocks === undefined
            ? undefined
            : nativeContent.contentHtml,
        contentVersion:
          payload.contentVersion === undefined && payload.contentBlocks === undefined
            ? undefined
            : nativeContent.contentVersion,
        type: payload.type,
        tags: payload.tags,
        pinned: payload.pinned,
        folderId: payload.folderId,
        workspaceId: payload.workspaceId,
        projectId: payload.projectId,
        taskId: payload.taskId,
        archivedAt:
          payload.archived === undefined ? undefined : payload.archived ? new Date() : null
      },
      include: {
        ...NOTE_RELATION_INCLUDE
      }
    });

    if (changed && saveSource !== 'autosave') {
      await createNoteRevisionSnapshot(prisma, updated, saveSource);
    }

    return updated;
  });

  app.get('/notes/:noteId/revisions', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ noteId: z.string().uuid() }).parse(request.params);
    const query = noteRevisionQuerySchema.parse(request.query);

    const note = await prisma.note.findFirst({
      where: accessibleNoteWhere(clerkUserId, { id: params.noteId }),
      select: {
        id: true
      }
    });

    if (!note) {
      return reply.code(404).send({
        message: 'Nota não encontrada.'
      });
    }

    return (prisma as any).noteRevision.findMany({
      where: {
        noteId: params.noteId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: query.limit ?? 30
    });
  });

  app.post('/notes/:noteId/revisions', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ noteId: z.string().uuid() }).parse(request.params);
    const payload = noteRevisionCreateSchema.parse(request.body ?? {});

    const note = await prisma.note.findFirst({
      where: accessibleNoteWhere(clerkUserId, { id: params.noteId }),
      select: {
        ...NOTE_REVISION_CORE_SELECT
      }
    });

    if (!note) {
      return reply.code(404).send({
        message: 'Nota não encontrada.'
      });
    }

      await createNoteRevisionSnapshot(prisma, note, payload.source ?? 'checkpoint');

    return {
      ok: true
    };
  });

  app.post('/notes/:noteId/revisions/:revisionId/restore', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = noteRevisionRestoreParamsSchema.parse(request.params);

    const [current, revision] = await Promise.all([
      prisma.note.findFirst({
        where: accessibleNoteWhere(clerkUserId, { id: params.noteId }),
        select: {
          ...NOTE_REVISION_CORE_SELECT
        }
      }),
      (prisma as any).noteRevision.findFirst({
        where: {
          id: params.revisionId,
          noteId: params.noteId
        }
      })
    ]);

    if (!current) {
      return reply.code(404).send({
        message: 'Nota não encontrada.'
      });
    }

    if (!revision) {
      return reply.code(404).send({
        message: 'Revisão não encontrada para esta nota.'
      });
    }

    const relationError = await validateNoteRelations(prisma, clerkUserId, {
      folderId: revision.folderId,
      workspaceId: revision.workspaceId,
      projectId: revision.projectId,
      taskId: revision.taskId
    });
    if (relationError) {
      return reply.code(422).send({
        error: relationError,
        message: 'A revisão possui vínculo inválido para esta nota.'
      });
    }

    const restored = await prisma.$transaction(async (tx) => {
      await createNoteRevisionSnapshot(tx, current, 'restore_backup');

      const updated = await tx.note.update({
        where: {
          id: params.noteId
        },
        data: {
          title: revision.title,
          content: revision.content,
          contentBlocks: revision.contentBlocks,
          contentText: revision.contentText,
          contentHtml: revision.contentHtml,
          contentVersion: revision.contentVersion ?? 1,
          type: revision.type,
          tags: revision.tags,
          pinned: revision.pinned,
          folderId: revision.folderId,
          workspaceId: revision.workspaceId,
          projectId: revision.projectId,
          taskId: revision.taskId
        },
        include: {
          ...NOTE_RELATION_INCLUDE
        }
      });

      await createNoteRevisionSnapshot(tx, updated, 'restore_apply');

      return updated;
    });

    return restored;
  });

  app.delete('/notes/:noteId', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ noteId: z.string().uuid() }).parse(request.params);

    const note = await prisma.note.findFirst({
      where: accessibleNoteWhere(clerkUserId, { id: params.noteId }),
      select: { id: true }
    });
    if (!note) return reply.code(404).send({ message: 'Nota não encontrada.' });

    await prisma.note.delete({
      where: {
        id: params.noteId
      }
    });

    return { ok: true };
  });
}
