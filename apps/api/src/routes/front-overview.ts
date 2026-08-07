import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import type { FrontOverviewService } from '../services/front-overview-service.js';

export function registerFrontOverviewRoutes(app: FastifyInstance, service: FrontOverviewService) {
  app.get('/workspaces/overview', async (request) => {
    return service.list(getUserId(request));
  });

  app.get('/workspaces/:workspaceId/overview', async (request) => {
    const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    return service.detail(workspaceId, getUserId(request));
  });
}
