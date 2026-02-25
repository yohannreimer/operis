import { PrismaClient } from '@prisma/client';

import { gamificationDelta } from '@execution-os/shared';

export class GamificationService {
  constructor(private readonly prisma: PrismaClient) {}

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private startOfWeek(date: Date) {
    const next = this.startOfDay(date);
    const day = next.getDay();
    const diff = (day + 6) % 7;
    next.setDate(next.getDate() - diff);
    return next;
  }

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
      data: {
        currentScore: 0,
        weeklyScore: 0,
        streakDays: 0,
        executionDebt: 0
      }
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

    return this.prisma.gamificationState.update({
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

  async getOverview() {
    const state = await this.getOrCreateState();
    return {
      scoreAtual: state.currentScore,
      scoreSemanal: state.weeklyScore,
      streak: state.streakDays,
      dividaExecucao: state.executionDebt,
      atualizadoEm: state.lastUpdate
    };
  }

  async getDetails() {
    const overview = await this.getOverview();
    const now = new Date();
    const thisWeekStart = this.startOfWeek(now);
    const sixWeeksAgo = new Date(thisWeekStart);
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 35);

    const events = await this.prisma.executionEvent.findMany({
      where: {
        timestamp: {
          gte: sixWeeksAgo
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    const weekBuckets = new Map<
      string,
      {
        weekStart: string;
        label: string;
        completed: number;
        delayed: number;
        failed: number;
        score: number;
      }
    >();

    for (let index = 0; index < 6; index += 1) {
      const weekStart = new Date(thisWeekStart);
      weekStart.setDate(weekStart.getDate() - (5 - index) * 7);
      const iso = weekStart.toISOString().slice(0, 10);

      weekBuckets.set(iso, {
        weekStart: iso,
        label: `S-${5 - index}`,
        completed: 0,
        delayed: 0,
        failed: 0,
        score: 0
      });
    }

    for (const event of events) {
      const eventWeek = this.startOfWeek(event.timestamp).toISOString().slice(0, 10);
      const bucket = weekBuckets.get(eventWeek);

      if (!bucket) {
        continue;
      }

      if (event.eventType === 'completed') {
        bucket.completed += 1;
        bucket.score += 8;
      }

      if (event.eventType === 'delayed') {
        bucket.delayed += 1;
        bucket.score -= 5;
      }

      if (event.eventType === 'failed') {
        bucket.failed += 1;
        bucket.score -= 8;
      }
    }

    const today = this.startOfDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const pendingConfirmations = await this.prisma.dayPlanItem.count({
      where: {
        dayPlan: {
          date: today
        },
        confirmationState: 'pending'
      }
    });

    const todayEvents = await this.prisma.executionEvent.findMany({
      where: {
        timestamp: {
          gte: today,
          lt: tomorrow
        }
      }
    });

    const todaySummary = {
      completed: todayEvents.filter((event) => event.eventType === 'completed').length,
      delayed: todayEvents.filter((event) => event.eventType === 'delayed').length,
      failed: todayEvents.filter((event) => event.eventType === 'failed').length,
      pendingConfirmations
    };

    return {
      ...overview,
      history: Array.from(weekBuckets.values()),
      today: todaySummary
    };
  }
}
