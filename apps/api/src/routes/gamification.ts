import { FastifyInstance } from 'fastify';

import { GamificationService } from '../services/gamification-service.js';

export function registerGamificationRoutes(app: FastifyInstance, gamificationService: GamificationService) {
  app.get('/gamification', async () => {
    return gamificationService.getOverview();
  });

  app.get('/gamification/details', async () => {
    return gamificationService.getDetails();
  });
}
