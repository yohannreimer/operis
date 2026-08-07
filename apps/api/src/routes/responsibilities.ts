import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import type { ResponsibilityService } from '../services/responsibility-service.js';

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const responsibilityParams = z.object({ responsibilityId: z.string().uuid() });
const cadenceSchema = z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'custom']);
const healthSchema = z.enum(['healthy', 'attention', 'critical']);
const baseObjectSchema = z.object({
  title: z.string().trim().min(2).max(120),
  expectedStandard: z.string().trim().min(2).max(500),
  cadence: cadenceSchema,
  cadenceIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
  health: healthSchema.optional(),
  nextCare: z.string().trim().min(2).max(240),
  nextReviewAt: z.string().datetime()
});
const createSchema = baseObjectSchema.superRefine((input, context) => {
  if (input.cadence === 'custom' && !input.cadenceIntervalDays) {
    context.addIssue({ code: 'custom', path: ['cadenceIntervalDays'], message: 'Cadência personalizada exige intervalo.' });
  }
});
const updateSchema = baseObjectSchema.partial().superRefine((input, context) => {
  if (input.cadence === 'custom' && !input.cadenceIntervalDays) {
    context.addIssue({ code: 'custom', path: ['cadenceIntervalDays'], message: 'Cadência personalizada exige intervalo.' });
  }
});

function invalid(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: 'Dados inválidos.', issues: error.issues });
}

export function registerResponsibilityRoutes(app: FastifyInstance, service: ResponsibilityService) {
  app.get('/workspaces/:workspaceId/responsibilities', async (request) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    return service.list(workspaceId, getUserId(request));
  });

  app.post('/workspaces/:workspaceId/responsibilities', async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const result = await service.create(workspaceId, parsed.data, getUserId(request));
    return reply.code(201).send(result);
  });

  app.patch('/responsibilities/:responsibilityId', async (request, reply) => {
    const { responsibilityId } = responsibilityParams.parse(request.params);
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    return service.update(responsibilityId, parsed.data, getUserId(request));
  });

  app.post('/responsibilities/:responsibilityId/reviews', async (request, reply) => {
    const { responsibilityId } = responsibilityParams.parse(request.params);
    const parsed = z.object({
      health: healthSchema,
      note: z.string().trim().max(2000).optional(),
      nextCare: z.string().trim().min(2).max(240),
      nextReviewAt: z.string().datetime().optional(),
      createTask: z.enum(['backlog', 'today']).optional()
    }).safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const result = await service.review(responsibilityId, parsed.data, getUserId(request));
    return reply.code(201).send(result);
  });

  app.get('/responsibilities/:responsibilityId/reviews', async (request) => {
    const { responsibilityId } = responsibilityParams.parse(request.params);
    return service.reviews(responsibilityId, getUserId(request));
  });

  app.post('/responsibilities/:responsibilityId/pause', async (request, reply) => {
    const { responsibilityId } = responsibilityParams.parse(request.params);
    const parsed = z.object({ paused: z.boolean().default(true) }).safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    return service.pause(responsibilityId, parsed.data.paused, getUserId(request));
  });

  app.post('/responsibilities/:responsibilityId/archive', async (request) => {
    const { responsibilityId } = responsibilityParams.parse(request.params);
    return service.archive(responsibilityId, getUserId(request));
  });
}
