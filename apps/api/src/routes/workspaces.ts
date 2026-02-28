import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrismaClient, WorkspaceMode, WorkspaceType } from '@prisma/client';
import {
  safeRecordStrategicDecisionEvent,
  signalFromImpact
} from '../services/strategic-decision-service.js';

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
        type: z.nativeEnum(WorkspaceType),
        category: z.string().min(2).max(48).optional(),
        mode: z.nativeEnum(WorkspaceMode).optional(),
        color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional()
      })
      .parse(request.body);

    const workspace = await prisma.workspace.create({
      data: {
        name: payload.name.trim(),
        type: payload.type,
        category: payload.category?.trim() ?? 'Empresa',
        mode: payload.mode ?? 'manutencao',
        color: payload.color ?? '#2563EB'
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: workspace.id,
      source: 'workspace_route',
      eventCode: 'workspace_created',
      signal: workspace.mode === 'expansao' ? 'executiva' : 'neutra',
      impactScore: workspace.mode === 'expansao' ? 3 : 1,
      title: `Frente criada: ${workspace.name}`,
      rationale: 'Nova frente estratégica registrada.',
      payload: {
        type: workspace.type,
        mode: workspace.mode,
        color: workspace.color
      }
    });

    return reply.code(201).send(workspace);
  });

  app.patch('/workspaces/:workspaceId', async (request) => {
    const params = z
      .object({
        workspaceId: z.string().uuid()
      })
      .parse(request.params);

    const payload = z
      .object({
        name: z.string().min(2).optional(),
        type: z.nativeEnum(WorkspaceType).optional(),
        category: z.string().min(2).max(48).optional(),
        mode: z.nativeEnum(WorkspaceMode).optional(),
        color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional()
      })
      .refine((data) => Object.keys(data).length > 0, {
        message: 'Informe ao menos um campo para atualizar.'
      })
      .parse(request.body);

    const current = await prisma.workspace.findUniqueOrThrow({
      where: {
        id: params.workspaceId
      },
      select: {
        id: true,
        name: true,
        mode: true,
        type: true
      }
    });

    const updated = await prisma.workspace.update({
      where: {
        id: params.workspaceId
      },
      data: {
        name: payload.name?.trim(),
        type: payload.type,
        category: payload.category?.trim(),
        mode: payload.mode,
        color: payload.color
      }
    });

    let impact = 0;
    const notes: string[] = [];

    if (current.mode !== updated.mode) {
      if (updated.mode === 'expansao') {
        impact += 3;
        notes.push('Frente promovida para expansão.');
      } else if (updated.mode === 'standby') {
        impact -= 2;
        notes.push('Frente movida para standby.');
      } else {
        impact += 1;
        notes.push('Frente ajustada para manutenção.');
      }
    }

    if (current.type !== updated.type) {
      notes.push('Tipo da frente alterado.');
      impact += 1;
    }

    if (notes.length > 0) {
      await safeRecordStrategicDecisionEvent(prisma, {
        workspaceId: updated.id,
        source: 'workspace_route',
        eventCode: 'workspace_updated',
        signal: signalFromImpact(impact),
        impactScore: impact,
        title: `Frente atualizada: ${updated.name}`,
        rationale: notes.join(' '),
        payload: {
          previousMode: current.mode,
          nextMode: updated.mode,
          previousType: current.type,
          nextType: updated.type
        }
      });
    }

    return updated;
  });

  app.delete('/workspaces/:workspaceId', async (request) => {
    const params = z
      .object({
        workspaceId: z.string().uuid()
      })
      .parse(request.params);

    const query = z
      .object({
        force: z.coerce.boolean().optional()
      })
      .parse(request.query);

    const workspace = await prisma.workspace.findUnique({
      where: {
        id: params.workspaceId
      },
      select: {
        id: true,
        name: true,
        type: true
      }
    });

    if (!workspace) {
      throw new Error('Frente não encontrada.');
    }

    if (workspace.type === 'geral') {
      throw new Error('Frente geral não pode ser excluída.');
    }

    const [projectsCount, tasksCount] = await Promise.all([
      prisma.project.count({
        where: {
          workspaceId: workspace.id,
          archivedAt: null
        }
      }),
      prisma.task.count({
        where: {
          workspaceId: workspace.id,
          archivedAt: null
        }
      })
    ]);

    if (!query.force && (projectsCount > 0 || tasksCount > 0)) {
      throw new Error(
        `Frente possui ${projectsCount} projeto(s) e ${tasksCount} tarefa(s). Confirme exclusão forçada para continuar.`
      );
    }

    await prisma.workspace.delete({
      where: {
        id: workspace.id
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      source: 'workspace_route',
      eventCode: 'workspace_deleted',
      signal: 'risco',
      impactScore: -6,
      title: `Frente excluída: ${workspace.name}`,
      rationale: 'Remoção de contexto com limpeza estrutural associada.',
      payload: {
        deletedWorkspaceId: workspace.id,
        projectsCount,
        tasksCount
      }
    });

    return {
      ok: true,
      projectsCount,
      tasksCount
    };
  });
}
