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

const projectMethodologySchema = z.enum(['fourdx', 'delivery', 'launch', 'discovery', 'growth']);
type ProjectMethodologyInput = z.infer<typeof projectMethodologySchema>;

const METHODOLOGY_DEFAULTS: Record<
  ProjectMethodologyInput,
  {
    leadOne: string;
    leadTwo: string;
    lagMetric: string;
    actionStatement: string;
  }
> = {
  fourdx: {
    leadOne: 'Medida de direção 1',
    leadTwo: 'Medida de direção 2',
    lagMetric: 'Métrica histórica',
    actionStatement: 'Placar 4DX com duas MDDs e uma lag.'
  },
  delivery: {
    leadOne: 'Marcos críticos concluídos na semana',
    leadTwo: 'Bloqueios críticos resolvidos na semana',
    lagMetric: 'Escopo entregue (%)',
    actionStatement: 'Ritmo de entrega com controle de marcos e bloqueios.'
  },
  launch: {
    leadOne: 'Ativos de lançamento prontos',
    leadTwo: 'Ensaios/checkpoints de lançamento concluídos',
    lagMetric: 'Meta do lançamento (receita/leads/conversão)',
    actionStatement: 'Preparação e execução de janela de lançamento.'
  },
  discovery: {
    leadOne: 'Entrevistas/insights validados',
    leadTwo: 'Experimentos de hipótese executados',
    lagMetric: 'Hipóteses validadas (%)',
    actionStatement: 'Aprendizado estruturado com hipóteses e validações.'
  },
  growth: {
    leadOne: 'Experimentos de crescimento executados',
    leadTwo: 'Iterações de funil concluídas',
    lagMetric: 'Crescimento da métrica norte (%)',
    actionStatement: 'Loops de aquisição, ativação e retenção com iteração contínua.'
  }
};

function defaultMetricsFromMethodology(input: {
  methodology: ProjectMethodologyInput;
  primaryMetric?: string | null;
  resultStartValue?: number | null;
  resultCurrentValue?: number | null;
  resultTargetValue?: number | null;
}) {
  const defaults = METHODOLOGY_DEFAULTS[input.methodology];
  const lagName = cleanText(input.primaryMetric) ?? defaults.lagMetric;

  return [
    normalizeMetricPayload({
      kind: 'lead',
      name: defaults.leadOne,
      unit: 'check-in semanal'
    }),
    normalizeMetricPayload({
      kind: 'lead',
      name: defaults.leadTwo,
      unit: 'check-in semanal'
    }),
    normalizeMetricPayload({
      kind: 'lag',
      name: lagName,
      targetValue: input.resultTargetValue ?? null,
      baselineValue: input.resultStartValue ?? null,
      currentValue: input.resultCurrentValue ?? input.resultStartValue ?? null
    })
  ];
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

const FRAMEWORK_META_PREFIX = '__operis_framework_meta__';

function encodeFrameworkMeta(input: {
  note?: string | null;
  extra?: Record<string, string | number | boolean | null> | null;
}) {
  const payload = {
    v: 1,
    note: cleanText(input.note) ?? null,
    extra: input.extra ?? {}
  };
  return `${FRAMEWORK_META_PREFIX}${JSON.stringify(payload)}`;
}

function parseFrameworkMeta(rawNote?: string | null) {
  if (!rawNote) {
    return null as {
      note: string | null;
      extra: Record<string, string | number | boolean | null>;
    } | null;
  }

  if (!rawNote.startsWith(FRAMEWORK_META_PREFIX)) {
    return null;
  }

  const encoded = rawNote.slice(FRAMEWORK_META_PREFIX.length);
  try {
    const parsed = JSON.parse(encoded) as {
      note?: string | null;
      extra?: Record<string, string | number | boolean | null>;
    };
    return {
      note: cleanText(parsed.note) ?? null,
      extra: parsed.extra ?? {}
    };
  } catch (_error) {
    return null;
  }
}

type MethodologyFrameworkTone = 'ok' | 'risk' | 'neutral' | 'pending';

type MethodologyFrameworkCard = {
  id: string;
  title: string;
  value: string;
  hint: string;
  tone: MethodologyFrameworkTone;
};

type MethodologyFrameworkRitual = {
  id: string;
  title: string;
  status: 'done' | 'pending' | 'risk';
  description: string;
};

type MethodologyFrameworkPayload = {
  methodology: ProjectMethodologyInput;
  guide: string;
  board: {
    chartFamily: 'line' | 'burndown' | 'launch' | 'validation' | 'momentum';
    xAxis: string;
    yAxis: string;
  };
  cards: MethodologyFrameworkCard[];
  rituals: MethodologyFrameworkRitual[];
};

function buildMethodologyFramework(input: {
  methodology: ProjectMethodologyInput;
  objective: string | null | undefined;
  lagMetricName: string;
  lagCurrent: number | null;
  lagTarget: number | null;
  leadDoneCount: number;
  leadMissingCount: number;
  cadenceDays: number;
  daysToDeadline: number | null;
  extras: {
    one: string | null | undefined;
    two: string | null | undefined;
  };
  taskStats: {
    open: number;
    inProgress: number;
    done: number;
    overdue: number;
    restricted: number;
  };
}): MethodologyFrameworkPayload {
  const lagCurrentLabel = input.lagCurrent === null ? 'n/d' : String(input.lagCurrent);
  const lagTargetLabel = input.lagTarget === null ? 'n/d' : String(input.lagTarget);
  const deadlineLabel =
    input.daysToDeadline === null
      ? 'sem prazo'
      : input.daysToDeadline < 0
        ? `vencido há ${Math.abs(input.daysToDeadline)} dia(s)`
        : `D-${input.daysToDeadline}`;

  if (input.methodology === 'delivery') {
    const blocked = input.taskStats.restricted + input.taskStats.overdue;
    return {
      methodology: input.methodology,
      guide: 'Delivery: entregue escopo com marcos claros e remoção contínua de bloqueios.',
      board: {
        chartFamily: 'burndown',
        xAxis: 'Semanas',
        yAxis: 'Escopo restante'
      },
      cards: [
        {
          id: 'scope',
          title: 'Escopo entregue',
          value: `${lagCurrentLabel} / ${lagTargetLabel}`,
          hint: `Métrica: ${input.lagMetricName}`,
          tone: input.lagCurrent !== null && input.lagTarget !== null && input.lagCurrent >= input.lagTarget ? 'ok' : 'neutral'
        },
        {
          id: 'milestones',
          title: 'Marcos da semana',
          value: `${input.leadDoneCount} concluído(s)`,
          hint: `${input.leadMissingCount} marco(s) sem check-in`,
          tone: input.leadMissingCount > 0 ? 'risk' : 'ok'
        },
        {
          id: 'risk',
          title: 'Risco operacional',
          value: `${blocked} ponto(s)`,
          hint: `${input.taskStats.restricted} restrição(ões) + ${input.taskStats.overdue} atraso(s)`,
          tone: blocked > 0 ? 'risk' : 'ok'
        },
        {
          id: 'deadline',
          title: 'Prazo de entrega',
          value: deadlineLabel,
          hint: `Cadência atual: ${input.cadenceDays} dia(s)`,
          tone: input.daysToDeadline !== null && input.daysToDeadline < 0 ? 'risk' : 'neutral'
        }
      ],
      rituals: [
        {
          id: 'review-blockers',
          title: 'Revisar bloqueios críticos',
          status: blocked > 0 ? 'risk' : 'done',
          description: blocked > 0 ? 'Existe gargalo ativo na entrega.' : 'Sem bloqueios críticos abertos.'
        },
        {
          id: 'close-milestones',
          title: 'Fechar marcos da semana',
          status: input.leadMissingCount > 0 ? 'pending' : 'done',
          description: `${input.leadDoneCount} feito(s), ${input.leadMissingCount} pendente(s).`
        }
      ]
    };
  }

  if (input.methodology === 'launch') {
    const readinessRisk = input.leadMissingCount > 0;
    return {
      methodology: input.methodology,
      guide: 'Launch: proteja a janela com readiness alto e plano de contingência acionável.',
      board: {
        chartFamily: 'launch',
        xAxis: 'Semanas da janela',
        yAxis: 'Resultado real vs esperado'
      },
      cards: [
        {
          id: 'window',
          title: 'Janela de lançamento',
          value: deadlineLabel,
          hint: input.daysToDeadline === null ? 'Defina data final para launch.' : 'Mantenha foco até D+14.',
          tone: input.daysToDeadline !== null && input.daysToDeadline < 0 ? 'risk' : 'neutral'
        },
        {
          id: 'readiness',
          title: 'Readiness',
          value: `${Math.max(0, 100 - input.leadMissingCount * 50)}%`,
          hint: `${input.leadMissingCount} checkpoint(s) pendente(s)`,
          tone: readinessRisk ? 'risk' : 'ok'
        },
        {
          id: 'result',
          title: 'Resultado acumulado',
          value: lagCurrentLabel,
          hint: `Meta da janela: ${lagTargetLabel}`,
          tone: input.lagCurrent !== null && input.lagTarget !== null && input.lagCurrent >= input.lagTarget ? 'ok' : 'neutral'
        },
        {
          id: 'contingency',
          title: 'Plano de contingência',
          value: input.extras.two?.trim() || 'pendente',
          hint: input.extras.one?.trim() ? `Canal foco: ${input.extras.one}` : 'Canal principal pendente',
          tone: input.extras.two?.trim() ? 'neutral' : 'risk'
        }
      ],
      rituals: [
        {
          id: 'launch-readiness',
          title: 'Revisão de readiness',
          status: readinessRisk ? 'pending' : 'done',
          description: readinessRisk
            ? 'Existem checkpoints de launch não concluídos.'
            : 'Checkpoints da semana concluídos.'
        },
        {
          id: 'window-guard',
          title: 'Guardião da janela',
          status: input.daysToDeadline !== null && input.daysToDeadline < 0 ? 'risk' : 'done',
          description:
            input.daysToDeadline !== null && input.daysToDeadline < 0
              ? 'Janela expirada. Decida relançamento, extensão ou encerramento.'
              : 'Janela ativa sob monitoramento.'
        }
      ]
    };
  }

  if (input.methodology === 'discovery') {
    const hasDecision = Boolean(input.extras.two?.trim());
    return {
      methodology: input.methodology,
      guide: 'Discovery: execute experimentos para produzir evidência e tomar decisão de ciclo.',
      board: {
        chartFamily: 'validation',
        xAxis: 'Semanas do ciclo',
        yAxis: 'Hipóteses validadas'
      },
      cards: [
        {
          id: 'hypothesis',
          title: 'Hipótese central',
          value: input.objective?.trim() || 'pendente',
          hint: 'Declare explicitamente a hipótese a validar/refutar.',
          tone: input.objective?.trim() ? 'neutral' : 'risk'
        },
        {
          id: 'experiments',
          title: 'Experimentos da semana',
          value: `${input.leadDoneCount} executado(s)`,
          hint: `${input.leadMissingCount} sem check-in`,
          tone: input.leadMissingCount > 0 ? 'pending' : 'ok'
        },
        {
          id: 'evidence',
          title: 'Evidência acumulada',
          value: lagCurrentLabel,
          hint: input.extras.one?.trim() || 'Critério de evidência pendente',
          tone: input.extras.one?.trim() ? 'neutral' : 'risk'
        },
        {
          id: 'decision',
          title: 'Decisão do ciclo',
          value: input.extras.two?.trim() || 'pendente',
          hint: hasDecision ? 'Decisão definida para fechamento do ciclo.' : 'Defina seguir/pivotar/encerrar.',
          tone: hasDecision ? 'ok' : 'pending'
        }
      ],
      rituals: [
        {
          id: 'evidence-review',
          title: 'Revisar evidência',
          status: input.leadMissingCount > 0 ? 'pending' : 'done',
          description: 'Consolide aprendizados e invalidações da semana.'
        },
        {
          id: 'cycle-decision',
          title: 'Tomar decisão do ciclo',
          status: hasDecision ? 'done' : 'pending',
          description: hasDecision ? 'Decisão registrada no projeto.' : 'Falta definir decisão estratégica.'
        }
      ]
    };
  }

  if (input.methodology === 'growth') {
    const momentum = input.lagCurrent !== null && input.lagTarget !== null ? input.lagCurrent / Math.max(1, input.lagTarget) : null;
    return {
      methodology: input.methodology,
      guide: 'Growth: mantenha loops ativos e use a métrica norte para acelerar semanalmente.',
      board: {
        chartFamily: 'momentum',
        xAxis: 'Semanas',
        yAxis: 'Delta da métrica norte'
      },
      cards: [
        {
          id: 'north-star',
          title: 'Métrica norte',
          value: `${lagCurrentLabel} / ${lagTargetLabel}`,
          hint: input.lagMetricName,
          tone: momentum !== null && momentum >= 1 ? 'ok' : 'neutral'
        },
        {
          id: 'loops',
          title: 'Loops em execução',
          value: `${input.leadDoneCount}/${Math.max(2, input.leadDoneCount + input.leadMissingCount)}`,
          hint: `${input.leadMissingCount} loop(s) sem check-in`,
          tone: input.leadMissingCount > 0 ? 'pending' : 'ok'
        },
        {
          id: 'lever',
          title: 'Alavanca principal',
          value: input.extras.one?.trim() || 'pendente',
          hint: 'Alavanca dominante para o ciclo atual',
          tone: input.extras.one?.trim() ? 'neutral' : 'risk'
        },
        {
          id: 'bottleneck',
          title: 'Gargalo atual',
          value: input.extras.two?.trim() || 'pendente',
          hint: 'Ponto de estrangulamento da escala',
          tone: input.extras.two?.trim() ? 'neutral' : 'risk'
        }
      ],
      rituals: [
        {
          id: 'loop-review',
          title: 'Revisão semanal dos loops',
          status: input.leadMissingCount > 0 ? 'pending' : 'done',
          description: 'Fechar loops ativos e iniciar novo ciclo de experimento.'
        },
        {
          id: 'bottleneck-attack',
          title: 'Ataque ao gargalo dominante',
          status: input.extras.two?.trim() ? 'done' : 'pending',
          description: input.extras.two?.trim()
            ? `Gargalo atual: ${input.extras.two}`
            : 'Defina gargalo dominante para o ciclo.'
        }
      ]
    };
  }

  const has4dxObjective = Boolean(input.objective?.trim());
  return {
    methodology: input.methodology,
    guide: '4DX: mantenha duas medidas de direção em dia e atualize a lag semanalmente.',
    board: {
      chartFamily: 'line',
      xAxis: 'Semanas',
      yAxis: 'Métrica histórica'
    },
    cards: [
      {
        id: 'objective',
        title: 'Objetivo 4DX',
        value: input.objective?.trim() || 'pendente',
        hint: 'Formato recomendado: de X para Y em Z tempo.',
        tone: has4dxObjective ? 'neutral' : 'risk'
      },
      {
        id: 'mdds',
        title: 'MDD da semana',
        value: `${input.leadDoneCount}/${Math.max(2, input.leadDoneCount + input.leadMissingCount)}`,
        hint: `${input.leadMissingCount} medida(s) sem check-in`,
        tone: input.leadMissingCount > 0 ? 'pending' : 'ok'
      },
      {
        id: 'lag',
        title: 'Métrica lag',
        value: `${lagCurrentLabel} / ${lagTargetLabel}`,
        hint: input.lagMetricName,
        tone: input.lagCurrent !== null && input.lagTarget !== null && input.lagCurrent >= input.lagTarget ? 'ok' : 'neutral'
      },
      {
        id: 'cadence',
        title: 'Cadência',
        value: `${input.cadenceDays} dia(s)`,
        hint: deadlineLabel,
        tone: input.daysToDeadline !== null && input.daysToDeadline < 0 ? 'risk' : 'neutral'
      }
    ],
    rituals: [
      {
        id: 'weekly-checkin',
        title: 'Fechar check-in semanal',
        status: input.leadMissingCount > 0 ? 'pending' : 'done',
        description: `${input.leadDoneCount} MDD concluída(s), ${input.leadMissingCount} pendente(s).`
      },
      {
        id: 'lag-update',
        title: 'Atualizar lag da semana',
        status: input.lagCurrent !== null ? 'done' : 'pending',
        description: input.lagCurrent !== null ? 'Lag registrada no ciclo atual.' : 'Sem leitura lag atual.'
      }
    ]
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
        methodology: projectMethodologySchema.optional(),
        objective: z.string().max(300).optional().nullable(),
        primaryMetric: z.string().max(120).optional().nullable(),
        actionStatement: z.string().max(240).optional().nullable(),
        methodologyExtraOne: z.string().max(180).optional().nullable(),
        methodologyExtraTwo: z.string().max(180).optional().nullable(),
        timeHorizonEnd: z.string().datetime().optional().nullable(),
        resultStartValue: z.number().finite().optional().nullable(),
        resultCurrentValue: z.number().finite().optional().nullable(),
        resultTargetValue: z.number().finite().optional().nullable(),
        scorecardCadenceDays: z.number().int().min(1).max(14).optional(),
        metrics: z.array(projectMetricSchema).max(12).optional()
      })
      .parse(request.body);

    const methodology = payload.methodology ?? 'fourdx';
    const metricsToCreate =
      payload.metrics?.length && payload.metrics.length > 0
        ? payload.metrics.map((metric) => normalizeMetricPayload(metric))
        : methodology === 'fourdx'
          ? []
          : defaultMetricsFromMethodology({
              methodology,
              primaryMetric: payload.primaryMetric,
              resultStartValue: payload.resultStartValue ?? null,
              resultCurrentValue: payload.resultCurrentValue ?? null,
              resultTargetValue: payload.resultTargetValue ?? null
            });

    const project = await prisma.project.create({
      data: {
        workspaceId: payload.workspaceId,
        title: payload.title.trim(),
        description: cleanText(payload.description),
        type: payload.type ?? 'operacao',
        methodology,
        objective: cleanText(payload.objective),
        primaryMetric: cleanText(payload.primaryMetric),
        actionStatement: cleanText(payload.actionStatement) ?? METHODOLOGY_DEFAULTS[methodology].actionStatement,
        methodologyExtraOne: cleanText(payload.methodologyExtraOne),
        methodologyExtraTwo: cleanText(payload.methodologyExtraTwo),
        timeHorizonEnd: payload.timeHorizonEnd ? new Date(payload.timeHorizonEnd) : null,
        resultStartValue: payload.resultStartValue ?? null,
        resultCurrentValue: payload.resultCurrentValue ?? null,
        resultTargetValue: payload.resultTargetValue ?? null,
        scorecardCadenceDays: payload.scorecardCadenceDays ?? 7,
        status: payload.status ?? 'ativo',
        metrics: metricsToCreate.length
          ? {
              create: metricsToCreate
            }
          : undefined
      } as Prisma.ProjectUncheckedCreateInput,
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
        methodology,
        cadenceDays: payload.scorecardCadenceDays ?? 7,
        metricsCount: metricsToCreate.length
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
        methodology: projectMethodologySchema.optional(),
        objective: z.string().max(300).nullable().optional(),
        primaryMetric: z.string().max(120).nullable().optional(),
        actionStatement: z.string().max(240).nullable().optional(),
        methodologyExtraOne: z.string().max(180).nullable().optional(),
        methodologyExtraTwo: z.string().max(180).nullable().optional(),
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

    const updateData: Record<string, unknown> = {};

    if (payload.title !== undefined) {
      updateData.title = payload.title.trim();
    }
    if (payload.status !== undefined) {
      updateData.status = payload.status;
    }
    if (payload.type !== undefined) {
      updateData.type = payload.type;
    }
    if (payload.methodology !== undefined) {
      updateData.methodology = payload.methodology;
      if (!Object.prototype.hasOwnProperty.call(payload, 'actionStatement')) {
        updateData.actionStatement = METHODOLOGY_DEFAULTS[payload.methodology].actionStatement;
      }
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
    if (Object.prototype.hasOwnProperty.call(payload, 'methodologyExtraOne')) {
      updateData.methodologyExtraOne =
        payload.methodologyExtraOne === null ? null : cleanText(payload.methodologyExtraOne);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'methodologyExtraTwo')) {
      updateData.methodologyExtraTwo =
        payload.methodologyExtraTwo === null ? null : cleanText(payload.methodologyExtraTwo);
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
      data: updateData as Prisma.ProjectUpdateInput
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
          nextType: updated.type,
          methodologyUpdated: Boolean(payload.methodology)
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

    const now = new Date();
    const [openTasks, inProgressTasks, doneTasks, overdueTasks, restrictedTasks] = await Promise.all([
      prisma.task.count({
        where: {
          projectId: params.projectId,
          archivedAt: null,
          status: {
            not: 'feito'
          }
        }
      }),
      prisma.task.count({
        where: {
          projectId: params.projectId,
          archivedAt: null,
          status: 'andamento'
        }
      }),
      prisma.task.count({
        where: {
          projectId: params.projectId,
          archivedAt: null,
          status: 'feito'
        }
      }),
      prisma.task.count({
        where: {
          projectId: params.projectId,
          archivedAt: null,
          status: {
            not: 'feito'
          },
          dueDate: {
            lt: now
          }
        }
      }),
      prisma.taskRestriction.count({
        where: {
          status: 'aberta',
          task: {
            projectId: params.projectId,
            archivedAt: null,
            status: {
              not: 'feito'
            }
          }
        }
      })
    ]);

    const framework = buildMethodologyFramework({
      methodology: project.methodology,
      objective: project.objective,
      lagMetricName: lagMetrics[0]?.name ?? project.primaryMetric ?? METHODOLOGY_DEFAULTS[project.methodology].lagMetric,
      lagCurrent: project.resultCurrentValue ?? project.resultStartValue ?? null,
      lagTarget: project.resultTargetValue ?? null,
      leadDoneCount: leadCompletedThisWeek,
      leadMissingCount: Math.max(0, leadMetrics.length - leadCheckinsSubmittedThisWeek),
      cadenceDays: project.scorecardCadenceDays,
      daysToDeadline: project.timeHorizonEnd
        ? Math.ceil((project.timeHorizonEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null,
      extras: {
        one: project.methodologyExtraOne,
        two: project.methodologyExtraTwo
      },
      taskStats: {
        open: openTasks,
        inProgress: inProgressTasks,
        done: doneTasks,
        overdue: overdueTasks,
        restricted: restrictedTasks
      }
    });

    const leadMetricsOrdered = normalizedMetrics.filter((metric) => metric.kind === 'lead');
    const lagMetricPrimary = normalizedMetrics.find((metric) => metric.kind === 'lag') ?? null;
    const leadOneWeekCheckin = leadMetricsOrdered[0]?.weekCheckin ?? null;
    const leadTwoWeekCheckin = leadMetricsOrdered[1]?.weekCheckin ?? null;
    const lagWeekCheckin = lagMetricPrimary?.weekCheckin ?? null;

    const parsedFrameworkMeta =
      parseFrameworkMeta(leadOneWeekCheckin?.note ?? null) ??
      parseFrameworkMeta(lagWeekCheckin?.note ?? null);

    const frameworkWeekly =
      leadOneWeekCheckin || leadTwoWeekCheckin || lagWeekCheckin
        ? {
            weekStart: weekKey,
            leadOneDone: Boolean((leadOneWeekCheckin?.value ?? 0) > 0),
            leadTwoDone: Boolean((leadTwoWeekCheckin?.value ?? 0) > 0),
            lagValue: lagWeekCheckin?.value ?? null,
            note:
              parsedFrameworkMeta?.note ??
              (lagWeekCheckin?.note && !lagWeekCheckin.note.startsWith(FRAMEWORK_META_PREFIX)
                ? lagWeekCheckin.note
                : null),
            extra: parsedFrameworkMeta?.extra ?? {}
          }
        : null;

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
      },
      framework: {
        ...framework,
        weekly: frameworkWeekly
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

  app.post('/projects/:projectId/framework-checkin', async (request, reply) => {
    const params = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        leadOneDone: z.boolean(),
        leadTwoDone: z.boolean(),
        lagValue: z.number().finite().nullable().optional(),
        note: z.string().max(1200).nullable().optional(),
        extra: z.record(z.union([z.string().max(180), z.number().finite(), z.boolean(), z.null()])).optional()
      })
      .parse(request.body);

    const project = await prisma.project.findUniqueOrThrow({
      where: {
        id: params.projectId
      },
      include: {
        metrics: {
          where: {
            archivedAt: null
          },
          orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });

    const leadMetrics = project.metrics.filter((metric) => metric.kind === 'lead');
    const lagMetric = project.metrics.find((metric) => metric.kind === 'lag') ?? null;
    if (leadMetrics.length < 2 || !lagMetric) {
      throw new Error('Scorecard incompleto: defina 2 métricas lead e 1 métrica lag para check-in guiado.');
    }

    const weekStart = startOfWeekUtc(
      payload.weekStart ? new Date(`${payload.weekStart}T00:00:00.000Z`) : new Date()
    );
    const metaNote = encodeFrameworkMeta({
      note: payload.note ?? null,
      extra: payload.extra ?? {}
    });

    const leadOneCheckin = await prisma.projectMetricCheckin.upsert({
      where: {
        projectMetricId_weekStart: {
          projectMetricId: leadMetrics[0].id,
          weekStart
        }
      },
      create: {
        projectMetricId: leadMetrics[0].id,
        projectId: project.id,
        weekStart,
        value: payload.leadOneDone ? 1 : 0,
        note: metaNote
      },
      update: {
        value: payload.leadOneDone ? 1 : 0,
        note: metaNote
      }
    });

    const leadTwoCheckin = await prisma.projectMetricCheckin.upsert({
      where: {
        projectMetricId_weekStart: {
          projectMetricId: leadMetrics[1].id,
          weekStart
        }
      },
      create: {
        projectMetricId: leadMetrics[1].id,
        projectId: project.id,
        weekStart,
        value: payload.leadTwoDone ? 1 : 0,
        note: null
      },
      update: {
        value: payload.leadTwoDone ? 1 : 0,
        note: null
      }
    });

    let lagCheckin: {
      id: string;
      value: number;
      note: string | null;
      updatedAt: Date;
    } | null = null;

    if (payload.lagValue !== undefined && payload.lagValue !== null) {
      lagCheckin = await prisma.projectMetricCheckin.upsert({
        where: {
          projectMetricId_weekStart: {
            projectMetricId: lagMetric.id,
            weekStart
          }
        },
        create: {
          projectMetricId: lagMetric.id,
          projectId: project.id,
          weekStart,
          value: payload.lagValue,
          note: cleanText(payload.note)
        },
        update: {
          value: payload.lagValue,
          note: cleanText(payload.note)
        }
      });
    }

    await prisma.project.update({
      where: {
        id: project.id
      },
      data: {
        lastScorecardCheckinAt: new Date(),
        resultCurrentValue: payload.lagValue === undefined || payload.lagValue === null ? undefined : payload.lagValue
      }
    });

    await safeRecordStrategicDecisionEvent(prisma, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      source: 'project_route',
      eventCode: 'project_framework_weekly_checkin',
      signal: 'executiva',
      impactScore: 3,
      title: `Check-in guiado ${project.methodology.toUpperCase()}: ${project.title}`,
      rationale: 'Execução semanal registrada por metodologia com leitura estruturada.',
      payload: {
        weekStart: toDateKey(weekStart),
        leadOneMetricId: leadMetrics[0].id,
        leadTwoMetricId: leadMetrics[1].id,
        lagMetricId: lagMetric.id,
        leadOneDone: payload.leadOneDone,
        leadTwoDone: payload.leadTwoDone,
        lagValue: payload.lagValue ?? null
      }
    });

    return reply.code(201).send({
      ok: true,
      weekStart: toDateKey(weekStart),
      leadOne: {
        id: leadOneCheckin.id,
        value: leadOneCheckin.value
      },
      leadTwo: {
        id: leadTwoCheckin.id,
        value: leadTwoCheckin.value
      },
      lag: lagCheckin
        ? {
            id: lagCheckin.id,
            value: lagCheckin.value
          }
        : null
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
