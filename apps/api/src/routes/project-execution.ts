import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { getUserId } from '../middleware/auth.js';
import type { ProjectCockpitService } from '../services/project-cockpit-service.js';
import type { ProjectNextMoveService } from '../services/project-next-move-service.js';

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  nextMoveId: z.string().uuid().optional()
});

const projectMethodologySchema = z.enum([
  'fourdx', 'delivery', 'launch', 'discovery', 'growth', 'entrega', 'exploracao',
  'pipeline', 'captacao', 'campanha', 'processo', 'okr', 'decisao', 'mentoria',
  'autoridade', 'cenario', 'runway', 'sistema_receita', 'funil'
]);

const projectStatusSchema = z.enum([
  'ativo', 'latente', 'encerrado', 'fantasma', 'pausado', 'concluido', 'arquivado'
]);

const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  methodology: projectMethodologySchema,
  title: z.string().trim().min(2).max(160),
  objective: z.string().trim().min(2).max(500),
  timeHorizonEnd: z.string().trim().min(1).nullable().optional(),
  resultStartValue: z.number().finite().nullable().optional(),
  resultCurrentValue: z.number().finite().nullable().optional(),
  resultTargetValue: z.number().finite().nullable().optional(),
  primaryMetric: z.string().trim().max(160).nullable().optional(),
  methodologyData: z.record(z.unknown()).optional(),
  metrics: z.array(z.object({
    kind: z.enum(['lead', 'lag']),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).nullable().optional(),
    targetValue: z.number().finite().nullable().optional(),
    baselineValue: z.number().finite().nullable().optional(),
    currentValue: z.number().finite().nullable().optional(),
    unit: z.string().trim().max(40).nullable().optional()
  })).max(20).optional(),
  nextMove: z.string().trim().min(2).max(240),
  nextMoveDestination: z.enum(['project', 'backlog', 'today'])
});

export function registerProjectCockpitRoutes(
  app: FastifyInstance,
  service: ProjectCockpitService
) {
  app.get('/project-execution', async (request, reply) => {
    const queryResult = z.object({
      workspaceId: z.string().uuid().optional(),
      status: projectStatusSchema.optional(),
      search: z.string().trim().max(160).optional()
    }).safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: 'Filtros de Projetos inválidos.' });
    }
    return service.list(queryResult.data, getUserId(request));
  });

  app.get('/project-execution/:projectId', async (request, reply) => {
    const paramsResult = z.object({ projectId: z.string().uuid() }).safeParse(request.params);
    if (!paramsResult.success) {
      return reply.code(400).send({ error: 'Projeto inválido.' });
    }
    return service.detail(paramsResult.data.projectId, getUserId(request));
  });

  app.post('/project-execution', async (request, reply) => {
    const headersResult = z.object({
      'idempotency-key': z.string().trim().min(8).max(200)
    }).safeParse(request.headers);
    if (!headersResult.success) {
      return reply.code(400).send({ error: 'Idempotency-Key é obrigatório.' });
    }
    const bodyResult = createProjectSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ error: 'Dados do Projeto inválidos.', issues: bodyResult.error.issues });
    }
    const result = await service.create({
      ...bodyResult.data,
      methodologyData: bodyResult.data.methodologyData as Prisma.InputJsonValue | undefined,
      creationKey: headersResult.data['idempotency-key']
    }, getUserId(request));
    return reply.code(201).send(result);
  });
}

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
