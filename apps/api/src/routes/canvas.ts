import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  generateDiagram,
  generateMindMap,
  extractPlainText,
  CanvasAIError,
} from '../services/canvas-ai-service.js';
import { getUserId } from '../middleware/auth.js';

const MAX_CANVAS_BYTES = 500 * 1024; // 500 KB

const dataSchema = z.record(z.unknown()).refine(
  (val) => JSON.stringify(val).length <= MAX_CANVAS_BYTES,
  { message: 'Canvas data exceeds 500 KB limit' }
);

async function assertNoteOwnership(prisma: PrismaClient, noteId: string, clerkUserId: string) {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      OR: [
        { workspace: { clerkUserId } },
        { workspaceId: null, folder: { clerkUserId } },
        { workspaceId: null, folderId: null, clerkUserId },
      ],
    },
  });
  return note;
}

export async function registerCanvasRoutes(app: FastifyInstance, prisma: PrismaClient) {
  // ── DIAGRAM ──────────────────────────────────────────────────────────────

  app.get('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const diagram = await prisma.diagram.findUnique({ where: { noteId } });
    if (!diagram) return reply.status(404).send({ error: 'not_found' });
    return diagram;
  });

  app.post('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const body = req.body as { data: unknown; title?: string };

    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (existing) return reply.status(409).send({ error: 'diagram_exists' });

    const parsed = dataSchema.safeParse(body.data);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.message });

    const diagram = await prisma.diagram.create({
      data: { noteId, data: parsed.data as object, title: body.title ?? null },
    });
    return reply.status(201).send(diagram);
  });

  app.patch('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const body = req.body as { data?: unknown; title?: string };

    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    if (body.data) {
      const parsed = dataSchema.safeParse(body.data);
      if (!parsed.success) return reply.status(413).send({ error: parsed.error.message });
    }

    const updated = await prisma.diagram.update({
      where: { noteId },
      data: {
        ...(body.data !== undefined && { data: body.data as object }),
        ...(body.title !== undefined && { title: body.title }),
      },
    });
    return updated;
  });

  app.delete('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.diagram.delete({ where: { noteId } });
    return reply.status(204).send();
  });

  app.post('/canvas/notes/:noteId/diagram/generate', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const body = (req.body ?? {}) as { overwrite?: boolean };

    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'note_not_found' });

    const noteContent = note.contentText ?? note.content ?? '';
    const plainText = extractPlainText(noteContent);
    if (plainText.length < 50) {
      return reply.status(422).send({ error: 'content_too_short', minLength: 50 });
    }

    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (existing && !body.overwrite) {
      return reply.status(409).send({ error: 'diagram_exists' });
    }

    try {
      const data = await generateDiagram(noteContent);
      const diagram = await prisma.diagram.upsert({
        where: { noteId },
        create: { noteId, data: data as object },
        update: { data: data as object },
      });
      return diagram;
    } catch (err) {
      if (err instanceof CanvasAIError) {
        const status = err.code === 'unavailable' ? 503 : 502;
        return reply.status(status).send({ error: err.code });
      }
      throw err;
    }
  });

  // ── MINDMAP ───────────────────────────────────────────────────────────────

  app.get('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const mindMap = await prisma.mindMap.findUnique({ where: { noteId } });
    if (!mindMap) return reply.status(404).send({ error: 'not_found' });
    return mindMap;
  });

  app.post('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const body = req.body as { data: unknown; title?: string };

    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (existing) return reply.status(409).send({ error: 'mindmap_exists' });

    const parsed = dataSchema.safeParse(body.data);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.message });

    const mindMap = await prisma.mindMap.create({
      data: { noteId, data: parsed.data as object, title: body.title ?? null },
    });
    return reply.status(201).send(mindMap);
  });

  app.patch('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const body = req.body as { data?: unknown; title?: string };

    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    if (body.data) {
      const parsed = dataSchema.safeParse(body.data);
      if (!parsed.success) return reply.status(413).send({ error: parsed.error.message });
    }

    const updated = await prisma.mindMap.update({
      where: { noteId },
      data: {
        ...(body.data !== undefined && { data: body.data as object }),
        ...(body.title !== undefined && { title: body.title }),
      },
    });
    return updated;
  });

  app.delete('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.mindMap.delete({ where: { noteId } });
    return reply.status(204).send();
  });

  // ── WHITEBOARD ────────────────────────────────────────────────────────────

  app.get('/canvas/notes/:noteId/whiteboard', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const whiteboard = await prisma.whiteboard.findUnique({ where: { noteId } });
    if (!whiteboard) return reply.status(404).send({ error: 'not_found' });
    return whiteboard;
  });

  app.post('/canvas/notes/:noteId/whiteboard', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const body = req.body as { data: unknown; title?: string };

    const existing = await prisma.whiteboard.findUnique({ where: { noteId } });
    if (existing) return reply.status(409).send({ error: 'whiteboard_exists' });

    const parsed = dataSchema.safeParse(body.data);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.message });

    const whiteboard = await prisma.whiteboard.create({
      data: { noteId, data: parsed.data as object, title: body.title ?? null },
    });
    return reply.status(201).send(whiteboard);
  });

  app.patch('/canvas/notes/:noteId/whiteboard', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const body = req.body as { data?: unknown; title?: string };

    const existing = await prisma.whiteboard.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    if (body.data) {
      const parsed = dataSchema.safeParse(body.data);
      if (!parsed.success) return reply.status(413).send({ error: parsed.error.message });
    }

    const updated = await prisma.whiteboard.update({
      where: { noteId },
      data: {
        ...(body.data !== undefined && { data: body.data as object }),
        ...(body.title !== undefined && { title: body.title }),
      },
    });
    return updated;
  });

  app.delete('/canvas/notes/:noteId/whiteboard', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'not_found' });
    const existing = await prisma.whiteboard.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.whiteboard.delete({ where: { noteId } });
    return reply.status(204).send();
  });

  app.post('/canvas/notes/:noteId/mindmap/generate', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const clerkUserId = getUserId(req);
    const body = (req.body ?? {}) as { overwrite?: boolean };

    const note = await assertNoteOwnership(prisma, noteId, clerkUserId);
    if (!note) return reply.status(404).send({ error: 'note_not_found' });

    const noteContent = note.contentText ?? note.content ?? '';
    const plainText = extractPlainText(noteContent);
    if (plainText.length < 50) {
      return reply.status(422).send({ error: 'content_too_short', minLength: 50 });
    }

    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (existing && !body.overwrite) {
      return reply.status(409).send({ error: 'mindmap_exists' });
    }

    try {
      const data = await generateMindMap(noteContent);
      const mindMap = await prisma.mindMap.upsert({
        where: { noteId },
        create: { noteId, data: data as object },
        update: { data: data as object },
      });
      return mindMap;
    } catch (err) {
      if (err instanceof CanvasAIError) {
        const status = err.code === 'unavailable' ? 503 : 502;
        return reply.status(status).send({ error: err.code });
      }
      throw err;
    }
  });
}
