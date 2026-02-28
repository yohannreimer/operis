import { CommitmentLevel, PrismaClient, ReviewPeriodType, WorkspaceMode } from '@prisma/client';
import {
  safeRecordStrategicDecisionEvent,
  signalFromImpact
} from './strategic-decision-service.js';
import { refreshGhostProjects } from './project-ghost-service.js';

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundHours(minutes: number) {
  return Math.round((minutes / 60) * 10) / 10;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class StrategyService {
  constructor(private readonly prisma: PrismaClient) {}

  private classifyFrontHealth(input: {
    workspaceMode: WorkspaceMode;
    activeProjects: number;
    activeProjectsWithTraction: number;
    hasTaskASignal: boolean;
  }) {
    if (input.workspaceMode === 'standby') {
      return {
        status: 'standby' as const,
        label: 'Standby',
        reason: 'Frente em standby: monitorada, sem cobrança de execução.'
      };
    }

    if (input.activeProjectsWithTraction > 0 && input.hasTaskASignal) {
      return {
        status: 'forte' as const,
        label: 'Tração forte',
        reason: 'Projeto ativo com tração recente e tarefa A ativa na semana.'
      };
    }

    if (input.activeProjectsWithTraction > 0) {
      return {
        status: 'estavel' as const,
        label: 'Tração parcial',
        reason: 'Projeto ativo com tração recente, mas sem sinal de tarefa A na semana.'
      };
    }

    if (input.hasTaskASignal) {
      return {
        status: 'estavel' as const,
        label: 'Tração por execução',
        reason: 'Sem projeto ativo com tração, porém com tarefa A ativa na semana.'
      };
    }

    if (input.activeProjects > 0) {
      return {
        status: 'atencao' as const,
        label: 'Atenção',
        reason: 'Projetos ativos sem tração nos últimos 14 dias.'
      };
    }

    return {
      status: 'negligenciada' as const,
      label: 'Negligenciada',
      reason: 'Sem projeto ativo com tração e sem tarefa A em execução nesta semana.'
    };
  }

  private startOfWeek(date: Date) {
    const base = new Date(date);
    base.setHours(0, 0, 0, 0);
    const weekday = base.getDay();
    const diff = (weekday + 6) % 7;
    base.setDate(base.getDate() - diff);
    return base;
  }

  private startOfMonth(date: Date) {
    const base = new Date(date);
    base.setUTCDate(1);
    base.setUTCHours(0, 0, 0, 0);
    return base;
  }

  private normalizeWeekStart(input?: string) {
    if (input) {
      return this.startOfWeek(new Date(`${input}T00:00:00.000Z`));
    }

    return this.startOfWeek(new Date());
  }

  private normalizeMonthStart(input?: string) {
    if (input) {
      return this.startOfMonth(new Date(`${input}T00:00:00.000Z`));
    }

    return this.startOfMonth(new Date());
  }

  private normalizePeriodStart(periodType: ReviewPeriodType, input?: string) {
    if (periodType === 'monthly') {
      return this.normalizeMonthStart(input);
    }

    return this.normalizeWeekStart(input);
  }

  private weekRange(weekStart: Date) {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private monthRange(monthStart: Date) {
    const start = new Date(monthStart);
    const end = new Date(monthStart);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }

  private workspaceScope(workspaceId?: string) {
    return workspaceId ?? '__all__';
  }

  private normalizeActionItems(actionItems?: string[]) {
    if (!actionItems?.length) {
      return [] as string[];
    }

    return actionItems
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 12);
  }

  private actionItemsFromJson(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private async collectWorkspaceMinutes(params: {
    start: Date;
    end: Date;
    workspaceId?: string;
  }) {
    const plans = await this.prisma.dayPlan.findMany({
      where: {
        date: {
          gte: params.start,
          lte: params.end
        }
      },
      include: {
        items: {
          include: {
            task: {
              include: {
                workspace: true
              }
            }
          }
        }
      }
    });

    const workspaceMinutes = new Map<string, { workspaceId: string; name: string; minutes: number }>();
    let disconnectedMinutes = 0;
    let totalTaskMinutes = 0;
    let constructionMinutes = 0;
    let operationMinutes = 0;

    for (const plan of plans) {
      for (const item of plan.items) {
        if (item.blockType !== 'task' || !item.task) {
          continue;
        }

        if (params.workspaceId && item.task.workspaceId !== params.workspaceId) {
          continue;
        }

        const duration = minutesBetween(item.startTime, item.endTime);
        totalTaskMinutes += duration;

        if (item.task.executionKind === 'construcao') {
          constructionMinutes += duration;
        } else {
          operationMinutes += duration;
        }

        if (!item.task.projectId) {
          disconnectedMinutes += duration;
        }

        const current = workspaceMinutes.get(item.task.workspaceId) ?? {
          workspaceId: item.task.workspaceId,
          name: item.task.workspace?.name ?? 'Frente',
          minutes: 0
        };

        current.minutes += duration;
        workspaceMinutes.set(item.task.workspaceId, current);
      }
    }

    return {
      workspaceMinutes,
      totalTaskMinutes,
      disconnectedMinutes,
      constructionMinutes,
      operationMinutes
    };
  }

  private dominantBottleneckFromEvents(
    events: Array<{ eventType: string; failureReason: string | null }>
  ) {
    const reasonLabels: Record<string, string> = {
      energia: 'Energia',
      medo: 'Medo',
      distracao: 'Distração',
      dependencia: 'Dependência',
      falta_clareza: 'Falta de clareza',
      falta_habilidade: 'Falta de habilidade'
    };

    const reasonCounts = new Map<string, number>();
    for (const event of events) {
      if (!['delayed', 'failed'].includes(event.eventType)) {
        continue;
      }

      const key = event.failureReason ?? (event.eventType === 'delayed' ? 'reagendamento' : 'falha_execucao');
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }

    const totalBottleneckBase = Math.max(
      1,
      Array.from(reasonCounts.values()).reduce((sum, value) => sum + value, 0)
    );

    const [dominantKey, dominantCount] = Array.from(reasonCounts.entries()).sort(
      (left, right) => right[1] - left[1]
    )[0] ?? [null, 0];

    if (!dominantKey) {
      return null;
    }

    return {
      key: dominantKey,
      label:
        dominantKey === 'reagendamento'
          ? 'Reagendamento'
          : dominantKey === 'falha_execucao'
            ? 'Falha de execução'
            : reasonLabels[dominantKey] ?? dominantKey,
      percent: clampPercent((dominantCount / totalBottleneckBase) * 100)
    };
  }

  private async ensureWorkspaceExists(workspaceId?: string) {
    if (!workspaceId) {
      return;
    }

    await this.prisma.workspace.findUniqueOrThrow({
      where: {
        id: workspaceId
      },
      select: {
        id: true
      }
    });
  }

  private async collectGhostFronts(params: {
    workspaceId?: string;
    start: Date;
    end: Date;
  }) {
    const [workspaces, projects, tasks] = await Promise.all([
      this.prisma.workspace.findMany({
        where: {
          type: {
            not: 'geral'
          },
          id: params.workspaceId
        },
        select: {
          id: true,
          name: true,
          mode: true
        }
      }),
      this.prisma.project.findMany({
        where: {
          workspaceId: params.workspaceId,
          archivedAt: null,
          status: 'ativo'
        },
        select: {
          workspaceId: true,
          lastStrategicAt: true
        }
      }),
      this.prisma.task.findMany({
        where: {
          workspaceId: params.workspaceId,
          archivedAt: null,
          taskType: 'a',
          OR: [
            {
              status: {
                in: ['backlog', 'hoje', 'andamento']
              }
            },
            {
              status: 'feito',
              completedAt: {
                gte: params.start,
                lte: params.end
              }
            }
          ]
        },
        select: {
          workspaceId: true
        }
      })
    ]);

    const tractionThreshold = new Date(params.end.getTime() - 14 * 24 * 60 * 60 * 1000);
    const projectTractionByWorkspace = new Map<string, number>();
    for (const project of projects) {
      if (project.lastStrategicAt < tractionThreshold) {
        continue;
      }

      projectTractionByWorkspace.set(
        project.workspaceId,
        (projectTractionByWorkspace.get(project.workspaceId) ?? 0) + 1
      );
    }

    const taskASignals = new Set(tasks.map((task) => task.workspaceId));

    return workspaces
      .filter((workspace) => workspace.mode !== 'standby')
      .filter((workspace) => {
        const traction = projectTractionByWorkspace.get(workspace.id) ?? 0;
        const hasTaskSignal = taskASignals.has(workspace.id);
        return traction === 0 && !hasTaskSignal;
      })
      .map((workspace) => ({
        id: workspace.id,
        title: workspace.name,
        workspace: {
          name: workspace.name
        },
        reason: 'Sem projeto ativo com tração e sem tarefa A na semana.'
      }));
  }

  private buildWeeklyAutoDraft(input: {
    completedA: number;
    deepWorkHours: number;
    dominantWorkspaceName: string | null;
    neglectedWorkspaceName: string | null;
    ghostFrontsCount: number;
    dominantBottleneck:
      | {
          key: string;
          label: string;
          percent: number;
        }
      | null;
  }) {
    const actions: string[] = [];
    const dataUsed: string[] = [];

    if (input.completedA < 3) {
      actions.push('Garantir 3 tarefas A concluídas até sexta.');
      dataUsed.push(`Tarefas A concluídas ${input.completedA}`);
    } else {
      actions.push('Manter cadência de tarefas A sem reagendar.');
      dataUsed.push(`Tarefas A concluídas ${input.completedA}`);
    }

    if (input.deepWorkHours < 4) {
      actions.push('Reservar no mínimo 4 blocos de Deep Work de 45 min.');
      dataUsed.push(`Deep Work ${input.deepWorkHours}h`);
    } else {
      actions.push('Proteger blocos de Deep Work já performando.');
      dataUsed.push(`Deep Work ${input.deepWorkHours}h`);
    }

    if (input.neglectedWorkspaceName) {
      actions.push(`Reequilibrar energia para a frente ${input.neglectedWorkspaceName}.`);
      dataUsed.push(`Frente negligenciada ${input.neglectedWorkspaceName}`);
    }

    if (input.ghostFrontsCount > 0) {
      actions.push(`Resolver ${input.ghostFrontsCount} frente(s) fantasma com decisão explícita.`);
      dataUsed.push(`Frentes fantasma ${input.ghostFrontsCount}`);
    }

    if (input.dominantBottleneck) {
      actions.push(`Mitigar gargalo dominante ${input.dominantBottleneck.label} (${input.dominantBottleneck.percent}%).`);
      dataUsed.push(`Gargalo ${input.dominantBottleneck.label} ${input.dominantBottleneck.percent}%`);
    }

    const commitmentLevel: CommitmentLevel =
      input.completedA >= 3 && input.deepWorkHours >= 4
        ? 'alto'
        : input.completedA >= 1 || input.deepWorkHours >= 2
          ? 'medio'
          : 'baixo';

    const strategicDecision =
      input.ghostFrontsCount > 0
        ? 'Reduzir dispersão: resolver frentes fantasma antes de abrir novas iniciativas.'
        : input.neglectedWorkspaceName
          ? `Rebalancear portfólio: subir energia na frente ${input.neglectedWorkspaceName} nesta semana.`
          : 'Proteger execução com foco no Top 3 e cadência de Deep Work.';

    const dominantLabel = input.dominantWorkspaceName ?? 'frente principal';

    return {
      generatedAt: new Date().toISOString(),
      confidence: actions.length >= 4 ? 'alta' : 'media',
      source: 'rule_engine',
      nextPriority: `Fechar alavanca crítica em ${input.neglectedWorkspaceName ?? dominantLabel}.`,
      strategicDecision,
      commitmentLevel,
      actionItems: actions.slice(0, 6),
      reflection:
        input.dominantBottleneck
          ? `O padrão desta semana aponta ${input.dominantBottleneck.label.toLowerCase()}. Corrigir isso antes de expandir escopo.`
          : 'Semana sem gargalo dominante: manter disciplina de execução e priorização.',
      dataUsed
    };
  }

  async getWeeklyAllocation(params: {
    weekStart?: string;
    workspaceId?: string;
  }) {
    await refreshGhostProjects(this.prisma, {
      workspaceId: params.workspaceId
    });

    const weekStart = this.normalizeWeekStart(params.weekStart);
    const { start, end } = this.weekRange(weekStart);

    const [workspaces, plans, actual] = await Promise.all([
      this.prisma.workspace.findMany({
        where: {
          type: {
            not: 'geral'
          },
          id: params.workspaceId
        },
        orderBy: {
          createdAt: 'asc'
        }
      }),
      this.prisma.weeklyEnergyPlan.findMany({
        where: {
          weekStart,
          workspaceId: params.workspaceId
        }
      }),
      this.collectWorkspaceMinutes({
        start,
        end,
        workspaceId: params.workspaceId
      })
    ]);

    const plannedByWorkspace = new Map(plans.map((plan) => [plan.workspaceId, plan.plannedPercent]));
    const totalActualMinutes = Array.from(actual.workspaceMinutes.values()).reduce(
      (sum, entry) => sum + entry.minutes,
      0
    );

    const rows = workspaces.map((workspace) => {
      const plannedPercent = plannedByWorkspace.get(workspace.id) ?? 0;
      const minutes = actual.workspaceMinutes.get(workspace.id)?.minutes ?? 0;
      const actualPercent = totalActualMinutes ? clampPercent((minutes / totalActualMinutes) * 100) : 0;

      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceColor: workspace.color,
        workspaceMode: workspace.mode,
        plannedPercent,
        actualPercent,
        deltaPercent: actualPercent - plannedPercent,
        actualHours: roundHours(minutes)
      };
    });

    return {
      weekStart: toDateKey(weekStart),
      weekEnd: toDateKey(end),
      rows,
      totals: {
        plannedPercent: rows.reduce((sum, row) => sum + row.plannedPercent, 0),
        actualHours: roundHours(totalActualMinutes),
        disconnectedPercent: totalActualMinutes
          ? clampPercent((actual.disconnectedMinutes / totalActualMinutes) * 100)
          : 0
      }
    };
  }

  async getWorkspacePortfolio(params: {
    weekStart?: string;
  }) {
    await refreshGhostProjects(this.prisma);

    const weekStart = this.normalizeWeekStart(params.weekStart);
    const { start, end } = this.weekRange(weekStart);

    const [workspaces, projects, tasks, deepWorkSessions, events, actual] = await Promise.all([
      this.prisma.workspace.findMany({
        where: {
          type: {
            not: 'geral'
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      }),
      this.prisma.project.findMany({
        where: {
          archivedAt: null
        },
        select: {
          id: true,
          workspaceId: true,
          status: true,
          lastStrategicAt: true
        }
      }),
      this.prisma.task.findMany({
        where: {
          archivedAt: null
        },
        select: {
          id: true,
          workspaceId: true,
          taskType: true,
          status: true,
          completedAt: true
        }
      }),
      this.prisma.deepWorkSession.findMany({
        where: {
          startedAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          workspaceId: true,
          startedAt: true,
          state: true,
          actualMinutes: true
        }
      }),
      this.prisma.executionEvent.findMany({
        where: {
          timestamp: {
            gte: start,
            lte: end
          }
        },
        include: {
          task: {
            select: {
              workspaceId: true
            }
          }
        }
      }),
      this.collectWorkspaceMinutes({
        start,
        end
      })
    ]);

    const projectsByWorkspace = new Map<string, Array<{ status: string; lastStrategicAt: Date }>>();
    for (const project of projects) {
      const current = projectsByWorkspace.get(project.workspaceId) ?? [];
      current.push({
        status: project.status,
        lastStrategicAt: project.lastStrategicAt
      });
      projectsByWorkspace.set(project.workspaceId, current);
    }

    const tasksByWorkspace = new Map<
      string,
      Array<{
        taskType: string;
        status: string;
        completedAt: Date | null;
      }>
    >();
    for (const task of tasks) {
      const current = tasksByWorkspace.get(task.workspaceId) ?? [];
      current.push({
        taskType: task.taskType,
        status: task.status,
        completedAt: task.completedAt
      });
      tasksByWorkspace.set(task.workspaceId, current);
    }

    const deepWorkByWorkspace = new Map<string, number>();
    for (const session of deepWorkSessions) {
      const minutes =
        session.state === 'active'
          ? Math.max(0, Math.round((Date.now() - session.startedAt.getTime()) / 60000))
          : session.actualMinutes;
      deepWorkByWorkspace.set(
        session.workspaceId,
        (deepWorkByWorkspace.get(session.workspaceId) ?? 0) + minutes
      );
    }

    const eventsByWorkspace = new Map<
      string,
      Array<{
        eventType: string;
        failureReason: string | null;
      }>
    >();
    for (const event of events) {
      const workspaceId = event.task?.workspaceId;
      if (!workspaceId) {
        continue;
      }

      const current = eventsByWorkspace.get(workspaceId) ?? [];
      current.push({
        eventType: event.eventType,
        failureReason: event.failureReason
      });
      eventsByWorkspace.set(workspaceId, current);
    }

    const tractionThreshold = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);

    const rows = workspaces.map((workspace) => {
      const workspaceProjects = projectsByWorkspace.get(workspace.id) ?? [];
      const workspaceTasks = tasksByWorkspace.get(workspace.id) ?? [];
      const minutesInvested = actual.workspaceMinutes.get(workspace.id)?.minutes ?? 0;
      const deepWorkMinutes = deepWorkByWorkspace.get(workspace.id) ?? 0;

      const completedA = workspaceTasks.filter((task) => {
        if (task.taskType !== 'a' || task.status !== 'feito' || !task.completedAt) {
          return false;
        }

        const completedAt = task.completedAt.getTime();
        return completedAt >= start.getTime() && completedAt <= end.getTime();
      }).length;

      const openA = workspaceTasks.filter(
        (task) => task.taskType === 'a' && ['backlog', 'hoje', 'andamento'].includes(task.status)
      ).length;

      const activeProjects = workspaceProjects.filter((project) => project.status === 'ativo').length;
      const activeProjectsWithTraction = workspaceProjects.filter(
        (project) => project.status === 'ativo' && project.lastStrategicAt >= tractionThreshold
      ).length;
      const stalledProjects = workspaceProjects.filter((project) =>
        ['latente', 'pausado'].includes(project.status)
      ).length;
      const projectTractionPercent = activeProjects
        ? clampPercent((activeProjectsWithTraction / activeProjects) * 100)
        : 0;
      const hasTaskASignal = completedA > 0 || openA > 0;
      const frontHealth = this.classifyFrontHealth({
        workspaceMode: workspace.mode,
        activeProjects,
        activeProjectsWithTraction,
        hasTaskASignal
      });
      const ghostProjects = frontHealth.status === 'negligenciada' ? 1 : 0;

      const dominantBottleneck = this.dominantBottleneckFromEvents(
        eventsByWorkspace.get(workspace.id) ?? []
      );

      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceColor: workspace.color,
        workspaceMode: workspace.mode,
        hoursInvested: roundHours(minutesInvested),
        deepWorkHours: roundHours(deepWorkMinutes),
        completedA,
        openA,
        activeProjects,
        activeProjectsWithTraction,
        projectTractionPercent,
        ghostProjects,
        stalledProjects,
        frontHealth,
        dominantBottleneck
      };
    });

    return {
      weekStart: toDateKey(weekStart),
      weekEnd: toDateKey(end),
      rows
    };
  }

  async setWeeklyAllocation(input: {
    weekStart: string;
    allocations: Array<{ workspaceId: string; plannedPercent: number }>;
  }) {
    const weekStart = this.normalizeWeekStart(input.weekStart);

    const normalized = input.allocations.map((entry) => ({
      workspaceId: entry.workspaceId,
      plannedPercent: Math.max(0, Math.min(100, Math.round(entry.plannedPercent)))
    }));

    const totalPercent = normalized.reduce((sum, entry) => sum + entry.plannedPercent, 0);
    if (totalPercent > 100) {
      throw new Error('A soma dos percentuais planejados não pode ultrapassar 100%.');
    }

    const workspaceIds = normalized.map((entry) => entry.workspaceId);

    const validWorkspaces = await this.prisma.workspace.findMany({
      where: {
        id: {
          in: workspaceIds
        },
        type: {
          not: 'geral'
        }
      },
      select: {
        id: true
      }
    });

    const validSet = new Set(validWorkspaces.map((workspace) => workspace.id));
    const invalid = workspaceIds.filter((workspaceId) => !validSet.has(workspaceId));
    if (invalid.length) {
      throw new Error('Frente inválida na alocação estratégica semanal.');
    }

    await this.prisma.$transaction([
      this.prisma.weeklyEnergyPlan.deleteMany({
        where: {
          weekStart
        }
      }),
      this.prisma.weeklyEnergyPlan.createMany({
        data: normalized.map((entry) => ({
          weekStart,
          workspaceId: entry.workspaceId,
          plannedPercent: entry.plannedPercent
        }))
      })
    ]);

    return this.getWeeklyAllocation({
      weekStart: toDateKey(weekStart)
    });
  }

  async getWeeklyReview(params: {
    weekStart?: string;
    workspaceId?: string;
  }) {
    await refreshGhostProjects(this.prisma, {
      workspaceId: params.workspaceId
    });

    const weekStart = this.normalizeWeekStart(params.weekStart);
    const { start, end } = this.weekRange(weekStart);

    const [allocation, completedA, deepWorkSessions, ghostFronts, events] = await Promise.all([
      this.getWeeklyAllocation({
        weekStart: toDateKey(weekStart),
        workspaceId: params.workspaceId
      }),
      this.prisma.task.count({
        where: {
          workspaceId: params.workspaceId,
          taskType: 'a',
          status: 'feito',
          completedAt: {
            gte: start,
            lte: end
          }
        }
      }),
      this.prisma.deepWorkSession.findMany({
        where: {
          workspaceId: params.workspaceId,
          startedAt: {
            gte: start,
            lte: end
          }
        }
      }),
      this.collectGhostFronts({
        workspaceId: params.workspaceId,
        start,
        end
      }),
      this.prisma.executionEvent.findMany({
        where: {
          timestamp: {
            gte: start,
            lte: end
          },
          task: params.workspaceId
            ? {
                workspaceId: params.workspaceId
              }
            : undefined
        },
        select: {
          eventType: true,
          failureReason: true
        }
      })
    ]);

    const deepWorkMinutes = deepWorkSessions.reduce((sum, session) => {
      if (session.state === 'active') {
        return sum + minutesBetween(session.startedAt, new Date());
      }
      return sum + session.actualMinutes;
    }, 0);

    const sortedByActual = [...allocation.rows].sort((left, right) => right.actualHours - left.actualHours);
    const dominantWorkspace = sortedByActual[0] ?? null;

    const neglectedCandidates = allocation.rows
      .filter((row) => row.plannedPercent > 0)
      .sort((left, right) => left.actualPercent - right.actualPercent);
    const neglectedWorkspace = neglectedCandidates[0] ?? null;

    const dominantBottleneck = this.dominantBottleneckFromEvents(events);
    const autoDraft = this.buildWeeklyAutoDraft({
      completedA,
      deepWorkHours: roundHours(deepWorkMinutes),
      dominantWorkspaceName: dominantWorkspace?.workspaceName ?? null,
      neglectedWorkspaceName: neglectedWorkspace?.workspaceName ?? null,
      ghostFrontsCount: ghostFronts.length,
      dominantBottleneck
    });

    return {
      weekStart: allocation.weekStart,
      weekEnd: allocation.weekEnd,
      summary: {
        completedA,
        deepWorkMinutes,
        deepWorkHours: roundHours(deepWorkMinutes),
        dominantWorkspace,
        neglectedWorkspace,
        ghostProjectsCount: ghostFronts.length,
        ghostProjects: ghostFronts,
        ghostFrontsCount: ghostFronts.length,
        ghostFronts,
        dominantBottleneck
      },
      question: 'O que será prioridade na próxima semana?',
      autoDraft
    };
  }

  async getMonthlyReview(params: {
    monthStart?: string;
    workspaceId?: string;
  }) {
    await refreshGhostProjects(this.prisma, {
      workspaceId: params.workspaceId
    });

    const monthStart = this.normalizeMonthStart(params.monthStart);
    const { start, end } = this.monthRange(monthStart);

    const [workspaces, plans, actual, completedA, deepWorkSessions, ghostFronts, events] = await Promise.all([
      this.prisma.workspace.findMany({
        where: {
          type: {
            not: 'geral'
          },
          id: params.workspaceId
        },
        orderBy: {
          createdAt: 'asc'
        }
      }),
      this.prisma.weeklyEnergyPlan.findMany({
        where: {
          weekStart: {
            gte: start,
            lte: end
          },
          workspaceId: params.workspaceId
        }
      }),
      this.collectWorkspaceMinutes({
        start,
        end,
        workspaceId: params.workspaceId
      }),
      this.prisma.task.count({
        where: {
          workspaceId: params.workspaceId,
          taskType: 'a',
          status: 'feito',
          completedAt: {
            gte: start,
            lte: end
          }
        }
      }),
      this.prisma.deepWorkSession.findMany({
        where: {
          workspaceId: params.workspaceId,
          startedAt: {
            gte: start,
            lte: end
          }
        }
      }),
      this.collectGhostFronts({
        workspaceId: params.workspaceId,
        start,
        end
      }),
      this.prisma.executionEvent.findMany({
        where: {
          timestamp: {
            gte: start,
            lte: end
          },
          task: params.workspaceId
            ? {
                workspaceId: params.workspaceId
              }
            : undefined
        },
        select: {
          eventType: true,
          failureReason: true
        }
      })
    ]);

    const totalActualMinutes = Array.from(actual.workspaceMinutes.values()).reduce(
      (sum, entry) => sum + entry.minutes,
      0
    );

    const plannedByWorkspace = new Map<string, { sum: number; count: number }>();
    for (const plan of plans) {
      const current = plannedByWorkspace.get(plan.workspaceId) ?? { sum: 0, count: 0 };
      current.sum += plan.plannedPercent;
      current.count += 1;
      plannedByWorkspace.set(plan.workspaceId, current);
    }

    const rows = workspaces.map((workspace) => {
      const planBase = plannedByWorkspace.get(workspace.id);
      const plannedPercent = planBase ? Math.round(planBase.sum / Math.max(1, planBase.count)) : 0;
      const minutes = actual.workspaceMinutes.get(workspace.id)?.minutes ?? 0;
      const actualPercent = totalActualMinutes ? clampPercent((minutes / totalActualMinutes) * 100) : 0;

      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceColor: workspace.color,
        workspaceMode: workspace.mode,
        plannedPercent,
        actualPercent,
        deltaPercent: actualPercent - plannedPercent,
        actualHours: roundHours(minutes)
      };
    });

    const sortedByActual = [...rows].sort((left, right) => right.actualHours - left.actualHours);
    const dominantWorkspace = sortedByActual[0] ?? null;

    const neglectedCandidates = rows
      .filter((row) => row.plannedPercent > 0)
      .sort((left, right) => left.actualPercent - right.actualPercent);
    const neglectedWorkspace = neglectedCandidates[0] ?? null;

    const deepWorkMinutes = deepWorkSessions.reduce((sum, session) => {
      if (session.state === 'active') {
        return sum + minutesBetween(session.startedAt, new Date());
      }
      return sum + session.actualMinutes;
    }, 0);

    const compositionBase = Math.max(1, actual.constructionMinutes + actual.operationMinutes);
    const disconnectedBase = Math.max(1, totalActualMinutes);

    const dominantBottleneck = this.dominantBottleneckFromEvents(events);

    const journal = await this.getReviewJournal({
      periodType: 'monthly',
      periodStart: toDateKey(monthStart),
      workspaceId: params.workspaceId
    });

    return {
      monthStart: toDateKey(start),
      monthEnd: toDateKey(end),
      rows,
      composition: {
        constructionPercent: clampPercent((actual.constructionMinutes / compositionBase) * 100),
        operationPercent: clampPercent((actual.operationMinutes / compositionBase) * 100),
        disconnectedPercent: clampPercent((actual.disconnectedMinutes / disconnectedBase) * 100)
      },
      summary: {
        completedA,
        deepWorkMinutes,
        deepWorkHours: roundHours(deepWorkMinutes),
        dominantWorkspace,
        neglectedWorkspace,
        ghostProjectsCount: ghostFronts.length,
        ghostProjects: ghostFronts,
        ghostFrontsCount: ghostFronts.length,
        ghostFronts,
        dominantBottleneck,
        actualHours: roundHours(totalActualMinutes)
      },
      journal: journal.review,
      question: 'Qual realocação de energia vai proteger seu próximo mês estratégico?'
    };
  }

  async getReviewJournal(params: {
    periodType: ReviewPeriodType;
    periodStart?: string;
    workspaceId?: string;
  }) {
    await this.ensureWorkspaceExists(params.workspaceId);

    const periodStart = this.normalizePeriodStart(params.periodType, params.periodStart);
    const workspaceScope = this.workspaceScope(params.workspaceId);

    const review = await this.prisma.strategicReview.findUnique({
      where: {
        periodType_periodStart_workspaceScope: {
          periodType: params.periodType,
          periodStart,
          workspaceScope
        }
      }
    });

    return {
      periodType: params.periodType,
      periodStart: toDateKey(periodStart),
      workspaceId: params.workspaceId ?? null,
      workspaceScope,
      review: review
        ? {
            id: review.id,
            nextPriority: review.nextPriority,
            strategicDecision: review.strategicDecision,
            commitmentLevel: review.commitmentLevel,
            actionItems: this.actionItemsFromJson(review.actionItems),
            reflection: review.reflection,
            reviewSnapshot: review.reviewSnapshot,
            updatedAt: review.updatedAt
          }
        : null
    };
  }

  async saveReviewJournal(input: {
    periodType: ReviewPeriodType;
    periodStart: string;
    workspaceId?: string;
    nextPriority?: string;
    strategicDecision?: string;
    commitmentLevel?: CommitmentLevel;
    actionItems?: string[];
    reflection?: string;
    reviewSnapshot?: unknown;
  }) {
    await this.ensureWorkspaceExists(input.workspaceId);

    const periodStart = this.normalizePeriodStart(input.periodType, input.periodStart);
    const workspaceScope = this.workspaceScope(input.workspaceId);
    const actionItems = this.normalizeActionItems(input.actionItems);

    const review = await this.prisma.strategicReview.upsert({
      where: {
        periodType_periodStart_workspaceScope: {
          periodType: input.periodType,
          periodStart,
          workspaceScope
        }
      },
      update: {
        workspaceId: input.workspaceId ?? null,
        nextPriority: normalizeText(input.nextPriority),
        strategicDecision: normalizeText(input.strategicDecision),
        commitmentLevel: input.commitmentLevel,
        actionItems,
        reflection: normalizeText(input.reflection),
        reviewSnapshot: (input.reviewSnapshot as object | undefined) ?? undefined
      },
      create: {
        periodType: input.periodType,
        periodStart,
        workspaceScope,
        workspaceId: input.workspaceId ?? null,
        nextPriority: normalizeText(input.nextPriority),
        strategicDecision: normalizeText(input.strategicDecision),
        commitmentLevel: input.commitmentLevel,
        actionItems,
        reflection: normalizeText(input.reflection),
        reviewSnapshot: (input.reviewSnapshot as object | undefined) ?? undefined
      }
    });

    const hasDecisionInput = Boolean(
      normalizeText(input.nextPriority) ||
        normalizeText(input.strategicDecision) ||
        normalizeText(input.reflection) ||
        actionItems.length > 0
    );

    if (hasDecisionInput) {
      const commitmentImpact =
        input.commitmentLevel === 'alto' ? 2 : input.commitmentLevel === 'medio' ? 1 : input.commitmentLevel === 'baixo' ? -1 : 0;

      await safeRecordStrategicDecisionEvent(this.prisma, {
        workspaceId: input.workspaceId ?? null,
        source: 'strategy_service',
        eventCode: 'review_journal_updated',
        signal: signalFromImpact(commitmentImpact),
        impactScore: commitmentImpact,
        title: `Revisão ${input.periodType} atualizada`,
        rationale: normalizeText(input.strategicDecision) ?? normalizeText(input.nextPriority) ?? 'Atualização de revisão estratégica.',
        payload: {
          reviewId: review.id,
          periodType: input.periodType,
          periodStart: toDateKey(periodStart),
          workspaceScope,
          commitmentLevel: input.commitmentLevel ?? null,
          actionItems
        }
      });
    }

    return this.getReviewJournal({
      periodType: input.periodType,
      periodStart: toDateKey(periodStart),
      workspaceId: input.workspaceId
    });
  }

  async resolveGhostFront(input: {
    workspaceId: string;
    action: 'reativar' | 'standby' | 'criar_tarefa_a';
  }) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: {
        id: input.workspaceId
      },
      select: {
        id: true,
        name: true,
        mode: true
      }
    });

    let nextMode = workspace.mode;
    let createdTaskId: string | null = null;

    if (input.action === 'reativar') {
      nextMode = 'expansao';
      await this.prisma.workspace.update({
        where: {
          id: workspace.id
        },
        data: {
          mode: nextMode
        }
      });
    } else if (input.action === 'standby') {
      nextMode = 'standby';
      await this.prisma.workspace.update({
        where: {
          id: workspace.id
        },
        data: {
          mode: nextMode
        }
      });
    } else {
      const createdTask = await this.prisma.task.create({
        data: {
          workspaceId: workspace.id,
          title: `Destravar frente ${workspace.name}`,
          definitionOfDone: 'Escolher e iniciar 1 alavanca A desta frente ainda nesta semana.',
          taskType: 'a',
          energyLevel: 'alta',
          executionKind: 'construcao',
          status: 'backlog',
          horizon: 'active',
          priority: 2,
          estimatedMinutes: 45
        }
      });
      createdTaskId = createdTask.id;
    }

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: workspace.id,
      taskId: createdTaskId,
      source: 'strategy_service',
      eventCode: 'ghost_front_resolved',
      signal: input.action === 'standby' ? 'neutra' : 'executiva',
      impactScore: input.action === 'standby' ? 0 : 3,
      title:
        input.action === 'reativar'
          ? `Frente reativada: ${workspace.name}`
          : input.action === 'standby'
            ? `Frente movida para standby: ${workspace.name}`
            : `Tarefa A criada para destravar frente: ${workspace.name}`,
      rationale:
        input.action === 'standby'
          ? 'Frente removida do foco ativo para reduzir fragmentação.'
          : 'Ação executiva para recuperar tração e sair do estado fantasma.',
      payload: {
        action: input.action,
        workspaceId: workspace.id,
        createdTaskId
      }
    });

    return {
      ok: true,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      mode: nextMode,
      action: input.action,
      createdTaskId
    };
  }

  async getReviewHistory(params: {
    periodType: ReviewPeriodType;
    workspaceId?: string;
    limit?: number;
  }) {
    await this.ensureWorkspaceExists(params.workspaceId);

    const workspaceScope = this.workspaceScope(params.workspaceId);
    const take = Math.max(1, Math.min(params.limit ?? 8, 24));

    const entries = await this.prisma.strategicReview.findMany({
      where: {
        periodType: params.periodType,
        workspaceScope
      },
      orderBy: {
        periodStart: 'desc'
      },
      take
    });

    return entries.map((entry) => ({
      id: entry.id,
      periodType: entry.periodType,
      periodStart: toDateKey(entry.periodStart),
      workspaceId: entry.workspaceId,
      nextPriority: entry.nextPriority,
      strategicDecision: entry.strategicDecision,
      commitmentLevel: entry.commitmentLevel,
      actionItems: this.actionItemsFromJson(entry.actionItems),
      reflection: entry.reflection,
      updatedAt: entry.updatedAt
    }));
  }
}
