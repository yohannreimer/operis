import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import type { ProjectNextMoveService } from '../services/project-next-move-service.js';

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  nextMoveId: z.string().uuid().optional()
});

export function registerProjectNextMoveRoutes(
  app: FastifyInstance,
  service: ProjectNextMoveService
) {
  app.post('/projects/:projectId/next-moves', async (request, reply) => {
    const { projectId } = paramsSchema.parse(request.params);
    const input = z.object({
      text: z.string().trim().min(2).max(240),
      source: z.enum(['manual', 'recommendation']),
      reason: z.string().trim().max(500).optional(),
      ruleKey: z.string().trim().max(120).optional()
    }).parse(request.body);
    const move = await service.replaceActive(projectId, input, getUserId(request));
    return reply.code(201).send(move);
  });

  app.post('/projects/:projectId/next-moves/:nextMoveId/to-today', async (request, reply) => {
    const { projectId, nextMoveId } = paramsSchema.required({ nextMoveId: true }).parse(request.params);
    const headersResult = z.object({
      'idempotency-key': z.string().trim().min(8).max(200)
    }).safeParse(request.headers);
    if (!headersResult.success) {
      return reply.code(400).send({ error: 'Idempotency-Key é obrigatório.' });
    }
    const headers = headersResult.data;
    return service.sendToToday(projectId, nextMoveId, headers['idempotency-key'], getUserId(request));
  });

  app.post('/projects/:projectId/next-moves/:nextMoveId/resolve', async (request) => {
    const { projectId, nextMoveId } = paramsSchema.required({ nextMoveId: true }).parse(request.params);
    return service.resolve(projectId, nextMoveId, getUserId(request));
  });
}
