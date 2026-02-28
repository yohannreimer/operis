import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ExecutionInsightsService } from '../services/execution-insights-service.js';

export function registerExecutionRoutes(app: FastifyInstance, executionInsightsService: ExecutionInsightsService) {
  app.get('/execution/briefing/:date', async (request) => {
    const params = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.params);

    const query = z
      .object({
        workspaceId: z.string().uuid().optional(),
        strictMode: z.coerce.boolean().optional()
      })
      .parse(request.query);

    return executionInsightsService.getBriefing({
      date: params.date,
      workspaceId: query.workspaceId,
      strictMode: query.strictMode
    });
  });

  app.get('/execution/score/:date', async (request) => {
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

    return executionInsightsService.getExecutionScore({
      date: params.date,
      workspaceId: query.workspaceId
    });
  });

  app.get('/execution/weekly-pulse', async (request) => {
    const query = z
      .object({
        workspaceId: z.string().uuid().optional(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      })
      .parse(request.query);

    return executionInsightsService.getWeeklyPulse({
      workspaceId: query.workspaceId,
      weekStart: query.weekStart
    });
  });

  app.get('/execution/evolution', async (request) => {
    const query = z
      .object({
        workspaceId: z.string().uuid().optional(),
        windowDays: z.coerce.number().int().min(21).max(60).optional()
      })
      .parse(request.query);

    return executionInsightsService.getEvolutionEngine({
      workspaceId: query.workspaceId,
      windowDays: query.windowDays
    });
  });

  app.get('/execution/top3/:date', async (request) => {
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

    return executionInsightsService.getTop3Commitment({
      date: params.date,
      workspaceId: query.workspaceId
    });
  });

  app.put('/execution/top3/:date', async (request) => {
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

    const payload = z
      .object({
        taskIds: z.array(z.string().uuid()).min(1).max(3),
        note: z.string().max(180).optional()
      })
      .parse(request.body);

    return executionInsightsService.commitTop3({
      date: params.date,
      workspaceId: query.workspaceId,
      taskIds: payload.taskIds,
      note: payload.note
    });
  });

  app.delete('/execution/top3/:date', async (request) => {
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

    return executionInsightsService.clearTop3Commitment({
      date: params.date,
      workspaceId: query.workspaceId
    });
  });
}
