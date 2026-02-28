import { FastifyInstance } from 'fastify';
import { PrismaClient, TaskHorizon } from '@prisma/client';
import { z } from 'zod';

export function registerInboxRoutes(app: FastifyInstance, prisma: PrismaClient) {
  function ensureExecutableTitle(raw: string) {
    const normalized = raw.trim();
    if (!normalized) {
      return 'Executar item da inbox';
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return normalized;
    }

    return `Executar ${normalized}`;
  }

  app.get('/inbox', async () => {
    return prisma.inboxItem.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
  });

  app.post('/inbox', async (request, reply) => {
    const payload = z
      .object({
        content: z.string().min(1),
        source: z.enum(['whatsapp', 'app']).default('app')
      })
      .parse(request.body);

    const item = await prisma.inboxItem.create({
      data: {
        content: payload.content,
        source: payload.source,
        processed: false
      }
    });

    return reply.code(201).send(item);
  });

  app.post('/inbox/:id/process', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        action: z.enum(['task', 'project', 'discard']),
        workspaceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        horizon: z.nativeEnum(TaskHorizon).optional(),
        title: z.string().optional()
      })
      .parse(request.body);

    const inboxItem = await prisma.inboxItem.findUnique({
      where: { id: params.id }
    });

    if (!inboxItem) {
      throw new Error('Inbox item não encontrado.');
    }

    if (payload.action === 'task') {
      if (!payload.workspaceId) {
        throw new Error('workspaceId (frente) é obrigatório para criar tarefa.');
      }

      const title = ensureExecutableTitle(payload.title ?? inboxItem.content);

      await prisma.task.create({
        data: {
          workspaceId: payload.workspaceId,
          projectId: payload.projectId,
          title,
          description: inboxItem.content,
          definitionOfDone: `Finalizar: ${title}`,
          taskType: 'b',
          energyLevel: 'media',
          executionKind: 'operacao',
          status: 'backlog',
          horizon: payload.horizon ?? 'active',
          priority: 3,
          estimatedMinutes: 30
        }
      });
    }

    if (payload.action === 'project') {
      if (!payload.workspaceId) {
        throw new Error('workspaceId (frente) é obrigatório para criar projeto.');
      }

      await prisma.project.create({
        data: {
          workspaceId: payload.workspaceId,
          title: payload.title ?? inboxItem.content,
          description: inboxItem.content,
          status: 'ativo'
        }
      });
    }

    await prisma.inboxItem.update({
      where: { id: params.id },
      data: { processed: true }
    });

    return { ok: true };
  });
}
