import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import { accessibleNoteWhere } from '../services/note-access-service.js';
import { generateDiagram, generateMindMap } from '../services/canvas-ai-service.js';
import {
  NoteArtifactService,
  NoteArtifactServiceError
} from '../services/note-artifact-service.js';

const noteParamsSchema = z.object({ noteId: z.string().uuid() });
const artifactParamsSchema = z.object({
  noteId: z.string().uuid(),
  artifactId: z.string().uuid()
});
const artifactKindSchema = z.enum(['diagram', 'mindmap', 'whiteboard']);
const artifactCreateSchema = z.object({
  kind: artifactKindSchema,
  title: z.string().trim().max(180).optional().nullable(),
  data: z.record(z.unknown()).default({})
});
const artifactUpdateSchema = z
  .object({
    title: z.string().trim().max(180).optional().nullable(),
    data: z.record(z.unknown()).optional(),
    baseVersion: z.number().int().positive()
  })
  .refine((value) => value.title !== undefined || value.data !== undefined, {
    message: 'Informe título ou dados para atualizar.'
  });
const artifactGenerateSchema = z.object({
  kind: z.enum(['diagram', 'mindmap']),
  title: z.string().trim().max(180).optional()
});

function invalidRequest(reply: FastifyReply, issues: unknown) {
  return reply.status(400).send({ error: 'invalid_request', issues });
}

function artifactServiceError(reply: FastifyReply, error: unknown) {
  if (error instanceof NoteArtifactServiceError) {
    return reply.status(error.statusCode).send({ error: error.code });
  }
  throw error;
}

export function registerNoteArtifactRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const service = new NoteArtifactService(prisma);

  app.get('/notes/:noteId/artifacts', async (request, reply) => {
    const params = noteParamsSchema.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, params.error.issues);

    try {
      return await service.list(getUserId(request), params.data.noteId);
    } catch (error) {
      return artifactServiceError(reply, error);
    }
  });

  app.post('/notes/:noteId/artifacts', async (request, reply) => {
    const params = noteParamsSchema.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, params.error.issues);
    const body = artifactCreateSchema.safeParse(request.body);
    if (!body.success) return invalidRequest(reply, body.error.issues);

    try {
      const artifact = await service.create(getUserId(request), params.data.noteId, {
        kind: body.data.kind,
        title: body.data.title,
        data: body.data.data as Prisma.InputJsonObject
      });
      return reply.status(201).send(artifact);
    } catch (error) {
      return artifactServiceError(reply, error);
    }
  });

  app.post('/notes/:noteId/artifacts/generate', async (request, reply) => {
    const params = noteParamsSchema.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, params.error.issues);
    const body = artifactGenerateSchema.safeParse(request.body);
    if (!body.success) return invalidRequest(reply, body.error.issues);
    const clerkUserId = getUserId(request);
    const note = await prisma.note.findFirst({
      where: accessibleNoteWhere(clerkUserId, { id: params.data.noteId }),
      select: { id: true, contentText: true, content: true }
    });
    if (!note) return reply.status(404).send({ error: 'note_not_found' });

    const noteText = (note.contentText ?? note.content ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (noteText.length < 50) {
      return reply.status(422).send({ error: 'note_content_too_short' });
    }

    try {
      const data = body.data.kind === 'diagram'
        ? await generateDiagram(noteText)
        : await generateMindMap(noteText);
      const artifact = await service.create(clerkUserId, params.data.noteId, {
        kind: body.data.kind,
        title: body.data.title ?? null,
        data: data as unknown as Prisma.InputJsonObject
      });
      return reply.status(201).send(artifact);
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'content_too_short') {
        return reply.status(422).send({ error: 'note_content_too_short' });
      }
      return artifactServiceError(reply, error);
    }
  });

  app.get('/notes/:noteId/artifacts/:artifactId', async (request, reply) => {
    const params = artifactParamsSchema.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, params.error.issues);

    try {
      return await service.get(
        getUserId(request),
        params.data.noteId,
        params.data.artifactId
      );
    } catch (error) {
      return artifactServiceError(reply, error);
    }
  });

  app.patch('/notes/:noteId/artifacts/:artifactId', async (request, reply) => {
    const params = artifactParamsSchema.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, params.error.issues);
    const body = artifactUpdateSchema.safeParse(request.body);
    if (!body.success) return invalidRequest(reply, body.error.issues);

    try {
      return await service.update(
        getUserId(request),
        params.data.noteId,
        params.data.artifactId,
        {
          ...(body.data.title !== undefined ? { title: body.data.title } : {}),
          ...(body.data.data !== undefined
            ? { data: body.data.data as Prisma.InputJsonObject }
            : {}),
          baseVersion: body.data.baseVersion
        }
      );
    } catch (error) {
      return artifactServiceError(reply, error);
    }
  });

  app.delete('/notes/:noteId/artifacts/:artifactId', async (request, reply) => {
    const params = artifactParamsSchema.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, params.error.issues);

    try {
      await service.remove(getUserId(request), params.data.noteId, params.data.artifactId);
      return reply.status(204).send();
    } catch (error) {
      return artifactServiceError(reply, error);
    }
  });
}
