import { PrismaClient, RecurrenceDay } from '@prisma/client';

export type CommitmentOccurrence = {
  id: string;
  commitmentId: string;
  date: string;
  title: string;
  startTime: string | null;
  durationMin: number | null;
  workspaceId: string | null;
  recurring: boolean;
  rescheduled: boolean;
};

const dayKeys: Record<number, RecurrenceDay> = {
  0: 'dom',
  1: 'seg',
  2: 'ter',
  3: 'qua',
  4: 'qui',
  5: 'sex',
  6: 'sab'
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export class CommitmentOccurrenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async listWeek(
    clerkUserId: string,
    weekStart: string,
    workspaceId?: string
  ): Promise<CommitmentOccurrence[]> {
    const start = new Date(`${weekStart}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);

    const commitments = await this.prisma.commitment.findMany({
      where: {
        clerkUserId,
        workspaceId,
        status: { not: 'encerrado' }
      },
      include: { exceptions: true }
    });

    const movedIntoWeek = await this.prisma.commitmentException.findMany({
      where: {
        action: 'rescheduled',
        newDate: { gte: start, lte: end },
        commitment: {
          clerkUserId,
          workspaceId,
          status: { not: 'encerrado' }
        }
      },
      include: { commitment: true }
    });

    const occurs = (commitment: (typeof commitments)[number], date: Date) => {
      if (commitment.type === 'variavel') {
        return commitment.date ? dateKey(commitment.date) === dateKey(date) : false;
      }

      return (
        commitment.recurrenceDays.includes(dayKeys[date.getUTCDay()]) &&
        (!commitment.date || date >= commitment.date) &&
        (!commitment.recurrenceEnd || date <= commitment.recurrenceEnd)
      );
    };

    const result: CommitmentOccurrence[] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      const key = dateKey(date);

      for (const commitment of commitments) {
        if (!occurs(commitment, date)) {
          continue;
        }

        const exception = commitment.exceptions.find((item) => dateKey(item.date) === key);
        if (exception?.action === 'cancelled' || exception?.action === 'rescheduled') {
          continue;
        }

        result.push({
          id: `${commitment.id}:${key}`,
          commitmentId: commitment.id,
          date: key,
          title: commitment.title,
          startTime: commitment.startTime,
          durationMin: commitment.durationMin,
          workspaceId: commitment.workspaceId,
          recurring: commitment.type === 'fixo',
          rescheduled: false
        });
      }
    }

    for (const exception of movedIntoWeek) {
      if (!exception.newDate) {
        continue;
      }

      const key = dateKey(exception.newDate);
      result.push({
        id: `${exception.commitmentId}:${key}:rescheduled`,
        commitmentId: exception.commitmentId,
        date: key,
        title: exception.commitment.title,
        startTime: exception.newTime ?? exception.commitment.startTime,
        durationMin: exception.commitment.durationMin,
        workspaceId: exception.commitment.workspaceId,
        recurring: exception.commitment.type === 'fixo',
        rescheduled: true
      });
    }

    return result.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        (left.startTime ?? '99:99').localeCompare(right.startTime ?? '99:99') ||
        left.title.localeCompare(right.title)
    );
  }
}
