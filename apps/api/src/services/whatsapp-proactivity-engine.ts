/**
 * WhatsApp Proactivity Engine — 7 triggers contextuais
 *
 * Regras globais anti-spam:
 *  - Máx 2 mensagens proativas/dia (exceto briefing matinal)
 *  - Humor "sobrecarregado" → 0 proativas
 *  - Só dentro da janela ativa configurada (WHATSAPP_ACTIVE_WINDOW_*)
 *  - Cada trigger tem cooldown de 24h (persistido em memória, reinicia com o serviço)
 *  - Não dispara durante conversa ativa (verificado via sessão)
 *
 * Triggers:
 *  1. top3_unconfirmed  — 10h30, Top 3 não confirmado
 *  2. deep_work_window  — ≥90min livres antes 15h, sem deep work ativo
 *  3. blocked_task_a    — 11h, tarefa A com 3+ reagendamentos
 *  4. afternoon_checkin — 17h, ≥1 A concluída + ≥1 A pendente
 *  5. top3_complete     — Top 3 100% antes 16h, max 1x/semana
 *  6. long_silence      — 3+ dias úteis sem interação
 *  7. weekly_review     — sexta-feira 16h, fluxo interativo
 */

import { PrismaClient, RecurrenceDay } from '@prisma/client';
import { HabitService } from './habit-service.js';
import { DayHumor } from './whatsapp-briefing-service.js';

const TOP3_COMMIT_EVENT_CODE = 'top3_committed';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ProactiveMessage = {
  triggerId: string;
  message: string;
  priority: number; // 1 = mais urgente
};

type LocalClock = {
  dateKey: string;
  hour: number;
  minute: number;
  totalMinutes: number;
  dayOfWeek: number; // 0=dom, 5=sex
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export class WhatsappProactivityEngine {
  // In-memory cooldown: triggerId → last fired timestamp
  private readonly cooldowns = new Map<string, number>();
  // Per-day counter: dateKey → count of proactive messages sent
  private readonly dailyCounts = new Map<string, number>();
  // Per-week: tracks if top3_complete was sent this week
  private top3CompleteWeekKey = '';

  private readonly MAX_PROACTIVE_PER_DAY = 2;
  private readonly COOLDOWN_MS = 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaClient) {}

  // ─── Ponto de entrada ────────────────────────────────────────────────────

  /**
   * Evaluate all triggers for the current minute.
   * Returns the highest-priority proactive message to send (if any),
   * or null if no trigger fires or spam limits are reached.
   */
  async evaluate(
    clock: LocalClock,
    humor: DayHumor | null
  ): Promise<ProactiveMessage | null> {
    // Humor sobrecarregado = zero proativas
    if (humor === 'sobrecarregado') return null;

    // Daily cap
    const todayCount = this.dailyCounts.get(clock.dateKey) ?? 0;
    if (todayCount >= this.MAX_PROACTIVE_PER_DAY) return null;

    const candidates: ProactiveMessage[] = [];

    // Run all triggers
    const [t1, t2, t3, t4, t5, t6, t7, t8] = await Promise.all([
      this.triggerTop3Unconfirmed(clock),
      this.triggerDeepWorkWindow(clock),
      this.triggerBlockedTaskA(clock),
      this.triggerAfternoonCheckin(clock),
      this.triggerTop3Complete(clock),
      this.triggerLongSilence(clock),
      this.triggerWeeklyReview(clock),
      this.triggerStreakCelebration(),
    ]);

    for (const t of [t1, t2, t3, t4, t5, t6, t7, t8]) {
      if (t) candidates.push(t);
    }

    if (candidates.length === 0) return null;

    // Pick highest priority (lowest number)
    const best = candidates.sort((a, b) => a.priority - b.priority)[0];

    // Mark cooldown and increment daily counter
    this.cooldowns.set(best.triggerId, Date.now());
    this.dailyCounts.set(clock.dateKey, todayCount + 1);

    return best;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private isCooledDown(triggerId: string): boolean {
    const last = this.cooldowns.get(triggerId);
    if (!last) return true;
    return Date.now() - last >= this.COOLDOWN_MS;
  }

  private atMinute(clock: LocalClock, h: number, m: number, toleranceMin = 5): boolean {
    const target = h * 60 + m;
    return clock.totalMinutes >= target && clock.totalMinutes <= target + toleranceMin;
  }

  private afterMinute(clock: LocalClock, h: number, m: number): boolean {
    return clock.totalMinutes >= h * 60 + m;
  }

  private beforeMinute(clock: LocalClock, h: number, m: number): boolean {
    return clock.totalMinutes < h * 60 + m;
  }

  private isFriday(clock: LocalClock): boolean {
    return clock.dayOfWeek === 5;
  }

  // ─── Trigger 1: Top 3 não confirmado às 10h30 ────────────────────────────

  private async triggerTop3Unconfirmed(clock: LocalClock): Promise<ProactiveMessage | null> {
    if (!this.atMinute(clock, 10, 30)) return null;
    const key = `top3_unconfirmed:${clock.dateKey}`;
    if (!this.isCooledDown(key)) return null;

    try {
      // Check if top3 was locked today (via strategicDecisionEvent)
      const dayStart = new Date(`${clock.dateKey}T00:00:00.000Z`);
      const dayEnd = new Date(`${clock.dateKey}T23:59:59.999Z`);
      const locked = await this.prisma.strategicDecisionEvent.findFirst({
        where: {
          eventCode: TOP3_COMMIT_EVENT_CODE,
          createdAt: { gte: dayStart, lte: dayEnd }
        }
      });
      if (locked) return null;

      // Get top candidates
      const tasks = await this.prisma.task.findMany({
        where: { archivedAt: null, taskType: 'a', status: { in: ['hoje', 'andamento', 'backlog'] } },
        orderBy: [{ priority: 'desc' }],
        take: 3
      });

      if (tasks.length === 0) return null;

      const list = tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
      return {
        triggerId: key,
        priority: 1,
        message: [
          '⏰ Já são 10h30 e o foco do dia ainda não foi confirmado.',
          '',
          list,
          '',
          'Confirmar agora? Responda *sim* ou mande áudio.'
        ].join('\n')
      };
    } catch {
      return null;
    }
  }

  // ─── Trigger 2: Janela de deep work detectada ─────────────────────────────

  private async triggerDeepWorkWindow(clock: LocalClock): Promise<ProactiveMessage | null> {
    if (!this.afterMinute(clock, 8, 0) || !this.beforeMinute(clock, 15, 0)) return null;
    const key = `deep_work_window:${clock.dateKey}`;
    if (!this.isCooledDown(key)) return null;

    try {
      // Check if deep work is already active
      const activeSession = await this.prisma.deepWorkSession.findFirst({
        where: { state: 'active' },
        select: { id: true }
      });
      if (activeSession) return null;

      // Get commitments for today to calculate free windows
      const date = new Date(clock.dateKey + 'T00:00:00.000Z');
      const dow = (['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as RecurrenceDay[])[date.getDay()];
      const [fixos, variavels] = await Promise.all([
        this.prisma.commitment.findMany({
          where: { type: 'fixo', status: 'ativo', recurrenceDays: { has: dow } },
          select: { id: true, startTime: true, durationMin: true }
        }),
        this.prisma.commitment.findMany({
          where: { type: 'variavel', status: 'ativo', date },
          select: { id: true, startTime: true, durationMin: true }
        })
      ]);

      // Find the next block of ≥90 min starting from now
      const allBlocks = [...fixos, ...variavels]
        .filter((c) => c.startTime && c.durationMin)
        .map((c) => {
          const [h, m] = c.startTime!.split(':').map(Number);
          const start = h * 60 + m;
          return { start, end: start + (c.durationMin ?? 0) };
        })
        .sort((a, b) => a.start - b.start);

      let freeStart = clock.totalMinutes;
      let freeMinutes = 14 * 60; // max to 14h

      for (const block of allBlocks) {
        if (block.start > freeStart) {
          freeMinutes = block.start - freeStart;
          break;
        }
        if (block.end > freeStart) {
          freeStart = block.end;
        }
      }

      if (freeMinutes < 90) return null;

      // Get top priority A task
      const task = await this.prisma.task.findFirst({
        where: { archivedAt: null, taskType: 'a', status: { in: ['hoje', 'andamento'] } },
        orderBy: [{ priority: 'desc' }]
      });

      if (!task) return null;

      const windowH = Math.round(freeMinutes / 60 * 10) / 10;
      return {
        triggerId: key,
        priority: 2,
        message: [
          `🧠 Você tem ~${windowH}h livres agora.`,
          `Prioridade A: *${task.title}*`,
          '',
          'Iniciar sessão de deep work? Responda *sim* ou diga outra tarefa.'
        ].join('\n')
      };
    } catch {
      return null;
    }
  }

  // ─── Trigger 3: Tarefa A travada (11h) ────────────────────────────────────

  private async triggerBlockedTaskA(clock: LocalClock): Promise<ProactiveMessage | null> {
    if (!this.atMinute(clock, 11, 0)) return null;
    const key = `blocked_task_a:${clock.dateKey}`;
    if (!this.isCooledDown(key)) return null;

    try {
      // Check top3 is confirmed via strategicDecisionEvent
      const dayStart = new Date(`${clock.dateKey}T00:00:00.000Z`);
      const dayEnd = new Date(`${clock.dateKey}T23:59:59.999Z`);
      const locked = await this.prisma.strategicDecisionEvent.findFirst({
        where: { eventCode: TOP3_COMMIT_EVENT_CODE, createdAt: { gte: dayStart, lte: dayEnd } }
      });
      if (!locked) return null;

      // Find tasks A that have been rescheduled multiple times
      // Using dayPlanItems as proxy (count per taskId)
      const rescheduledTasks = await this.prisma.task.findMany({
        where: {
          archivedAt: null,
          taskType: 'a',
          status: { in: ['hoje', 'andamento'] },
          dayPlanItems: {
            some: {}
          }
        },
        include: {
          _count: { select: { dayPlanItems: true } }
        },
        orderBy: [{ priority: 'desc' }],
        take: 10
      });

      const stuck = rescheduledTasks.find((t) => (t._count?.dayPlanItems ?? 0) >= 3);
      if (!stuck) return null;

      return {
        triggerId: key,
        priority: 3,
        message: [
          `🔍 *"${stuck.title}"* está no seu radar há vários dias sem avançar.`,
          '',
          'O que tá travando?',
          '1️⃣ Esperando alguém',
          '2️⃣ Não sei por onde começar',
          '3️⃣ Não é mais prioridade',
          '4️⃣ Vou fazer hoje ainda'
        ].join('\n')
      };
    } catch {
      return null;
    }
  }

  // ─── Trigger 4: Check-in fim de tarde (17h) ───────────────────────────────

  private async triggerAfternoonCheckin(clock: LocalClock): Promise<ProactiveMessage | null> {
    if (!this.atMinute(clock, 17, 0)) return null;
    const key = `afternoon_checkin:${clock.dateKey}`;
    if (!this.isCooledDown(key)) return null;

    try {
      const tasks = await this.prisma.task.findMany({
        where: { archivedAt: null, taskType: 'a' },
        select: { id: true, title: true, status: true },
        take: 20
      });

      const allA = tasks;
      // Also fetch done tasks separately (status 'feito' is outside status filter above)
      const doneA = await this.prisma.task.findMany({
        where: { archivedAt: null, taskType: 'a', status: 'feito' },
        select: { id: true, title: true, status: true },
        take: 5
      });
      const done = doneA;
      const pending = allA.filter((t) => !['feito'].includes(t.status as string));

      if (done.length === 0 || pending.length === 0) return null;

      const lines = [
        '🌆 *Atualização rápida:*',
        ...done.slice(0, 2).map((t) => `✅ ${t.title}`),
        ...pending.slice(0, 2).map((t) => `⏳ ${t.title}`),
        '',
        'Continuar ou mover pra amanhã?'
      ];

      return {
        triggerId: key,
        priority: 4,
        message: lines.join('\n')
      };
    } catch {
      return null;
    }
  }

  // ─── Trigger 5: Parabéns cirúrgico (Top 3 100% antes 16h) ────────────────

  private async triggerTop3Complete(clock: LocalClock): Promise<ProactiveMessage | null> {
    if (!this.beforeMinute(clock, 16, 0)) return null;
    const weekKey = `top3_complete_week:${this.getWeekKey(clock.dateKey)}`;
    if (this.top3CompleteWeekKey === weekKey) return null; // max 1x/semana
    const key = `top3_complete:${clock.dateKey}`;
    if (!this.isCooledDown(key)) return null;

    try {
      // Find today's top3 commitment via strategicDecisionEvent
      const dayStart = new Date(`${clock.dateKey}T00:00:00.000Z`);
      const dayEnd = new Date(`${clock.dateKey}T23:59:59.999Z`);
      const event = await this.prisma.strategicDecisionEvent.findFirst({
        where: { eventCode: TOP3_COMMIT_EVENT_CODE, createdAt: { gte: dayStart, lte: dayEnd } },
        orderBy: { createdAt: 'desc' }
      });
      if (!event?.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return null;

      const payload = event.payload as Record<string, unknown>;
      const taskIds = Array.isArray(payload.taskIds)
        ? (payload.taskIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : [];
      if (taskIds.length === 0) return null;

      const allDone = await this.prisma.task.count({
        where: { id: { in: taskIds }, status: 'feito' }
      });

      if (allDone < taskIds.length) return null;

      this.top3CompleteWeekKey = weekKey;

      return {
        triggerId: key,
        priority: 5,
        message: [
          '🏆 *Top 3 completo antes das 16h.*',
          '',
          '1️⃣ Puxar tarefa B do backlog',
          '2️⃣ Weekly review antecipado',
          '3️⃣ Encerrar o dia — você merece'
        ].join('\n')
      };
    } catch {
      return null;
    }
  }

  // ─── Trigger 6: Silêncio longo (3+ dias úteis) ────────────────────────────

  private async triggerLongSilence(clock: LocalClock): Promise<ProactiveMessage | null> {
    if (!this.atMinute(clock, 10, 0)) return null;
    const key = `long_silence:${clock.dateKey}`;
    if (!this.isCooledDown(key)) return null;

    try {
      const lastEvent = await this.prisma.whatsappEvent.findFirst({
        where: { direction: 'in' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });

      if (!lastEvent) return null;

      const daysSince = Math.floor(
        (Date.now() - lastEvent.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      );

      if (daysSince < 3) return null;

      return {
        triggerId: key,
        priority: 6,
        message: [
          `👋 Faz ${daysSince} dias que você não aparece.`,
          '',
          'Quando quiser retomar, manda *foco* ou um áudio.'
        ].join('\n')
      };
    } catch {
      return null;
    }
  }

  // ─── Trigger 7: Weekly Review (sexta 16h) ─────────────────────────────────

  private async triggerWeeklyReview(clock: LocalClock): Promise<ProactiveMessage | null> {
    if (!this.isFriday(clock)) return null;
    if (!this.atMinute(clock, 16, 0)) return null;
    const key = `weekly_review:${clock.dateKey}`;
    if (!this.isCooledDown(key)) return null;

    try {
      // Build quick weekly stats
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [doneTasks, deepSessions] = await Promise.all([
        this.prisma.task.count({ where: { status: 'feito', updatedAt: { gte: since } } }),
        this.prisma.deepWorkSession.count({ where: { startedAt: { gte: since } } })
      ]);

      return {
        triggerId: key,
        priority: 7,
        message: [
          '📅 *Review da semana — 5 perguntas rápidas*',
          '',
          `📊 Semana: ${doneTasks} concluídas · ${deepSessions} sessões deep work`,
          '',
          '1/5 — Qual foi a maior vitória da semana?',
          '',
          '_(Mande um texto ou áudio curto)_'
        ].join('\n')
      };
    } catch {
      return null;
    }
  }

  // ─── Trigger 8 (was 9) — Celebração de streak (verifica a cada tick) ──────

  private readonly STREAK_CELEBRATION_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
  private lastStreakCelebration = 0;

  private async triggerStreakCelebration(): Promise<ProactiveMessage | null> {
    if (Date.now() - this.lastStreakCelebration < this.STREAK_CELEBRATION_COOLDOWN_MS) return null;

    try {
      const habitService = new HabitService(this.prisma);
      const event = await habitService.getUnnotifiedStreakEvents();
      if (!event) return null;

      const streakDays = event.reason === 'streak_7' ? 7 : event.reason === 'streak_30' ? 30 : 100;
      const levelInfo = (await habitService.getRadarStats('legacy'))[event.lifeArea];
      const levelMsg = levelInfo ? ` Você está no Nível ${levelInfo.level} — ${levelInfo.name}!` : '';

      await habitService.markEventNotified(event.id);
      this.lastStreakCelebration = Date.now();

      return {
        triggerId: `streak_celebration:${event.id}`,
        priority: 2,
        message: `🔥 ${streakDays} dias seguidos de "${event.habit.title}"! +${event.xp} XP em ${event.lifeArea.charAt(0).toUpperCase() + event.lifeArea.slice(1)}.${levelMsg} Continue assim! 🏆`,
      };
    } catch {
      return null;
    }
  }

  // ─── Util ─────────────────────────────────────────────────────────────────

  private getWeekKey(dateKey: string): string {
    const date = new Date(dateKey + 'T12:00:00.000Z');
    const mon = new Date(date);
    mon.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return mon.toISOString().slice(0, 10);
  }
}
