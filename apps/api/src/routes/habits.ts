import { FastifyInstance } from 'fastify';
import { PrismaClient, HabitType, HabitLifeArea, HabitFrequency, HabitStatus, RecurrenceDay } from '@prisma/client';
import { z } from 'zod';
import { HabitEvolutionService } from '../services/habit-evolution-service.js';
import { HabitService } from '../services/habit-service.js';
import { getUserId } from '../middleware/auth.js';

const habitCreateSchema = z.object({
  title: z.string().min(1).max(200),
  lifeArea: z.nativeEnum(HabitLifeArea),
  type: z.nativeEnum(HabitType),
  icon: z.string().max(10).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  frequencyType: z.nativeEnum(HabitFrequency),
  frequencyTarget: z.number().int().min(1).optional(),
  specificDays: z.array(z.nativeEnum(RecurrenceDay)).optional(),
  unit: z.string().max(50).optional().nullable(),
  dailyTarget: z.number().positive().optional().nullable(),
  xpPerCompletion: z.number().int().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

const habitUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  lifeArea: z.nativeEnum(HabitLifeArea).optional(),
  type: z.nativeEnum(HabitType).optional(),
  icon: z.string().max(10).optional().nullable(),
  color: z.string().max(32).optional().nullable(),
  frequencyType: z.nativeEnum(HabitFrequency).optional(),
  frequencyTarget: z.number().int().min(1).optional(),
  specificDays: z.array(z.nativeEnum(RecurrenceDay)).optional(),
  unit: z.string().max(50).optional().nullable(),
  dailyTarget: z.number().positive().optional().nullable(),
  xpPerCompletion: z.number().int().min(1).optional(),
  status: z.nativeEnum(HabitStatus).optional(),
  sortOrder: z.number().int().optional(),
});

const logSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().optional(),
  note: z.string().max(500).optional().nullable(),
});

const absoluteLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().positive(),
  note: z.string().max(500).optional().nullable(),
});

const recaiuSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function registerHabitRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const service = new HabitService(prisma);
  const evolutionService = new HabitEvolutionService(prisma);

  // GET /habits
  app.get('/habits', async (request) => {
    const clerkUserId = getUserId(request);
    const query = request.query as { lifeArea?: string; status?: string };
    const where: Record<string, unknown> = { clerkUserId };

    if (query.lifeArea) {
      where['lifeArea'] = query.lifeArea as HabitLifeArea;
    }

    if (query.status) {
      where['status'] = query.status as HabitStatus;
    } else {
      where['status'] = { not: 'arquivado' as HabitStatus };
    }

    return prisma.habit.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  // POST /habits
  app.post('/habits', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const body = habitCreateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.message });
    }

    const data = body.data;
    return prisma.habit.create({
      data: {
        clerkUserId,
        title: data.title,
        lifeArea: data.lifeArea,
        type: data.type,
        icon: data.icon ?? null,
        color: data.color ?? null,
        frequencyType: data.frequencyType,
        frequencyTarget: data.frequencyTarget ?? 1,
        specificDays: data.specificDays ?? [],
        unit: data.unit ?? null,
        dailyTarget: data.dailyTarget ?? null,
        xpPerCompletion: data.xpPerCompletion ?? 10,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  });

  // PATCH /habits/:id
  app.patch('/habits/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = habitUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.message });
    }

    const habit = await prisma.habit.findUnique({ where: { id, clerkUserId } });
    if (!habit) {
      return reply.status(404).send({ error: 'Hábito não encontrado' });
    }

    return prisma.habit.update({
      where: { id },
      data: body.data,
    });
  });

  // DELETE /habits/:id
  app.delete('/habits/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = request.params as { id: string };
    const query = request.query as { hard?: string; confirm?: string };

    const habit = await prisma.habit.findUnique({
      where: { id, clerkUserId },
      include: { _count: { select: { xpEvents: true } } },
    });

    if (!habit) {
      return reply.status(404).send({ error: 'Hábito não encontrado' });
    }

    if (query.hard === 'true') {
      if (query.confirm !== 'true') {
        return reply.status(400).send({
          error: `Este hábito tem ${habit._count.xpEvents} eventos de XP. Isso apagará todo o histórico e XP desta área. Confirme com ?hard=true&confirm=true`,
          xpEventCount: habit._count.xpEvents,
        });
      }

      await prisma.habit.delete({ where: { id } });
      return { ok: true };
    }

    // Soft delete
    await prisma.habit.update({
      where: { id },
      data: { status: 'arquivado' },
    });

    return { ok: true };
  });

  // GET /habits/stats/today
  app.get('/habits/stats/today', async (request) => {
    const clerkUserId = getUserId(request);
    const query = request.query as { date?: string; includeUnscheduled?: string };
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    return service.getTodayStats(date, clerkUserId, {
      includeUnscheduled: query.includeUnscheduled === 'true',
    });
  });

  // GET /habits/stats/radar
  app.get('/habits/stats/radar', async (request) => {
    const clerkUserId = getUserId(request);
    return service.getRadarStats(clerkUserId);
  });

  // GET /habits/stats/evolution
  app.get('/habits/stats/evolution', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const parsed = z.coerce
      .number()
      .int()
      .refine((days) => days === 30 || days === 90 || days === 365)
      .safeParse((request.query as { days?: string }).days ?? '90');

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Período inválido' });
    }

    return evolutionService.getEvolution(clerkUserId, parsed.data);
  });

  // GET /habits/stats/heatmap/:id
  app.get('/habits/stats/heatmap/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = request.params as { id: string };
    const query = request.query as { days?: string };
    const days = query.days ? parseInt(query.days, 10) : 365;

    const habit = await prisma.habit.findUnique({ where: { id, clerkUserId } });
    if (!habit) {
      return reply.status(404).send({ error: 'Hábito não encontrado' });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);

    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    const logs = await prisma.habitLog.findMany({
      where: {
        habitId: id,
        date: { gte: startStr, lte: endStr },
      },
      orderBy: { date: 'asc' },
    });

    return { habitId: id, startDate: startStr, endDate: endStr, logs };
  });

  // GET /habits/stats/trends
  app.get('/habits/stats/trends', async (request) => {
    const clerkUserId = getUserId(request);
    const query = request.query as { days?: string };
    const days = query.days ? parseInt(query.days, 10) : 30;

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);

    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);

    const events = await prisma.habitXPEvent.findMany({
      where: {
        date: { gte: startStr, lte: endStr },
        habit: { clerkUserId }
      },
      select: { lifeArea: true, xp: true, date: true },
    });

    const areas = ['corpo', 'mente', 'trabalho', 'relacoes', 'financas', 'crescimento'] as HabitLifeArea[];
    const result: Record<string, number> = {};
    for (const area of areas) {
      result[area] = events.filter((e) => e.lifeArea === area).reduce((sum, e) => sum + e.xp, 0);
    }

    return { days, startDate: startStr, endDate: endStr, xpByArea: result };
  });

  // GET /habits/logs
  app.get('/habits/logs', async (request) => {
    const clerkUserId = getUserId(request);
    const query = request.query as { date?: string };
    const date = query.date ?? new Date().toISOString().slice(0, 10);

    return prisma.habitLog.findMany({
      where: { date, habit: { clerkUserId } },
      include: { habit: true },
    });
  });

  // POST /habits/:id/log
  app.post('/habits/:id/log', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = logSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.message });
    }

    const habit = await prisma.habit.findUnique({ where: { id, clerkUserId } });
    if (!habit) {
      return reply.status(404).send({ error: 'Hábito não encontrado' });
    }

    if (habit.type === 'vice') {
      return reply.status(400).send({ error: 'Use POST /recaiu para registrar recaída de vício' });
    }

    const { date, note } = body.data;
    let log;

    if (habit.type === 'binary') {
      log = await prisma.habitLog.upsert({
        where: { habitId_date: { habitId: id, date } },
        create: { habitId: id, date, value: 1, note: note ?? null },
        update: { value: 1, note: note ?? null },
      });
    } else {
      // quantitative: accumulate
      const existing = await prisma.habitLog.findUnique({
        where: { habitId_date: { habitId: id, date } },
      });
      const addValue = body.data.value ?? 1;
      const newValue = (existing?.value ?? 0) + addValue;

      log = await prisma.habitLog.upsert({
        where: { habitId_date: { habitId: id, date } },
        create: { habitId: id, date, value: newValue, note: note ?? null },
        update: { value: newValue, note: note ?? null },
      });
    }

    // Process XP
    await service.processXP(id, date);

    return log;
  });

  // PUT /habits/:id/log — set an absolute quantitative total for the date
  app.put('/habits/:id/log', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = absoluteLogSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.message });
    }

    const habit = await prisma.habit.findUnique({ where: { id, clerkUserId } });
    if (!habit) {
      return reply.status(404).send({ error: 'Hábito não encontrado' });
    }
    if (habit.type !== 'quantitative') {
      return reply.status(400).send({ error: 'Valor absoluto exige hábito quantitativo' });
    }

    const { date, value, note } = body.data;
    const log = await prisma.habitLog.upsert({
      where: { habitId_date: { habitId: id, date } },
      create: { habitId: id, date, value, note: note ?? null },
      update: { value, note: note ?? null },
    });

    await service.processXP(id, date);
    return log;
  });

  // DELETE /habits/:id/log/:date
  app.delete('/habits/:id/log/:date', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id, date } = request.params as { id: string; date: string };

    const habit = await prisma.habit.findUnique({ where: { id, clerkUserId } });
    if (!habit) return reply.status(404).send({ error: 'Hábito não encontrado' });

    const log = await prisma.habitLog.findUnique({
      where: { habitId_date: { habitId: id, date } },
    });

    if (!log) {
      return reply.status(404).send({ error: 'Log não encontrado' });
    }

    await prisma.habitLog.delete({ where: { habitId_date: { habitId: id, date } } });

    return { ok: true };
  });

  // POST /habits/:id/recaiu
  app.post('/habits/:id/recaiu', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = recaiuSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.message });
    }

    const habit = await prisma.habit.findUnique({ where: { id, clerkUserId } });
    if (!habit) {
      return reply.status(404).send({ error: 'Hábito não encontrado' });
    }

    if (habit.type !== 'vice') {
      return reply.status(400).send({ error: 'Este endpoint é apenas para hábitos do tipo vício' });
    }

    const { date } = body.data;

    // Calculate previous streak before logging recaída
    const previousStreak = await service.calculateStreak(id, date, 'vice');

    await prisma.habitLog.upsert({
      where: { habitId_date: { habitId: id, date } },
      create: { habitId: id, date, value: -1 },
      update: { value: -1 },
    });

    return { ok: true, previousStreak };
  });
}
