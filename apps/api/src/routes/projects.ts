import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

export function registerProjectRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get('/projects', async (request) => {
    const query = z
      .object({
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return prisma.project.findMany({
      where: {
        workspaceId: query.workspaceId,
        archivedAt: null
      },
      include: {
        workspace: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  });

  app.post('/projects', async (request, reply) => {
    const payload = z
      .object({
        workspaceId: z.string().uuid(),
        title: z.string().min(2),
        description: z.string().optional(),
        status: z.enum(['ativo', 'pausado', 'concluido', 'arquivado']).optional()
      })
      .parse(request.body);

    const project = await prisma.project.create({
      data: {
        workspaceId: payload.workspaceId,
        title: payload.title,
        description: payload.description,
        status: payload.status ?? 'ativo'
      }
    });

    return reply.code(201).send(project);
  });
}
