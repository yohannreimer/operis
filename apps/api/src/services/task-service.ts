import {
  Prisma,
  PrismaClient,
  TaskEnergy,
  TaskExecutionKind,
  FailureReason,
  TaskHorizon,
  TaskRestrictionStatus,
  TaskStatus,
  TaskType,
  WaitingType,
  WorkspaceMode
} from '@prisma/client';

import { publishEvent } from '../infra/rabbit.js';
import { queueNames } from '@execution-os/shared';
import {
  safeRecordStrategicDecisionEvent,
  signalFromImpact
} from './strategic-decision-service.js';

type CreateTaskInput = {
  workspaceId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  definitionOfDone?: string | null;
  isMultiBlock?: boolean;
  multiBlockGoalMinutes?: number | null;
  taskType?: TaskType;
  energyLevel?: TaskEnergy;
  executionKind?: TaskExecutionKind;
  horizon?: TaskHorizon;
  priority?: number;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  fixedTimeStart?: string | null;
  fixedTimeEnd?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  waitingOnPerson?: string | null;
  waitingType?: WaitingType | null;
  waitingPriority?: 'alta' | 'media' | 'baixa' | null;
  waitingDueDate?: string | null;
};

type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};

type UpdateSubtaskInput = Partial<{
  title: string;
  status: TaskStatus;
}>;

type CreateTaskRestrictionInput = {
  title: string;
  detail?: string | null;
};

type UpdateTaskRestrictionInput = Partial<{
  title: string;
  detail: string | null;
  status: TaskRestrictionStatus;
}>;

type TaskHistoryEntry = {
  id: string;
  at: string;
  type:
    | 'created'
    | 'scheduled'
    | 'completed'
    | 'postponed'
    | 'not_confirmed'
    | 'updated'
    | 'whatsapp_in'
    | 'whatsapp_out';
  title: string;
  description?: string;
};

type WorkspaceGuardrailViolationCode = 'maintenance_construction' | 'standby_execution';

type WorkspaceGuardrailViolation = {
  code: WorkspaceGuardrailViolationCode;
  message: string;
};

type WaitingFollowupEntry = {
  taskId: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectTitle: string | null;
  waitingOnPerson: string;
  waitingType: WaitingType | null;
  waitingPriority: 'alta' | 'media' | 'baixa';
  waitingDueDate: string | null;
  daysWaiting: number;
  lastFollowupAt: string | null;
  nextFollowupAt: string;
  followupState: 'urgente' | 'hoje' | 'agendado';
  suggestedAction: string;
  suggestedMessage: string;
};

export class TaskService {
  constructor(private readonly prisma: PrismaClient) {}

  private clampPercent(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private taskStrategicImpact(task: {
    taskType: TaskType;
    executionKind: TaskExecutionKind;
    projectId?: string | null;
    estimatedMinutes?: number | null;
  }) {
    let score = 0;

    if (task.taskType === 'a') {
      score += 4;
    } else if (task.taskType === 'b') {
      score += 1;
    } else {
      score -= 2;
    }

    if (task.executionKind === 'construcao') {
      score += 3;
    } else {
      score -= 1;
    }

    if (task.projectId) {
      score += 3;
    } else {
      score -= 2;
    }

    if (task.estimatedMinutes && task.estimatedMinutes > 0 && task.estimatedMinutes <= 180) {
      score += 1;
    }

    return score;
  }

  private ensureExecutableTitle(title: string) {
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      throw new Error('Título da tarefa deve seguir o padrão verbo + objeto.');
    }
  }

  private ensureWaitingIntegrity(input: {
    waitingOnPerson?: string | null;
    waitingType?: WaitingType | null;
    waitingDueDate?: string | null;
  }) {
    if (!input.waitingOnPerson?.trim()) {
      return;
    }

    if (!input.waitingType) {
      throw new Error('Dependência externa exige tipo de espera.');
    }

    if (!input.waitingDueDate) {
      throw new Error('Dependência externa exige data limite.');
    }
  }

  private ensureMultiBlockIntegrity(input: {
    isMultiBlock?: boolean;
    multiBlockGoalMinutes?: number | null;
    definitionOfDone?: string | null;
    estimatedMinutes?: number | null;
  }) {
    const isMultiBlock = Boolean(input.isMultiBlock);
    const goalMinutes = input.multiBlockGoalMinutes ?? null;
    const estimatedMinutes = input.estimatedMinutes ?? null;

    if (goalMinutes !== null && goalMinutes <= 0) {
      throw new Error('Meta de minutos da tarefa multiblock deve ser maior que zero.');
    }

    if (!isMultiBlock) {
      return;
    }

    if (!input.definitionOfDone?.trim()) {
      throw new Error('Tarefa multiblock exige critério de término (definição de pronto).');
    }

    const resolvedGoalMinutes = goalMinutes ?? estimatedMinutes;
    if (!resolvedGoalMinutes || resolvedGoalMinutes <= 0) {
      throw new Error('Tarefa multiblock exige estimativa total de minutos para progresso por sessão.');
    }
  }

  private async touchProjectStrategicSignal(projectId?: string | null, taskType?: TaskType) {
    if (!projectId || taskType === 'c') {
      return;
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true }
    });

    if (!project) {
      return;
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        lastStrategicAt: new Date()
      }
    });
  }

  private resolveWorkspaceGuardrailViolation(input: {
    workspaceName: string;
    workspaceMode: WorkspaceMode;
    executionKind: TaskExecutionKind;
    status: TaskStatus;
  }): WorkspaceGuardrailViolation | null {
    if (input.workspaceMode === 'manutencao' && input.executionKind === 'construcao') {
      return {
        code: 'maintenance_construction',
        message: `Frente ${input.workspaceName} está em manutenção: tarefas de construção não são permitidas neste modo.`
      };
    }

    if (input.workspaceMode === 'standby' && ['hoje', 'andamento'].includes(input.status)) {
      return {
        code: 'standby_execution',
        message: `Frente ${input.workspaceName} está em standby: não pode entrar em execução (hoje/andamento).`
      };
    }

    return null;
  }

  private followupIntervalDays(priority?: 'alta' | 'media' | 'baixa' | null) {
    if (priority === 'alta') {
      return 1;
    }
    if (priority === 'media') {
      return 3;
    }
    return 7;
  }

  private toIsoDateKey(input: Date) {
    return input.toISOString().slice(0, 10);
  }

  private addDays(input: Date, days: number) {
    const next = new Date(input);
    next.setDate(next.getDate() + days);
    return next;
  }

  private parseTaskFollowupPayload(payload: Prisma.JsonValue | null | undefined) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        nextFollowupAt: null as string | null
      };
    }

    const record = payload as Record<string, unknown>;
    return {
      nextFollowupAt:
        typeof record.nextFollowupAt === 'string' && record.nextFollowupAt.trim().length > 0
          ? record.nextFollowupAt
          : null
    };
  }

  private normalizeWaitingTaskState(params: {
    task: {
      id: string;
      title: string;
      workspaceId: string;
      projectId: string | null;
      waitingOnPerson: string | null;
      waitingType: WaitingType | null;
      waitingPriority: 'alta' | 'media' | 'baixa' | null;
      waitingDueDate: Date | null;
      createdAt: Date;
      workspace: { name: string } | null;
      project: { title: string } | null;
    };
    lastFollowupAt?: Date | null;
    lastFollowupPayload?: Prisma.JsonValue | null;
    now: Date;
  }): WaitingFollowupEntry {
    const waitingPriority = params.task.waitingPriority ?? 'media';
    const intervalDays = this.followupIntervalDays(waitingPriority);
    const waitingDueDate = params.task.waitingDueDate;
    const daysWaiting = Math.max(
      0,
      Math.floor((params.now.getTime() - params.task.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    );

    const payload = this.parseTaskFollowupPayload(params.lastFollowupPayload);
    const payloadNextFollowupAt = payload.nextFollowupAt ? new Date(payload.nextFollowupAt) : null;
    const computedNextFromLast = params.lastFollowupAt
      ? this.addDays(params.lastFollowupAt, intervalDays)
      : null;
    const nextFollowupCandidate = payloadNextFollowupAt ?? computedNextFromLast ?? params.now;

    const dueFromDependency = waitingDueDate ? waitingDueDate.getTime() : null;
    const dueFromCadence = nextFollowupCandidate.getTime();
    const effectiveDue = dueFromDependency !== null ? Math.min(dueFromDependency, dueFromCadence) : dueFromCadence;
    const endOfToday = new Date(params.now);
    endOfToday.setHours(23, 59, 59, 999);

    let followupState: WaitingFollowupEntry['followupState'] = 'agendado';
    if (effectiveDue < params.now.getTime()) {
      followupState = 'urgente';
    } else if (effectiveDue <= endOfToday.getTime()) {
      followupState = 'hoje';
    }

    const dueLabel =
      waitingDueDate && this.toIsoDateKey(waitingDueDate) === this.toIsoDateKey(params.now)
        ? 'vence hoje'
        : waitingDueDate
          ? `vence em ${this.toIsoDateKey(waitingDueDate)}`
          : `sem prazo formal (cadência ${intervalDays}d)`;

    const suggestedAction =
      followupState === 'urgente'
        ? 'Cobrar agora'
        : followupState === 'hoje'
          ? 'Cobrar hoje'
          : `Programar cobrança em ${intervalDays} dia(s)`;

    const suggestedMessage = `Follow-up: cobrar ${params.task.waitingOnPerson ?? 'responsável'} sobre "${params.task.title}" (${dueLabel}).`;

    return {
      taskId: params.task.id,
      title: params.task.title,
      workspaceId: params.task.workspaceId,
      workspaceName: params.task.workspace?.name ?? 'Frente',
      projectId: params.task.projectId,
      projectTitle: params.task.project?.title ?? null,
      waitingOnPerson: params.task.waitingOnPerson ?? 'responsável',
      waitingType: params.task.waitingType,
      waitingPriority,
      waitingDueDate: waitingDueDate ? waitingDueDate.toISOString() : null,
      daysWaiting,
      lastFollowupAt: params.lastFollowupAt ? params.lastFollowupAt.toISOString() : null,
      nextFollowupAt: new Date(effectiveDue).toISOString(),
      followupState,
      suggestedAction,
      suggestedMessage
    };
  }

  async resolveTaskByShortId(shortId: string) {
    const normalized = shortId.trim().toLowerCase();

    const candidates = await this.prisma.task.findMany({
      where: {
        id: {
          startsWith: normalized
        }
      },
      take: 2
    });

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length > 1) {
      throw new Error('ID ambíguo. Envie mais caracteres do ID da tarefa.');
    }

    return candidates[0];
  }

  async list(filters: {
    workspaceId?: string;
    projectId?: string;
    status?: TaskStatus;
    horizon?: TaskHorizon;
    waitingOnly?: boolean;
    restrictedOnly?: boolean;
  }) {
    const where: Prisma.TaskWhereInput = {
      workspaceId: filters.workspaceId,
      projectId: filters.projectId,
      status: filters.status,
      horizon: filters.horizon,
      waitingOnPerson: filters.waitingOnly ? { not: null } : undefined,
      restrictions: filters.restrictedOnly
        ? {
            some: {
              status: 'aberta'
            }
          }
        : undefined
    };

    return this.prisma.task.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        workspace: true,
        project: true,
        restrictions: {
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
        }
      }
    });
  }

  async getWaitingRadar(filters?: { workspaceId?: string }) {
    const waitingTasks = await this.prisma.task.findMany({
      where: {
        workspaceId: filters?.workspaceId,
        archivedAt: null,
        status: {
          in: ['backlog', 'hoje', 'andamento']
        },
        waitingOnPerson: {
          not: null
        }
      },
      include: {
        workspace: {
          select: {
            name: true
          }
        },
        project: {
          select: {
            title: true
          }
        }
      }
    });

    const now = new Date();
    const taskIds = waitingTasks.map((task) => task.id);
    const followupEvents = taskIds.length
      ? await this.prisma.strategicDecisionEvent.findMany({
          where: {
            taskId: {
              in: taskIds
            },
            eventCode: 'task_waiting_followup_logged'
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      : [];

    const latestFollowupByTask = new Map<
      string,
      {
        createdAt: Date;
        payload: Prisma.JsonValue | null;
      }
    >();

    for (const event of followupEvents) {
      if (!event.taskId || latestFollowupByTask.has(event.taskId)) {
        continue;
      }
      latestFollowupByTask.set(event.taskId, {
        createdAt: event.createdAt,
        payload: event.payload
      });
    }

    const rows = waitingTasks
      .map((task) =>
        this.normalizeWaitingTaskState({
          task,
          lastFollowupAt: latestFollowupByTask.get(task.id)?.createdAt ?? null,
          lastFollowupPayload: latestFollowupByTask.get(task.id)?.payload,
          now
        })
      )
      .sort((left, right) => {
        const rank = {
          urgente: 3,
          hoje: 2,
          agendado: 1
        } as const;
        if (rank[left.followupState] !== rank[right.followupState]) {
          return rank[right.followupState] - rank[left.followupState];
        }
        if (left.nextFollowupAt !== right.nextFollowupAt) {
          return new Date(left.nextFollowupAt).getTime() - new Date(right.nextFollowupAt).getTime();
        }
        return right.daysWaiting - left.daysWaiting;
      });

    return {
      generatedAt: now.toISOString(),
      counts: {
        total: rows.length,
        urgent: rows.filter((entry) => entry.followupState === 'urgente').length,
        dueToday: rows.filter((entry) => entry.followupState === 'hoje').length
      },
      rows
    };
  }

  async create(input: CreateTaskInput) {
    this.ensureExecutableTitle(input.title);
    this.ensureWaitingIntegrity(input);
    this.ensureMultiBlockIntegrity({
      isMultiBlock: input.isMultiBlock,
      multiBlockGoalMinutes: input.multiBlockGoalMinutes,
      definitionOfDone: input.definitionOfDone,
      estimatedMinutes: input.estimatedMinutes
    });
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: input.workspaceId },
      select: {
        name: true,
        mode: true
      }
    });

    const createViolation = this.resolveWorkspaceGuardrailViolation({
      workspaceName: workspace.name,
      workspaceMode: workspace.mode,
      executionKind: input.executionKind ?? 'operacao',
      status: 'backlog'
    });

    if (createViolation) {
      throw new Error(createViolation.message);
    }

    const task = await this.prisma.task.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        definitionOfDone: input.definitionOfDone?.trim() || null,
        taskType: input.taskType ?? 'b',
        energyLevel: input.energyLevel ?? 'media',
        executionKind: input.executionKind ?? 'operacao',
        horizon: input.horizon ?? 'active',
        priority: input.priority ?? 3,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        estimatedMinutes: input.estimatedMinutes,
        isMultiBlock: Boolean(input.isMultiBlock),
        multiBlockGoalMinutes: input.isMultiBlock
          ? input.multiBlockGoalMinutes ?? input.estimatedMinutes ?? null
          : null,
        fixedTimeStart: input.fixedTimeStart ? new Date(input.fixedTimeStart) : null,
        fixedTimeEnd: input.fixedTimeEnd ? new Date(input.fixedTimeEnd) : null,
        windowStart: input.windowStart ? new Date(input.windowStart) : null,
        windowEnd: input.windowEnd ? new Date(input.windowEnd) : null,
        waitingOnPerson: input.waitingOnPerson,
        waitingType: input.waitingType,
        waitingPriority: input.waitingPriority,
        waitingDueDate: input.waitingDueDate ? new Date(input.waitingDueDate) : null,
        status: 'backlog'
      }
    });

    await this.touchProjectStrategicSignal(task.projectId, task.taskType);
    const creationImpact = this.taskStrategicImpact({
      taskType: task.taskType,
      executionKind: task.executionKind,
      projectId: task.projectId,
      estimatedMinutes: task.estimatedMinutes
    });
    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      source: 'task_service',
      eventCode: 'task_created',
      signal: signalFromImpact(creationImpact),
      impactScore: creationImpact,
      title: `Tarefa criada: ${task.title}`,
      rationale: 'Registro em tempo real para aprendizado de padrão de criação.',
      payload: {
        taskType: task.taskType,
        executionKind: task.executionKind,
        estimatedMinutes: task.estimatedMinutes,
        hasProject: Boolean(task.projectId)
      }
    });

    return task;
  }

  async update(taskId: string, input: UpdateTaskInput) {
    if (input.title !== undefined) {
      this.ensureExecutableTitle(input.title);
    }

    this.ensureWaitingIntegrity({
      waitingOnPerson: input.waitingOnPerson,
      waitingType: input.waitingType,
      waitingDueDate: input.waitingDueDate
    });

    const currentTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        projectId: true,
        definitionOfDone: true,
        taskType: true,
        isMultiBlock: true,
        multiBlockGoalMinutes: true,
        estimatedMinutes: true,
        executionKind: true,
        status: true,
        workspace: {
          select: {
            name: true,
            mode: true
          }
        }
      }
    });

    if (!currentTask) {
      throw new Error('Tarefa não encontrada.');
    }

    const nextWorkspaceId = input.workspaceId ?? currentTask.workspaceId;
    const nextExecutionKind = input.executionKind ?? currentTask.executionKind;
    const nextStatus = input.status ?? currentTask.status;
    const nextDefinitionOfDone =
      input.definitionOfDone === undefined ? currentTask.definitionOfDone : input.definitionOfDone;
    const nextEstimatedMinutes =
      input.estimatedMinutes === undefined ? currentTask.estimatedMinutes : input.estimatedMinutes;
    const nextIsMultiBlock = input.isMultiBlock ?? currentTask.isMultiBlock;
    const nextMultiBlockGoalMinutes =
      input.isMultiBlock === false
        ? null
        : input.multiBlockGoalMinutes === undefined
          ? currentTask.multiBlockGoalMinutes
          : input.multiBlockGoalMinutes;

    this.ensureMultiBlockIntegrity({
      isMultiBlock: nextIsMultiBlock,
      multiBlockGoalMinutes: nextMultiBlockGoalMinutes,
      definitionOfDone: nextDefinitionOfDone,
      estimatedMinutes: nextEstimatedMinutes
    });

    const nextWorkspace =
      nextWorkspaceId === currentTask.workspaceId
        ? currentTask.workspace
        : await this.prisma.workspace.findUniqueOrThrow({
            where: { id: nextWorkspaceId },
            select: {
              name: true,
              mode: true
            }
          });

    const currentViolation = this.resolveWorkspaceGuardrailViolation({
      workspaceName: currentTask.workspace.name,
      workspaceMode: currentTask.workspace.mode,
      executionKind: currentTask.executionKind,
      status: currentTask.status
    });

    const nextViolation = this.resolveWorkspaceGuardrailViolation({
      workspaceName: nextWorkspace.name,
      workspaceMode: nextWorkspace.mode,
      executionKind: nextExecutionKind,
      status: nextStatus
    });

    if (nextViolation && (!currentViolation || currentViolation.code !== nextViolation.code)) {
      throw new Error(nextViolation.message);
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        title: input.title?.trim(),
        description: input.description === null ? null : input.description?.trim(),
        definitionOfDone:
          input.definitionOfDone === null ? null : input.definitionOfDone?.trim(),
        taskType: input.taskType,
        energyLevel: input.energyLevel,
        executionKind: input.executionKind,
        status: input.status,
        horizon: input.horizon,
        priority: input.priority,
        dueDate:
          input.dueDate === null
            ? null
            : input.dueDate
              ? new Date(input.dueDate)
              : undefined,
        estimatedMinutes: input.estimatedMinutes,
        isMultiBlock: input.isMultiBlock,
        multiBlockGoalMinutes:
          input.isMultiBlock === false
            ? null
            : input.multiBlockGoalMinutes === undefined
              ? undefined
              : input.multiBlockGoalMinutes,
        fixedTimeStart:
          input.fixedTimeStart === null
            ? null
            : input.fixedTimeStart
              ? new Date(input.fixedTimeStart)
              : undefined,
        fixedTimeEnd:
          input.fixedTimeEnd === null
            ? null
            : input.fixedTimeEnd
              ? new Date(input.fixedTimeEnd)
              : undefined,
        windowStart:
          input.windowStart === null
            ? null
            : input.windowStart
              ? new Date(input.windowStart)
              : undefined,
        windowEnd:
          input.windowEnd === null
            ? null
            : input.windowEnd
              ? new Date(input.windowEnd)
              : undefined,
        waitingOnPerson: input.waitingOnPerson,
        waitingType: input.waitingType,
        waitingPriority: input.waitingPriority,
        waitingDueDate:
          input.waitingDueDate === null
            ? null
            : input.waitingDueDate
              ? new Date(input.waitingDueDate)
              : undefined
      }
    });

    await this.touchProjectStrategicSignal(task.projectId, task.taskType);

    const changeReasons: string[] = [];
    let updateImpact = 0;

    if (currentTask.projectId !== task.projectId) {
      if (task.projectId) {
        changeReasons.push('Tarefa conectada a projeto estratégico.');
        updateImpact += 3;
      } else {
        changeReasons.push('Tarefa ficou sem vínculo de projeto.');
        updateImpact -= 3;
      }
    }

    if (currentTask.taskType !== task.taskType) {
      if (task.taskType === 'a') {
        changeReasons.push('Classificação elevada para tarefa A.');
        updateImpact += 3;
      } else if (currentTask.taskType === 'a') {
        changeReasons.push('Tarefa A foi rebaixada.');
        updateImpact -= 2;
      }
    }

    if (currentTask.executionKind !== task.executionKind) {
      if (task.executionKind === 'construcao') {
        changeReasons.push('Natureza alterada para construção de futuro.');
        updateImpact += 2;
      } else {
        changeReasons.push('Natureza alterada para operação.');
        updateImpact -= 1;
      }
    }

    if (input.estimatedMinutes !== undefined && input.estimatedMinutes !== currentTask.estimatedMinutes) {
      if (task.estimatedMinutes && task.estimatedMinutes > 0) {
        changeReasons.push('Tempo estimado foi recalibrado.');
        updateImpact += 1;
      }
    }

    if (input.isMultiBlock !== undefined && input.isMultiBlock !== currentTask.isMultiBlock) {
      if (task.isMultiBlock) {
        changeReasons.push('Tarefa convertida para multiblock (execução em múltiplas sessões).');
        updateImpact += 2;
      } else {
        changeReasons.push('Tarefa voltou ao modo de bloco único.');
        updateImpact -= 1;
      }
    }

    if (input.status && input.status !== currentTask.status) {
      if (['hoje', 'andamento'].includes(input.status)) {
        changeReasons.push('Tarefa movida para execução ativa.');
        updateImpact += 1;
      } else if (input.status === 'backlog' && currentTask.status !== 'backlog') {
        changeReasons.push('Tarefa recuada para backlog.');
        updateImpact -= 1;
      }
    }

    if (changeReasons.length > 0) {
      await safeRecordStrategicDecisionEvent(this.prisma, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        source: 'task_service',
        eventCode: 'task_reframed',
        signal: signalFromImpact(updateImpact),
        impactScore: updateImpact,
        title: `Tarefa ajustada: ${task.title}`,
        rationale: changeReasons.join(' '),
        payload: {
          previous: {
            projectId: currentTask.projectId,
            taskType: currentTask.taskType,
            executionKind: currentTask.executionKind,
            status: currentTask.status,
            estimatedMinutes: currentTask.estimatedMinutes
          },
          next: {
            projectId: task.projectId,
            taskType: task.taskType,
            executionKind: task.executionKind,
            status: task.status,
            estimatedMinutes: task.estimatedMinutes
          }
        }
      });
    }

    const planningChanged =
      input.fixedTimeStart !== undefined ||
      input.fixedTimeEnd !== undefined ||
      input.dueDate !== undefined ||
      input.windowStart !== undefined ||
      input.windowEnd !== undefined;

    if (planningChanged) {
      await this.prisma.executionEvent.create({
        data: {
          taskId,
          eventType: 'confirmed'
        }
      });
    }

    return task;
  }

  async addDependency(taskId: string, dependsOnTaskId: string) {
    if (taskId === dependsOnTaskId) {
      throw new Error('Uma tarefa não pode depender dela mesma.');
    }

    const dependsOnGraph = await this.prisma.taskDependency.findMany({
      where: { taskId: dependsOnTaskId }
    });

    if (dependsOnGraph.some((item) => item.dependsOnTaskId === taskId)) {
      throw new Error('Dependência cíclica detectada.');
    }

    const dependency = await this.prisma.taskDependency.create({
      data: {
        taskId,
        dependsOnTaskId
      }
    });

    const task = await this.prisma.task.findUnique({
      where: {
        id: taskId
      },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        projectId: true
      }
    });

    if (task) {
      await safeRecordStrategicDecisionEvent(this.prisma, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        source: 'task_service',
        eventCode: 'task_dependency_added',
        signal: 'neutra',
        impactScore: 1,
        title: `Dependência adicionada: ${task.title}`,
        rationale: 'Registro de dependência para análise de gargalo e bloqueios externos.',
        payload: {
          dependsOnTaskId
        }
      });
    }

    return dependency;
  }

  private resolveCompletionResult(task: { fixedTimeEnd: Date | null }, now: Date) {
    if (!task.fixedTimeEnd) {
      return 'late' as const;
    }

    return now <= task.fixedTimeEnd ? ('on_time' as const) : ('late' as const);
  }

  private async countPendingAForStrictMode(task: {
    id: string;
    workspaceId: string;
    taskType: TaskType;
  }) {
    if (task.taskType === 'a') {
      return 0;
    }

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    return this.prisma.task.count({
      where: {
        id: {
          not: task.id
        },
        workspaceId: task.workspaceId,
        archivedAt: null,
        taskType: 'a',
        status: {
          in: ['backlog', 'hoje', 'andamento']
        },
        OR: [
          {
            status: {
              in: ['hoje', 'andamento']
            }
          },
          {
            dueDate: {
              lte: endOfToday
            }
          }
        ]
      }
    });
  }

  async complete(taskId: string, options?: { strictMode?: boolean }) {
    const currentTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        projectId: true,
        fixedTimeEnd: true,
        taskType: true,
        executionKind: true
      }
    });

    if (!currentTask) {
      throw new Error('Tarefa não encontrada.');
    }

    if (options?.strictMode) {
      const pendingA = await this.countPendingAForStrictMode(currentTask);
      if (pendingA > 0) {
        throw new Error(
          'Modo rígido ativo: existem tarefas A pendentes para hoje neste workspace. Conclua-as antes de tarefas B/C.'
        );
      }
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'feito',
        completedAt: new Date()
      }
    });

    await this.prisma.executionEvent.create({
      data: {
        taskId,
        eventType: 'completed'
      }
    });
    const completionImpact =
      this.taskStrategicImpact({
        taskType: currentTask.taskType,
        executionKind: currentTask.executionKind,
        projectId: currentTask.projectId,
        estimatedMinutes: null
      }) + 2;
    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: currentTask.workspaceId,
      projectId: currentTask.projectId,
      taskId: currentTask.id,
      source: 'task_service',
      eventCode: 'task_completed',
      signal: signalFromImpact(completionImpact),
      impactScore: completionImpact,
      title: `Tarefa concluída: ${currentTask.title}`,
      rationale: 'Conclusão registrada para reforçar padrão de entrega.',
      payload: {
        taskType: currentTask.taskType,
        executionKind: currentTask.executionKind,
        strictMode: Boolean(options?.strictMode)
      }
    });

    const result = this.resolveCompletionResult(currentTask, new Date());

    await publishEvent(queueNames.updateGamification, {
      taskId,
      result
    });

    return task;
  }

  async postpone(taskId: string, reason?: FailureReason) {
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'backlog'
      }
    });

    await this.prisma.executionEvent.create({
      data: {
        taskId,
        eventType: 'delayed',
        failureReason: reason
      }
    });

    await publishEvent(queueNames.updateGamification, {
      taskId,
      result: 'postponed'
    });

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      source: 'task_service',
      eventCode: 'task_postponed',
      signal: 'risco',
      impactScore: -4,
      title: `Tarefa adiada: ${task.title}`,
      rationale: 'Reagendamento alimenta sinal de evitação quando recorrente.',
      payload: {
        reason: reason ?? null
      }
    });

    return task;
  }

  async notConfirmed(taskId: string, reason?: FailureReason) {
    await this.prisma.executionEvent.create({
      data: {
        taskId,
        eventType: 'failed',
        failureReason: reason
      }
    });

    await publishEvent(queueNames.updateGamification, {
      taskId,
      result: 'not_confirmed'
    });

    const task = await this.prisma.task.findUnique({
      where: {
        id: taskId
      },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        projectId: true,
        taskType: true
      }
    });

    if (task) {
      await safeRecordStrategicDecisionEvent(this.prisma, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        source: 'task_service',
        eventCode: 'task_not_confirmed',
        signal: 'risco',
        impactScore: task.taskType === 'a' ? -6 : -4,
        title: `Compromisso quebrado: ${task.title}`,
        rationale: 'Falha após compromisso explícito no bloco do dia.',
        payload: {
          reason: reason ?? null
        }
      });
    }
  }

  async registerWaitingFollowup(
    taskId: string,
    input?: {
      note?: string;
      source?: 'manual' | 'auto';
      triggerQueue?: boolean;
    }
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        workspace: {
          select: {
            name: true
          }
        },
        project: {
          select: {
            title: true
          }
        }
      }
    });

    if (!task) {
      throw new Error('Tarefa não encontrada.');
    }

    if (!task.waitingOnPerson?.trim()) {
      throw new Error('Tarefa não possui dependência externa ativa.');
    }

    const waitingPriority = task.waitingPriority ?? 'media';
    const intervalDays = this.followupIntervalDays(waitingPriority);
    const now = new Date();
    const nextFollowupAt = this.addDays(now, intervalDays);

    if (input?.triggerQueue) {
      await publishEvent(queueNames.waitingFollowupCheck, {
        taskId,
        waitingPriority
      });
    }

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      source: 'task_service',
      eventCode: 'task_waiting_followup_logged',
      signal: 'executiva',
      impactScore: 2,
      title: `Follow-up registrado: ${task.title}`,
      rationale: `Cobrança registrada para ${task.waitingOnPerson} com prioridade ${waitingPriority}.`,
      payload: {
        waitingOnPerson: task.waitingOnPerson,
        waitingType: task.waitingType ?? null,
        waitingPriority,
        waitingDueDate: task.waitingDueDate?.toISOString() ?? null,
        nextFollowupAt: nextFollowupAt.toISOString(),
        source: input?.source ?? 'manual',
        note: input?.note?.trim() ? input.note.trim() : null
      }
    });

    return this.normalizeWaitingTaskState({
      task,
      lastFollowupAt: now,
      lastFollowupPayload: {
        nextFollowupAt: nextFollowupAt.toISOString()
      },
      now
    });
  }

  async scheduleWaitingFollowup(taskId: string) {
    return this.registerWaitingFollowup(taskId, {
      source: 'auto',
      triggerQueue: true
    });
  }

  async archiveCompletedOlderThan24Hours() {
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.prisma.task.updateMany({
      where: {
        status: 'feito',
        completedAt: {
          lt: before
        }
      },
      data: {
        status: 'arquivado',
        archivedAt: new Date()
      }
    });

    return result.count;
  }

  async getMultiBlockProgress(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: {
        id: taskId
      },
      select: {
        id: true,
        title: true,
        status: true,
        isMultiBlock: true,
        multiBlockGoalMinutes: true,
        estimatedMinutes: true,
        definitionOfDone: true,
        workspaceId: true,
        projectId: true
      }
    });

    if (!task) {
      throw new Error('Tarefa não encontrada.');
    }

    const sessions = await this.prisma.deepWorkSession.findMany({
      where: {
        taskId
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    const now = new Date();
    const normalizedSessions = sessions.map((session) => {
      const elapsedMinutes =
        session.state === 'active'
          ? Math.max(0, Math.round((now.getTime() - session.startedAt.getTime()) / 60000))
          : session.actualMinutes;

      return {
        id: session.id,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        state: session.state,
        minutes: elapsedMinutes,
        targetMinutes: session.targetMinutes,
        interruptionCount: session.interruptionCount,
        breakCount: session.breakCount,
        notes: session.notes ?? null
      };
    });

    const completedMinutes = normalizedSessions.reduce((sum, session) => sum + session.minutes, 0);
    const goalMinutes = task.multiBlockGoalMinutes ?? task.estimatedMinutes ?? 0;
    const progressPercent = goalMinutes
      ? this.clampPercent((completedMinutes / Math.max(1, goalMinutes)) * 100)
      : 0;

    const completedSessions = normalizedSessions.filter((session) => session.state === 'completed').length;
    const brokenSessions = normalizedSessions.filter((session) => session.state === 'broken').length;
    const activeSession = normalizedSessions.find((session) => session.state === 'active') ?? null;
    const lastSession = normalizedSessions[0] ?? null;

    return {
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        isMultiBlock: task.isMultiBlock,
        goalMinutes,
        estimatedMinutes: task.estimatedMinutes,
        completionCriteria: task.definitionOfDone ?? null
      },
      summary: {
        sessionsCount: normalizedSessions.length,
        completedSessions,
        brokenSessions,
        completedMinutes,
        goalMinutes,
        remainingMinutes: Math.max(0, goalMinutes - completedMinutes),
        progressPercent,
        hasCompletionCriteria: Boolean(task.definitionOfDone?.trim()),
        activeSessionId: activeSession?.id ?? null,
        lastSessionAt: lastSession?.startedAt ?? null
      },
      sessions: normalizedSessions
    };
  }

  async listSubtasks(taskId: string) {
    return this.prisma.subtask.findMany({
      where: {
        taskId
      },
      orderBy: {
        id: 'asc'
      }
    });
  }

  async listRestrictions(taskId: string) {
    return this.prisma.taskRestriction.findMany({
      where: {
        taskId
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    });
  }

  async createRestriction(taskId: string, input: CreateTaskRestrictionInput) {
    await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { id: true }
    });

    return this.prisma.taskRestriction.create({
      data: {
        taskId,
        title: input.title.trim(),
        detail: input.detail?.trim() || null,
        status: 'aberta'
      }
    });
  }

  async updateRestriction(restrictionId: string, input: UpdateTaskRestrictionInput) {
    const current = await this.prisma.taskRestriction.findUnique({
      where: { id: restrictionId },
      select: {
        status: true
      }
    });

    if (!current) {
      throw new Error('Restrição não encontrada.');
    }

    const nextStatus = input.status ?? current.status;

    return this.prisma.taskRestriction.update({
      where: { id: restrictionId },
      data: {
        title: input.title?.trim(),
        detail: input.detail === null ? null : input.detail?.trim(),
        status: input.status,
        resolvedAt:
          nextStatus === 'resolvida'
            ? current.status === 'resolvida'
              ? undefined
              : new Date()
            : null
      }
    });
  }

  async removeRestriction(restrictionId: string) {
    await this.prisma.taskRestriction.delete({
      where: {
        id: restrictionId
      }
    });

    return { ok: true };
  }

  async createSubtask(taskId: string, title: string) {
    await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { id: true }
    });

    return this.prisma.subtask.create({
      data: {
        taskId,
        title,
        status: 'backlog'
      }
    });
  }

  async updateSubtask(subtaskId: string, input: UpdateSubtaskInput) {
    return this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        title: input.title,
        status: input.status
      }
    });
  }

  async removeSubtask(subtaskId: string) {
    await this.prisma.subtask.delete({
      where: { id: subtaskId }
    });

    return { ok: true };
  }

  async remove(taskId: string) {
    const currentTask = await this.prisma.task.findUnique({
      where: {
        id: taskId
      },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        projectId: true,
        taskType: true,
        executionKind: true,
        status: true
      }
    });

    if (!currentTask) {
      throw new Error('Tarefa não encontrada.');
    }

    await this.prisma.task.delete({
      where: {
        id: taskId
      }
    });

    const deletionImpact =
      this.taskStrategicImpact({
        taskType: currentTask.taskType,
        executionKind: currentTask.executionKind,
        projectId: currentTask.projectId,
        estimatedMinutes: null
      }) * -1;

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: currentTask.workspaceId,
      projectId: currentTask.projectId,
      source: 'task_service',
      eventCode: 'task_deleted',
      signal: signalFromImpact(deletionImpact),
      impactScore: deletionImpact,
      title: `Tarefa excluída: ${currentTask.title}`,
      rationale: 'Exclusão manual de tarefa no fluxo operacional.',
      payload: {
        deletedTaskId: currentTask.id,
        taskType: currentTask.taskType,
        executionKind: currentTask.executionKind,
        status: currentTask.status
      }
    });

    return {
      ok: true
    };
  }

  async getHistory(taskId: string): Promise<TaskHistoryEntry[]> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        createdAt: true
      }
    });

    if (!task) {
      throw new Error('Tarefa não encontrada.');
    }

    const [executionEvents, planItems, whatsappEvents] = await Promise.all([
      this.prisma.executionEvent.findMany({
        where: { taskId },
        orderBy: { timestamp: 'asc' }
      }),
      this.prisma.dayPlanItem.findMany({
        where: { taskId },
        include: {
          dayPlan: true
        },
        orderBy: { startTime: 'asc' }
      }),
      this.prisma.whatsappEvent.findMany({
        where: { relatedTaskId: taskId },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const history: TaskHistoryEntry[] = [
      {
        id: `created-${task.id}`,
        at: task.createdAt.toISOString(),
        type: 'created',
        title: 'Tarefa criada'
      }
    ];

    for (const item of planItems) {
      history.push({
        id: `plan-${item.id}`,
        at: item.startTime.toISOString(),
        type: 'scheduled',
        title: 'Bloco planejado',
        description: `${item.startTime.toISOString().slice(11, 16)}-${item.endTime
          .toISOString()
          .slice(11, 16)} (${item.dayPlan.date.toISOString().slice(0, 10)})`
      });
    }

    for (const event of executionEvents) {
      if (event.eventType === 'completed') {
        history.push({
          id: `execution-${event.id}`,
          at: event.timestamp.toISOString(),
          type: 'completed',
          title: 'Concluída'
        });
      }

      if (event.eventType === 'delayed') {
        history.push({
          id: `execution-${event.id}`,
          at: event.timestamp.toISOString(),
          type: 'postponed',
          title: 'Adiada',
          description: event.failureReason ?? undefined
        });
      }

      if (event.eventType === 'failed') {
        history.push({
          id: `execution-${event.id}`,
          at: event.timestamp.toISOString(),
          type: 'not_confirmed',
          title: 'Não confirmada',
          description: event.failureReason ?? undefined
        });
      }

      if (event.eventType === 'confirmed') {
        history.push({
          id: `execution-${event.id}`,
          at: event.timestamp.toISOString(),
          type: 'updated',
          title: 'Planejamento atualizado'
        });
      }
    }

    for (const event of whatsappEvents) {
      history.push({
        id: `whatsapp-${event.id}`,
        at: event.createdAt.toISOString(),
        type: event.direction === 'in' ? 'whatsapp_in' : 'whatsapp_out',
        title: event.direction === 'in' ? 'WhatsApp recebido' : 'WhatsApp enviado',
        description: event.messageContent
      });
    }

    return history.sort((left, right) => right.at.localeCompare(left.at));
  }
}
