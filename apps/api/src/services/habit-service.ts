import { PrismaClient, HabitLifeArea } from '@prisma/client';

const LEVELS = [
  { level: 1, xp: 0, name: 'Iniciante' },
  { level: 2, xp: 100, name: 'Consistente' },
  { level: 3, xp: 300, name: 'Disciplinado' },
  { level: 4, xp: 600, name: 'Focado' },
  { level: 5, xp: 1000, name: 'Resiliente' },
  { level: 6, xp: 1500, name: 'Avançado' },
  { level: 7, xp: 2200, name: 'Expert' },
  { level: 8, xp: 3000, name: 'Mestre' },
  { level: 9, xp: 4000, name: 'Elite' },
  { level: 10, xp: 5500, name: 'Lendário' },
] as const;

export function getLevelInfo(totalXp: number) {
  let currentLevel: (typeof LEVELS)[number] = LEVELS[0];
  for (const lvl of LEVELS) {
    if (totalXp >= lvl.xp) {
      currentLevel = lvl;
    } else {
      break;
    }
  }

  const nextLevel = LEVELS.find((l) => l.level === currentLevel.level + 1) ?? null;
  const prevXp = currentLevel.xp;
  const nextXp = nextLevel ? nextLevel.xp : null;

  const progressPct =
    nextXp !== null
      ? Math.min(100, Math.round(((totalXp - prevXp) / (nextXp - prevXp)) * 100))
      : 100;

  return {
    level: currentLevel.level,
    name: currentLevel.name,
    totalXp,
    progressPct,
    nextLevelXp: nextXp,
  };
}

const STREAK_MILESTONES = [
  { streak: 7, xp: 25, reason: 'streak_7' },
  { streak: 30, xp: 100, reason: 'streak_30' },
  { streak: 100, xp: 500, reason: 'streak_100' },
] as const;

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export class HabitService {
  constructor(private prisma: PrismaClient) {}

  async calculateStreak(habitId: string, date: string, type: 'binary' | 'quantitative' | 'vice'): Promise<number> {
    // Fetch logs ordered descending from date
    const logs = await this.prisma.habitLog.findMany({
      where: { habitId, date: { lte: date } },
      orderBy: { date: 'desc' },
    });

    const logsByDate = new Map<string, number>();
    for (const log of logs) {
      logsByDate.set(log.date, log.value);
    }

    let streak = 0;
    const baseDate = new Date(date + 'T00:00:00Z');

    for (let offset = 0; offset <= 365; offset++) {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() - offset);
      const key = d.toISOString().slice(0, 10);
      const value = logsByDate.get(key);

      if (type === 'vice') {
        // Vice: no log with value=-1 → clean day
        if (value === -1) {
          break;
        }
        streak++;
      } else {
        // binary/quantitative: value > 0
        if (value === undefined || value <= 0) {
          break;
        }
        streak++;
      }
    }

    return streak;
  }

  async processXP(habitId: string, date: string): Promise<void> {
    const habit = await this.prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit) return;

    // 1. Award base XP — deduplicate by checking existing completion event for this habit+date
    const existingCompletion = await this.prisma.habitXPEvent.findFirst({
      where: { habitId, date, reason: 'completion' },
    });

    if (!existingCompletion) {
      await this.prisma.habitXPEvent.create({
        data: {
          habitId,
          lifeArea: habit.lifeArea,
          xp: habit.xpPerCompletion,
          reason: 'completion',
          date,
        },
      });
    }

    // 2. Calculate streak
    const streak = await this.calculateStreak(habitId, date, habit.type as 'binary' | 'quantitative' | 'vice');

    // 3. Check streak milestones
    for (const milestone of STREAK_MILESTONES) {
      if (streak >= milestone.streak) {
        // Deduplication: only award once per continuous streak sequence.
        // We check if there's already a milestone event with the same reason
        // that was awarded at a date that is within the current streak window
        const windowStart = new Date(date + 'T00:00:00Z');
        windowStart.setUTCDate(windowStart.getUTCDate() - streak + milestone.streak);
        const windowStartStr = windowStart.toISOString().slice(0, 10);

        const existing = await this.prisma.habitXPEvent.findFirst({
          where: {
            habitId,
            reason: milestone.reason,
            date: { gte: windowStartStr, lte: date },
          },
        });

        if (!existing) {
          await this.prisma.habitXPEvent.create({
            data: {
              habitId,
              lifeArea: habit.lifeArea,
              xp: milestone.xp,
              reason: milestone.reason,
              date,
            },
          });
        }
      }
    }
  }

  async processViceCleanDayXP(date: string): Promise<void> {
    const viceHabits = await this.prisma.habit.findMany({
      where: { type: 'vice', status: 'ativo' },
    });

    for (const habit of viceHabits) {
      const failLog = await this.prisma.habitLog.findFirst({
        where: { habitId: habit.id, date, value: -1 },
      });

      if (!failLog) {
        // No recaída — award clean day XP (deduplicated)
        const existing = await this.prisma.habitXPEvent.findFirst({
          where: { habitId: habit.id, date, reason: 'vice_clean_day' },
        });

        if (!existing) {
          await this.prisma.habitXPEvent.create({
            data: {
              habitId: habit.id,
              lifeArea: habit.lifeArea,
              xp: 5,
              reason: 'vice_clean_day',
              date,
            },
          });
        }
      }
    }
  }

  async getRadarStats(clerkUserId: string) {
    const areas = ['corpo', 'mente', 'trabalho', 'relacoes', 'financas', 'crescimento'] as HabitLifeArea[];

    const result: Record<string, ReturnType<typeof getLevelInfo>> = {};

    for (const area of areas) {
      const agg = await this.prisma.habitXPEvent.aggregate({
        _sum: { xp: true },
        where: { lifeArea: area, habit: { clerkUserId } },
      });

      const totalXp = agg._sum.xp ?? 0;
      result[area] = getLevelInfo(totalXp);
    }

    return result;
  }

  async getTodayStats(date: string, clerkUserId = 'legacy') {
    // Day of week for specific_days filtering (0=Sun,1=Mon,...)
    const dateObj = new Date(date + 'T00:00:00Z');
    const utcDay = dateObj.getUTCDay(); // 0=Sun,...,6=Sat

    const dayMap: Record<number, string> = {
      0: 'dom',
      1: 'seg',
      2: 'ter',
      3: 'qua',
      4: 'qui',
      5: 'sex',
      6: 'sab',
    };
    const todayDayKey = dayMap[utcDay];

    // Week boundaries (Mon-start)
    const weekStart = new Date(dateObj);
    const dayOfWeek = (utcDay + 6) % 7; // Mon=0
    weekStart.setUTCDate(weekStart.getUTCDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Month boundaries
    const monthStart = date.slice(0, 7) + '-01';
    const monthLastDay = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth() + 1, 0));
    const monthEnd = monthLastDay.toISOString().slice(0, 10);

    const habits = await this.prisma.habit.findMany({
      where: { clerkUserId, status: { not: 'arquivado' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const results = [];

    for (const habit of habits) {
      // Filter specific_days habits
      if (habit.frequencyType === 'specific_days') {
        if (!habit.specificDays.includes(todayDayKey as any)) {
          continue;
        }
      }

      // Get current log for today
      const currentLog = await this.prisma.habitLog.findUnique({
        where: { habitId_date: { habitId: habit.id, date } },
      });

      // Calculate streak
      const streak = await this.calculateStreak(habit.id, date, habit.type as 'binary' | 'quantitative' | 'vice');

      // Period progress
      let periodProgress: { done: number; target: number } | null = null;

      if (habit.frequencyType === 'weekly') {
        const weekLogs = await this.prisma.habitLog.count({
          where: {
            habitId: habit.id,
            date: { gte: weekStartStr, lte: weekEndStr },
            value: { gt: 0 },
          },
        });
        periodProgress = { done: weekLogs, target: habit.frequencyTarget };
      } else if (habit.frequencyType === 'monthly') {
        const monthLogs = await this.prisma.habitLog.count({
          where: {
            habitId: habit.id,
            date: { gte: monthStart, lte: monthEnd },
            value: { gt: 0 },
          },
        });
        periodProgress = { done: monthLogs, target: habit.frequencyTarget };
      }

      // isCompletedToday
      let isCompletedToday = false;
      if (habit.type === 'vice') {
        isCompletedToday = !currentLog || currentLog.value !== -1;
      } else if (habit.type === 'binary') {
        isCompletedToday = Boolean(currentLog && currentLog.value > 0);
      } else if (habit.type === 'quantitative') {
        isCompletedToday = Boolean(
          habit.dailyTarget && currentLog && currentLog.value >= habit.dailyTarget
        );
      }

      results.push({
        ...habit,
        currentLog,
        streak,
        periodProgress,
        isCompletedToday,
      });
    }

    return results;
  }

  async findHabitByHint(titleHint: string) {
    const habits = await this.prisma.habit.findMany({
      where: { status: 'ativo' },
    });

    const normalizedHint = normalizeText(titleHint);

    // Step 1: Case-insensitive substring match
    let matches = habits.filter((h) =>
      h.title.toLowerCase().includes(titleHint.toLowerCase())
    );

    // Step 2: Accent-normalized match
    if (matches.length === 0) {
      matches = habits.filter((h) =>
        normalizeText(h.title).includes(normalizedHint)
      );
    }

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // Multiple: return best match by Levenshtein distance
    function levenshtein(a: string, b: string) {
      const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
      );
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          dp[i][j] =
            a[i - 1] === b[j - 1]
              ? dp[i - 1][j - 1]
              : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
      return dp[a.length][b.length];
    }

    return matches.sort(
      (a, b) =>
        levenshtein(normalizeText(a.title), normalizedHint) -
        levenshtein(normalizeText(b.title), normalizedHint)
    )[0];
  }

  async buildHabitsForLLM(date: string, clerkUserId = 'legacy'): Promise<string[]> {
    const stats = await this.getTodayStats(date, clerkUserId);
    return stats.map((h) => {
      const status = h.isCompletedToday ? '✓' : '○';
      const streakStr = h.streak > 0 ? ` 🔥${h.streak}` : '';
      if (h.type === 'vice') {
        const failed = h.currentLog?.value === -1;
        return `${status} [vício] ${h.title}${failed ? ' — recaiu hoje' : ` — ${h.streak} dias limpos`}`;
      }
      if (h.type === 'quantitative' && h.currentLog) {
        return `${status} ${h.title}: ${h.currentLog.value}/${h.dailyTarget ?? '?'} ${h.unit ?? ''}${streakStr}`;
      }
      return `${status} ${h.title}${streakStr}`;
    });
  }

  async getUnnotifiedStreakEvents() {
    return this.prisma.habitXPEvent.findFirst({
      where: {
        reason: { in: ['streak_7', 'streak_30', 'streak_100'] },
        notified: false,
      },
      orderBy: { createdAt: 'asc' },
      include: { habit: true },
    });
  }

  async markEventNotified(eventId: string) {
    return this.prisma.habitXPEvent.update({
      where: { id: eventId },
      data: { notified: true },
    });
  }
}
