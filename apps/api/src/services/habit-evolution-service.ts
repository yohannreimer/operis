import type { Habit, HabitLifeArea, HabitLog, PrismaClient } from '@prisma/client';

import { getLevelInfo } from './habit-service.js';
import { addDateDays, classifyHabitDate, periodBounds } from './habit-schedule.js';

const LIFE_AREAS: HabitLifeArea[] = [
  'corpo',
  'mente',
  'trabalho',
  'relacoes',
  'financas',
  'crescimento',
];

function dateRange(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDateDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function periodKey(frequency: 'weekly' | 'monthly', date: string) {
  return frequency === 'weekly' ? periodBounds('weekly', date).start : date.slice(0, 7);
}

export function calculateOccurrenceTotals(
  habits: Habit[],
  logs: HabitLog[],
  startDate: string,
  endDate: string,
) {
  const logsByHabit = new Map<string, HabitLog[]>();
  for (const log of logs) {
    logsByHabit.set(log.habitId, [...(logsByHabit.get(log.habitId) ?? []), log]);
  }

  let expectedOccurrences = 0;
  let completedOccurrences = 0;

  for (const habit of habits) {
    const createdDate = habit.createdAt.toISOString().slice(0, 10);
    const activeStart = createdDate > startDate ? createdDate : startDate;
    const activeDates = dateRange(activeStart, endDate);
    const habitLogs = logsByHabit.get(habit.id) ?? [];
    const logByDate = new Map(habitLogs.map((log) => [log.date, log.value]));

    if (habit.frequencyType === 'daily' || habit.frequencyType === 'specific_days') {
      const scheduledDates = activeDates.filter(
        (date) => habit.frequencyType === 'daily' || classifyHabitDate(habit, date, 0, false),
      );
      expectedOccurrences += scheduledDates.length;
      completedOccurrences += scheduledDates.filter((date) => {
        const value = logByDate.get(date);
        return habit.type === 'vice' ? value !== -1 : (value ?? 0) > 0;
      }).length;
      continue;
    }

    const datesByPeriod = new Map<string, string[]>();
    for (const date of activeDates) {
      const key = periodKey(habit.frequencyType, date);
      datesByPeriod.set(key, [...(datesByPeriod.get(key) ?? []), date]);
    }

    for (const dates of datesByPeriod.values()) {
      const expectedInPeriod = Math.min(habit.frequencyTarget, dates.length);
      const values = dates.map((date) => logByDate.get(date));
      expectedOccurrences += expectedInPeriod;
      completedOccurrences +=
        habit.type === 'vice'
          ? Math.max(0, expectedInPeriod - values.filter((value) => value === -1).length)
          : Math.min(expectedInPeriod, values.filter((value) => (value ?? 0) > 0).length);
    }
  }

  return { expectedOccurrences, completedOccurrences };
}

async function loadAreaLevels(prisma: PrismaClient, clerkUserId: string) {
  return Promise.all(
    LIFE_AREAS.map(async (lifeArea) => {
      const aggregate = await prisma.habitXPEvent.aggregate({
        _sum: { xp: true },
        where: { lifeArea, habit: { clerkUserId } },
      });

      return {
        lifeArea,
        ...getLevelInfo(aggregate._sum.xp ?? 0),
      };
    }),
  );
}

export class HabitEvolutionService {
  constructor(private prisma: PrismaClient) {}

  async getEvolution(
    clerkUserId: string,
    days: number,
    endDate = new Date().toISOString().slice(0, 10),
  ) {
    const startDate = addDateDays(endDate, -(days - 1));
    const [habits, logs, areas] = await Promise.all([
      this.prisma.habit.findMany({
        where: { clerkUserId, status: { not: 'arquivado' } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.habitLog.findMany({
        where: {
          habit: { clerkUserId },
          date: { gte: startDate, lte: endDate },
        },
      }),
      loadAreaLevels(this.prisma, clerkUserId),
    ]);

    const totals = calculateOccurrenceTotals(habits, logs, startDate, endDate);

    return {
      startDate,
      endDate,
      ...totals,
      rhythmPct:
        totals.expectedOccurrences === 0
          ? 0
          : Math.round((totals.completedOccurrences / totals.expectedOccurrences) * 100),
      areas,
    };
  }
}
