import { Prisma, PrismaClient } from '@prisma/client';

import { startOfDay } from '../utils/time.js';

export type DailySourceInput = {
  sourceType: 'inbox' | 'task';
  sourceId: string;
};

export const dailyExecutionInclude = {
  inboxItem: { include: { workspace: true, inboxContext: true } },
  task: { include: { workspace: true, project: true } }
} satisfies Prisma.DailyExecutionItemInclude;

export type DailyExecutionRecord = Prisma.DailyExecutionItemGetPayload<{
  include: typeof dailyExecutionInclude;
}>;

export type RolloverAction = 'keep_today' | 'return_inbox' | 'complete';

function serviceError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export class DailyExecutionService {
  constructor(private readonly prisma: PrismaClient) {}

  private normalizedDate(date: string) {
    return startOfDay(date);
  }

  async assign(
    clerkUserId: string,
    date: string,
    input: DailySourceInput
  ): Promise<DailyExecutionRecord> {
    const normalizedDate = this.normalizedDate(date);
    const inboxItem = input.sourceType === 'inbox'
      ? await this.prisma.inboxItem.findFirst({ where: { id: input.sourceId, clerkUserId } })
      : null;
    const task = input.sourceType === 'task'
      ? await this.prisma.task.findFirst({
          where: { id: input.sourceId, workspace: { clerkUserId } }
        })
      : null;

    if (!inboxItem && !task) {
      throw new Error('Origem diária não encontrada.');
    }

    const existing = await this.prisma.dailyExecutionItem.findFirst({
      where: {
        clerkUserId,
        date: normalizedDate,
        ...(inboxItem ? { inboxItemId: inboxItem.id } : { taskId: task!.id })
      },
      include: dailyExecutionInclude
    });
    if (existing) {
      return existing;
    }

    const position = await this.prisma.dailyExecutionItem.count({
      where: { clerkUserId, date: normalizedDate }
    });

    return this.prisma.dailyExecutionItem.create({
      data: {
        clerkUserId,
        date: normalizedDate,
        sourceType: input.sourceType,
        inboxItemId: inboxItem?.id ?? null,
        taskId: task?.id ?? null,
        position
      },
      include: dailyExecutionInclude
    });
  }

  async listDay(clerkUserId: string, date: string): Promise<DailyExecutionRecord[]> {
    const normalizedDate = this.normalizedDate(date);
    await this.backfillLegacy(clerkUserId, date);

    return this.prisma.dailyExecutionItem.findMany({
      where: { clerkUserId, date: normalizedDate },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: dailyExecutionInclude
    });
  }

  async setCompleted(
    clerkUserId: string,
    id: string,
    completed: boolean
  ): Promise<DailyExecutionRecord> {
    const item = await this.findOwned(clerkUserId, id);
    const completedAt = completed ? new Date() : null;
    const updateAssignment = this.prisma.dailyExecutionItem.update({
      where: { id },
      data: { completedAt },
      include: dailyExecutionInclude
    });

    if (item.sourceType === 'inbox' && item.inboxItemId) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.inboxItem.update({
          where: { id: item.inboxItemId },
          data: { status: completed ? 'feito' : 'pendente' }
        }),
        updateAssignment
      ]);
      return updated;
    }

    if (item.sourceType === 'task' && item.taskId) {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: item.taskId },
          data: { status: completed ? 'feito' : 'hoje', completedAt }
        }),
        updateAssignment
      ]);
      return updated;
    }

    throw serviceError('Alocação diária sem origem válida.', 409);
  }

  async remove(clerkUserId: string, id: string): Promise<void> {
    const item = await this.findOwned(clerkUserId, id);
    const removeAssignment = this.prisma.dailyExecutionItem.delete({ where: { id } });

    if (item.sourceType === 'task' && item.taskId) {
      await this.prisma.$transaction([
        this.prisma.task.updateMany({
          where: { id: item.taskId, status: 'hoje' },
          data: { status: 'backlog' }
        }),
        removeAssignment
      ]);
      return;
    }

    await removeAssignment;
  }

  async reorder(clerkUserId: string, date: string, orderedIds: string[]): Promise<void> {
    const normalizedDate = this.normalizedDate(date);
    const currentItems = await this.prisma.dailyExecutionItem.findMany({
      where: { clerkUserId, date: normalizedDate },
      select: { id: true }
    });
    const currentIds = new Set(currentItems.map((item) => item.id));
    const orderedIdSet = new Set(orderedIds);
    const isExactOrder = orderedIds.length === currentItems.length
      && orderedIdSet.size === currentItems.length
      && currentItems.every((item) => orderedIdSet.has(item.id))
      && orderedIds.every((itemId) => currentIds.has(itemId));

    if (!isExactOrder) {
      throw serviceError('A ordem deve conter todos os itens do dia.', 400);
    }

    await this.prisma.$transaction(
      orderedIds.map((itemId, position) => this.prisma.dailyExecutionItem.update({
        where: { id: itemId },
        data: { position }
      }))
    );
  }

  async listRollover(clerkUserId: string, targetDate: string): Promise<DailyExecutionRecord[]> {
    return this.prisma.dailyExecutionItem.findMany({
      where: {
        clerkUserId,
        completedAt: null,
        date: { lt: this.normalizedDate(targetDate) }
      },
      orderBy: [{ date: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      include: dailyExecutionInclude
    });
  }

  async resolveRollover(
    clerkUserId: string,
    id: string,
    input: { action: RolloverAction; targetDate: string }
  ): Promise<DailyExecutionRecord | void> {
    const item = await this.findOwned(clerkUserId, id);

    if (input.action === 'complete') {
      return this.setCompleted(clerkUserId, id, true);
    }

    if (input.action === 'return_inbox') {
      if (item.sourceType !== 'inbox') {
        throw serviceError('Somente capturas rápidas podem voltar ao Inbox.', 400);
      }
      await this.remove(clerkUserId, id);
      return;
    }

    const targetDate = this.normalizedDate(input.targetDate);
    if (item.date.getTime() === targetDate.getTime()) {
      return item;
    }

    const existingTarget = await this.prisma.dailyExecutionItem.findFirst({
      where: {
        clerkUserId,
        date: targetDate,
        ...(item.inboxItemId ? { inboxItemId: item.inboxItemId } : { taskId: item.taskId! })
      },
      include: dailyExecutionInclude
    });
    if (existingTarget) {
      await this.remove(clerkUserId, id);
      return existingTarget;
    }

    const [remainingSourceItems, targetPosition] = await Promise.all([
      this.prisma.dailyExecutionItem.findMany({
        where: { clerkUserId, date: item.date, id: { not: id } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true }
      }),
      this.prisma.dailyExecutionItem.count({ where: { clerkUserId, date: targetDate } })
    ]);
    const [updated] = await this.prisma.$transaction([
      this.prisma.dailyExecutionItem.update({
        where: { id },
        data: { date: targetDate, position: targetPosition },
        include: dailyExecutionInclude
      }),
      ...remainingSourceItems.map((sourceItem, position) => this.prisma.dailyExecutionItem.update({
        where: { id: sourceItem.id },
        data: { position }
      }))
    ]);
    return updated;
  }

  private async findOwned(clerkUserId: string, id: string): Promise<DailyExecutionRecord> {
    const item = await this.prisma.dailyExecutionItem.findFirst({
      where: { id, clerkUserId },
      include: dailyExecutionInclude
    });
    if (!item) {
      throw serviceError('Alocação diária não encontrada.', 404);
    }
    return item;
  }

  private async backfillLegacy(clerkUserId: string, date: string) {
    const legacyInboxItems = await this.prisma.inboxTodayItem.findMany({
      where: { clerkUserId, todayDate: date },
      select: { inboxItemId: true }
    });

    for (const item of legacyInboxItems) {
      await this.assign(clerkUserId, date, {
        sourceType: 'inbox',
        sourceId: item.inboxItemId
      });
    }

    if (date !== new Date().toISOString().slice(0, 10)) {
      return;
    }

    const legacyTasks = await this.prisma.task.findMany({
      where: { status: 'hoje', workspace: { clerkUserId } },
      select: { id: true }
    });
    for (const task of legacyTasks) {
      await this.assign(clerkUserId, date, {
        sourceType: 'task',
        sourceId: task.id
      });
    }
  }
}
