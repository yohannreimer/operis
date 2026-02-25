import { PrismaClient } from '@prisma/client';

import { gamificationDelta } from '@execution-os/shared';

export class GamificationService {
  constructor(private readonly prisma: PrismaClient) {}

  private async getOrCreateState() {
    const existing = await this.prisma.gamificationState.findFirst({
      orderBy: {
        lastUpdate: 'desc'
      }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.gamificationState.create({
      data: {}
    });
  }

  async applyResult(result: keyof typeof gamificationDelta) {
    const state = await this.getOrCreateState();
    const delta = gamificationDelta[result];
    const now = new Date();

    const wasSameDay =
      state.lastUpdate.getFullYear() === now.getFullYear() &&
      state.lastUpdate.getMonth() === now.getMonth() &&
      state.lastUpdate.getDate() === now.getDate();

    const nextStreak =
      result === 'not_confirmed'
        ? 0
        : wasSameDay
          ? state.streakDays
          : state.streakDays + (delta >= 0 ? 1 : 0);

    await this.prisma.gamificationState.update({
      where: { id: state.id },
      data: {
        currentScore: state.currentScore + delta,
        weeklyScore: state.weeklyScore + delta,
        executionDebt: delta < 0 ? state.executionDebt + Math.abs(delta) : state.executionDebt,
        streakDays: nextStreak,
        lastUpdate: now
      }
    });
  }
}
