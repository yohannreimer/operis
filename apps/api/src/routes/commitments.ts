import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrismaClient, CommitmentType, CommitmentStatus, RecurrenceDay } from '@prisma/client';
import { getUserId } from '../middleware/auth.js';
import { CommitmentOccurrenceService } from '../services/commitment-occurrence-service.js';

const recurrenceDaySchema = z.enum(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);

const commitmentCreateSchema = z.object({
  workspaceId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  type: z.enum(['fixo', 'variavel']).default('variavel'),
  status: z.enum(['ativo', 'pausado', 'encerrado']).default('ativo'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  durationMin: z.number().int().min(1).max(1440).optional().nullable(),
  recurrenceDays: z.array(recurrenceDaySchema).default([]),
  date: z.string().optional().nullable(),        // YYYY-MM-DD
  recurrenceEnd: z.string().optional().nullable(), // YYYY-MM-DD
});

const commitmentUpdateSchema = commitmentCreateSchema.partial();

// Helper: get commitments for a specific date (expanding recurrences)
function matchesDate(
  commitment: {
    type: CommitmentType;
    date: Date | null;
    recurrenceDays: RecurrenceDay[];
    recurrenceEnd: Date | null;
    status: CommitmentStatus;
  },
  date: Date
): boolean {
  if (commitment.status === 'encerrado') return false;

  if (commitment.type === 'variavel') {
    if (!commitment.date) return false;
    return commitment.date.toISOString().slice(0, 10) === date.toISOString().slice(0, 10);
  }

  // Fixed: check recurrence days
  const dayMap: Record<number, RecurrenceDay> = {
    1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom',
  };
  const dayOfWeek = date.getUTCDay();
  const dayKey = dayMap[dayOfWeek];

  if (!commitment.recurrenceDays.includes(dayKey)) return false;

  // Check start date
  if (commitment.date && date < commitment.date) return false;

  // Check end date
  if (commitment.recurrenceEnd && date > commitment.recurrenceEnd) return false;

  return true;
}

// Helper: verify that a commitment belongs to the authenticated user
async function assertOwnsCommitment(prisma: PrismaClient, id: string, clerkUserId: string) {
  const commitment = await prisma.commitment.findFirst({
    where: { id, clerkUserId },
    select: { id: true },
  });
  if (!commitment) {
    const error = new Error('Compromisso não encontrado.');
    (error as any).statusCode = 404;
    throw error;
  }
}

export async function commitmentsRoutes(app: FastifyInstance, { prisma }: { prisma: PrismaClient }) {
  const occurrenceService = new CommitmentOccurrenceService(prisma);

  // GET /commitments — list all (optionally filtered by date or workspaceId)
  app.get('/commitments', async (request) => {
    const clerkUserId = getUserId(request);
    const query = z.object({
      workspaceId: z.string().optional(),
      date: z.string().optional(),       // YYYY-MM-DD — returns commitments for that day
      type: z.enum(['fixo', 'variavel']).optional(),
      status: z.enum(['ativo', 'pausado', 'encerrado']).optional(),
    }).parse(request.query);

    const where: Record<string, unknown> = { clerkUserId };
    if (query.workspaceId) where['workspaceId'] = query.workspaceId;
    if (query.type) where['type'] = query.type;
    if (query.status) where['status'] = query.status;
    else where['status'] = { not: 'encerrado' };

    const commitments = await prisma.commitment.findMany({
      where,
      include: { exceptions: true },
      orderBy: [{ type: 'asc' }, { startTime: 'asc' }, { title: 'asc' }],
    });

    // If date filter, expand recurrences
    if (query.date) {
      const filterDate = new Date(query.date + 'T00:00:00.000Z');
      const filtered = commitments.filter(c => {
        if (!matchesDate(c, filterDate)) return false;
        // Check exceptions for this date
        const exception = c.exceptions.find(
          e => e.date.toISOString().slice(0, 10) === query.date
        );
        if (exception?.action === 'cancelled') return false;
        return true;
      });

      // Add rescheduled exceptions from other days that point to this date
      const rescheduled = await prisma.commitmentException.findMany({
        where: {
          newDate: filterDate,
          action: 'rescheduled',
          commitment: { clerkUserId },
        },
        include: { commitment: { include: { exceptions: true } } },
      });

      const rescheduledFormatted = rescheduled.map(e => ({
        ...e.commitment,
        startTime: e.newTime ?? e.commitment.startTime,
        _rescheduledFrom: e.date.toISOString().slice(0, 10),
      }));

      return [...filtered, ...rescheduledFormatted];
    }

    return commitments;
  });

  // GET /commitments/:id
  app.get('/commitments/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const commitment = await prisma.commitment.findFirst({
      where: { id, clerkUserId },
      include: { exceptions: { orderBy: { date: 'asc' } } },
    });
    if (!commitment) return reply.code(404).send({ message: 'Compromisso não encontrado.' });
    return commitment;
  });

  // POST /commitments
  app.post('/commitments', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const data = commitmentCreateSchema.parse(request.body);

    const commitment = await prisma.commitment.create({
      data: {
        clerkUserId,
        workspaceId: data.workspaceId ?? null,
        projectId: data.projectId ?? null,
        title: data.title.trim(),
        description: data.description?.trim() ?? null,
        type: data.type as CommitmentType,
        status: data.status as CommitmentStatus,
        startTime: data.startTime ?? null,
        durationMin: data.durationMin ?? null,
        recurrenceDays: (data.recurrenceDays ?? []) as RecurrenceDay[],
        date: data.date ? new Date(data.date + 'T00:00:00.000Z') : null,
        recurrenceEnd: data.recurrenceEnd ? new Date(data.recurrenceEnd + 'T00:00:00.000Z') : null,
      },
      include: { exceptions: true },
    });

    return reply.code(201).send(commitment);
  });

  // PATCH /commitments/:id
  app.patch('/commitments/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const data = commitmentUpdateSchema.parse(request.body);

    await assertOwnsCommitment(prisma, id, clerkUserId);

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData['title'] = data.title.trim();
    if (data.description !== undefined) updateData['description'] = data.description?.trim() ?? null;
    if (data.type !== undefined) updateData['type'] = data.type;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.workspaceId !== undefined) updateData['workspaceId'] = data.workspaceId ?? null;
    if (data.projectId !== undefined) updateData['projectId'] = data.projectId ?? null;
    if (data.startTime !== undefined) updateData['startTime'] = data.startTime ?? null;
    if (data.durationMin !== undefined) updateData['durationMin'] = data.durationMin ?? null;
    if (data.recurrenceDays !== undefined) updateData['recurrenceDays'] = data.recurrenceDays;
    if (data.date !== undefined) updateData['date'] = data.date ? new Date(data.date + 'T00:00:00.000Z') : null;
    if (data.recurrenceEnd !== undefined) updateData['recurrenceEnd'] = data.recurrenceEnd ? new Date(data.recurrenceEnd + 'T00:00:00.000Z') : null;

    return prisma.commitment.update({
      where: { id },
      data: updateData,
      include: { exceptions: true },
    });
  });

  // DELETE /commitments/:id — encerra (soft) ou deleta (hard com ?hard=true)
  app.delete('/commitments/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { hard } = z.object({ hard: z.coerce.boolean().default(false) }).parse(request.query);

    await assertOwnsCommitment(prisma, id, clerkUserId);

    if (hard) {
      await prisma.commitment.delete({ where: { id } });
    } else {
      await prisma.commitment.update({ where: { id }, data: { status: 'encerrado' } });
    }

    return reply.code(200).send({ ok: true });
  });

  // POST /commitments/:id/exceptions — cancelar ou remarcar uma ocorrência
  app.post('/commitments/:id/exceptions', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const data = z.object({
      date: z.string(),                     // YYYY-MM-DD — ocorrência afetada
      action: z.enum(['cancelled', 'rescheduled']),
      newDate: z.string().optional().nullable(),  // YYYY-MM-DD
      newTime: z.string().optional().nullable(),  // HH:mm
      note: z.string().optional().nullable(),
    }).parse(request.body);

    await assertOwnsCommitment(prisma, id, clerkUserId);

    const exception = await prisma.commitmentException.upsert({
      where: { commitmentId_date: { commitmentId: id, date: new Date(data.date + 'T00:00:00.000Z') } },
      update: {
        action: data.action,
        newDate: data.newDate ? new Date(data.newDate + 'T00:00:00.000Z') : null,
        newTime: data.newTime ?? null,
        note: data.note ?? null,
      },
      create: {
        commitmentId: id,
        date: new Date(data.date + 'T00:00:00.000Z'),
        action: data.action,
        newDate: data.newDate ? new Date(data.newDate + 'T00:00:00.000Z') : null,
        newTime: data.newTime ?? null,
        note: data.note ?? null,
      },
    });

    return reply.code(201).send(exception);
  });

  // DELETE /commitments/:id/exceptions/:date — remove exceção (restaura ocorrência)
  app.delete('/commitments/:id/exceptions/:date', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id, date } = z.object({ id: z.string().uuid(), date: z.string() }).parse(request.params);

    await assertOwnsCommitment(prisma, id, clerkUserId);

    await prisma.commitmentException.deleteMany({
      where: { commitmentId: id, date: new Date(date + 'T00:00:00.000Z') },
    });
    return reply.code(200).send({ ok: true });
  });

  // GET /commitments/week/:weekStart — retorna todos os compromissos da semana (7 dias)
  app.get('/commitments/week/:weekStart', async (request) => {
    const clerkUserId = getUserId(request);
    const { weekStart } = z
      .object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(request.params);
    const { workspaceId } = z.object({ workspaceId: z.string().optional() }).parse(request.query);

    const startDate = new Date(weekStart + 'T00:00:00.000Z');
    const occurrences = await occurrenceService.listWeek(clerkUserId, weekStart, workspaceId);

    const result: Record<string, typeof occurrences> = {};
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setUTCDate(day.getUTCDate() + i);
      const dayKey = day.toISOString().slice(0, 10);
      result[dayKey] = [];
    }

    for (const occurrence of occurrences) {
      result[occurrence.date]?.push(occurrence);
    }

    return result;
  });
}
