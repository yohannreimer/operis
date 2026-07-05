import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { DayPlanService } from '../services/day-plan-service.js';
import { getUserId } from '../middleware/auth.js';

export function registerDayPlanRoutes(app: FastifyInstance, dayPlanService: DayPlanService) {
  app.get('/day-plans/:date', async (request) => {
    const clerkUserId = getUserId(request);
    const params = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.params);

    const plan = await dayPlanService.getByDate(params.date, clerkUserId);
    return plan ?? { date: params.date, items: [] };
  });

  app.post('/day-plans/:date/items', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const params = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.params);

    const payload = z
      .object({
        taskId: z.string().uuid().optional().nullable(),
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
        orderIndex: z.number().int().optional(),
        blockType: z.enum(['task', 'fixed'])
      })
      .parse(request.body);

    const item = await dayPlanService.addItem({
      clerkUserId,
      date: params.date,
      ...payload
    });

    return reply.code(201).send(item);
  });

  app.post('/day-plan-items/:id/confirmation', async (request) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        action: z.enum(['done', 'not_done', 'postpone']),
        reason: z
          .enum(['energia', 'medo', 'distracao', 'dependencia', 'falta_clareza', 'falta_habilidade'])
          .optional()
      })
      .parse(request.body);

    if (payload.action === 'done') {
      return dayPlanService.confirmDone(params.id, clerkUserId);
    }

    if (payload.action === 'postpone') {
      return dayPlanService.postpone(params.id, payload.reason, clerkUserId);
    }

    return dayPlanService.confirmNotDone(params.id, payload.reason, clerkUserId);
  });

  app.patch('/day-plan-items/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        taskId: z.string().uuid().nullable().optional(),
        startTime: z.string().datetime().optional(),
        endTime: z.string().datetime().optional(),
        orderIndex: z.number().int().optional(),
        blockType: z.enum(['task', 'fixed']).optional()
      })
      .parse(request.body);

    return dayPlanService.updateItem(params.id, payload, clerkUserId);
  });

  app.delete('/day-plan-items/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return dayPlanService.removeItem(params.id, clerkUserId);
  });
}
