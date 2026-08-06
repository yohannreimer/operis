import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import type {
  DailyExecutionRecord,
  DailyExecutionService
} from '../services/daily-execution-service.js';

export type DailyExecutionDto =
  | {
      id: string;
      kind: 'inbox';
      sourceId: string;
      date: string;
      title: string;
      position: number;
      completedAt: string | null;
      context: string | null;
    }
  | {
      id: string;
      kind: 'task';
      sourceId: string;
      date: string;
      title: string;
      position: number;
      completedAt: string | null;
      project: string | null;
      estimatedMinutes: number | null;
      deadline: string | null;
    };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const idSchema = z.string().uuid('Identificador inválido.');
const assignmentSchema = z.object({
  sourceType: z.enum(['inbox', 'task']),
  sourceId: idSchema
});
const completionSchema = z.object({ completed: z.boolean() }).strict();
const orderSchema = z.object({ orderedIds: z.array(idSchema) }).strict();
const rolloverSchema = z.object({
  action: z.enum(['keep_today', 'return_inbox', 'complete']),
  targetDate: dateSchema
}).strict();

function parseOrBadRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const error = new Error(result.error.issues[0]?.message ?? 'Dados inválidos.') as Error & {
    statusCode: number;
  };
  error.statusCode = 400;
  throw error;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function toDailyExecutionDto(record: DailyExecutionRecord): DailyExecutionDto {
  if (record.sourceType === 'inbox' && record.inboxItem) {
    return {
      id: record.id,
      kind: 'inbox',
      sourceId: record.inboxItem.id,
      date: dateKey(record.date),
      title: record.inboxItem.content,
      position: record.position,
      completedAt: record.completedAt?.toISOString() ?? null,
      context: record.inboxItem.inboxContext?.name ?? record.inboxItem.workspace?.name ?? null
    };
  }
  if (record.sourceType === 'task' && record.task) {
    return {
      id: record.id,
      kind: 'task',
      sourceId: record.task.id,
      date: dateKey(record.date),
      title: record.task.title,
      position: record.position,
      completedAt: record.completedAt?.toISOString() ?? null,
      project: record.task.project?.title ?? null,
      estimatedMinutes: record.task.estimatedMinutes,
      deadline: record.task.dueDate?.toISOString() ?? null
    };
  }
  const error = new Error('DailyExecutionItem sem origem válida.') as Error & { statusCode: number };
  error.statusCode = 409;
  throw error;
}

export function registerDailyExecutionRoutes(
  app: FastifyInstance,
  service: DailyExecutionService
) {
  app.get('/daily-execution/:date', async (request) => {
    const clerkUserId = getUserId(request);
    const params = parseOrBadRequest(z.object({ date: dateSchema }), request.params);
    const [entries, rollover] = await Promise.all([
      service.listDay(clerkUserId, params.date),
      service.listRollover(clerkUserId, params.date)
    ]);
    return {
      entries: entries.map(toDailyExecutionDto),
      rollover: rollover.map(toDailyExecutionDto)
    };
  });

  app.post('/daily-execution/:date/items', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = parseOrBadRequest(z.object({ date: dateSchema }), request.params);
    const payload = parseOrBadRequest(assignmentSchema, request.body);
    const item = await service.assign(clerkUserId, params.date, payload);
    return reply.code(201).send(toDailyExecutionDto(item));
  });

  app.patch('/daily-execution-items/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const params = parseOrBadRequest(z.object({ id: idSchema }), request.params);
    const payload = parseOrBadRequest(completionSchema, request.body);
    return toDailyExecutionDto(
      await service.setCompleted(clerkUserId, params.id, payload.completed)
    );
  });

  app.put('/daily-execution/:date/order', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = parseOrBadRequest(z.object({ date: dateSchema }), request.params);
    const payload = parseOrBadRequest(orderSchema, request.body);
    await service.reorder(clerkUserId, params.date, payload.orderedIds);
    return reply.code(204).send();
  });

  app.delete('/daily-execution-items/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = parseOrBadRequest(z.object({ id: idSchema }), request.params);
    await service.remove(clerkUserId, params.id);
    return reply.code(204).send();
  });

  app.get('/daily-execution/:date/rollover', async (request) => {
    const clerkUserId = getUserId(request);
    const params = parseOrBadRequest(z.object({ date: dateSchema }), request.params);
    const rollover = await service.listRollover(clerkUserId, params.date);
    return rollover.map(toDailyExecutionDto);
  });

  app.post('/daily-execution-items/:id/rollover', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = parseOrBadRequest(z.object({ id: idSchema }), request.params);
    const payload = parseOrBadRequest(rolloverSchema, request.body);
    const resolved = await service.resolveRollover(clerkUserId, params.id, payload);
    if (!resolved) {
      return reply.code(204).send();
    }
    return toDailyExecutionDto(resolved);
  });
}
