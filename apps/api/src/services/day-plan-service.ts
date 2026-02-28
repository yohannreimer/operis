import { BlockType, FailureReason, PrismaClient } from '@prisma/client';

import { publishEvent } from '../infra/rabbit.js';
import { queueNames } from '@execution-os/shared';
import { overlap, startOfDay } from '../utils/time.js';
import { TaskService } from './task-service.js';
import { safeRecordStrategicDecisionEvent } from './strategic-decision-service.js';

type AddDayPlanItemInput = {
  date: string;
  taskId?: string | null;
  startTime: string;
  endTime: string;
  orderIndex?: number;
  blockType: BlockType;
};

type UpdateDayPlanItemInput = Partial<{
  taskId: string | null;
  startTime: string;
  endTime: string;
  orderIndex: number;
  blockType: BlockType;
}>;

export class DayPlanService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly taskService: TaskService
  ) {}

  private async getOrCreatePlan(date: string) {
    const normalizedDate = startOfDay(date);

    const existing = await this.prisma.dayPlan.findUnique({
      where: { date: normalizedDate }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.dayPlan.create({
      data: {
        date: normalizedDate
      }
    });
  }

  private todayDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  private isTodayDate(date: string) {
    return date === this.todayDateString();
  }

  private async cleanupPendingTaskDuplicates() {
    const pendingItems = await this.prisma.dayPlanItem.findMany({
      where: {
        taskId: {
          not: null
        },
        confirmationState: 'pending'
      },
      orderBy: [
        {
          startTime: 'desc'
        }
      ]
    });

    const seen = new Set<string>();
    const duplicatesToDelete: string[] = [];

    for (const item of pendingItems) {
      if (!item.taskId) {
        continue;
      }

      if (!seen.has(item.taskId)) {
        seen.add(item.taskId);
        continue;
      }

      duplicatesToDelete.push(item.id);
    }

    if (duplicatesToDelete.length) {
      await this.prisma.dayPlanItem.deleteMany({
        where: {
          id: {
            in: duplicatesToDelete
          }
        }
      });
    }
  }

  async getByDate(date: string) {
    await this.cleanupPendingTaskDuplicates();

    const normalizedDate = startOfDay(date);
    const plan = await this.prisma.dayPlan.findUnique({
      where: { date: normalizedDate },
      include: {
        items: {
          include: {
            task: true
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
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    if (startTime >= endTime) {
      throw new Error('start_time precisa ser menor que end_time.');
    }

    const plan = await this.getOrCreatePlan(input.date);

    if (input.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: input.taskId },
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

      if (task.workspace.mode === 'manutencao' && task.executionKind === 'construcao') {
        throw new Error(
          `Frente ${task.workspace.name} está em manutenção. Tarefa de construção não pode entrar na agenda.`
        );
      }

      await this.prisma.dayPlanItem.deleteMany({
        where: {
          taskId: input.taskId,
          confirmationState: 'pending'
        }
      });
    }

    const existingItems = await this.prisma.dayPlanItem.findMany({
      where: {
        dayPlanId: plan.id
      }
    });

    for (const existing of existingItems) {
      const collides = overlap(startTime, endTime, existing.startTime, existing.endTime);

      if (!collides) {
        continue;
      }

      const hasFixedBlockConflict =
        existing.blockType === 'fixed' || input.blockType === 'fixed';

      if (hasFixedBlockConflict) {
        throw new Error('Blocos fixos não podem ser sobrepostos.');
      }
    }

    const created = await this.prisma.dayPlanItem.create({
      data: {
        dayPlanId: plan.id,
        taskId: input.taskId,
        startTime,
        endTime,
        orderIndex: input.orderIndex ?? 0,
        blockType: input.blockType,
        confirmationState: 'pending'
      },
      include: {
        task: true
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
      const isStrategic = created.task.taskType === 'a' && created.task.executionKind === 'construcao';
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

  private async assertNoForbiddenOverlap(params: {
    dayPlanId: string;
    startTime: Date;
    endTime: Date;
    blockType: BlockType;
    skipItemId?: string;
  }) {
    const existingItems = await this.prisma.dayPlanItem.findMany({
      where: {
        dayPlanId: params.dayPlanId,
        id: params.skipItemId ? { not: params.skipItemId } : undefined
      }
    });

    for (const existing of existingItems) {
      const collides = overlap(params.startTime, params.endTime, existing.startTime, existing.endTime);

      if (!collides) {
        continue;
      }

      const hasFixedBlockConflict = existing.blockType === 'fixed' || params.blockType === 'fixed';

      if (hasFixedBlockConflict) {
        throw new Error('Blocos fixos não podem ser sobrepostos.');
      }
    }
  }

  async updateItem(dayPlanItemId: string, input: UpdateDayPlanItemInput) {
    const existingItem = await this.prisma.dayPlanItem.findUnique({
      where: { id: dayPlanItemId },
      include: {
        dayPlan: true
      }
    });

    if (!existingItem) {
      throw new Error('Item de planejamento não encontrado.');
    }

    const nextStart = input.startTime ? new Date(input.startTime) : existingItem.startTime;
    const nextEnd = input.endTime ? new Date(input.endTime) : existingItem.endTime;
    const nextBlockType = input.blockType ?? existingItem.blockType;
    const nextTaskId = input.taskId === undefined ? existingItem.taskId : input.taskId;

    if (nextStart >= nextEnd) {
      throw new Error('start_time precisa ser menor que end_time.');
    }

    if (nextTaskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: nextTaskId },
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

      if (task.workspace.mode === 'manutencao' && task.executionKind === 'construcao') {
        throw new Error(
          `Frente ${task.workspace.name} está em manutenção. Tarefa de construção não pode entrar na agenda.`
        );
      }
    }

    await this.assertNoForbiddenOverlap({
      dayPlanId: existingItem.dayPlanId,
      startTime: nextStart,
      endTime: nextEnd,
      blockType: nextBlockType,
      skipItemId: existingItem.id
    });

    if (nextTaskId) {
      await this.prisma.dayPlanItem.deleteMany({
        where: {
          taskId: nextTaskId,
          confirmationState: 'pending',
          id: {
            not: existingItem.id
          }
        }
      });
    }

    const updated = await this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        taskId: input.taskId,
        startTime: input.startTime ? nextStart : undefined,
        endTime: input.endTime ? nextEnd : undefined,
        orderIndex: input.orderIndex,
        blockType: input.blockType
      },
      include: {
        task: true
      }
    });

    if (updated.taskId) {
      const updatedPlan = await this.prisma.dayPlan.findUnique({
        where: { id: updated.dayPlanId }
      });

      await this.prisma.task.update({
        where: { id: updated.taskId },
        data: {
          status:
            updatedPlan && this.isTodayDate(updatedPlan.date.toISOString().slice(0, 10))
              ? 'hoje'
              : 'backlog',
          horizon: 'active'
        }
      });
    }

    return updated;
  }

  async removeItem(dayPlanItemId: string) {
    const existingItem = await this.prisma.dayPlanItem.findUnique({
      where: { id: dayPlanItemId },
      include: {
        dayPlan: true
      }
    });

    if (!existingItem) {
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

  async confirmDone(dayPlanItemId: string) {
    const item = await this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        confirmationState: 'confirmed_done'
      }
    });

    if (item.taskId) {
      await this.taskService.complete(item.taskId);
    }

    return item;
  }

  async confirmNotDone(dayPlanItemId: string, reason?: FailureReason) {
    const item = await this.prisma.dayPlanItem.update({
      where: { id: dayPlanItemId },
      data: {
        confirmationState: 'confirmed_not_done'
      }
    });

    if (item.taskId) {
      await this.taskService.notConfirmed(item.taskId, reason);
    }

    return item;
  }

  async postpone(dayPlanItemId: string, reason?: FailureReason) {
    const item = await this.prisma.dayPlanItem.findUnique({
      where: { id: dayPlanItemId }
    });

    if (!item) {
      throw new Error('Item de planejamento não encontrado.');
    }

    if (item.taskId) {
      await this.taskService.postpone(item.taskId, reason);
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
