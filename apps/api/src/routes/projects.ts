import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma, PrismaClient, ProjectMetricKind, ProjectStatus, ProjectType } from '@prisma/client';
import {
  safeRecordStrategicDecisionEvent,
  signalFromImpact
} from '../services/strategic-decision-service.js';
import { refreshGhostProjects } from '../services/project-ghost-service.js';

function startOfWeekUtc(input: Date) {
  const base = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const weekday = base.getUTCDay();
  const diff = (weekday + 6) % 7;
  base.setUTCDate(base.getUTCDate() - diff);
  return base;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cleanText(value?: string | null) {
  if (value === null) {
    return null;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeMetricPayload(input: {
  kind: ProjectMetricKind;
  name: string;
  description?: string | null;
  targetValue?: number | null;
  baselineValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
}) {
  return {
    kind: input.kind,
    name: input.name.trim(),
    description: cleanText(input.description),
    targetValue: input.targetValue ?? null,
    baselineValue: input.baselineValue ?? null,
    currentValue: input.currentValue ?? null,
    unit: cleanText(input.unit)
  };
}

const projectMetricSchema = z.object({
  kind: z.nativeEnum(ProjectMetricKind),
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional().nullable(),
  targetValue: z.number().finite().optional().nullable(),
  baselineValue: z.number().finite().optional().nullable(),
  currentValue: z.number().finite().optional().nullable(),
  unit: z.string().max(40).optional().nullable()
});

const workspaceIdQuerySchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized === 'all') {
    return undefined;
  }

  return normalized;
}, z.string().uuid().optional());

export function registerProjectRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get('/projects', async (request) => {
    const query = z
      .object({
        workspaceId: workspaceIdQuerySchema
      })
      .parse(request.query);

    await refreshGhostProjects(prisma, {
      workspaceId: query.workspaceId
    });

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
        description: z.string().optional().nullable(),
        status: z.nativeEnum(ProjectStatus).optional(),
        type: z.nativeEnum(ProjectType).optional(),
        objective: z.string().max(300).optional().nullable(),
        primaryMetric: z.string().max(120).optional().nullable(),
        actionStatement: z.string().max(240).optional().nullable(),
        timeHorizonEnd: z.string().datetime().optional().nullable(),
        resultStartValue: z.number().finite().optional().nullable(),
        resultCurrentValue: z.number().finite().optional().nullable(),
        resultTargetValue: z.number().finite().optional().nullable(),
        scorecardCadenceDays: z.number().int().min(1).max(14).optional(),
        metrics: z.array(projectMetricSchema).max(12).optional()
      })
      .parse(request.body);

    const project = await prisma.project.create({
      data: {
        workspaceId: payload.workspaceId,
        title: payload.title.trim(),
        description: cleanText(payload.description),
        type: payload.type ?? 'operacao',
        objective: cleanText(payload.objective),
        primaryMetric: cleanText(payload.primaryMetric),
        actionStatement: cleanText(payload.actionStatement),
        timeHorizonEnd: payload.timeHorizonEnd ? new Date(payload.timeHorizonEnd) : null,
        resultStartValue: payload.resultStartValue ?? null,
        resultCurrentValue: payload.resultCurrentValue ?? null,
        resultTargetValue: payload.resultTargetValue ?? null,
        scorecardCadenceDays: payload.scorecardCadenceDays ?? 7,
        status: payload.status ?? 'ativo',
        metrics: payload.metrics?.length
          ? {
              create: payload.metrics.map((metric) => normalizeMetricPayload(metric))
            }
          : undefined
      },
      include: {
        workspace: true
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      source: 'project_route',
      eventCode: 'project_created',
      signal: project.status === 'ativo' ? 'executiva' : 'neutra',
      impactScore: project.status === 'ativo' ? 4 : 1,
      title: `Projeto criado: ${project.title}`,
      rationale: 'Novo vetor estratégico adicionado ao portfólio.',
      payload: {
        status: project.status,
        type: project.type,
        cadenceDays: payload.scorecardCadenceDays ?? 7,
        metricsCount: payload.metrics?.length ?? 0
      }
    });

    return reply.code(201).send(project);
  });

  app.patch('/projects/:projectId', async (request) => {
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        title: z.string().min(2).optional(),
        description: z.string().nullable().optional(),
        status: z.nativeEnum(ProjectStatus).optional(),
        type: z.nativeEnum(ProjectType).optional(),
        objective: z.string().max(300).nullable().optional(),
        primaryMetric: z.string().max(120).nullable().optional(),
        actionStatement: z.string().max(240).nullable().optional(),
        timeHorizonEnd: z.string().datetime().nullable().optional(),
        resultStartValue: z.number().finite().nullable().optional(),
        resultCurrentValue: z.number().finite().nullable().optional(),
        resultTargetValue: z.number().finite().nullable().optional(),
        scorecardCadenceDays: z.number().int().min(1).max(14).optional()
      })
      .parse(request.body);

    const current = await prisma.project.findUniqueOrThrow({
      where: {
        id: params.projectId
      },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        status: true,
        type: true
      }
    });

    const updateData: Prisma.ProjectUpdateInput = {};

    if (payload.title !== undefined) {
      updateData.title = payload.title.trim();
    }
    if (payload.status !== undefined) {
      updateData.status = payload.status;
    }
    if (payload.type !== undefined) {
      updateData.type = payload.type;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
      updateData.description = payload.description === null ? null : cleanText(payload.description);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'objective')) {
      updateData.objective = payload.objective === null ? null : cleanText(payload.objective);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'primaryMetric')) {
      updateData.primaryMetric =
        payload.primaryMetric === null ? null : cleanText(payload.primaryMetric);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'actionStatement')) {
      updateData.actionStatement =
        payload.actionStatement === null ? null : cleanText(payload.actionStatement);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'timeHorizonEnd')) {
      updateData.timeHorizonEnd = payload.timeHorizonEnd ? new Date(payload.timeHorizonEnd) : null;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'resultStartValue')) {
      updateData.resultStartValue = payload.resultStartValue ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'resultCurrentValue')) {
      updateData.resultCurrentValue = payload.resultCurrentValue ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'resultTargetValue')) {
      updateData.resultTargetValue = payload.resultTargetValue ?? null;
    }
    if (payload.scorecardCadenceDays !== undefined) {
      updateData.scorecardCadenceDays = payload.scorecardCadenceDays;
    }

    const updated = await prisma.project.update({
      where: {
        id: params.projectId
      },
      data: updateData
    });

    let impact = 0;
    const notes: string[] = [];

    if (current.status !== updated.status) {
      if (updated.status === 'ativo') {
        impact += 4;
        notes.push('Projeto voltou ao estado ativo.');
      } else if (updated.status === 'latente' || updated.status === 'pausado') {
        impact -= 2;
        notes.push('Projeto perdeu prioridade ativa.');
      } else if (updated.status === 'encerrado' || updated.status === 'arquivado') {
        impact += 1;
        notes.push('Projeto encerrado com decisão explícita.');
      }
    }

    if (current.type !== updated.type) {
      if (updated.type === 'construcao') {
        impact += 2;
        notes.push('Projeto reposicionado para construção.');
      } else if (updated.type === 'operacao') {
        impact -= 1;
        notes.push('Projeto reposicionado para operação.');
      }
    }

    if (notes.length > 0) {
      await safeRecordStrategicDecisionEvent(prisma, {
        workspaceId: updated.workspaceId,
        projectId: updated.id,
        source: 'project_route',
        eventCode: 'project_updated',
        signal: signalFromImpact(impact),
        impactScore: impact,
        title: `Projeto atualizado: ${updated.title}`,
        rationale: notes.join(' '),
        payload: {
          previousStatus: current.status,
          nextStatus: updated.status,
          previousType: current.type,
          nextType: updated.type
        }
      });
    }

    return updated;
  });

  app.post('/projects/:projectId/ghost-action', async (request) => {
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        action: z.enum(['reativar', 'mover_latente', 'encerrar'])
      })
      .parse(request.body);

    const current = await prisma.project.findUniqueOrThrow({
      where: {
        id: params.projectId
      },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        status: true
      }
    });

    const nextStatus: ProjectStatus =
      payload.action === 'reativar'
        ? 'ativo'
        : payload.action === 'mover_latente'
          ? 'latente'
          : 'encerrado';
    const isReactivating = payload.action === 'reativar';

    const updated = await prisma.project.update({
      where: {
        id: current.id
      },
      data: {
        status: nextStatus,
        lastStrategicAt: isReactivating ? new Date() : undefined
      },
      include: {
        workspace: true
      }
    });

    const impact = payload.action === 'reativar' ? 4 : payload.action === 'mover_latente' ? -1 : 1;

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: current.workspaceId,
      projectId: current.id,
      source: 'project_route',
      eventCode: 'project_ghost_resolved',
      signal: signalFromImpact(impact),
      impactScore: impact,
      title:
        payload.action === 'reativar'
          ? `Projeto reativado: ${current.title}`
          : payload.action === 'mover_latente'
            ? `Projeto movido para latente: ${current.title}`
            : `Projeto encerrado após estado fantasma: ${current.title}`,
      rationale:
        payload.action === 'reativar'
          ? 'Projeto fantasma recebeu decisão de retomada com novo ciclo estratégico.'
          : payload.action === 'mover_latente'
            ? 'Projeto fantasma saiu do foco ativo para reduzir fragmentação.'
            : 'Projeto fantasma encerrado com decisão explícita de portfólio.',
      payload: {
        previousStatus: current.status,
        nextStatus,
        action: payload.action
      }
    });

    return updated;
  });

  app.get('/projects/:projectId/scorecard', async (request) => {
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      })
      .parse(request.query);

    const weekStart = startOfWeekUtc(
      query.weekStart ? new Date(`${query.weekStart}T00:00:00.000Z`) : new Date()
    );

    const projectScope = await prisma.project.findUniqueOrThrow({
      where: {
        id: params.projectId
      },
      select: {
        workspaceId: true
      }
    });

    await refreshGhostProjects(prisma, {
      workspaceId: projectScope.workspaceId
    });

    const project = await prisma.project.findUniqueOrThrow({
      where: {
        id: params.projectId
      },
      include: {
        workspace: true,
        metrics: {
          where: {
            archivedAt: null
          },
          orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
          include: {
            checkins: {
              orderBy: {
                weekStart: 'desc'
              },
              take: 12
            }
          }
        }
      }
    });

    const weekKey = toDateKey(weekStart);
    const leadMetrics = project.metrics.filter((metric) => metric.kind === 'lead');
    const lagMetrics = project.metrics.filter((metric) => metric.kind === 'lag');

    const normalizedMetrics = project.metrics.map((metric) => {
      const latestCheckin = metric.checkins[0] ?? null;
      const weekCheckin = metric.checkins.find((checkin) => toDateKey(checkin.weekStart) === weekKey) ?? null;
      const history = [...metric.checkins]
        .sort((left, right) => left.weekStart.getTime() - right.weekStart.getTime())
        .map((checkin) => ({
          id: checkin.id,
          weekStart: toDateKey(checkin.weekStart),
          value: checkin.value,
          note: checkin.note,
          updatedAt: checkin.updatedAt.toISOString()
        }));

      return {
        id: metric.id,
        kind: metric.kind,
        name: metric.name,
        description: metric.description,
        targetValue: metric.targetValue,
        baselineValue: metric.baselineValue,
        currentValue: metric.currentValue,
        unit: metric.unit,
        weekChecked: Boolean(weekCheckin),
        weekCheckin: weekCheckin
          ? {
              id: weekCheckin.id,
              weekStart: toDateKey(weekCheckin.weekStart),
              value: weekCheckin.value,
              note: weekCheckin.note,
              updatedAt: weekCheckin.updatedAt.toISOString()
            }
          : null,
        latestCheckin: latestCheckin
          ? {
              id: latestCheckin.id,
              weekStart: toDateKey(latestCheckin.weekStart),
              value: latestCheckin.value,
              note: latestCheckin.note,
              updatedAt: latestCheckin.updatedAt.toISOString()
            }
          : null,
        history
      };
    });

    const leadCheckinsSubmittedThisWeek = normalizedMetrics.filter(
      (metric) => metric.kind === 'lead' && metric.weekChecked
    ).length;
    const leadCompletedThisWeek = normalizedMetrics.filter(
      (metric) => metric.kind === 'lead' && (metric.weekCheckin?.value ?? 0) > 0
    ).length;
    const weeklyLeadCompliancePercent = leadMetrics.length
      ? Math.round((leadCompletedThisWeek / leadMetrics.length) * 100)
      : 0;

    const lagProgressPercent =
      project.resultTargetValue && Number.isFinite(project.resultTargetValue)
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(
                ((project.resultCurrentValue ?? project.resultStartValue ?? 0) /
                  Math.max(1, project.resultTargetValue)) *
                  100
              )
            )
          )
        : null;

    const latestCheckinAt = project.metrics
      .flatMap((metric) => metric.checkins)
      .map((checkin) => checkin.updatedAt.getTime())
      .sort((left, right) => right - left)[0];

    return {
      project: {
        ...project,
        weekStart: weekKey
      },
      metrics: normalizedMetrics,
      summary: {
        leadMetricsCount: leadMetrics.length,
        lagMetricsCount: lagMetrics.length,
        weeklyLeadCompliancePercent,
        weeklyCheckinsMissing: Math.max(0, leadMetrics.length - leadCheckinsSubmittedThisWeek),
        lagProgressPercent,
        lastScorecardCheckinAt: latestCheckinAt ? new Date(latestCheckinAt).toISOString() : null,
        cadenceDays: project.scorecardCadenceDays,
        isWeeklyCheckinMissing: leadMetrics.length > 0 && leadCheckinsSubmittedThisWeek < leadMetrics.length
      }
    };
  });

  app.post('/projects/:projectId/metrics', async (request, reply) => {
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const payload = projectMetricSchema.parse(request.body);

    const project = await prisma.project.findUniqueOrThrow({
      where: {
        id: params.projectId
      },
      select: {
        id: true,
        title: true,
        workspaceId: true
      }
    });

    const metric = await prisma.projectMetric.create({
      data: {
        projectId: params.projectId,
        ...normalizeMetricPayload(payload)
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      source: 'project_route',
      eventCode: 'project_metric_created',
      signal: 'executiva',
      impactScore: 3,
      title: `Métrica ${payload.kind.toUpperCase()} criada: ${payload.name}`,
      rationale: 'Scorecard 4DX refinado com nova medida de direção/resultado.',
      payload: {
        metricId: metric.id,
        kind: payload.kind
      }
    });

    return reply.code(201).send(metric);
  });

  app.patch('/project-metrics/:metricId', async (request) => {
    const params = z.object({ metricId: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        name: z.string().min(2).max(120).optional(),
        description: z.string().max(240).nullable().optional(),
        targetValue: z.number().finite().nullable().optional(),
        baselineValue: z.number().finite().nullable().optional(),
        currentValue: z.number().finite().nullable().optional(),
        unit: z.string().max(40).nullable().optional(),
        archived: z.boolean().optional()
      })
      .parse(request.body);

    const current = await prisma.projectMetric.findUniqueOrThrow({
      where: {
        id: params.metricId
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        kind: true,
        project: {
          select: {
            workspaceId: true
          }
        }
      }
    });

    const updated = await prisma.projectMetric.update({
      where: {
        id: params.metricId
      },
      data: {
        name: payload.name?.trim(),
        description: payload.description === null ? null : cleanText(payload.description),
        targetValue: payload.targetValue,
        baselineValue: payload.baselineValue,
        currentValue: payload.currentValue,
        unit: payload.unit === null ? null : cleanText(payload.unit),
        archivedAt: payload.archived === undefined ? undefined : payload.archived ? new Date() : null
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: current.project.workspaceId,
      projectId: current.projectId,
      source: 'project_route',
      eventCode: 'project_metric_updated',
      signal: 'neutra',
      impactScore: 1,
      title: `Métrica atualizada: ${current.name}`,
      rationale: 'Parâmetros da métrica foram ajustados no scorecard.',
      payload: {
        metricId: current.id,
        kind: current.kind,
        archived: payload.archived ?? false
      }
    });

    return updated;
  });

  app.delete('/project-metrics/:metricId', async (request) => {
    const params = z.object({ metricId: z.string().uuid() }).parse(request.params);

    const metric = await prisma.projectMetric.findUnique({
      where: {
        id: params.metricId
      },
      select: {
        id: true,
        name: true,
        projectId: true,
        kind: true,
        project: {
          select: {
            workspaceId: true
          }
        }
      }
    });

    if (!metric) {
      throw new Error('Métrica não encontrada.');
    }

    await prisma.projectMetric.delete({
      where: {
        id: metric.id
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: metric.project.workspaceId,
      projectId: metric.projectId,
      source: 'project_route',
      eventCode: 'project_metric_deleted',
      signal: 'risco',
      impactScore: -2,
      title: `Métrica removida: ${metric.name}`,
      rationale: 'Uma métrica foi removida do scorecard 4DX.',
      payload: {
        metricId: metric.id,
        kind: metric.kind
      }
    });

    return {
      ok: true
    };
  });

  app.post('/project-metrics/:metricId/checkins', async (request, reply) => {
    const params = z.object({ metricId: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        value: z.number().finite(),
        note: z.string().max(280).optional().nullable(),
        syncCurrentValue: z.boolean().optional()
      })
      .parse(request.body);

    const metric = await prisma.projectMetric.findUniqueOrThrow({
      where: {
        id: params.metricId
      },
      include: {
        project: {
          select: {
            id: true,
            workspaceId: true,
            title: true
          }
        }
      }
    });

    const weekStart = startOfWeekUtc(
      payload.weekStart ? new Date(`${payload.weekStart}T00:00:00.000Z`) : new Date()
    );

    const checkin = await prisma.projectMetricCheckin.upsert({
      where: {
        projectMetricId_weekStart: {
          projectMetricId: metric.id,
          weekStart
        }
      },
      create: {
        projectMetricId: metric.id,
        projectId: metric.projectId,
        weekStart,
        value: payload.value,
        note: cleanText(payload.note)
      },
      update: {
        value: payload.value,
        note: cleanText(payload.note)
      }
    });

    await prisma.project.update({
      where: {
        id: metric.projectId
      },
      data: {
        lastScorecardCheckinAt: new Date(),
        resultCurrentValue:
          payload.syncCurrentValue === false || metric.kind !== 'lag' ? undefined : payload.value
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: metric.project.workspaceId,
      projectId: metric.projectId,
      source: 'project_route',
      eventCode: 'project_metric_checkin',
      signal: 'executiva',
      impactScore: 2,
      title: `Check-in ${metric.kind.toUpperCase()}: ${metric.name}`,
      rationale: 'Atualização semanal registrada no scorecard 4DX.',
      payload: {
        metricId: metric.id,
        kind: metric.kind,
        weekStart: toDateKey(weekStart),
        value: payload.value
      }
    });

    return reply.code(201).send({
      id: checkin.id,
      metricId: metric.id,
      projectId: metric.projectId,
      weekStart: toDateKey(checkin.weekStart),
      value: checkin.value,
      note: checkin.note,
      updatedAt: checkin.updatedAt.toISOString()
    });
  });

  app.delete('/project-metrics/:metricId/checkins', async (request) => {
    const params = z.object({ metricId: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.query);

    const metric = await prisma.projectMetric.findUniqueOrThrow({
      where: {
        id: params.metricId
      },
      include: {
        project: {
          select: {
            id: true,
            workspaceId: true,
            resultStartValue: true
          }
        }
      }
    });

    const weekStart = startOfWeekUtc(new Date(`${query.weekStart}T00:00:00.000Z`));
    const where = {
      projectMetricId_weekStart: {
        projectMetricId: metric.id,
        weekStart
      }
    } as const;

    const existing = await prisma.projectMetricCheckin.findUnique({ where });
    if (!existing) {
      return {
        ok: true,
        deleted: false
      };
    }

    await prisma.projectMetricCheckin.delete({ where });

    const latestProjectCheckin = await prisma.projectMetricCheckin.findFirst({
      where: {
        projectId: metric.projectId
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (metric.kind === 'lag') {
      const latestLagCheckin = await prisma.projectMetricCheckin.findFirst({
        where: {
          projectMetricId: metric.id
        },
        orderBy: {
          weekStart: 'desc'
        }
      });

      await prisma.project.update({
        where: {
          id: metric.projectId
        },
        data: {
          resultCurrentValue: latestLagCheckin?.value ?? metric.project.resultStartValue ?? null,
          lastScorecardCheckinAt: latestProjectCheckin?.updatedAt ?? null
        }
      });
    } else {
      await prisma.project.update({
        where: {
          id: metric.projectId
        },
        data: {
          lastScorecardCheckinAt: latestProjectCheckin?.updatedAt ?? null
        }
      });
    }

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: metric.project.workspaceId,
      projectId: metric.projectId,
      source: 'project_route',
      eventCode: 'project_metric_checkin_deleted',
      signal: 'neutra',
      impactScore: -1,
      title: `Check-in removido: ${metric.name}`,
      rationale: 'Valor semanal removido do scorecard para correção de registro.',
      payload: {
        metricId: metric.id,
        kind: metric.kind,
        weekStart: toDateKey(weekStart)
      }
    });

    return {
      ok: true,
      deleted: true
    };
  });

  app.delete('/projects/:projectId', async (request) => {
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        cascadeTasks: z.coerce.boolean().optional()
      })
      .parse(request.query);

    const project = await prisma.project.findUnique({
      where: {
        id: params.projectId
      },
      select: {
        id: true,
        title: true,
        workspaceId: true
      }
    });

    if (!project) {
      throw new Error('Projeto não encontrado.');
    }

    const linkedTasks = await prisma.task.count({
      where: {
        projectId: project.id,
        archivedAt: null
      }
    });

    let deletedTasks = 0;

    if (query.cascadeTasks) {
      const deleted = await prisma.task.deleteMany({
        where: {
          projectId: project.id
        }
      });
      deletedTasks = deleted.count;
    }

    await prisma.project.delete({
      where: {
        id: project.id
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: project.workspaceId,
      source: 'project_route',
      eventCode: 'project_deleted',
      signal: 'risco',
      impactScore: -4,
      title: `Projeto excluído: ${project.title}`,
      rationale: query.cascadeTasks
        ? 'Projeto e tarefas vinculadas foram removidos.'
        : 'Projeto removido; tarefas vinculadas ficaram desconectadas.',
      payload: {
        deletedProjectId: project.id,
        linkedTasks,
        deletedTasks,
        cascadeTasks: Boolean(query.cascadeTasks)
      }
    });

    return {
      ok: true,
      linkedTasks,
      deletedTasks
    };
  });
}
