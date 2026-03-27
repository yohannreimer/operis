import { FastifyInstance } from 'fastify';

import { GamificationService } from '../services/gamification-service.js';
import { getUserId } from '../middleware/auth.js';

export function registerGamificationRoutes(app: FastifyInstance, gamificationService: GamificationService) {
  app.get('/gamification', async (request) => {
    const clerkUserId = getUserId(request);
    return gamificationService.getOverview(clerkUserId);
  });

  app.get('/gamification/details', async (request) => {
    const clerkUserId = getUserId(request);
    return gamificationService.getDetails(clerkUserId);
  });
}
