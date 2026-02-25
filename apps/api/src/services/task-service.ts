import { Prisma, PrismaClient, TaskHorizon, TaskStatus } from '@prisma/client';

import { publishEvent } from '../infra/rabbit.js';
import { queueNames } from '@execution-os/shared';

type CreateTaskInput = {
  workspaceId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  horizon?: TaskHorizon;
  priority?: number;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  fixedTimeStart?: string | null;
  fixedTimeEnd?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  waitingOnPerson?: string | null;
  waitingPriority?: 'alta' | 'media' | 'baixa' | null;
};

type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};

export class TaskService {
  constructor(private readonly prisma: PrismaClient) {}

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
  }) {
    const where: Prisma.TaskWhereInput = {
      workspaceId: filters.workspaceId,
      projectId: filters.projectId,
      status: filters.status,
      horizon: filters.horizon,
      waitingOnPerson: filters.waitingOnly ? { not: null } : undefined
    };

    return this.prisma.task.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        workspace: true,
        project: true
      }
    });
  }

  async create(input: CreateTaskInput) {
    return this.prisma.task.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        horizon: input.horizon ?? 'active',
        priority: input.priority ?? 3,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        estimatedMinutes: input.estimatedMinutes,
        fixedTimeStart: input.fixedTimeStart ? new Date(input.fixedTimeStart) : null,
        fixedTimeEnd: input.fixedTimeEnd ? new Date(input.fixedTimeEnd) : null,
        windowStart: input.windowStart ? new Date(input.windowStart) : null,
        windowEnd: input.windowEnd ? new Date(input.windowEnd) : null,
        waitingOnPerson: input.waitingOnPerson,
        waitingPriority: input.waitingPriority,
        status: 'backlog'
      }
    });
  }

  async update(taskId: string, input: UpdateTaskInput) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        title: input.title,
        description: input.description,
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
        waitingPriority: input.waitingPriority
      }
    });
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

    return this.prisma.taskDependency.create({
      data: {
        taskId,
        dependsOnTaskId
      }
    });
  }

  private resolveCompletionResult(task: { fixedTimeEnd: Date | null }, now: Date) {
    if (!task.fixedTimeEnd) {
      return 'late' as const;
    }

    return now <= task.fixedTimeEnd ? ('on_time' as const) : ('late' as const);
  }

  async complete(taskId: string) {
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

    const result = this.resolveCompletionResult(task, new Date());

    await publishEvent(queueNames.updateGamification, {
      taskId,
      result
    });

    return task;
  }

  async postpone(taskId: string) {
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'backlog'
      }
    });

    await this.prisma.executionEvent.create({
      data: {
        taskId,
        eventType: 'delayed'
      }
    });

    await publishEvent(queueNames.updateGamification, {
      taskId,
      result: 'postponed'
    });

    return task;
  }

  async notConfirmed(taskId: string) {
    await this.prisma.executionEvent.create({
      data: {
        taskId,
        eventType: 'failed'
      }
    });

    await publishEvent(queueNames.updateGamification, {
      taskId,
      result: 'not_confirmed'
    });
  }

  async scheduleWaitingFollowup(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task?.waitingPriority) {
      throw new Error('Tarefa não possui waiting_priority configurada.');
    }

    await publishEvent(queueNames.waitingFollowupCheck, {
      taskId,
      waitingPriority: task.waitingPriority
    });

    return task;
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
}
