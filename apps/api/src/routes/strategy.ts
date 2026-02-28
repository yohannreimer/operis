import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { StrategyService } from '../services/strategy-service.js';

const reviewPeriodSchema = z.enum(['weekly', 'monthly']);
const commitmentLevelSchema = z.enum(['baixo', 'medio', 'alto']);

export function registerStrategyRoutes(app: FastifyInstance, strategyService: StrategyService) {
  app.get('/strategy/workspace-portfolio', async (request) => {
    const query = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      })
      .parse(request.query);

    return strategyService.getWorkspacePortfolio(query);
  });

  app.get('/strategy/weekly-allocation', async (request) => {
    const query = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return strategyService.getWeeklyAllocation(query);
  });

  app.put('/strategy/weekly-allocation/:weekStart', async (request) => {
    const params = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.params);

    const payload = z
      .object({
        allocations: z
          .array(
            z.object({
              workspaceId: z.string().uuid(),
              plannedPercent: z.number().min(0).max(100)
            })
          )
          .min(1)
      })
      .parse(request.body);

    return strategyService.setWeeklyAllocation({
      weekStart: params.weekStart,
      allocations: payload.allocations
    });
  });

  app.get('/strategy/weekly-review', async (request) => {
    const query = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return strategyService.getWeeklyReview(query);
  });

  app.get('/strategy/monthly-review', async (request) => {
    const query = z
      .object({
        monthStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return strategyService.getMonthlyReview(query);
  });

  app.get('/strategy/review-journal', async (request) => {
    const query = z
      .object({
        periodType: reviewPeriodSchema,
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return strategyService.getReviewJournal(query);
  });

  app.put('/strategy/review-journal/:periodType/:periodStart', async (request) => {
    const params = z
      .object({
        periodType: reviewPeriodSchema,
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.params);

    const payload = z
      .object({
        workspaceId: z.string().uuid().optional(),
        nextPriority: z.string().max(320).optional(),
        strategicDecision: z.string().max(420).optional(),
        commitmentLevel: commitmentLevelSchema.optional(),
        actionItems: z.array(z.string().max(200)).max(12).optional(),
        reflection: z.string().max(900).optional()
      })
      .parse(request.body);

    return strategyService.saveReviewJournal({
      periodType: params.periodType,
      periodStart: params.periodStart,
      workspaceId: payload.workspaceId,
      nextPriority: payload.nextPriority,
      strategicDecision: payload.strategicDecision,
      commitmentLevel: payload.commitmentLevel,
      actionItems: payload.actionItems,
      reflection: payload.reflection
    });
  });

  app.get('/strategy/review-history', async (request) => {
    const query = z
      .object({
        periodType: reviewPeriodSchema,
        workspaceId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(24).optional()
      })
      .parse(request.query);

    return strategyService.getReviewHistory(query);
  });

  app.post('/strategy/ghost-fronts/:workspaceId/resolve', async (request) => {
    const params = z
      .object({
        workspaceId: z.string().uuid()
      })
      .parse(request.params);

    const payload = z
      .object({
        action: z.enum(['reativar', 'standby', 'criar_tarefa_a'])
      })
      .parse(request.body);

    return strategyService.resolveGhostFront({
      workspaceId: params.workspaceId,
      action: payload.action
    });
  });
}
