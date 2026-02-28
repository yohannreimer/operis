import { PrismaClient } from '@prisma/client';

import { gamificationDelta } from '@execution-os/shared';

export class GamificationService {
  constructor(private readonly prisma: PrismaClient) {}

  private parseTop3TaskIds(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return [] as string[];
    }

    const record = payload as Record<string, unknown>;
    if (!Array.isArray(record.taskIds)) {
      return [] as string[];
    }

    return record.taskIds.filter((item): item is string => typeof item === 'string');
  }

  private severityByBreakType(input: {
    type: 'failed' | 'delayed' | 'not_confirmed';
    afterTop3Commit: boolean;
  }) {
    if (input.afterTop3Commit && (input.type === 'failed' || input.type === 'not_confirmed')) {
      return 'alta' as const;
    }

    if (input.type === 'delayed') {
      return 'media' as const;
    }

    return 'alta' as const;
  }

  private impactByBreakType(type: 'failed' | 'delayed' | 'not_confirmed') {
    if (type === 'not_confirmed') {
      return -8;
    }
    if (type === 'failed') {
      return -6;
    }
    return -4;
  }

  private recoverySuggestion(type: 'failed' | 'delayed' | 'not_confirmed', afterTop3Commit: boolean) {
    if (type === 'delayed') {
      return 'Replanejar em bloco curto (15-30 min) ainda hoje para quebrar evitação.';
    }

    if (afterTop3Commit) {
      return 'Registrar causa raiz e substituir por ação A de recuperação no próximo bloco.';
    }

    return 'Reassumir compromisso com tarefa A equivalente e confirmar novo horário.';
  }

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

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private consecutiveStreakFromToday(
    today: Date,
    predicate: (dateKey: string) => boolean,
    maxDays = 120
  ) {
    let streak = 0;

    for (let offset = 0; offset < maxDays; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const key = this.toDateKey(date);
      if (!predicate(key)) {
        break;
      }

      streak += 1;
    }

    return streak;
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
    const lookbackStart = new Date(today);
    lookbackStart.setDate(lookbackStart.getDate() - 120);

    const [pendingConfirmations, todayEvents, aCompletions, deepWorkSessions, commitmentEvents, top3Events] = await Promise.all([
      this.prisma.dayPlanItem.count({
        where: {
          dayPlan: {
            date: today
          },
          confirmationState: 'pending'
        }
      }),
      this.prisma.executionEvent.findMany({
        where: {
          timestamp: {
            gte: today,
            lt: tomorrow
          }
        }
      }),
      this.prisma.task.findMany({
        where: {
          taskType: 'a',
          status: 'feito',
          completedAt: {
            gte: lookbackStart,
            lt: tomorrow
          }
        },
        select: {
          completedAt: true
        }
      }),
      this.prisma.deepWorkSession.findMany({
        where: {
          startedAt: {
            gte: lookbackStart,
            lt: tomorrow
          }
        },
        select: {
          startedAt: true,
          state: true,
          actualMinutes: true
        }
      }),
      this.prisma.executionEvent.findMany({
        where: {
          eventType: {
            in: ['failed', 'delayed']
          },
          timestamp: {
            gte: lookbackStart,
            lt: tomorrow
          }
        },
        include: {
          task: {
            include: {
              workspace: {
                select: {
                  name: true
                }
              },
              project: {
                select: {
                  title: true
                }
              }
            }
          }
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: 24
      }),
      this.prisma.strategicDecisionEvent.findMany({
        where: {
          eventCode: 'top3_committed',
          createdAt: {
            gte: lookbackStart,
            lt: tomorrow
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 120
      })
    ]);

    const todaySummary = {
      completed: todayEvents.filter((event) => event.eventType === 'completed').length,
      delayed: todayEvents.filter((event) => event.eventType === 'delayed').length,
      failed: todayEvents.filter((event) => event.eventType === 'failed').length,
      pendingConfirmations
    };

    const aByDate = new Map<string, number>();
    for (const completion of aCompletions) {
      if (!completion.completedAt) {
        continue;
      }
      const key = this.toDateKey(completion.completedAt);
      aByDate.set(key, (aByDate.get(key) ?? 0) + 1);
    }

    const deepWorkByDate = new Map<string, number>();
    for (const session of deepWorkSessions) {
      const key = this.toDateKey(session.startedAt);
      const minutes =
        session.state === 'active'
          ? Math.max(0, Math.round((new Date().getTime() - session.startedAt.getTime()) / 60000))
          : session.actualMinutes;
      deepWorkByDate.set(key, (deepWorkByDate.get(key) ?? 0) + minutes);
    }

    const streakExecucaoA = this.consecutiveStreakFromToday(
      today,
      (dateKey) => (aByDate.get(dateKey) ?? 0) >= 3
    );
    const streakDeepWork = this.consecutiveStreakFromToday(
      today,
      (dateKey) => (deepWorkByDate.get(dateKey) ?? 0) >= 45
    );

    const failureReasonLabel: Record<string, string> = {
      energia: 'Energia',
      medo: 'Medo',
      distracao: 'Distração',
      dependencia: 'Dependência',
      falta_clareza: 'Falta de clareza',
      falta_habilidade: 'Falta de habilidade'
    };

    const top3MapByDate = new Map<
      string,
      Array<{
        committedAt: string;
        taskIds: string[];
      }>
    >();

    for (const event of top3Events) {
      const key = this.toDateKey(event.createdAt);
      const entries = top3MapByDate.get(key) ?? [];
      entries.push({
        committedAt: event.createdAt.toISOString(),
        taskIds: this.parseTop3TaskIds(event.payload)
      });
      top3MapByDate.set(key, entries);
    }

    const commitmentBreaks = commitmentEvents.map((event) => {
      const mappedType =
        event.eventType === 'delayed'
          ? ('delayed' as const)
          : event.failureReason
            ? ('failed' as const)
            : ('not_confirmed' as const);
      const reason =
        mappedType === 'delayed'
          ? 'Reagendada'
          : event.failureReason
            ? failureReasonLabel[event.failureReason] ?? event.failureReason
            : 'Compromisso quebrado';

      const eventDateKey = this.toDateKey(event.timestamp);
      const possibleCommits = top3MapByDate.get(eventDateKey) ?? [];
      const matchedCommit = possibleCommits.find((commit) =>
        Boolean(event.taskId && commit.taskIds.includes(event.taskId))
      );
      const afterTop3Commit = Boolean(matchedCommit);
      const severity = this.severityByBreakType({
        type: mappedType,
        afterTop3Commit
      });
      const impactScore = this.impactByBreakType(mappedType);

      return {
        id: event.id,
        at: event.timestamp.toISOString(),
        type: mappedType,
        reason,
        taskId: event.taskId,
        taskTitle: event.task?.title ?? 'Tarefa removida',
        workspaceName: event.task?.workspace?.name ?? 'Sem frente',
        projectTitle: event.task?.project?.title ?? null,
        afterTop3Commit,
        committedAt: matchedCommit?.committedAt ?? null,
        severity,
        impactScore,
        recoverySuggestion: this.recoverySuggestion(mappedType, afterTop3Commit)
      };
    });

    return {
      ...overview,
      history: Array.from(weekBuckets.values()),
      today: todaySummary,
      streakExecucaoA,
      streakDeepWork,
      commitmentBreaks
    };
  }
}
