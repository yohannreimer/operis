import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { requireAuth } from './middleware/auth.js';
import { env } from './config.js';

import { prisma } from './db.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerDayPlanRoutes } from './routes/day-plans.js';
import { registerInboxRoutes } from './routes/inbox.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerGamificationRoutes } from './routes/gamification.js';
import { registerRecurringBlockRoutes } from './routes/recurring-blocks.js';
import { registerDeepWorkRoutes } from './routes/deep-work.js';
import { registerExecutionRoutes } from './routes/execution.js';
import { registerStrategyRoutes } from './routes/strategy.js';
import { commitmentsRoutes } from './routes/commitments.js';
import { registerHabitRoutes } from './routes/habits.js';
import { registerCanvasRoutes } from './routes/canvas.js';
import { TaskService } from './services/task-service.js';
import { DayPlanService } from './services/day-plan-service.js';
import { GamificationService } from './services/gamification-service.js';
import { WhatsappCommandService } from './services/whatsapp-command-service.js';
import { DeepWorkService } from './services/deep-work-service.js';
import { ExecutionInsightsService } from './services/execution-insights-service.js';
import { StrategyService } from './services/strategy-service.js';
import { WhatsappConversationService } from './services/whatsapp-conversation-service.js';
import { WhatsappAutoDispatchService } from './services/whatsapp-auto-dispatch-service.js';
import { WhatsappLLMService } from './services/whatsapp-llm-service.js';
import { InboxWatcherService } from './services/inbox-watcher-service.js';
import { UserPhoneService } from './services/user-phone-service.js';
import { registerUserPhoneRoutes } from './routes/user-phone.js';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 30 * 1024 * 1024
  });
  const allowedCorsOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin(origin, callback) {
      if (!origin || allowedCorsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  });
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW,
    errorResponseBuilder(_request, context) {
      const error = new Error(`Too many requests. Try again in ${context.after}.`);
      (error as Error & { statusCode: number }).statusCode = context.statusCode;
      return error;
    }
  });
  await app.register(websocket);

  app.addHook('preHandler', requireAuth);

  const gamificationService = new GamificationService(prisma);
  const taskService = new TaskService(prisma);
  const dayPlanService = new DayPlanService(prisma, taskService);
  const deepWorkService = new DeepWorkService(prisma);
  const executionInsightsService = new ExecutionInsightsService(prisma);
  const strategyService = new StrategyService(prisma);
  const whatsappCommandService = new WhatsappCommandService(
    prisma,
    taskService,
    executionInsightsService,
    deepWorkService,
    dayPlanService
  );
  const whatsappLLMService = new WhatsappLLMService();
  const whatsappConversationService = new WhatsappConversationService(
    prisma,
    whatsappCommandService,
    whatsappLLMService
  );
  const whatsappAutoDispatchService = new WhatsappAutoDispatchService(
    app.log,
    whatsappCommandService,
    prisma
  );
  whatsappAutoDispatchService.setConversationService(whatsappConversationService);

  app.get('/health', async () => ({ ok: true }));

  registerWorkspaceRoutes(app, prisma);
  registerProjectRoutes(app, prisma);
  registerTaskRoutes(app, taskService);
  registerDayPlanRoutes(app, dayPlanService);
  registerDeepWorkRoutes(app, deepWorkService);
  registerExecutionRoutes(app, executionInsightsService);
  registerStrategyRoutes(app, strategyService);
  registerRecurringBlockRoutes(app, prisma, dayPlanService);
  registerInboxRoutes(app, prisma, deepWorkService);
  registerNoteRoutes(app, prisma);
  registerGamificationRoutes(app, gamificationService);
  const userPhoneService = new UserPhoneService(prisma);
  registerWebhookRoutes(app, whatsappCommandService, whatsappConversationService, prisma, userPhoneService);
  app.register(commitmentsRoutes, { prisma });
  registerHabitRoutes(app, prisma);
  registerCanvasRoutes(app, prisma);

  registerUserPhoneRoutes(app, userPhoneService);

  const inboxWatcherService = new InboxWatcherService(prisma);
  inboxWatcherService.start();

  whatsappAutoDispatchService.start();
  app.addHook('onClose', async () => {
    inboxWatcherService.stop();
    whatsappAutoDispatchService.stop();
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const httpError = error as Error & { statusCode?: number; validation?: unknown };
    const statusCode = httpError.statusCode && httpError.statusCode >= 400 ? httpError.statusCode : 500;

    if (statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: httpError.message
        }
      });
    }

    if (statusCode >= 500) {
      return reply.status(statusCode).send({
        error: env.NODE_ENV === 'production' ? 'Erro interno.' : httpError.message
      });
    }

    return reply.status(statusCode).send({
      error: httpError.message
    });
  });

  return app;
}
