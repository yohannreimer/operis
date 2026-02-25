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
import { TaskService } from './services/task-service.js';
import { DayPlanService } from './services/day-plan-service.js';
import { GamificationService } from './services/gamification-service.js';
import { WhatsappCommandService } from './services/whatsapp-command-service.js';

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
  const whatsappCommandService = new WhatsappCommandService(prisma, taskService);

  app.get('/health', async () => ({ ok: true }));

  registerWorkspaceRoutes(app, prisma);
  registerProjectRoutes(app, prisma);
  registerTaskRoutes(app, taskService);
  registerDayPlanRoutes(app, dayPlanService);
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
