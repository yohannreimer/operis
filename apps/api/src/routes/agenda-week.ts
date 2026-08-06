import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import type { AgendaWeekService } from '../services/agenda-week-service.js';

const weekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function registerAgendaWeekRoutes(app: FastifyInstance, service: AgendaWeekService) {
  app.get('/agenda/week/:weekStart', async (request) => {
    const clerkUserId = getUserId(request);
    const parsed = z.object({ weekStart: weekStartSchema }).safeParse(request.params);
    if (!parsed.success) {
      throw badRequest('weekStart inválido.');
    }

    const { weekStart } = parsed.data;
    const start = new Date(`${weekStart}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      start.toISOString().slice(0, 10) !== weekStart ||
      start.getUTCDay() !== 1
    ) {
      throw badRequest('weekStart precisa ser uma segunda-feira.');
    }

    return service.getWeek(clerkUserId, weekStart);
  });
}
