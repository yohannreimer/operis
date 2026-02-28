import { Prisma, PrismaClient, Task } from '@prisma/client';
import { safeRecordStrategicDecisionEvent } from './strategic-decision-service.js';
import { refreshGhostProjects } from './project-ghost-service.js';

import { endOfDay, startOfDay } from '../utils/time.js';

const DAY_CAPACITY_MINUTES = 17 * 60;
const EXPANSION_ALERT_GRACE_HOURS = 72;
const DEFAULT_EVOLUTION_WINDOW_DAYS = 30;
const MIN_EVOLUTION_WINDOW_DAYS = 21;
const MAX_EVOLUTION_WINDOW_DAYS = 60;
const DAILY_DEEP_WORK_TARGET_MINUTES = 45;
const TOP3_COMMIT_EVENT_CODE = 'top3_committed';
const TOP3_UNLOCK_EVENT_CODE = 'top3_unlocked';

type EvolutionStage = 'reativo' | 'executor' | 'construtor' | 'estrategista';
type EvolutionTrend = 'subindo' | 'estavel' | 'caindo';
type EvolutionRuleOperator = 'gte' | 'lte';
type EvolutionRuleStatus = 'ok' | 'warning' | 'critical';
type EvolutionAlignment = 'alinhado' | 'superestimado' | 'subestimado' | 'sem_dados';

type WindowMetrics = {
  aCompletionRate: number;
  deepWorkHoursPerWeek: number;
  rescheduleRate: number;
  projectConnectionRate: number;
  constructionPercent: number;
  disconnectedPercent: number;
  ghostProjects: number;
  consistencyPercent: number;
  dailyScores: number[];
};

type EvolutionRuleDraft = {
  id: string;
  title: string;
  description: string;
  metric: string;
  current: number;
  target: number;
  operator: EvolutionRuleOperator;
  unit: string;
  weight: number;
  dataUsed: string;
  recommendation: string;
};

type EvaluatedEvolutionRule = EvolutionRuleDraft & {
  status: EvolutionRuleStatus;
  impact: number;
  contribution: number;
};

const EVOLUTION_STAGE_ORDER: EvolutionStage[] = ['reativo', 'executor', 'construtor', 'estrategista'];

const STAGE_MIN_INDEX: Record<EvolutionStage, number> = {
  reativo: 0,
  executor: 55,
  construtor: 70,
  estrategista: 84
};

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sortTop3Tasks(left: Task, right: Task) {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
  const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;

  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampUnitInterval(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeText(value?: string | null) {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function evaluateRule(draft: EvolutionRuleDraft): EvaluatedEvolutionRule {
  let ratio = 0;
  let passed = false;

  if (draft.operator === 'gte') {
    passed = draft.current >= draft.target;
    ratio = draft.target <= 0 ? 1 : clampUnitInterval(draft.current / draft.target);
  } else {
    passed = draft.current <= draft.target;
    ratio = passed ? 1 : clampUnitInterval(draft.target / Math.max(1, draft.current));
  }

  const status: EvolutionRuleStatus = passed ? 'ok' : ratio >= 0.75 ? 'warning' : 'critical';
  const contribution = Math.round(draft.weight * ratio);
  const impact = Math.max(0, draft.weight - contribution);

  return {
    ...draft,
    status,
    contribution,
    impact
  };
}

function stageLabel(stage: EvolutionStage) {
  if (stage === 'reativo') {
    return 'Reativo';
  }

  if (stage === 'executor') {
    return 'Executor';
  }

  if (stage === 'construtor') {
    return 'Construtor';
  }

  return 'Estrategista';
}

function isExecutableTask(task: Task) {
  const hasVerbObject = task.title.trim().split(/\s+/).length >= 2;
  const hasDefinitionOfDone = Boolean(task.definitionOfDone?.trim());
  const hasEstimatedMinutes = Boolean(task.estimatedMinutes && task.estimatedMinutes > 0);

  return hasVerbObject && hasDefinitionOfDone && hasEstimatedMinutes;
}

function hasOpenRestrictions(task: Task & { restrictions?: Array<{ status: string }> }) {
  return (task.restrictions ?? []).some((restriction) => restriction.status === 'aberta');
}

function isBlockedForExecution(task: Task & { restrictions?: Array<{ status: string }> }) {
  if (task.waitingOnPerson?.trim()) {
    return true;
  }

  return hasOpenRestrictions(task);
}

function top3ScopeValue(workspaceId?: string) {
  return workspaceId ?? '__all__';
}

function parseTop3Payload(payload: Prisma.JsonValue | null | undefined) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      taskIds: [] as string[],
      note: null as string | null
    };
  }

  const record = payload as Record<string, unknown>;
  const taskIds = Array.isArray(record.taskIds)
    ? record.taskIds.filter((item): item is string => typeof item === 'string')
    : [];
  const note = typeof record.note === 'string' && record.note.trim().length > 0 ? record.note.trim() : null;

  return {
    taskIds,
    note
  };
}

function priorityByWaitingPriority(priority?: 'alta' | 'media' | 'baixa' | null) {
  if (priority === 'alta') {
    return 3;
  }
  if (priority === 'media') {
    return 2;
  }
  return 1;
}

export class ExecutionInsightsService {
  constructor(private readonly prisma: PrismaClient) {}

  private isTopFocusEligibleTask(
    task: Task & {
      workspace?: { mode: string | null } | null;
      project?: { status: string | null } | null;
      restrictions?: Array<{ status: string }>;
    }
  ) {
    if (task.taskType !== 'a') {
      return false;
    }

    if (task.workspace?.mode === 'standby') {
      return false;
    }

    if (task.project && task.project.status !== 'ativo') {
      return false;
    }

    if (isBlockedForExecution(task)) {
      return false;
    }

    return true;
  }

  private buildTopFocusCandidates(
    tasks: Array<
      Task & {
        workspace?: { mode: string | null } | null;
        project?: { status: string | null } | null;
        restrictions?: Array<{ status: string }>;
      }
    >
  ) {
    return tasks.filter((task) => this.isTopFocusEligibleTask(task)).sort(sortTop3Tasks);
  }

  private async getTop3CommitmentSnapshot(params: {
    date: string;
    workspaceId?: string;
    tasks: Array<
      Task & {
        workspace?: { mode: string | null } | null;
        project?: { status: string | null } | null;
        restrictions?: Array<{ status: string }>;
      }
    >;
  }) {
    const dayStart = startOfDay(params.date);
    const dayEnd = endOfDay(params.date);
    const workspaceScope = top3ScopeValue(params.workspaceId);

    const latestEvent = await this.prisma.strategicDecisionEvent.findFirst({
      where: {
        workspaceId: params.workspaceId ?? null,
        eventCode: {
          in: [TOP3_COMMIT_EVENT_CODE, TOP3_UNLOCK_EVENT_CODE]
        },
        createdAt: {
          gte: dayStart,
          lte: dayEnd
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const latestPayload = parseTop3Payload(latestEvent?.payload);
    const latestScope =
      latestEvent && latestEvent.payload && typeof latestEvent.payload === 'object' && !Array.isArray(latestEvent.payload)
        ? (latestEvent.payload as Record<string, unknown>).workspaceScope
        : null;
    const sameScope = typeof latestScope === 'string' ? latestScope === workspaceScope : true;

    if (!latestEvent || !sameScope || latestEvent.eventCode === TOP3_UNLOCK_EVENT_CODE) {
      return {
        locked: false,
        manual: false,
        committedAt: null as string | null,
        note: null as string | null,
        requestedTaskIds: [] as string[],
        droppedTaskIds: [] as string[],
        taskIds: [] as string[],
        tasks: [] as Array<Task>
      };
    }

    const taskIds = latestPayload.taskIds.slice(0, 3);
    const taskById = new Map(params.tasks.map((task) => [task.id, task]));
    const selected = taskIds
      .map((taskId) => taskById.get(taskId))
      .filter(
        (
          task
        ): task is Task & {
          workspace?: { mode: string | null } | null;
          project?: { status: string | null } | null;
          restrictions?: Array<{ status: string }>;
        } => Boolean(task)
      )
      .filter((task) => this.isTopFocusEligibleTask(task));

    const selectedIds = selected.map((task) => task.id);
    const droppedTaskIds = taskIds.filter((taskId) => !selectedIds.includes(taskId));

    return {
      locked: true,
      manual: true,
      committedAt: latestEvent.createdAt.toISOString(),
      note: latestPayload.note,
      requestedTaskIds: taskIds,
      droppedTaskIds,
      taskIds: selectedIds,
      tasks: selected
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

  private clampEvolutionWindow(days?: number) {
    const fallback = DEFAULT_EVOLUTION_WINDOW_DAYS;
    const parsed = Number.isFinite(days) ? Number(days) : fallback;
    return Math.max(MIN_EVOLUTION_WINDOW_DAYS, Math.min(MAX_EVOLUTION_WINDOW_DAYS, Math.round(parsed)));
  }

  private startOfDayDate(value: Date) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getStageFromMetrics(metrics: WindowMetrics, index: number): EvolutionStage {
    if (
      index >= STAGE_MIN_INDEX.estrategista &&
      metrics.aCompletionRate >= 75 &&
      metrics.deepWorkHoursPerWeek >= 6 &&
      metrics.rescheduleRate <= 12 &&
      metrics.projectConnectionRate >= 75 &&
      metrics.constructionPercent >= 50 &&
      metrics.disconnectedPercent <= 20 &&
      metrics.ghostProjects === 0 &&
      metrics.consistencyPercent >= 70
    ) {
      return 'estrategista';
    }

    if (
      index >= STAGE_MIN_INDEX.construtor &&
      metrics.aCompletionRate >= 60 &&
      metrics.deepWorkHoursPerWeek >= 4 &&
      metrics.rescheduleRate <= 22 &&
      metrics.projectConnectionRate >= 60 &&
      metrics.constructionPercent >= 40 &&
      metrics.ghostProjects <= 2 &&
      metrics.consistencyPercent >= 55
    ) {
      return 'construtor';
    }

    if (
      index >= STAGE_MIN_INDEX.executor &&
      metrics.aCompletionRate >= 45 &&
      metrics.deepWorkHoursPerWeek >= 2 &&
      metrics.rescheduleRate <= 35 &&
      metrics.consistencyPercent >= 40
    ) {
      return 'executor';
    }

    return 'reativo';
  }

  private getNextStage(stage: EvolutionStage): EvolutionStage | null {
    const index = EVOLUTION_STAGE_ORDER.indexOf(stage);
    if (index < 0 || index >= EVOLUTION_STAGE_ORDER.length - 1) {
      return null;
    }

    return EVOLUTION_STAGE_ORDER[index + 1];
  }

  private async countGhostFronts(params: {
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
    const tractionByWorkspace = new Map<string, number>();
    for (const project of projects) {
      if (project.lastStrategicAt < tractionThreshold) {
        continue;
      }

      tractionByWorkspace.set(
        project.workspaceId,
        (tractionByWorkspace.get(project.workspaceId) ?? 0) + 1
      );
    }

    const taskSignals = new Set(tasks.map((task) => task.workspaceId));

    return workspaces
      .filter((workspace) => workspace.mode !== 'standby')
      .filter((workspace) => (tractionByWorkspace.get(workspace.id) ?? 0) === 0 && !taskSignals.has(workspace.id))
      .length;
  }

  private async collectWindowMetrics(params: {
    start: Date;
    end: Date;
    workspaceId?: string;
    now: Date;
    windowDays: number;
  }): Promise<WindowMetrics> {
    const [events, sessions, plans, ghostProjects] = await Promise.all([
      this.prisma.executionEvent.findMany({
        where: {
          timestamp: {
            gte: params.start,
            lte: params.end
          },
          task: params.workspaceId
            ? {
                workspaceId: params.workspaceId
              }
            : undefined
        },
        include: {
          task: {
            select: {
              taskType: true,
              projectId: true
            }
          }
        }
      }),
      this.prisma.deepWorkSession.findMany({
        where: {
          workspaceId: params.workspaceId,
          startedAt: {
            gte: params.start,
            lte: params.end
          }
        }
      }),
      this.prisma.dayPlan.findMany({
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
                select: {
                  workspaceId: true,
                  projectId: true,
                  executionKind: true
                }
              }
            }
          }
        }
      }),
      this.countGhostFronts({
        workspaceId: params.workspaceId,
        start: params.start,
        end: params.end
      })
    ]);

    const completedEvents = events.filter((event) => event.eventType === 'completed');
    const delayedEvents = events.filter((event) => event.eventType === 'delayed');
    const failedEvents = events.filter((event) => event.eventType === 'failed');
    const actionableEvents = [...completedEvents, ...delayedEvents, ...failedEvents];

    const completedA = completedEvents.filter((event) => event.task?.taskType === 'a').length;
    const actionableA = actionableEvents.filter((event) => event.task?.taskType === 'a').length;
    const completedWithProject = completedEvents.filter((event) => Boolean(event.task?.projectId)).length;

    const totalActionable = actionableEvents.length;
    const aCompletionRate = actionableA > 0 ? (completedA / actionableA) * 100 : 0;
    const rescheduleRate = totalActionable > 0 ? (delayedEvents.length / totalActionable) * 100 : 0;
    const projectConnectionRate = completedEvents.length > 0 ? (completedWithProject / completedEvents.length) * 100 : 0;

    let deepWorkMinutes = 0;
    for (const session of sessions) {
      if (session.state === 'active') {
        const boundedEnd = params.end.getTime() < params.now.getTime() ? params.end : params.now;
        deepWorkMinutes += minutesBetween(session.startedAt, boundedEnd);
      } else {
        deepWorkMinutes += session.actualMinutes;
      }
    }
    const deepWorkHoursPerWeek = ((deepWorkMinutes / Math.max(1, params.windowDays)) * 7) / 60;

    let constructionMinutes = 0;
    let operationMinutes = 0;
    let disconnectedMinutes = 0;
    let plannedTaskMinutes = 0;

    for (const plan of plans) {
      for (const item of plan.items) {
        if (item.blockType !== 'task' || !item.task) {
          continue;
        }

        if (params.workspaceId && item.task.workspaceId !== params.workspaceId) {
          continue;
        }

        const minutes = minutesBetween(item.startTime, item.endTime);
        plannedTaskMinutes += minutes;

        if (item.task.executionKind === 'construcao') {
          constructionMinutes += minutes;
        } else {
          operationMinutes += minutes;
        }

        if (!item.task.projectId) {
          disconnectedMinutes += minutes;
        }
      }
    }

    const constructionBase = Math.max(1, constructionMinutes + operationMinutes);
    const disconnectedBase = Math.max(1, plannedTaskMinutes);
    const constructionPercent = (constructionMinutes / constructionBase) * 100;
    const disconnectedPercent = (disconnectedMinutes / disconnectedBase) * 100;

    const daySignals = new Map<
      string,
      {
        completed: number;
        delayed: number;
        failed: number;
        completedA: number;
        actionableA: number;
        completedWithProject: number;
        deepMinutes: number;
      }
    >();

    for (let dayOffset = 0; dayOffset < params.windowDays; dayOffset += 1) {
      const day = new Date(params.start);
      day.setDate(params.start.getDate() + dayOffset);
      daySignals.set(toDateKey(day), {
        completed: 0,
        delayed: 0,
        failed: 0,
        completedA: 0,
        actionableA: 0,
        completedWithProject: 0,
        deepMinutes: 0
      });
    }

    for (const event of actionableEvents) {
      const dayKey = toDateKey(event.timestamp);
      const entry = daySignals.get(dayKey);
      if (!entry) {
        continue;
      }

      if (event.eventType === 'completed') {
        entry.completed += 1;
        if (event.task?.taskType === 'a') {
          entry.completedA += 1;
        }
        if (event.task?.projectId) {
          entry.completedWithProject += 1;
        }
      }

      if (event.eventType === 'delayed') {
        entry.delayed += 1;
      }

      if (event.eventType === 'failed') {
        entry.failed += 1;
      }

      if (event.task?.taskType === 'a') {
        entry.actionableA += 1;
      }
    }

    for (const session of sessions) {
      const dayKey = toDateKey(session.startedAt);
      const entry = daySignals.get(dayKey);
      if (!entry) {
        continue;
      }

      if (session.state === 'active') {
        const boundedEnd = params.end.getTime() < params.now.getTime() ? params.end : params.now;
        entry.deepMinutes += minutesBetween(session.startedAt, boundedEnd);
      } else {
        entry.deepMinutes += session.actualMinutes;
      }
    }

    const dailyScores = Array.from(daySignals.values()).map((entry) => {
      const total = entry.completed + entry.delayed + entry.failed;
      if (total === 0 && entry.deepMinutes === 0) {
        return 0;
      }

      const completionRate = entry.completed / Math.max(1, total);
      const aRate = entry.actionableA > 0 ? entry.completedA / entry.actionableA : completionRate;
      const deepRate = Math.min(1, entry.deepMinutes / DAILY_DEEP_WORK_TARGET_MINUTES);
      const projectRate = entry.completed > 0 ? entry.completedWithProject / entry.completed : 0;

      return clampPercent((completionRate * 0.5 + aRate * 0.2 + deepRate * 0.2 + projectRate * 0.1) * 100);
    });

    const consistencyPercent =
      dailyScores.length > 0
        ? dailyScores.reduce((sum, score) => sum + score, 0) / dailyScores.length
        : 0;

    return {
      aCompletionRate,
      deepWorkHoursPerWeek,
      rescheduleRate,
      projectConnectionRate,
      constructionPercent,
      disconnectedPercent,
      ghostProjects,
      consistencyPercent,
      dailyScores
    };
  }

  private taskScopeWhere(workspaceId?: string): Prisma.TaskWhereInput {
    return {
      archivedAt: null,
      workspaceId,
      status: {
        in: ['backlog', 'hoje', 'andamento']
      }
    };
  }

  private async countExpansionAlert(workspaceId?: string) {
    if (!workspaceId) {
      return {
        enabled: false,
        missingWeeklyA: false,
        missingWeeklyDeepWork: false
      };
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id: workspaceId
      },
      select: {
        mode: true,
        createdAt: true
      }
    });

    if (!workspace || workspace.mode !== 'expansao') {
      return {
        enabled: false,
        missingWeeklyA: false,
        missingWeeklyDeepWork: false
      };
    }

    const hoursSinceWorkspaceCreation = (Date.now() - workspace.createdAt.getTime()) / 36e5;
    if (hoursSinceWorkspaceCreation < EXPANSION_ALERT_GRACE_HOURS) {
      return {
        enabled: false,
        missingWeeklyA: false,
        missingWeeklyDeepWork: false
      };
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [weeklyA, weeklyDeepWork] = await Promise.all([
      this.prisma.task.count({
        where: {
          workspaceId,
          taskType: 'a',
          archivedAt: null,
          createdAt: {
            gte: weekAgo
          }
        }
      }),
      this.prisma.deepWorkSession.count({
        where: {
          workspaceId,
          startedAt: {
            gte: weekAgo
          }
        }
      })
    ]);

    return {
      enabled: true,
      missingWeeklyA: weeklyA < 1,
      missingWeeklyDeepWork: weeklyDeepWork < 1
    };
  }

  async getBriefing(params: {
    date: string;
    workspaceId?: string;
    strictMode?: boolean;
  }) {
    await refreshGhostProjects(this.prisma, {
      workspaceId: params.workspaceId
    });

    const dayStart = startOfDay(params.date);
    const dayEnd = endOfDay(params.date);
    const weekAgo = new Date(dayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(dayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [tasks, dayPlan, expansion, strategicProjectLoad, deepFocusProjectLoad, delayedEvents, activeProjects, ghostProjects] = await Promise.all([
      this.prisma.task.findMany({
        where: this.taskScopeWhere(params.workspaceId),
        include: {
          workspace: true,
          project: true,
          restrictions: {
            where: {
              status: 'aberta'
            },
            select: {
              status: true
            }
          }
        }
      }),
      this.prisma.dayPlan.findUnique({
        where: {
          date: dayStart
        },
        include: {
          items: {
            include: {
              task: true
            }
          }
        }
      }),
      this.countExpansionAlert(params.workspaceId),
      this.prisma.project.count({
        where: {
          workspaceId: params.workspaceId,
          status: 'ativo',
          archivedAt: null,
          tasks: {
            some: {
              taskType: 'a',
              archivedAt: null,
              status: {
                in: ['backlog', 'hoje', 'andamento']
              },
              updatedAt: {
                gte: weekAgo
              }
            }
          }
        }
      }),
      this.prisma.project.count({
        where: {
          workspaceId: params.workspaceId,
          status: 'ativo',
          archivedAt: null,
          deepWorkSessions: {
            some: {
              startedAt: {
                gte: weekAgo
              }
            }
          }
        }
      }),
      this.prisma.executionEvent.findMany({
        where: {
          eventType: 'delayed',
          timestamp: {
            gte: thirtyDaysAgo
          }
        },
        include: {
          task: true
        }
      }),
      this.prisma.project.findMany({
        where: {
          workspaceId: params.workspaceId,
          status: 'ativo',
          archivedAt: null
        },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          lastStrategicAt: true,
          createdAt: true
        }
      }),
      this.prisma.project.findMany({
        where: {
          workspaceId: params.workspaceId,
          status: 'fantasma',
          archivedAt: null
        },
        include: {
          workspace: {
            select: {
              name: true
            }
          }
        },
        orderBy: [{ updatedAt: 'desc' }, { lastStrategicAt: 'asc' }],
        take: 12
      })
    ]);

    const topFocusCandidates = this.buildTopFocusCandidates(tasks);
    const top3Commitment = await this.getTop3CommitmentSnapshot({
      date: params.date,
      workspaceId: params.workspaceId,
      tasks
    });
    const targetTop3Size = Math.max(
      1,
      Math.min(3, top3Commitment.requestedTaskIds.length > 0 ? top3Commitment.requestedTaskIds.length : 3)
    );
    const lockedTaskIds = top3Commitment.taskIds.slice(0, targetTop3Size);
    const swapTaskIds = [...lockedTaskIds];
    for (const candidate of topFocusCandidates) {
      if (swapTaskIds.includes(candidate.id)) {
        continue;
      }
      swapTaskIds.push(candidate.id);
      if (swapTaskIds.length >= targetTop3Size) {
        break;
      }
    }
    const missingSlots = Math.max(0, targetTop3Size - lockedTaskIds.length);
    const guidedSwapNeeded = top3Commitment.locked && (top3Commitment.droppedTaskIds.length > 0 || missingSlots > 0);
    const swapReason =
      !guidedSwapNeeded
        ? null
        : top3Commitment.droppedTaskIds.length > 0
          ? `${top3Commitment.droppedTaskIds.length} item(ns) do compromisso original não estão mais elegíveis.`
          : 'Faltam tarefas elegíveis para completar o compromisso de foco.';
    const top3 = top3Commitment.locked
      ? (top3Commitment.tasks.length > 0 ? top3Commitment.tasks : topFocusCandidates).slice(0, targetTop3Size)
      : topFocusCandidates.slice(0, targetTop3Size);

    const pendingA = tasks.filter((task) => {
      if (task.taskType !== 'a') {
        return false;
      }

      if (task.workspace?.mode === 'standby') {
        return false;
      }

      if (task.project && task.project.status !== 'ativo') {
        return false;
      }

      if (isBlockedForExecution(task)) {
        return false;
      }

      if (task.status === 'hoje' || task.status === 'andamento') {
        return true;
      }

      return Boolean(task.dueDate && new Date(task.dueDate).getTime() <= dayEnd.getTime());
    }).length;

    const delayedByTask = new Map<string, number>();
    for (const event of delayedEvents) {
      if (!event.task) {
        continue;
      }

      if (params.workspaceId && event.task.workspaceId !== params.workspaceId) {
        continue;
      }

      if (event.task.taskType !== 'a') {
        continue;
      }

      if (!['backlog', 'hoje', 'andamento'].includes(event.task.status)) {
        continue;
      }

      delayedByTask.set(event.taskId, (delayedByTask.get(event.taskId) ?? 0) + 1);
    }
    const excessiveRescheduleA = Array.from(delayedByTask.values()).filter((count) => count >= 3).length;
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const fragmentationByProject = new Map<
      string,
      {
        projectId: string;
        title: string;
        workspaceId: string;
        workspaceName: string;
        openATasks: number;
        highestPriority: number;
      }
    >();
    for (const task of tasks) {
      if (!task.projectId || !task.project || task.project.status !== 'ativo') {
        continue;
      }
      if (task.taskType !== 'a') {
        continue;
      }
      if (!['backlog', 'hoje', 'andamento'].includes(task.status)) {
        continue;
      }
      if (new Date(task.updatedAt).getTime() < weekAgo.getTime()) {
        continue;
      }

      const current = fragmentationByProject.get(task.projectId) ?? {
        projectId: task.projectId,
        title: task.project.title,
        workspaceId: task.workspaceId,
        workspaceName: task.workspace?.name ?? 'Frente',
        openATasks: 0,
        highestPriority: 0
      };
      current.openATasks += 1;
      current.highestPriority = Math.max(current.highestPriority, task.priority);
      fragmentationByProject.set(task.projectId, current);
    }
    const fragmentationProjects = Array.from(fragmentationByProject.values())
      .sort((left, right) => {
        if (left.openATasks !== right.openATasks) {
          return right.openATasks - left.openATasks;
        }
        return right.highestPriority - left.highestPriority;
      })
      .slice(0, 12);

    const activeProjectsByWorkspace = new Map<
      string,
      Array<{
        id: string;
        title: string;
        workspaceId: string;
        lastStrategicAt: Date | null;
        createdAt: Date;
      }>
    >();
    for (const project of activeProjects) {
      const list = activeProjectsByWorkspace.get(project.workspaceId) ?? [];
      list.push(project);
      activeProjectsByWorkspace.set(project.workspaceId, list);
    }
    for (const projectsOfWorkspace of activeProjectsByWorkspace.values()) {
      projectsOfWorkspace.sort((left, right) => {
        const leftTime = left.lastStrategicAt?.getTime() ?? 0;
        const rightTime = right.lastStrategicAt?.getTime() ?? 0;
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      });
    }

    const disconnectedTasks = tasks
      .filter((task) => !task.projectId && ['backlog', 'hoje', 'andamento'].includes(task.status))
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return leftDue - rightDue;
      })
      .slice(0, 12)
      .map((task) => {
        const suggestedProject = activeProjectsByWorkspace.get(task.workspaceId)?.[0] ?? null;
        return {
          taskId: task.id,
          title: task.title,
          workspaceId: task.workspaceId,
          workspaceName: task.workspace?.name ?? 'Frente',
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
          suggestedProjectId: suggestedProject?.id ?? null,
          suggestedProjectTitle: suggestedProject?.title ?? null
        };
      });

    const rescheduleRiskTasks = Array.from(delayedByTask.entries())
      .filter(([, count]) => count >= 3)
      .map(([taskId, delayedCount]) => {
        const task = taskById.get(taskId);
        if (!task) {
          return null;
        }
        return {
          taskId: task.id,
          title: task.title,
          workspaceId: task.workspaceId,
          workspaceName: task.workspace?.name ?? 'Frente',
          projectId: task.projectId ?? null,
          projectTitle: task.project?.title ?? null,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
          delayedCount
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => {
        if (left.delayedCount !== right.delayedCount) {
          return right.delayedCount - left.delayedCount;
        }
        return right.priority - left.priority;
      })
      .slice(0, 12);

    const ghostProjectActionables = ghostProjects.map((project) => {
      const idleDays = Math.max(
        0,
        Math.floor((dayEnd.getTime() - project.lastStrategicAt.getTime()) / (24 * 60 * 60 * 1000))
      );
      return {
        projectId: project.id,
        title: project.title,
        workspaceId: project.workspaceId,
        workspaceName: project.workspace?.name ?? 'Frente',
        status: project.status,
        idleDays,
        staleSinceDays: Math.max(0, idleDays - 14),
        suggestedAction: 'reativar'
      };
    });

    const waitingFollowupActionables = tasks
      .filter((task) => task.waitingOnPerson?.trim())
      .map((task) => {
        const dueAt = task.waitingDueDate ? new Date(task.waitingDueDate).getTime() : null;
        const overdueDays =
          dueAt && dueAt < dayStart.getTime()
            ? Math.max(1, Math.ceil((dayStart.getTime() - dueAt) / (24 * 60 * 60 * 1000)))
            : 0;
        const dueToday = dueAt ? dueAt >= dayStart.getTime() && dueAt <= dayEnd.getTime() : false;
        const urgencyScore = overdueDays * 100 + (dueToday ? 50 : 0) + priorityByWaitingPriority(task.waitingPriority);
        return {
          taskId: task.id,
          title: task.title,
          workspaceId: task.workspaceId,
          workspaceName: task.workspace?.name ?? 'Frente',
          waitingOnPerson: task.waitingOnPerson ?? 'responsável',
          waitingType: task.waitingType ?? 'resposta',
          waitingPriority: task.waitingPriority ?? 'media',
          waitingDueDate: task.waitingDueDate ? new Date(task.waitingDueDate).toISOString() : null,
          overdueDays,
          dueToday,
          urgencyScore
        };
      })
      .sort((left, right) => right.urgencyScore - left.urgencyScore)
      .slice(0, 12)
      .map(({ urgencyScore: _urgencyScore, ...entry }) => entry);

    const vagueTasks = tasks.filter((task) => !isExecutableTask(task)).length;
    const maintenanceConstructionCount = tasks.filter(
      (task) =>
        task.workspace?.mode === 'manutencao' &&
        task.executionKind === 'construcao' &&
        ['backlog', 'hoje', 'andamento'].includes(task.status)
    ).length;
    const standbyExecutionCount = tasks.filter(
      (task) => task.workspace?.mode === 'standby' && ['hoje', 'andamento'].includes(task.status)
    ).length;

    const fixedMinutes = (dayPlan?.items ?? []).reduce((acc, item) => {
      if (item.blockType !== 'fixed') {
        return acc;
      }

      return acc + minutesBetween(item.startTime, item.endTime);
    }, 0);

    const taskMinutes = (dayPlan?.items ?? []).reduce((acc, item) => {
      if (item.blockType !== 'task') {
        return acc;
      }

      if (params.workspaceId && item.task && item.task.workspaceId !== params.workspaceId) {
        return acc;
      }

      return acc + minutesBetween(item.startTime, item.endTime);
    }, 0);

    const availableMinutes = Math.max(0, DAY_CAPACITY_MINUTES - fixedMinutes);
    const overloadMinutes = Math.max(0, taskMinutes - availableMinutes);

    return {
      date: params.date,
      top3,
      top3Meta: {
        locked: top3Commitment.locked,
        manual: top3Commitment.manual,
        committedAt: top3Commitment.committedAt,
        note: top3Commitment.note,
        taskIds: top3.map((task) => task.id),
        guidedSwapNeeded,
        missingSlots,
        droppedTaskIds: top3Commitment.droppedTaskIds,
        swapTaskIds: swapTaskIds.slice(0, targetTop3Size),
        swapReason
      },
      pendingA,
      strictModeBlocked: Boolean(params.strictMode && pendingA > 0),
      openCounts: {
        a: tasks.filter((task) => task.taskType === 'a').length,
        b: tasks.filter((task) => task.taskType === 'b').length,
        c: tasks.filter((task) => task.taskType === 'c').length
      },
      capacity: {
        baseMinutes: DAY_CAPACITY_MINUTES,
        fixedMinutes,
        availableMinutes,
        plannedTaskMinutes: taskMinutes,
        overloadMinutes,
        isUnrealistic: overloadMinutes > 0
      },
      alerts: {
        expansionNeedsA: expansion.enabled && expansion.missingWeeklyA,
        expansionNeedsDeepWork: expansion.enabled && expansion.missingWeeklyDeepWork,
        fragmentationRisk: strategicProjectLoad > 5,
        fragmentationCount: strategicProjectLoad,
        focusOverloadRisk: deepFocusProjectLoad > 3,
        focusOverloadCount: deepFocusProjectLoad,
        excessiveRescheduleA,
        vagueTasks,
        maintenanceConstructionRisk: maintenanceConstructionCount > 0,
        maintenanceConstructionCount,
        standbyExecutionRisk: standbyExecutionCount > 0,
        standbyExecutionCount
      },
      actionables: {
        fragmentationProjects,
        disconnectedTasks,
        rescheduleRiskTasks,
        ghostProjects: ghostProjectActionables,
        waitingFollowups: waitingFollowupActionables
      }
    };
  }

  async getTop3Commitment(params: {
    date: string;
    workspaceId?: string;
  }) {
    const tasks = await this.prisma.task.findMany({
      where: this.taskScopeWhere(params.workspaceId),
      include: {
        workspace: true,
        project: true,
        restrictions: {
          where: {
            status: 'aberta'
          },
          select: {
            status: true
          }
        }
      }
    });

    const topFocusCandidates = this.buildTopFocusCandidates(tasks);
    const top3Commitment = await this.getTop3CommitmentSnapshot({
      date: params.date,
      workspaceId: params.workspaceId,
      tasks
    });

    const tasksResult = top3Commitment.locked
      ? top3Commitment.tasks.slice(0, 3)
      : topFocusCandidates.slice(0, 3);

    return {
      date: params.date,
      workspaceId: params.workspaceId ?? null,
      locked: top3Commitment.locked,
      manual: top3Commitment.manual,
      committedAt: top3Commitment.committedAt,
      note: top3Commitment.note,
      taskIds: tasksResult.map((task) => task.id),
      tasks: tasksResult
    };
  }

  async commitTop3(params: {
    date: string;
    workspaceId?: string;
    taskIds: string[];
    note?: string;
  }) {
    const uniqueTaskIds = Array.from(new Set(params.taskIds.map((taskId) => taskId.trim()).filter(Boolean)));
    if (uniqueTaskIds.length === 0) {
      throw new Error('Selecione ao menos 1 tarefa para confirmar o Top 3.');
    }

    if (uniqueTaskIds.length > 3) {
      throw new Error('Top 3 aceita no máximo 3 tarefas.');
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        id: {
          in: uniqueTaskIds
        },
        ...this.taskScopeWhere(params.workspaceId)
      },
      include: {
        workspace: true,
        project: true,
        restrictions: {
          where: {
            status: 'aberta'
          },
          select: {
            status: true
          }
        }
      }
    });

    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const selectedTasks = uniqueTaskIds
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is (typeof tasks)[number] => Boolean(task));

    if (selectedTasks.length !== uniqueTaskIds.length) {
      throw new Error('Uma ou mais tarefas do Top 3 não foram encontradas no escopo atual.');
    }

    for (const task of selectedTasks) {
      if (!this.isTopFocusEligibleTask(task)) {
        throw new Error(`A tarefa "${task.title}" não está elegível para Top 3 (tipo A, desbloqueada e ativa).`);
      }
    }

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: params.workspaceId ?? null,
      source: 'execution_insights_service',
      eventCode: TOP3_COMMIT_EVENT_CODE,
      signal: 'executiva',
      impactScore: 5,
      title: `Top 3 confirmado (${params.date})`,
      rationale: 'Compromisso explícito do foco executivo do dia.',
      payload: {
        date: params.date,
        workspaceScope: top3ScopeValue(params.workspaceId),
        taskIds: selectedTasks.map((task) => task.id),
        note: params.note?.trim() || null
      }
    });

    return this.getTop3Commitment({
      date: params.date,
      workspaceId: params.workspaceId
    });
  }

  async clearTop3Commitment(params: {
    date: string;
    workspaceId?: string;
  }) {
    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: params.workspaceId ?? null,
      source: 'execution_insights_service',
      eventCode: TOP3_UNLOCK_EVENT_CODE,
      signal: 'neutra',
      impactScore: 0,
      title: `Top 3 destravado (${params.date})`,
      rationale: 'Top 3 voltou para modo sugestão automática.',
      payload: {
        date: params.date,
        workspaceScope: top3ScopeValue(params.workspaceId)
      }
    });

    return this.getTop3Commitment({
      date: params.date,
      workspaceId: params.workspaceId
    });
  }

  async getExecutionScore(params: {
    date: string;
    workspaceId?: string;
  }) {
    const dayStart = startOfDay(params.date);
    const dayEnd = endOfDay(params.date);

    const [dayPlan, events, sessions] = await Promise.all([
      this.prisma.dayPlan.findUnique({
        where: {
          date: dayStart
        },
        include: {
          items: {
            include: {
              task: true
            }
          }
        }
      }),
      this.prisma.executionEvent.findMany({
        where: {
          timestamp: {
            gte: dayStart,
            lte: dayEnd
          },
          task: params.workspaceId
            ? {
                workspaceId: params.workspaceId
              }
            : undefined
        },
        include: {
          task: true
        }
      }),
      this.prisma.deepWorkSession.findMany({
        where: {
          workspaceId: params.workspaceId,
          startedAt: {
            gte: dayStart,
            lte: dayEnd
          }
        }
      })
    ]);

    const plannedItems = (dayPlan?.items ?? []).filter((item) => {
      if (item.blockType !== 'task' || !item.task) {
        return false;
      }

      if (params.workspaceId && item.task.workspaceId !== params.workspaceId) {
        return false;
      }

      return true;
    });

    const plannedATasks = new Set(
      plannedItems.filter((item) => item.task?.taskType === 'a').map((item) => item.taskId as string)
    );

    const completedEvents = events.filter((event) => event.eventType === 'completed');
    const delayedEvents = events.filter((event) => event.eventType === 'delayed');
    const failedEvents = events.filter((event) => event.eventType === 'failed');

    const completedA = completedEvents.filter((event) => {
      if (!event.task) {
        return false;
      }

      if (plannedATasks.size === 0) {
        return event.task.taskType === 'a';
      }

      return plannedATasks.has(event.taskId);
    }).length;

    const aBase = Math.max(1, plannedATasks.size || completedA);
    const aRate = completedA / aBase;

    const deepWorkMinutes = sessions.reduce((acc, session) => {
      if (session.state === 'active') {
        return acc + minutesBetween(session.startedAt, new Date());
      }
      return acc + session.actualMinutes;
    }, 0);

    const deepWorkTarget = Math.max(45, plannedATasks.size * 45);
    const deepRate = Math.min(1, deepWorkMinutes / deepWorkTarget);

    const completedPlanItems = plannedItems.filter((item) => {
      if (!item.task?.completedAt) {
        return false;
      }

      const completedAt = new Date(item.task.completedAt).getTime();
      return completedAt >= dayStart.getTime() && completedAt <= dayEnd.getTime();
    });

    const onTimeCount = completedPlanItems.filter((item) => {
      if (!item.task?.completedAt) {
        return false;
      }

      return new Date(item.task.completedAt).getTime() <= item.endTime.getTime();
    }).length;

    const punctualityRate = completedPlanItems.length ? onTimeCount / completedPlanItems.length : 0;

    const totalConfirmations = completedEvents.length + delayedEvents.length + failedEvents.length;
    const nonRescheduleRate = totalConfirmations ? 1 - delayedEvents.length / totalConfirmations : 1;

    const completedWithProject = completedEvents.filter((event) => Boolean(event.task?.projectId)).length;
    const projectConnectionRate = completedEvents.length ? completedWithProject / completedEvents.length : 0;

    const score = clampPercent(
      aRate * 40 +
        deepRate * 20 +
        punctualityRate * 15 +
        nonRescheduleRate * 15 +
        projectConnectionRate * 10
    );

    return {
      date: params.date,
      workspaceId: params.workspaceId ?? null,
      score,
      components: {
        aCompletion: {
          weight: 40,
          value: clampPercent(aRate * 100),
          completed: completedA,
          total: aBase
        },
        deepWork: {
          weight: 20,
          value: clampPercent(deepRate * 100),
          minutes: deepWorkMinutes,
          targetMinutes: deepWorkTarget
        },
        punctuality: {
          weight: 15,
          value: clampPercent(punctualityRate * 100),
          onTime: onTimeCount,
          total: completedPlanItems.length
        },
        nonReschedule: {
          weight: 15,
          value: clampPercent(nonRescheduleRate * 100),
          delayed: delayedEvents.length,
          total: totalConfirmations
        },
        projectConnection: {
          weight: 10,
          value: clampPercent(projectConnectionRate * 100),
          connected: completedWithProject,
          total: completedEvents.length
        }
      }
    };
  }

  async getEvolutionEngine(params: {
    workspaceId?: string;
    windowDays?: number;
  }) {
    const now = new Date();
    const windowDays = this.clampEvolutionWindow(params.windowDays);
    const ninetyDaysAgo = this.startOfDayDate(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);

    const currentEnd = new Date(now);
    const currentStart = this.startOfDayDate(now);
    currentStart.setDate(currentStart.getDate() - (windowDays - 1));

    const previousEnd = new Date(currentStart);
    previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);
    const previousStart = this.startOfDayDate(previousEnd);
    previousStart.setDate(previousStart.getDate() - (windowDays - 1));

    const [currentMetrics, previousMetrics, latestMonthlyReview, recentReviewHistory, recentDecisionEvents] = await Promise.all([
      this.collectWindowMetrics({
        start: currentStart,
        end: currentEnd,
        workspaceId: params.workspaceId,
        now,
        windowDays
      }),
      this.collectWindowMetrics({
        start: previousStart,
        end: previousEnd,
        workspaceId: params.workspaceId,
        now: previousEnd,
        windowDays
      }),
      this.prisma.strategicReview.findFirst({
        where: {
          periodType: 'monthly',
          workspaceId: params.workspaceId ?? undefined,
          workspaceScope: params.workspaceId ? undefined : '__all__'
        },
        orderBy: {
          updatedAt: 'desc'
        },
        select: {
          periodStart: true,
          nextPriority: true,
          strategicDecision: true,
          reflection: true,
          actionItems: true
        }
      }),
      this.prisma.strategicReview.findMany({
        where: {
          periodStart: {
            gte: ninetyDaysAgo
          },
          workspaceId: params.workspaceId ?? undefined,
          workspaceScope: params.workspaceId ? undefined : '__all__'
        },
        orderBy: [
          {
            periodStart: 'desc'
          },
          {
            updatedAt: 'desc'
          }
        ],
        take: 16,
        select: {
          id: true,
          periodType: true,
          periodStart: true,
          nextPriority: true,
          strategicDecision: true,
          commitmentLevel: true,
          reflection: true,
          updatedAt: true
        }
      }),
      this.prisma.strategicDecisionEvent
        .findMany({
          where: {
            createdAt: {
              gte: ninetyDaysAgo
            },
            workspaceId: params.workspaceId ?? undefined
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 80,
          select: {
            id: true,
            workspaceId: true,
            projectId: true,
            taskId: true,
            source: true,
            eventCode: true,
            signal: true,
            title: true,
            rationale: true,
            impactScore: true,
            createdAt: true
          }
        })
        .catch(() => [])
      
    ]);

    const toRuleDrafts = (metrics: WindowMetrics): EvolutionRuleDraft[] => [
      {
        id: 'a_completion',
        title: 'Conclusão de tarefas A',
        description: 'Percentual de execução das tarefas A frente a sinais reais de execução/falha.',
        metric: 'a_completion_rate',
        current: clampPercent(metrics.aCompletionRate),
        target: 60,
        operator: 'gte',
        unit: '%',
        weight: 22,
        dataUsed: `execution_events (completed/delayed/failed) últimos ${windowDays} dias`,
        recommendation: 'Reduza o escopo do dia e proteja as tarefas A antes de qualquer tarefa B/C.'
      },
      {
        id: 'deep_work',
        title: 'Deep Work semanal',
        description: 'Horas médias de Deep Work por semana no período analisado.',
        metric: 'deep_work_hours_week',
        current: Math.round(metrics.deepWorkHoursPerWeek * 10) / 10,
        target: 4,
        operator: 'gte',
        unit: 'h/sem',
        weight: 16,
        dataUsed: `deep_work_sessions últimos ${windowDays} dias`,
        recommendation: 'Bloqueie no mínimo 4 sessões de 45 minutos por semana em tarefas A.'
      },
      {
        id: 'reschedule',
        title: 'Controle de reagendamento',
        description: 'Taxa de adiantamentos/adiamentos sobre eventos executivos do período.',
        metric: 'reschedule_rate',
        current: clampPercent(metrics.rescheduleRate),
        target: 20,
        operator: 'lte',
        unit: '%',
        weight: 14,
        dataUsed: `execution_events delayed / total últimos ${windowDays} dias`,
        recommendation: 'Se uma tarefa A for reagendada 3x, transforme em ação mínima de 15 minutos hoje.'
      },
      {
        id: 'project_connection',
        title: 'Conexão com projeto',
        description: 'Percentual de conclusões ligadas a projeto estratégico.',
        metric: 'project_connection_rate',
        current: clampPercent(metrics.projectConnectionRate),
        target: 65,
        operator: 'gte',
        unit: '%',
        weight: 14,
        dataUsed: `execution_events completed com project_id últimos ${windowDays} dias`,
        recommendation: 'Conecte tarefas soltas aos projetos ativos ou elimine tarefas sem resultado estratégico.'
      },
      {
        id: 'construction',
        title: 'Construção de futuro',
        description: 'Proporção de minutos em construção vs operação.',
        metric: 'construction_percent',
        current: clampPercent(metrics.constructionPercent),
        target: 40,
        operator: 'gte',
        unit: '%',
        weight: 12,
        dataUsed: `day_plan_items tipo task (execution_kind) últimos ${windowDays} dias`,
        recommendation: 'Eleve blocos de construção no início do dia antes de abrir operação.'
      },
      {
        id: 'disconnected',
        title: 'Execução desconexa',
        description: 'Percentual de minutos sem vínculo com projeto.',
        metric: 'disconnected_percent',
        current: clampPercent(metrics.disconnectedPercent),
        target: 30,
        operator: 'lte',
        unit: '%',
        weight: 8,
        dataUsed: `day_plan_items sem project_id últimos ${windowDays} dias`,
        recommendation: 'Limite tarefas desconexas e amarre ao menos 70% da execução a projetos.'
      },
      {
        id: 'consistency',
        title: 'Consistência de execução',
        description: 'Média diária de execução considerando conclusão, Deep Work e conexão estratégica.',
        metric: 'consistency_percent',
        current: clampPercent(metrics.consistencyPercent),
        target: 60,
        operator: 'gte',
        unit: '%',
        weight: 8,
        dataUsed: `score diário composto em ${windowDays} dias`,
        recommendation: 'Proteja ritual de manhã/noite para estabilizar execução mínima diária.'
      },
      {
        id: 'ghost_projects',
        title: 'Frentes fantasma',
        description: 'Projetos ativos sem tração estratégica suficiente.',
        metric: 'ghost_projects',
        current: metrics.ghostProjects,
        target: 1,
        operator: 'lte',
        unit: 'frentes',
        weight: 6,
        dataUsed: 'frentes sem tração ativa e sem tarefa A sinalizada na janela',
        recommendation: 'Reativar tração com tarefa A e Deep Work ou declarar frente em standby.'
      }
    ];

    const currentRules = toRuleDrafts(currentMetrics).map(evaluateRule);
    const previousRules = toRuleDrafts(previousMetrics).map(evaluateRule);
    const index = clampPercent(currentRules.reduce((sum, rule) => sum + rule.contribution, 0));
    const previousIndex = clampPercent(previousRules.reduce((sum, rule) => sum + rule.contribution, 0));

    const stage = this.getStageFromMetrics(currentMetrics, index);
    const nextStage = this.getNextStage(stage);
    const deltaIndex = index - previousIndex;
    const trend: EvolutionTrend = deltaIndex >= 6 ? 'subindo' : deltaIndex <= -6 ? 'caindo' : 'estavel';

    const betterDays = currentMetrics.dailyScores.filter(
      (score, idx) => score > (previousMetrics.dailyScores[idx] ?? previousIndex)
    ).length;
    const lowPerformanceDays21 = currentMetrics.dailyScores.slice(-21).filter((score) => score < 45).length;

    const nextStageGateMet = nextStage
      ? index >= STAGE_MIN_INDEX[nextStage] - 4 &&
        currentRules.filter((rule) => rule.status === 'critical').length <= 1
      : false;

    const promotionCandidate = Boolean(
      nextStage &&
      nextStageGateMet &&
      betterDays >= Math.ceil(windowDays * 0.65) &&
      trend !== 'caindo'
    );

    const regressionRisk = stage !== 'reativo' && lowPerformanceDays21 >= 12 && trend === 'caindo';

    const stageMode = {
      reativo: {
        focusLimit: 2,
        deepWorkTargetMinutes: 45,
        maxNewTasksPerDay: 4,
        strictModeDefault: true,
        allowBCExecutionWhileAPending: false,
        reviewRhythm: 'weekly' as const,
        enforcement: 'Disciplina mínima: simplificar e eliminar excesso de promessas.',
        workloadGuard: 'Bloquear criação excessiva e exigir executabilidade antes de agendar.'
      },
      executor: {
        focusLimit: 3,
        deepWorkTargetMinutes: 60,
        maxNewTasksPerDay: 6,
        strictModeDefault: true,
        allowBCExecutionWhileAPending: false,
        reviewRhythm: 'weekly' as const,
        enforcement: 'Execução consistente: manter Top 3 e reduzir reagendamento.',
        workloadGuard: 'Aumentar exigência de tarefa A e reservar blocos fixos de foco.'
      },
      construtor: {
        focusLimit: 3,
        deepWorkTargetMinutes: 90,
        maxNewTasksPerDay: 8,
        strictModeDefault: false,
        allowBCExecutionWhileAPending: true,
        reviewRhythm: 'weekly' as const,
        enforcement: 'Entrega estratégica: cobrar avanço de projeto, não apenas tarefa.',
        workloadGuard: 'Meta semanal de construção e marcos por projeto ativo.'
      },
      estrategista: {
        focusLimit: 3,
        deepWorkTargetMinutes: 120,
        maxNewTasksPerDay: 10,
        strictModeDefault: false,
        allowBCExecutionWhileAPending: true,
        reviewRhythm: 'monthly' as const,
        enforcement: 'Alocação executiva: gerir energia como portfólio estratégico.',
        workloadGuard: 'Comparar ciclos e rebalancear construção vs operação mensalmente.'
      }
    }[stage];

    const actionCandidates = currentRules
      .filter((rule) => rule.status !== 'ok')
      .sort((left, right) => right.impact - left.impact)
      .map((rule) => rule.recommendation);
    const nextActions = Array.from(new Set(actionCandidates)).slice(0, 4);

    const reviewText = normalizeText(
      [
        latestMonthlyReview?.nextPriority,
        latestMonthlyReview?.strategicDecision,
        latestMonthlyReview?.reflection,
        Array.isArray(latestMonthlyReview?.actionItems)
          ? latestMonthlyReview?.actionItems.join(' ')
          : ''
      ]
        .filter(Boolean)
        .join(' ')
    );

    const highPerceptionSignals = [
      'avancei',
      'forte',
      'excelente',
      'controle',
      'consistente',
      'otimo',
      'progresso'
    ];
    const lowPerceptionSignals = [
      'dispers',
      'trav',
      'caos',
      'atras',
      'evita',
      'fraco',
      'sem foco',
      'desorganiz'
    ];

    const highHits = highPerceptionSignals.filter((token) => reviewText.includes(token)).length;
    const lowHits = lowPerceptionSignals.filter((token) => reviewText.includes(token)).length;
    const promotionBlockedBySelfAssessment = Boolean(
      nextStage &&
      reviewText.length > 0 &&
      lowHits >= Math.max(2, highHits + 1)
    );
    const promotionRecommended = promotionCandidate && !promotionBlockedBySelfAssessment;

    const perceivedLevel: 'alto' | 'medio' | 'baixo' | 'sem_dados' =
      reviewText.length === 0
        ? 'sem_dados'
        : highHits > lowHits
          ? 'alto'
          : lowHits > highHits
            ? 'baixo'
            : 'medio';

    const objectiveLevel: 'alto' | 'medio' | 'baixo' = index >= 70 ? 'alto' : index <= 45 ? 'baixo' : 'medio';

    let alignment: EvolutionAlignment = 'sem_dados';
    let alignmentNote = 'Sem autoavaliação mensal recente para cruzar percepção com realidade.';

    if (perceivedLevel !== 'sem_dados') {
      alignment = 'alinhado';
      alignmentNote = 'Percepção e dados objetivos estão alinhados.';

      if (perceivedLevel === 'alto' && objectiveLevel === 'baixo') {
        alignment = 'superestimado';
        alignmentNote = 'Percepção alta com dados baixos. Existe desalinhamento entre narrativa e execução.';
      } else if (perceivedLevel === 'baixo' && objectiveLevel === 'alto') {
        alignment = 'subestimado';
        alignmentNote = 'Percepção baixa com dados altos. Há subestimação da própria consistência.';
      }
    }

    const criticalCount = currentRules.filter((rule) => rule.status === 'critical').length;
    const warningCount = currentRules.filter((rule) => rule.status === 'warning').length;
    const confidence = clampPercent(
      100 - criticalCount * 16 - warningCount * 8 + (trend === 'subindo' ? 6 : trend === 'caindo' ? -6 : 0)
    );
    const dailyMean =
      currentMetrics.dailyScores.length > 0
        ? currentMetrics.dailyScores.reduce((sum, score) => sum + score, 0) / currentMetrics.dailyScores.length
        : 0;
    const dailyVariance =
      currentMetrics.dailyScores.length > 0
        ? currentMetrics.dailyScores.reduce((sum, score) => sum + (score - dailyMean) ** 2, 0) /
          currentMetrics.dailyScores.length
        : 0;
    const dailyStdDev = Math.sqrt(dailyVariance);
    const stageStability = clampPercent(100 - dailyStdDev * 2 - criticalCount * 6 - warningCount * 3);

    const weekWindowCount = Math.max(1, Math.min(4, Math.ceil(currentMetrics.dailyScores.length / 7)));
    const weeklyTrajectory = Array.from({ length: weekWindowCount }, (_, reverseIndex) => {
      const fromEnd = weekWindowCount - reverseIndex;
      const end = currentMetrics.dailyScores.length - (fromEnd - 1) * 7;
      const start = Math.max(0, end - 7);
      const slice = currentMetrics.dailyScores.slice(start, end);
      const average = slice.length > 0 ? slice.reduce((sum, score) => sum + score, 0) / slice.length : 0;
      return {
        label: `S-${weekWindowCount - reverseIndex - 1}`,
        index: clampPercent(average)
      };
    });

    const commitmentValues = recentReviewHistory
      .map((review) => {
        if (review.commitmentLevel === 'alto') {
          return 3;
        }
        if (review.commitmentLevel === 'medio') {
          return 2;
        }
        if (review.commitmentLevel === 'baixo') {
          return 1;
        }
        return null;
      })
      .filter((value): value is 1 | 2 | 3 => value !== null);
    const commitmentAverage = commitmentValues.length
      ? commitmentValues.reduce((sum, value) => sum + value, 0) / commitmentValues.length
      : null;
    const commitmentSignal =
      commitmentAverage === null
        ? ('sem_dados' as const)
        : commitmentAverage >= 2.6
          ? ('alto' as const)
          : commitmentAverage >= 1.8
            ? ('medio' as const)
            : ('baixo' as const);

    const challengeByStage = {
      reativo: {
        title: 'Ritual mínimo de consistência',
        metric: 'consistency_percent',
        target: 55,
        current: clampPercent(currentMetrics.consistencyPercent),
        unit: '%',
        reason: 'Sem consistência diária não existe evolução estratégica.'
      },
      executor: {
        title: 'Top 3 sob controle',
        metric: 'a_completion_rate',
        target: 60,
        current: clampPercent(currentMetrics.aCompletionRate),
        unit: '%',
        reason: 'Executar tarefas A com regularidade consolida identidade de executor.'
      },
      construtor: {
        title: 'Construção acima de operação',
        metric: 'construction_percent',
        target: 45,
        current: clampPercent(currentMetrics.constructionPercent),
        unit: '%',
        reason: 'Agora o jogo é avanço de projeto e construção de ativo futuro.'
      },
      estrategista: {
        title: 'Portfólio em equilíbrio',
        metric: 'disconnected_percent',
        target: 20,
        current: clampPercent(currentMetrics.disconnectedPercent),
        unit: '%',
        reason: 'Nível estrategista exige alocação limpa e baixa dispersão operacional.'
      }
    }[stage];

    const challengeDueDate = new Date(now);
    challengeDueDate.setDate(challengeDueDate.getDate() + 7);

    const topPressureRule = currentRules
      .filter((rule) => rule.status !== 'ok')
      .sort((left, right) => right.impact - left.impact)[0] ?? null;

    const stageNarrative = {
      reativo: 'Você está em fase de estabilização comportamental. Menos promessa, mais execução básica.',
      executor: 'Você já tem tração. Agora precisa proteger foco para não voltar ao caos operacional.',
      construtor: 'Execução já existe. O próximo salto vem de entregas estratégicas e marcos de projeto.',
      estrategista: 'Seu sistema está maduro. O ganho agora é alocação inteligente e decisão de portfólio.'
    }[stage];

    const narrative = {
      summary: `${stageNarrative} Índice atual ${index} (${trend}).`,
      pressureMessage: topPressureRule
        ? `Pressão principal: ${topPressureRule.title}. Se ignorar, você perde até ${topPressureRule.impact} pontos de índice.`
        : 'Sem pressão crítica dominante no momento.',
      riskIfIgnored: regressionRisk
        ? 'Há risco real de regressão de estágio em menos de 3 semanas.'
        : 'Sem risco imediato de regressão, mas mantenha o protocolo para consolidar evolução.',
      next7DaysPlan: [
        ...nextActions.slice(0, 3),
        stageMode.workloadGuard
      ]
    };

    const decisionFocusTokens = ['encerrar', 'cortar', 'prioriz', 'foco', 'deleg', 'elimin', 'reativ'];
    const decisionRiskTokens = ['adiar', 'depois', 'trav', 'medo', 'dispers', 'sem foco', 'atras'];
    const normalizeDecisionSignal = (signal: string) =>
      signal === 'executiva' || signal === 'risco' || signal === 'neutra' ? signal : 'neutra';

    const runtimeDecisionJournal = recentDecisionEvents.map((event) => ({
      id: event.id,
      kind: 'event' as const,
      periodType: null,
      periodStart: null,
      updatedAt: event.createdAt.toISOString(),
      decision: event.rationale?.trim() || event.title,
      commitmentLevel: null,
      signal: normalizeDecisionSignal(event.signal),
      source: event.source,
      eventCode: event.eventCode,
      impactScore: event.impactScore
    }));

    const reviewDecisionJournal = recentReviewHistory
      .filter((review) => Boolean(review.strategicDecision?.trim() || review.nextPriority?.trim()))
      .slice(0, 8)
      .map((review) => {
        const decisionText = review.strategicDecision?.trim() || review.nextPriority?.trim() || '';
        const normalized = normalizeText(`${review.strategicDecision ?? ''} ${review.reflection ?? ''}`);
        const focusHits = decisionFocusTokens.filter((token) => normalized.includes(token)).length;
        const riskHits = decisionRiskTokens.filter((token) => normalized.includes(token)).length;
        const signal = focusHits > riskHits ? 'executiva' : riskHits > focusHits ? 'risco' : 'neutra';

        return {
          id: review.id,
          kind: 'review' as const,
          periodType: review.periodType,
          periodStart: review.periodStart.toISOString().slice(0, 10),
          updatedAt: review.updatedAt.toISOString(),
          decision: decisionText,
          commitmentLevel: review.commitmentLevel,
          signal,
          source: 'review_journal',
          eventCode: 'review_journal_updated',
          impactScore: signal === 'executiva' ? 2 : signal === 'risco' ? -2 : 0
        };
      });

    const decisionJournal = [...runtimeDecisionJournal, ...reviewDecisionJournal]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 12);

    const executiveSignals = runtimeDecisionJournal.filter((entry) => entry.signal === 'executiva').length;
    const riskSignals = runtimeDecisionJournal.filter((entry) => entry.signal === 'risco').length;
    const neutralSignals = runtimeDecisionJournal.filter((entry) => entry.signal === 'neutra').length;
    const decisionBase = Math.max(1, executiveSignals + riskSignals + neutralSignals);
    const decisionQualityScore = clampPercent(
      50 + ((executiveSignals * 1.2 - riskSignals * 1.4 + neutralSignals * 0.2) / decisionBase) * 40
    );

    return {
      generatedAt: now.toISOString(),
      workspaceId: params.workspaceId ?? null,
      windowDays,
      index,
      previousIndex,
      deltaIndex,
      trend,
      stage: {
        code: stage,
        label: stageLabel(stage),
        minIndex: STAGE_MIN_INDEX[stage],
        next: nextStage
          ? {
              code: nextStage,
              label: stageLabel(nextStage),
              minIndex: STAGE_MIN_INDEX[nextStage]
            }
          : null
      },
      confidence,
      systemMode: stageMode,
      challenge: {
        title: challengeByStage.title,
        metric: challengeByStage.metric,
        target: challengeByStage.target,
        current: challengeByStage.current,
        unit: challengeByStage.unit,
        dueDate: challengeDueDate.toISOString().slice(0, 10),
        reason: challengeByStage.reason
      },
      narrative,
      metrics: {
        aCompletionRate: clampPercent(currentMetrics.aCompletionRate),
        deepWorkHoursPerWeek: Math.round(currentMetrics.deepWorkHoursPerWeek * 10) / 10,
        rescheduleRate: clampPercent(currentMetrics.rescheduleRate),
        projectConnectionRate: clampPercent(currentMetrics.projectConnectionRate),
        constructionPercent: clampPercent(currentMetrics.constructionPercent),
        disconnectedPercent: clampPercent(currentMetrics.disconnectedPercent),
        consistencyPercent: clampPercent(currentMetrics.consistencyPercent),
        ghostProjects: currentMetrics.ghostProjects
      },
      promotion: {
        recommended: promotionRecommended,
        blockedBySelfAssessment: promotionBlockedBySelfAssessment,
        blockReason: promotionBlockedBySelfAssessment
          ? 'Autoavaliação recente sinaliza dispersão/evitação. Subida de nível bloqueada até estabilizar.'
          : null,
        daysConsistent: betterDays,
        reason: promotionRecommended
          ? `Sinais consistentes em ${betterDays}/${windowDays} dias. Pronto para evoluir ao nível ${nextStage ? stageLabel(nextStage) : stageLabel(stage)}.`
          : nextStage
            ? promotionBlockedBySelfAssessment
              ? `Subida ao nível ${stageLabel(nextStage)} bloqueada por autoavaliação desalinhada.`
              : `Ainda não estabilizou evolução por ${windowDays} dias para subir ao nível ${stageLabel(nextStage)}.`
            : 'Você já está no nível máximo de exigência do sistema.'
      },
      regression: {
        risk: regressionRisk,
        daysDecline: lowPerformanceDays21,
        reason: regressionRisk
          ? `Queda sustentada em ${lowPerformanceDays21}/21 dias. Recomendado reduzir escopo e reforçar ritual básico.`
          : 'Sem risco forte de regressão no ciclo atual.'
      },
      perceptionAlignment: {
        status: alignment,
        perceivedLevel,
        objectiveLevel,
        note: alignmentNote,
        sourcePeriodStart: latestMonthlyReview?.periodStart.toISOString().slice(0, 10) ?? null
      },
      learningLoop: {
        stageStability,
        decisionQualityScore,
        commitmentSignal,
        decisionsLast90Days: recentDecisionEvents.length + reviewDecisionJournal.length,
        selfAssessmentBlock: promotionBlockedBySelfAssessment,
        weeklyTrajectory
      },
      decisionJournal,
      explainableRules: currentRules
        .sort((left, right) => right.impact - left.impact)
        .map((rule) => ({
          id: rule.id,
          title: rule.title,
          description: rule.description,
          metric: rule.metric,
          operator: rule.operator,
          current: rule.current,
          target: rule.target,
          unit: rule.unit,
          weight: rule.weight,
          status: rule.status,
          impact: rule.impact,
          dataUsed: rule.dataUsed,
          recommendation: rule.recommendation
        })),
      nextActions
    };
  }

  async getWeeklyPulse(params: {
    workspaceId?: string;
    weekStart?: string;
  }) {
    const baseDate = params.weekStart
      ? new Date(`${params.weekStart}T00:00:00.000Z`)
      : new Date();

    const weekStartDate = this.startOfWeek(baseDate);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);

    const [plans, sessions] = await Promise.all([
      this.prisma.dayPlan.findMany({
        where: {
          date: {
            gte: weekStartDate,
            lte: weekEndDate
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
        },
        orderBy: {
          date: 'asc'
        }
      }),
      this.prisma.deepWorkSession.findMany({
        where: {
          workspaceId: params.workspaceId,
          startedAt: {
            gte: weekStartDate,
            lte: weekEndDate
          }
        },
        include: {
          workspace: true
        }
      })
    ]);

    const dayMap = new Map<
      string,
      {
        date: string;
        plannedMinutes: number;
        fixedMinutes: number;
        deepWorkMinutes: number;
        constructionMinutes: number;
        operationMinutes: number;
        disconnectedMinutes: number;
      }
    >();

    for (let index = 0; index < 7; index += 1) {
      const date = new Date(weekStartDate);
      date.setDate(weekStartDate.getDate() + index);
      const key = toDateKey(date);
      dayMap.set(key, {
        date: key,
        plannedMinutes: 0,
        fixedMinutes: 0,
        deepWorkMinutes: 0,
        constructionMinutes: 0,
        operationMinutes: 0,
        disconnectedMinutes: 0
      });
    }

    const workspaceMinutes = new Map<string, { workspaceId: string; name: string; minutes: number }>();
    const workspaceHeatmapMinutes = new Map<
      string,
      {
        workspaceId: string;
        name: string;
        byDay: Map<string, number>;
      }
    >();

    for (const plan of plans) {
      const key = toDateKey(plan.date);
      const bucket = dayMap.get(key);

      if (!bucket) {
        continue;
      }

      for (const item of plan.items) {
        const duration = minutesBetween(item.startTime, item.endTime);

        if (item.blockType === 'fixed') {
          bucket.fixedMinutes += duration;
          continue;
        }

        if (!item.task) {
          continue;
        }

        if (params.workspaceId && item.task.workspaceId !== params.workspaceId) {
          continue;
        }

        bucket.plannedMinutes += duration;

        if (item.task.executionKind === 'construcao') {
          bucket.constructionMinutes += duration;
        } else {
          bucket.operationMinutes += duration;
        }

        if (!item.task.projectId) {
          bucket.disconnectedMinutes += duration;
        }

        const workspaceId = item.task.workspaceId;
        const workspaceName = item.task.workspace?.name ?? 'Workspace';
        const current = workspaceMinutes.get(workspaceId) ?? {
          workspaceId,
          name: workspaceName,
          minutes: 0
        };
        current.minutes += duration;
        workspaceMinutes.set(workspaceId, current);

        const heatmapEntry = workspaceHeatmapMinutes.get(workspaceId) ?? {
          workspaceId,
          name: workspaceName,
          byDay: new Map<string, number>()
        };
        heatmapEntry.byDay.set(key, (heatmapEntry.byDay.get(key) ?? 0) + duration);
        workspaceHeatmapMinutes.set(workspaceId, heatmapEntry);
      }
    }

    for (const session of sessions) {
      const key = toDateKey(session.startedAt);
      const bucket = dayMap.get(key);

      if (!bucket) {
        continue;
      }

      const minutes = session.state === 'active' ? minutesBetween(session.startedAt, new Date()) : session.actualMinutes;
      bucket.deepWorkMinutes += minutes;
    }

    const days = Array.from(dayMap.values());

    const totals = days.reduce(
      (acc, day) => {
        acc.plannedMinutes += day.plannedMinutes;
        acc.deepWorkMinutes += day.deepWorkMinutes;
        acc.constructionMinutes += day.constructionMinutes;
        acc.operationMinutes += day.operationMinutes;
        acc.disconnectedMinutes += day.disconnectedMinutes;
        return acc;
      },
      {
        plannedMinutes: 0,
        deepWorkMinutes: 0,
        constructionMinutes: 0,
        operationMinutes: 0,
        disconnectedMinutes: 0
      }
    );

    const constructionBase = Math.max(1, totals.constructionMinutes + totals.operationMinutes);
    const disconnectedBase = Math.max(1, totals.plannedMinutes);

    return {
      weekStart: toDateKey(weekStartDate),
      weekEnd: toDateKey(weekEndDate),
      days,
      workspaceHours: Array.from(workspaceMinutes.values())
        .map((entry) => ({
          ...entry,
          hours: Math.round((entry.minutes / 60) * 10) / 10
        }))
        .sort((left, right) => right.minutes - left.minutes),
      workspaceHeatmap: Array.from(workspaceHeatmapMinutes.values())
        .map((entry) => {
          const heatDays = days.map((day) => {
            const minutes = entry.byDay.get(day.date) ?? 0;
            return {
              date: day.date,
              minutes,
              hours: Math.round((minutes / 60) * 10) / 10
            };
          });

          const totalMinutes = heatDays.reduce((sum, day) => sum + day.minutes, 0);

          return {
            workspaceId: entry.workspaceId,
            name: entry.name,
            totalMinutes,
            totalHours: Math.round((totalMinutes / 60) * 10) / 10,
            days: heatDays
          };
        })
        .sort((left, right) => right.totalMinutes - left.totalMinutes),
      composition: {
        constructionPercent: clampPercent((totals.constructionMinutes / constructionBase) * 100),
        operationPercent: clampPercent((totals.operationMinutes / constructionBase) * 100),
        disconnectedPercent: clampPercent((totals.disconnectedMinutes / disconnectedBase) * 100)
      }
    };
  }
}
