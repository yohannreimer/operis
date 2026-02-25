import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

export function registerWorkspaceRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get('/workspaces', async () => {
    return prisma.workspace.findMany({
      orderBy: {
        createdAt: 'asc'
      }
    });
  });

  app.post('/workspaces', async (request, reply) => {
    const payload = z
      .object({
        name: z.string().min(2),
        type: z.enum(['empresa', 'pessoal', 'geral'])
      })
      .parse(request.body);

    const workspace = await prisma.workspace.create({
      data: payload
    });

    return reply.code(201).send(workspace);
  });
}
