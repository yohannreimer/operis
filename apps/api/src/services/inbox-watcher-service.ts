import { PrismaClient } from '@prisma/client';

export class InboxWatcherService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  start() {
    this.runCheck().catch(() => {});
    this.timer = setInterval(() => {
      this.runCheck().catch(() => {});
    }, 60 * 60 * 1000); // every hour
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCheck() {
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
