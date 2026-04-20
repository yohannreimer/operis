import { PrismaClient } from '@prisma/client';

export class InboxWatcherService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  start() {
    this.runCheck().catch(() => {});
    this.timer = setInterval(() => {
      this.runCheck().catch(() => {});
    }, 60 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCheck() {
    await Promise.all([
      this.convertWaitingItems(),
      this.resetPastTodayItems(),
    ]);
  }

  private async convertWaitingItems() {
    const now = new Date();
    await this.prisma.inboxItem.updateMany({
      where: {
        status: 'aguardando',
        waitingDate: { lte: now },
      },
      data: {
        status: 'pendente',
        waitingDate: null,
        waitingPerson: null,
        waitingNote: null,
      },
    });
  }

  private async resetPastTodayItems() {
    const today = new Date().toISOString().slice(0, 10);

    const pastItems = await this.prisma.inboxTodayItem.findMany({
      where: { todayDate: { lt: today } },
    });

    if (pastItems.length === 0) return;

    const completedItemIds = pastItems
      .filter((t) => t.completedAt !== null)
      .map((t) => t.inboxItemId);

    if (completedItemIds.length > 0) {
      await this.prisma.inboxItem.updateMany({
        where: { id: { in: completedItemIds } },
        data: { status: 'feito' },
      });
    }

    await this.prisma.inboxTodayItem.deleteMany({
      where: { id: { in: pastItems.map((t) => t.id) } },
    });
  }
}
