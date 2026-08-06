import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import type {
  ExecutionSessionRecord,
  ExecutionSessionService
} from '../services/execution-session-service.js';

export type ExecutionSessionDto = {
  id: string;
  kind: 'task' | 'inbox';
  sourceId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  state: 'active' | 'completed' | 'cancelled';
  dayPlanItemId: string | null;
  dailyExecutionItemId: string | null;
};

const idSchema = z.object({ id: z.string().uuid() });
const startSchema = z
  .object({
    sourceType: z.enum(['task', 'inbox']),
    sourceId: z.string().uuid(),
    dayPlanItemId: z.string().uuid().optional().nullable(),
    dailyExecutionItemId: z.string().uuid().optional().nullable()
  })
  .strict();

function parseOrBadRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw Object.assign(new Error(parsed.error.issues[0]?.message ?? 'Dados inválidos.'), {
    statusCode: 400
  });
}

export function toExecutionSessionDto(record: ExecutionSessionRecord): ExecutionSessionDto {
  const source = record.task
    ? { kind: 'task' as const, id: record.task.id, title: record.task.title }
    : record.inboxItem
      ? { kind: 'inbox' as const, id: record.inboxItem.id, title: record.inboxItem.content }
      : null;

  if (!source) {
    throw Object.assign(new Error('Sessão de execução sem origem válida.'), { statusCode: 409 });
  }

  return {
    id: record.id,
    kind: source.kind,
    sourceId: source.id,
    title: source.title,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    state: record.state,
    dayPlanItemId: record.dayPlanItemId,
    dailyExecutionItemId: record.dailyExecutionItemId
  };
}

export function registerExecutionSessionRoutes(
  app: FastifyInstance,
  service: ExecutionSessionService
) {
  app.get('/execution-sessions/active', async (request) => {
    const session = await service.getActive(getUserId(request));
    return session ? toExecutionSessionDto(session) : null;
  });

  app.post('/execution-sessions/start', async (request, reply) => {
    const payload = parseOrBadRequest(startSchema, request.body);
    const session = await service.start(getUserId(request), payload);
    return reply.code(201).send(toExecutionSessionDto(session));
  });

  app.post('/execution-sessions/:id/stop', async (request) => {
    const { id } = parseOrBadRequest(idSchema, request.params);
    return toExecutionSessionDto(await service.stop(getUserId(request), id));
  });

  app.post('/execution-sessions/:id/cancel', async (request) => {
    const { id } = parseOrBadRequest(idSchema, request.params);
    return toExecutionSessionDto(await service.cancel(getUserId(request), id));
  });
}
