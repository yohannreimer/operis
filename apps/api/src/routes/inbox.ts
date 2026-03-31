import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getUserId } from '../middleware/auth.js';

export function registerInboxRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── Helpers ─────────────────────────────────────────────────────────────

  function dateRangeForFilter(filter: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    if (filter === 'hoje') {
      return { gte: todayStart, lt: todayEnd };
    }
    if (filter === 'ontem') {
      const start = new Date(todayStart.getTime() - 86400000);
      return { gte: start, lt: todayStart };
    }
    if (filter === 'semana') {
      const start = new Date(todayStart.getTime() - 6 * 86400000);
      return { gte: start, lt: todayEnd };
    }
    return undefined; // 'tudo'
  }

  function assertOwnership(clerkUserId: string, itemClerkUserId: string) {
    if (itemClerkUserId !== clerkUserId) {
      throw new Error('Não autorizado.');
    }
  }

  function validateContextMutualExclusion(workspaceId?: string | null, inboxContextId?: string | null) {
    if (workspaceId && inboxContextId) {
      throw new Error('Um item não pode ter workspaceId e inboxContextId simultaneamente.');
    }
  }

  // ── Items ────────────────────────────────────────────────────────────────

  // GET /inbox
  app.get('/inbox', async (request) => {
    const clerkUserId = getUserId(request);
    const query = z.object({
      filter: z.enum(['hoje', 'ontem', 'semana', 'tudo']).default('hoje'),
    }).parse(request.query);

    const dateRange = dateRangeForFilter(query.filter);

    const [items, contexts] = await Promise.all([
      prisma.inboxItem.findMany({
        where: {
          clerkUserId,
          ...(dateRange ? { createdAt: dateRange } : {}),
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
        include: {
          workspace: { select: { id: true, name: true, color: true } },
          inboxContext: { select: { id: true, name: true } },
        },
      }),
      prisma.inboxContext.findMany({
        where: { clerkUserId },
        orderBy: { position: 'asc' },
      }),
    ]);

    return { items, contexts };
  });

  // POST /inbox
  app.post('/inbox', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const payload = z.object({
      content: z.string().min(1),
      source: z.enum(['whatsapp', 'app']).default('app'),
      workspaceId: z.string().uuid().nullish(),
      inboxContextId: z.string().uuid().nullish(),
    }).parse(request.body);

    validateContextMutualExclusion(payload.workspaceId, payload.inboxContextId);

    const item = await prisma.inboxItem.create({
      data: {
        clerkUserId,
        content: payload.content,
        source: payload.source,
        workspaceId: payload.workspaceId ?? null,
        inboxContextId: payload.inboxContextId ?? null,
      },
      include: {
        workspace: { select: { id: true, name: true, color: true } },
        inboxContext: { select: { id: true, name: true } },
      },
    });

    return reply.code(201).send(item);
  });

  // PATCH /inbox/:id
  app.patch('/inbox/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z.object({
      content: z.string().min(1).optional(),
      status: z.enum(['pendente', 'feito', 'convertido', 'agenda', 'aguardando']).optional(),
      workspaceId: z.string().uuid().nullish(),
      inboxContextId: z.string().uuid().nullish(),
      position: z.number().int().optional(),
      waitingDate: z.string().datetime().nullish(),
      waitingPerson: z.string().nullish(),
      waitingNote: z.string().nullish(),
      scheduledAt: z.string().datetime().nullish(),
      convertedTaskId: z.string().uuid().nullish(),
    }).parse(request.body);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    const nextWorkspaceId = 'workspaceId' in payload ? payload.workspaceId : existing.workspaceId;
    const nextContextId = 'inboxContextId' in payload ? payload.inboxContextId : existing.inboxContextId;
    validateContextMutualExclusion(nextWorkspaceId, nextContextId);

    const updated = await prisma.inboxItem.update({
      where: { id },
      data: {
        ...(payload.content !== undefined && { content: payload.content }),
        ...(payload.status !== undefined && { status: payload.status }),
        ...('workspaceId' in payload && { workspaceId: payload.workspaceId ?? null }),
        ...('inboxContextId' in payload && { inboxContextId: payload.inboxContextId ?? null }),
        ...(payload.position !== undefined && { position: payload.position }),
        ...('waitingDate' in payload && { waitingDate: payload.waitingDate ? new Date(payload.waitingDate) : null }),
        ...('waitingPerson' in payload && { waitingPerson: payload.waitingPerson ?? null }),
        ...('waitingNote' in payload && { waitingNote: payload.waitingNote ?? null }),
        ...('scheduledAt' in payload && { scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null }),
        ...('convertedTaskId' in payload && { convertedTaskId: payload.convertedTaskId ?? null }),
      },
      include: {
        workspace: { select: { id: true, name: true, color: true } },
        inboxContext: { select: { id: true, name: true } },
      },
    });

    return updated;
  });

  // DELETE /inbox/:id
  app.delete('/inbox/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    await prisma.inboxItem.delete({ where: { id } });
    return reply.code(204).send();
  });

  // POST /inbox/:id/convert
  app.post('/inbox/:id/convert', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(request.body);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    return prisma.inboxItem.update({
      where: { id },
      data: { status: 'convertido', convertedTaskId: taskId },
    });
  });

  // POST /inbox/:id/schedule
  app.post('/inbox/:id/schedule', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { mode, scheduledAt } = z.object({
      mode: z.enum(['now', 'scheduled']),
      scheduledAt: z.string().datetime().optional(),
    }).parse(request.body);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    return prisma.inboxItem.update({
      where: { id },
      data: {
        status: 'agenda',
        scheduledAt: mode === 'now' ? new Date() : scheduledAt ? new Date(scheduledAt) : new Date(),
      },
    });
  });

  // ── Contexts ─────────────────────────────────────────────────────────────

  // GET /inbox/contexts
  app.get('/inbox/contexts', async (request) => {
    const clerkUserId = getUserId(request);
    return prisma.inboxContext.findMany({
      where: { clerkUserId },
      orderBy: { position: 'asc' },
    });
  });

  // POST /inbox/contexts
  app.post('/inbox/contexts', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { name } = z.object({ name: z.string().min(1) }).parse(request.body);

    const context = await prisma.inboxContext.create({
      data: { clerkUserId, name },
    });

    return reply.code(201).send(context);
  });

  // PATCH /inbox/contexts/:id
  app.patch('/inbox/contexts/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z.object({
      name: z.string().min(1).optional(),
      position: z.number().int().optional(),
    }).parse(request.body);

    const existing = await prisma.inboxContext.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    return prisma.inboxContext.update({ where: { id }, data: payload });
  });

  // DELETE /inbox/contexts/:id
  app.delete('/inbox/contexts/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const existing = await prisma.inboxContext.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    await prisma.inboxItem.updateMany({
      where: { inboxContextId: id },
      data: { inboxContextId: null },
    });

    await prisma.inboxContext.delete({ where: { id } });
    return reply.code(204).send();
  });
}
