import { PrismaClient } from '@prisma/client';

export class InboxWatcherService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  start() {
    this.runOnce().catch(() => {});
    this.timer = setInterval(() => {
      this.runOnce().catch(() => {});
    }, 60 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce() {
    await this.convertWaitingItems();
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

}
