import Fastify from 'fastify';
import cors from '@fastify/cors';

import { prisma } from './db.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerDayPlanRoutes } from './routes/day-plans.js';
import { registerInboxRoutes } from './routes/inbox.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerGamificationRoutes } from './routes/gamification.js';
import { registerRecurringBlockRoutes } from './routes/recurring-blocks.js';
import { registerDeepWorkRoutes } from './routes/deep-work.js';
import { registerExecutionRoutes } from './routes/execution.js';
import { registerStrategyRoutes } from './routes/strategy.js';
import { TaskService } from './services/task-service.js';
import { DayPlanService } from './services/day-plan-service.js';
import { GamificationService } from './services/gamification-service.js';
import { WhatsappCommandService } from './services/whatsapp-command-service.js';
import { DeepWorkService } from './services/deep-work-service.js';
import { ExecutionInsightsService } from './services/execution-insights-service.js';
import { StrategyService } from './services/strategy-service.js';

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });

  const gamificationService = new GamificationService(prisma);
  const taskService = new TaskService(prisma);
  const dayPlanService = new DayPlanService(prisma, taskService);
  const deepWorkService = new DeepWorkService(prisma);
  const executionInsightsService = new ExecutionInsightsService(prisma);
  const strategyService = new StrategyService(prisma);
  const whatsappCommandService = new WhatsappCommandService(prisma, taskService);

  app.get('/health', async () => ({ ok: true }));

  registerWorkspaceRoutes(app, prisma);
  registerProjectRoutes(app, prisma);
  registerTaskRoutes(app, taskService);
  registerDayPlanRoutes(app, dayPlanService);
  registerDeepWorkRoutes(app, deepWorkService);
  registerExecutionRoutes(app, executionInsightsService);
  registerStrategyRoutes(app, strategyService);
  registerRecurringBlockRoutes(app, prisma, dayPlanService);
  registerInboxRoutes(app, prisma);
  registerGamificationRoutes(app, gamificationService);
  registerWebhookRoutes(app, whatsappCommandService, prisma);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);

    return reply.status(400).send({
      error: error.message
    });
  });

  return app;
}
