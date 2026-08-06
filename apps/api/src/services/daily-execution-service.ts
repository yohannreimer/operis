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
