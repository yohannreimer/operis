import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getUserId } from '../middleware/auth.js';
import { DeepWorkService } from '../services/deep-work-service.js';

export function registerInboxRoutes(app: FastifyInstance, prisma: PrismaClient, deepWorkService?: DeepWorkService) {

  // ── Helpers ─────────────────────────────────────────────────────────────

  function dateRangeForFilter(filter: string, utcOffsetMinutes: number = 0) {
    const now = new Date();
    // Shift now by client's UTC offset to find their local calendar date
    const clientMs = now.getTime() + utcOffsetMinutes * 60000;
    const clientDate = new Date(clientMs);
    // Midnight in client's timezone expressed as UTC
    const clientMidnightUTC =
      Date.UTC(clientDate.getUTCFullYear(), clientDate.getUTCMonth(), clientDate.getUTCDate()) -
      utcOffsetMinutes * 60000;

    const todayStart = new Date(clientMidnightUTC);
    const todayEnd   = new Date(clientMidnightUTC + 86400000);

    if (filter === 'hoje') {
      return { gte: todayStart, lt: todayEnd };
    }
    if (filter === 'ontem') {
      return { gte: new Date(clientMidnightUTC - 86400000), lt: todayStart };
    }
    if (filter === 'semana') {
      return { gte: new Date(clientMidnightUTC - 6 * 86400000), lt: todayEnd };
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

  async function assertAssignableRelations(
    clerkUserId: string,
    workspaceId?: string | null,
    inboxContextId?: string | null,
    convertedTaskId?: string | null
  ) {
    if (workspaceId) {
      const workspace = await prisma.workspace.findFirst({
        where: { id: workspaceId, clerkUserId },
        select: { id: true }
      });
      if (!workspace) {
        throw new Error('Frente não encontrada.');
      }
    }

    if (inboxContextId) {
      const context = await prisma.inboxContext.findFirst({
        where: { id: inboxContextId, clerkUserId },
        select: { id: true }
      });
      if (!context) {
        throw new Error('Contexto não encontrado.');
      }
    }

    if (convertedTaskId) {
      const task = await prisma.task.findFirst({
        where: { id: convertedTaskId, workspace: { clerkUserId } },
        select: { id: true }
      });
      if (!task) {
        throw new Error('Tarefa não encontrada.');
      }
    }
  }

  // ── Items ────────────────────────────────────────────────────────────────

  // GET /inbox
  app.get('/inbox', async (request) => {
    const clerkUserId = getUserId(request);
    const query = z.object({
      filter: z.enum(['hoje', 'ontem', 'semana', 'tudo']).default('hoje'),
      utcOffset: z.coerce.number().int().min(-840).max(840).default(0),
    }).parse(request.query);

    const dateRange = dateRangeForFilter(query.filter, query.utcOffset);

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
    await assertAssignableRelations(clerkUserId, payload.workspaceId, payload.inboxContextId);

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
    await assertAssignableRelations(
      clerkUserId,
      nextWorkspaceId,
      nextContextId,
      payload.convertedTaskId
    );

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
    await assertAssignableRelations(clerkUserId, undefined, undefined, taskId);

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

  // POST /inbox/:id/execute — create task + start deep work session
  app.post('/inbox/:id/execute', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { targetMinutes } = z.object({
      targetMinutes: z.number().int().min(1).max(360).optional(),
    }).parse(request.body ?? {});

    const item = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, item.clerkUserId);

    if (!item.workspaceId) {
      return reply.code(400).send({ error: 'Atribua uma frente ao item antes de executar.' });
    }
    await assertAssignableRelations(clerkUserId, item.workspaceId);

    // Create a real task so deep work can track time
    const task = await prisma.task.create({
      data: {
        workspaceId: item.workspaceId,
        title: item.content,
        definitionOfDone: item.content,
        taskType: 'a',
        status: 'andamento',
        horizon: 'active',
        estimatedMinutes: targetMinutes ?? 45,
      },
    });

    // Mark inbox item as converted
    await prisma.inboxItem.update({
      where: { id },
      data: { status: 'convertido', convertedTaskId: task.id },
    });

    // Start deep work session on the new task
    const service = deepWorkService ?? new DeepWorkService(prisma);
    const session = await service.start({
      taskId: task.id,
      targetMinutes: Math.max(15, targetMinutes ?? 45),
    }, clerkUserId);

    return reply.code(201).send({ session, task });
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
      where: { inboxContextId: id, clerkUserId },
      data: { inboxContextId: null },
    });

    await prisma.inboxContext.delete({ where: { id } });
    return reply.code(204).send();
  });

  // ── Today ─────────────────────────────────────────────────────────────────

  // GET /inbox/today
  app.get('/inbox/today', async (request) => {
    const clerkUserId = getUserId(request);
    const { todayDate } = z.object({
      todayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);

    return prisma.inboxTodayItem.findMany({
      where: { clerkUserId, todayDate },
      orderBy: { position: 'asc' },
      include: {
        inboxItem: {
          include: {
            workspace: { select: { id: true, name: true, color: true } },
            inboxContext: { select: { id: true, name: true } },
          },
        },
      },
    });
  });

  // POST /inbox/today
  app.post('/inbox/today', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const payload = z.object({
      inboxItemId: z.string().uuid(),
      todayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      position: z.number().int().default(0),
    }).parse(request.body);

    const item = await prisma.inboxItem.findUniqueOrThrow({ where: { id: payload.inboxItemId } });
    assertOwnership(clerkUserId, item.clerkUserId);

    const todayItem = await prisma.inboxTodayItem.create({
      data: {
        clerkUserId,
        inboxItemId: payload.inboxItemId,
        todayDate: payload.todayDate,
        position: payload.position,
      },
      include: {
        inboxItem: {
          include: {
            workspace: { select: { id: true, name: true, color: true } },
            inboxContext: { select: { id: true, name: true } },
          },
        },
      },
    });

    return reply.code(201).send(todayItem);
  });

  // PATCH /inbox/today/:id
  app.patch('/inbox/today/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z.object({
      position: z.number().int().optional(),
      completedAt: z.string().datetime().nullable().optional(),
    }).parse(request.body);

    const existing = await prisma.inboxTodayItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    return prisma.inboxTodayItem.update({
      where: { id },
      data: {
        ...(payload.position !== undefined && { position: payload.position }),
        ...('completedAt' in payload && {
          completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
        }),
      },
      include: {
        inboxItem: {
          include: {
            workspace: { select: { id: true, name: true, color: true } },
            inboxContext: { select: { id: true, name: true } },
          },
        },
      },
    });
  });

  // DELETE /inbox/today/:id
  app.delete('/inbox/today/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const existing = await prisma.inboxTodayItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    await prisma.inboxTodayItem.delete({ where: { id } });
    return reply.code(204).send();
  });
}
