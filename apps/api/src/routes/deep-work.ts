import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { DeepWorkService } from '../services/deep-work-service.js';

export function registerDeepWorkRoutes(app: FastifyInstance, deepWorkService: DeepWorkService) {
  app.get('/deep-work/active', async (request) => {
    const query = z
      .object({
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return deepWorkService.getActive(query.workspaceId);
  });

  app.get('/deep-work/summary/:date', async (request) => {
    const params = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.params);

    const query = z
      .object({
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return deepWorkService.getSummary({
      date: params.date,
      workspaceId: query.workspaceId
    });
  });

  app.post('/deep-work/start', async (request, reply) => {
    const payload = z
      .object({
        taskId: z.string().uuid(),
        targetMinutes: z.number().int().min(15).max(360).optional(),
        minimumBlockMinutes: z.number().int().min(15).max(180).optional()
      })
      .parse(request.body);

    const session = await deepWorkService.start(payload);
    return reply.code(201).send(session);
  });

  app.post('/deep-work/:sessionId/interruption', async (request) => {
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    return deepWorkService.registerInterruption(params.sessionId);
  });

  app.post('/deep-work/:sessionId/break', async (request) => {
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    return deepWorkService.registerBreak(params.sessionId);
  });

  app.post('/deep-work/:sessionId/stop', async (request) => {
    const params = z.object({ sessionId: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        switchedTask: z.boolean().optional(),
        notes: z.string().max(500).optional()
      })
      .parse(request.body ?? {});

    return deepWorkService.stop(params.sessionId, payload);
  });
}
