import { FastifyInstance } from 'fastify';
import { NoteType, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config.js';
import { getUserId } from '../middleware/auth.js';
import {
  hasNativeNoteSnapshotChanged,
  normalizeNativeNoteContent,
  normalizeStringArray
} from '../services/note-content-service.js';

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

export function registerNoteRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get('/notes/transcription-capabilities', async () => {
    return {
      enabled: Boolean(env.NOTES_TRANSCRIBE_WEBHOOK_URL),
      provider: env.NOTES_TRANSCRIBE_WEBHOOK_URL ? 'webhook' : 'disabled',
      maxAudioBytes: MAX_NOTES_AUDIO_BYTES,
      maxAudioMB: Math.round((MAX_NOTES_AUDIO_BYTES / 1024 / 1024) * 10) / 10
    };
  });

  app.post('/notes/transcribe-audio', async (request, reply) => {
    const payload = noteAudioTranscriptionSchema.parse(request.body);

    if (!env.NOTES_TRANSCRIBE_WEBHOOK_URL) {
      return reply.code(503).send({
        message:
          'Transcrição de áudio não configurada. Defina NOTES_TRANSCRIBE_WEBHOOK_URL no backend.'
      });
    }

    const estimatedBytes = Math.floor((payload.audioBase64.length * 3) / 4);
    if (estimatedBytes > MAX_NOTES_AUDIO_BYTES) {
      return reply.code(413).send({
        message: `Áudio excede limite de ${Math.round(MAX_NOTES_AUDIO_BYTES / 1024 / 1024)}MB.`
      });
    }

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortController.abort(),
      env.NOTES_TRANSCRIBE_TIMEOUT_MS
    );

    try {
      const webhookResponse = await fetch(env.NOTES_TRANSCRIBE_WEBHOOK_URL, {
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
    const nativeContent = normalizeNativeNoteContent({
      content: payload.content ?? null,
      contentBlocks: payload.contentBlocks,
      contentText: payload.contentText ?? null,
      contentHtml: payload.contentHtml ?? null,
      contentVersion: payload.contentVersion
    });

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
      where: {
        id: params.noteId,
        clerkUserId
      },
      select: {
        ...NOTE_REVISION_CORE_SELECT
      }
    });

    if (!current) {
      return reply.code(404).send({
        message: 'Nota não encontrada.'
      });
    }

    const nativeContent = normalizeNativeNoteContent({
      content: payload.content === undefined ? current.content : payload.content,
      contentBlocks: payload.contentBlocks === undefined ? current.contentBlocks : payload.contentBlocks,
      contentText: payload.contentText === undefined ? current.contentText : payload.contentText,
      contentHtml: payload.contentHtml === undefined ? current.contentHtml : payload.contentHtml,
      contentVersion: payload.contentVersion === undefined ? current.contentVersion : payload.contentVersion
    });
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
      folderId: payload.folderId ?? current.folderId,
      workspaceId: payload.workspaceId ?? current.workspaceId,
      projectId: payload.projectId ?? current.projectId,
      taskId: payload.taskId ?? current.taskId
    };
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
      where: {
        id: params.noteId,
        clerkUserId
      },
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
      where: {
        id: params.noteId,
        clerkUserId
      },
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
        where: {
          id: params.noteId,
          clerkUserId
        },
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
      where: { id: params.noteId, clerkUserId },
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
