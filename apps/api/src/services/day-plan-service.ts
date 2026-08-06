import { BlockType, FailureReason, PrismaClient } from '@prisma/client';

import { publishEvent } from '../infra/rabbit.js';
import { queueNames } from '@execution-os/shared';
import { startOfDay } from '../utils/time.js';
import { TaskService } from './task-service.js';
import { safeRecordStrategicDecisionEvent } from './strategic-decision-service.js';

function isStrategicExecutionKind(kind?: string | null) {
  return kind === 'construcao' || kind === 'otimizacao';
}

type AddDayPlanItemInput = {
  clerkUserId: string;
  date: string;
  taskId?: string | null;
  inboxItemId?: string | null;
  startTime: string;
  endTime: string;
  orderIndex?: number;
  blockType: BlockType;
};

type UpdateDayPlanItemInput = Partial<{
  date: string;
  taskId: string | null;
  inboxItemId: string | null;
  startTime: string;
  endTime: string;
  orderIndex: number;
  blockType: BlockType;
  completedAt: string | null;
}>;

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function assertSource(input: {
  blockType: BlockType;
  taskId?: string | null;
  inboxItemId?: string | null;
}) {
  const sources = Number(Boolean(input.taskId)) + Number(Boolean(input.inboxItemId));

  if (input.blockType === 'task' && sources !== 1) {
    throw badRequest('Bloco de trabalho precisa de uma única origem.');
  }

  if (input.blockType === 'fixed' && sources !== 0) {
    throw badRequest('Bloco fixo legado não aceita origem.');
  }
}

export class DayPlanService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly taskService: TaskService
  ) {}

  private async getOrCreatePlan(date: string, clerkUserId: string) {
    const normalizedDate = startOfDay(date);

    const existing = await this.prisma.dayPlan.findUnique({
      where: { clerkUserId_date: { clerkUserId, date: normalizedDate } }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.dayPlan.create({
      data: { clerkUserId, date: normalizedDate }
    });
  }

  private todayDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  private isTodayDate(date: string) {
    return date === this.todayDateString();
  }

  async getByDate(date: string, clerkUserId: string) {
    const normalizedDate = startOfDay(date);
    const plan = await this.prisma.dayPlan.findUnique({
      where: { clerkUserId_date: { clerkUserId, date: normalizedDate } },
      include: {
        items: {
          include: {
            task: true,
            inboxItem: true
          },
          orderBy: {
            startTime: 'asc'
          }
        }
      }
    });

    return plan;
  }

  async addItem(input: AddDayPlanItemInput) {
    assertSource(input);

    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    if (startTime >= endTime) {
      throw new Error('start_time precisa ser menor que end_time.');
    }

    const plan = await this.getOrCreatePlan(input.date, input.clerkUserId);

    if (input.taskId) {
      const task = await this.prisma.task.findFirst({
        where: {
          id: input.taskId,
          workspace: { clerkUserId: input.clerkUserId }
        },
        select: {
          estimatedMinutes: true,
          title: true,
          executionKind: true,
          workspace: {
            select: {
              name: true,
              mode: true
            }
          }
        }
      });

      if (!task) {
        throw new Error('Tarefa não encontrada para agendamento.');
      }

      if (!task.estimatedMinutes) {
        throw new Error(`Defina tempo estimado para agendar: ${task.title}`);
      }

      if (task.workspace.mode === 'standby') {
        throw new Error(
          `Frente ${task.workspace.name} está em standby. Mude o modo antes de agendar esta tarefa.`
        );
      }

      if (task.workspace.mode === 'manutencao' && isStrategicExecutionKind(task.executionKind)) {
        throw new Error(
          `Frente ${task.workspace.name} está em manutenção. Tarefa de construção/otimização não pode entrar na agenda.`
        );
      }
    }

    if (input.inboxItemId) {
      const inboxItem = await this.prisma.inboxItem.findFirst({
        where: { id: input.inboxItemId, clerkUserId: input.clerkUserId },
        select: { id: true }
      });

      if (!inboxItem) {
        throw new Error('Item do Inbox não encontrado para agendamento.');
      }
    }

    const created = await this.prisma.dayPlanItem.create({
      data: {
        dayPlanId: plan.id,
        taskId: input.taskId ?? null,
        inboxItemId: input.inboxItemId ?? null,
        startTime,
        endTime,
        orderIndex: input.orderIndex ?? 0,
        blockType: input.blockType,
        confirmationState: 'pending'
      },
      include: {
        task: true,
        inboxItem: true
      }
    });

    if (created.taskId) {
      await this.prisma.task.update({
        where: { id: created.taskId },
        data: {
          status: this.isTodayDate(input.date) ? 'hoje' : 'backlog',
          horizon: 'active'
        }
      });
    }

    await publishEvent(queueNames.scheduleBlockStart, {
      dayPlanItemId: created.id,
      taskId: created.taskId
    });

    await publishEvent(queueNames.scheduleBlockEnd, {
      dayPlanItemId: created.id,
      taskId: created.taskId
    });

    if (created.task) {
      const isStrategic = created.task.taskType === 'a' && isStrategicExecutionKind(created.task.executionKind);
      await safeRecordStrategicDecisionEvent(this.prisma, {
        workspaceId: created.task.workspaceId,
        projectId: created.task.projectId,
        taskId: created.task.id,
        source: 'day_plan_service',
        eventCode: 'schedule_block_added',
        signal: isStrategic ? 'executiva' : 'neutra',
        impactScore: isStrategic ? 3 : 1,
        title: `Bloco agendado: ${created.task.title}`,
        rationale: 'Compromisso explícito no calendário diário.',
        payload: {
          date: input.date,
          blockType: created.blockType,
          startTime: created.startTime.toISOString(),
          endTime: created.endTime.toISOString()
        }
      });
    }

    return created;
  }

  private async assertItemOwner(dayPlanItemId: string, clerkUserId?: string) {
    if (!clerkUserId) {
      return;
    }

    const item = await this.prisma.dayPlanItem.findFirst({
      where: {
        id: dayPlanItemId,
        dayPlan: { clerkUserId }
      },
      select: { id: true }
    });

    if (!item) {
      throw new Error('Item de planejamento não encontrado.');
    }
  }

  async updateItem(dayPlanItemId: string, input: UpdateDayPlanItemInput, clerkUserId?: string) {
    const existingItem = await this.prisma.dayPlanItem.findUnique({
      where: { id: dayPlanItemId },
      include: {
        dayPlan: true
      }
    });

    if (!existingItem) {
      throw new Error('Item de planejamento não encontrado.');
    }

    if (clerkUserId && existingItem.dayPlan.clerkUserId !== clerkUserId) {
      throw new Error('Item de planejamento não encontrado.');
    }

    const nextStart = input.startTime ? new Date(input.startTime) : existingItem.startTime;
    const nextEnd = input.endTime ? new Date(input.endTime) : existingItem.endTime;
    const nextBlockType = input.blockType ?? existingItem.blockType;
    const nextTaskId = input.taskId === undefined ? existingItem.taskId : input.taskId;
    const nextInboxItemId =
      input.inboxItemId === undefined ? existingItem.inboxItemId : input.inboxItemId;

    assertSource({
      blockType: nextBlockType,
      taskId: nextTaskId,
      inboxItemId: nextInboxItemId
    });

    if (nextStart >= nextEnd) {
      throw new Error('start_time precisa ser menor que end_time.');
    }

    if (nextTaskId) {
      const task = await this.prisma.task.findFirst({
        where: {
          id: nextTaskId,
          workspace: clerkUserId ? { clerkUserId } : undefined
        },
        select: {
          estimatedMinutes: true,
          title: true,
          executionKind: true,
          workspace: {
            select: {
              name: true,
              mode: true
            }
          }
        }
      });

      if (!task) {
        throw new Error('Tarefa não encontrada para agendamento.');
      }

      if (!task.estimatedMinutes) {
        throw new Error(`Defina tempo estimado para agendar: ${task.title}`);
      }

      if (task.workspace.mode === 'standby') {
        throw new Error(
          `Frente ${task.workspace.name} está em standby. Mude o modo antes de agendar esta tarefa.`
        );
      }

      if (task.workspace.mode === 'manutencao' && isStrategicExecutionKind(task.executionKind)) {
        throw new Error(
          `Frente ${task.workspace.name} está em manutenção. Tarefa de construção/otimização não pode entrar na agenda.`
        );
      }
    }

    if (nextInboxItemId) {
      const inboxItem = await this.prisma.inboxItem.findFirst({
        where: {
          id: nextInboxItemId,
          clerkUserId: clerkUserId ?? existingItem.dayPlan.clerkUserId
        },
        select: { id: true }
      });

      if (!inboxItem) {
        throw new Error('Item do Inbox não encontrado para agendamento.');
      }
    }

    const targetPlan = input.date
      ? await this.getOrCreatePlan(
          input.date,
          clerkUserId ?? existingItem.dayPlan.clerkUserId
        )
      : existingItem.dayPlan;

    const updated = await this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        dayPlanId: input.date ? targetPlan.id : undefined,
        taskId: input.taskId,
        inboxItemId: input.inboxItemId,
        startTime: input.startTime ? nextStart : undefined,
        endTime: input.endTime ? nextEnd : undefined,
        orderIndex: input.orderIndex,
        blockType: input.blockType,
        completedAt:
          input.completedAt === undefined
            ? undefined
            : input.completedAt === null
              ? null
              : new Date(input.completedAt),
        confirmationState:
          input.completedAt === undefined
            ? undefined
            : input.completedAt === null
              ? 'pending'
              : 'confirmed_done'
      },
      include: {
        task: true,
        inboxItem: true
      }
    });

    if (updated.taskId) {
      await this.prisma.task.update({
        where: { id: updated.taskId },
        data: {
          status: this.isTodayDate(targetPlan.date.toISOString().slice(0, 10))
            ? 'hoje'
            : 'backlog',
          horizon: 'active'
        }
      });
    }

    if (updated.inboxItemId && input.completedAt !== undefined) {
      await this.prisma.inboxItem.update({
        where: { id: updated.inboxItemId },
        data: { status: input.completedAt === null ? 'pendente' : 'feito' }
      });
    }

    return updated;
  }

  async removeItem(dayPlanItemId: string, clerkUserId?: string) {
    const existingItem = await this.prisma.dayPlanItem.findUnique({
      where: { id: dayPlanItemId },
      include: {
        dayPlan: true
      }
    });

    if (!existingItem) {
      throw new Error('Item de planejamento não encontrado.');
    }

    if (clerkUserId && existingItem.dayPlan.clerkUserId !== clerkUserId) {
      throw new Error('Item de planejamento não encontrado.');
    }

    await this.prisma.dayPlanItem.delete({
      where: { id: dayPlanItemId }
    });

    if (existingItem.taskId) {
      const task = await this.prisma.task.findUnique({
        where: {
          id: existingItem.taskId
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
          source: 'day_plan_service',
          eventCode: 'schedule_block_removed',
          signal: task.taskType === 'a' ? 'risco' : 'neutra',
          impactScore: task.taskType === 'a' ? -3 : -1,
          title: `Bloco removido: ${task.title}`,
          rationale: 'Retirada de bloco da agenda do dia.',
          payload: {
            blockType: existingItem.blockType,
            startTime: existingItem.startTime.toISOString(),
            endTime: existingItem.endTime.toISOString()
          }
        });
      }
    }

    if (existingItem.taskId) {
      const remainingPendingForTask = await this.prisma.dayPlanItem.count({
        where: {
          taskId: existingItem.taskId,
          confirmationState: 'pending'
        }
      });

      if (remainingPendingForTask === 0) {
        await this.prisma.task.update({
          where: { id: existingItem.taskId },
          data: {
            status: 'backlog'
          }
        });
      }
    }

    return { ok: true };
  }

  async confirmDone(dayPlanItemId: string, clerkUserId?: string) {
    await this.assertItemOwner(dayPlanItemId, clerkUserId);

    const completedAt = new Date();
    const item = await this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        confirmationState: 'confirmed_done',
        completedAt
      }
    });

    if (item.inboxItemId) {
      await this.prisma.inboxItem.update({
        where: { id: item.inboxItemId },
        data: { status: 'feito' }
      });
    }

    return item;
  }

  async confirmNotDone(dayPlanItemId: string, reason?: FailureReason, clerkUserId?: string) {
    await this.assertItemOwner(dayPlanItemId, clerkUserId);

    const item = await this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        confirmationState: 'confirmed_not_done'
      }
    });

    if (item.taskId) {
      await this.taskService.notConfirmed(item.taskId, reason, { clerkUserId });
    }

    return item;
  }

  async postpone(dayPlanItemId: string, reason?: FailureReason, clerkUserId?: string) {
    const item = await this.prisma.dayPlanItem.findUnique({
      where: { id: dayPlanItemId },
      include: { dayPlan: true }
    });

    if (!item || (clerkUserId && item.dayPlan.clerkUserId !== clerkUserId)) {
      throw new Error('Item de planejamento não encontrado.');
    }

    if (item.taskId) {
      await this.taskService.postpone(item.taskId, reason, { clerkUserId });
    }

    return this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        confirmationState: 'confirmed_not_done'
      }
    });
  }

  async markPendingConfirmation(dayPlanItemId: string) {
    return this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        confirmationState: 'pending'
      }
    });
  }
}
