import { FastifyBaseLogger } from 'fastify';

import { queueNames } from '@execution-os/shared';

import { env } from '../config.js';
import { publishEvent } from '../infra/rabbit.js';
import { WhatsappCommandService } from './whatsapp-command-service.js';
import { WhatsappBriefingService } from './whatsapp-briefing-service.js';
import { WhatsappProactivityEngine } from './whatsapp-proactivity-engine.js';
import { Prisma, PrismaClient } from '@prisma/client';
import { HabitService } from './habit-service.js';
import { ConversationState } from './whatsapp-conversation-service.js';

type LocalClock = {
  dateKey: string;
  hour: number;
  minute: number;
  totalMinutes: number;
  dayOfWeek: number;
};

function parseTimeToken(value: string, fallbackHour: number, fallbackMinute: number) {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return {
      hour: fallbackHour,
      minute: fallbackMinute
    };
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

function formatNowToClock(now: Date, timezone: string): LocalClock {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') ?? '1970';
  const month = byType.get('month') ?? '01';
  const day = byType.get('day') ?? '01';
  const hour = Number(byType.get('hour') ?? '0');
  const minute = Number(byType.get('minute') ?? '0');

  // dayOfWeek from the actual date in timezone
  const dateInTz = new Date(`${year}-${month}-${day}T12:00:00.000Z`);

  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    dayOfWeek: dateInTz.getDay()
  };
}

export class WhatsappAutoDispatchService {
  private timer: NodeJS.Timeout | null = null;
  private conversationService: { setSessionPublic: (phone: string, state: ConversationState, payload: any, ttl?: number) => Promise<void> } | null = null;

  setConversationService(svc: { setSessionPublic: (phone: string, state: ConversationState, payload: any, ttl?: number) => Promise<void> }) {
    this.conversationService = svc;
  }
  private readonly sentKeys = new Set<string>();
  private readonly timezone = env.WHATSAPP_TIMEZONE;
  private readonly morningTime = parseTimeToken(env.WHATSAPP_MORNING_TIME, 8, 0);
  private readonly activeWindowStart = parseTimeToken(env.WHATSAPP_ACTIVE_WINDOW_START, 8, 0);
  private readonly activeWindowEnd = parseTimeToken(env.WHATSAPP_ACTIVE_WINDOW_END, 21, 0);
  private readonly eveningTime = parseTimeToken(env.WHATSAPP_EVENING_TIME ?? '21:00', 21, 0);
  private readonly upcomingEveryMinutes = Math.max(5, Math.min(120, env.WHATSAPP_UPCOMING_EVERY_MINUTES));
  private readonly upcomingWithinMinutes = Math.max(5, Math.min(120, env.WHATSAPP_UPCOMING_WITHIN_MINUTES));

  private readonly briefingService: WhatsappBriefingService;
  private readonly proactivityEngine: WhatsappProactivityEngine;

  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly commandService: WhatsappCommandService,
    private readonly prisma: PrismaClient
  ) {
    this.briefingService = new WhatsappBriefingService(prisma);
    this.proactivityEngine = new WhatsappProactivityEngine(prisma);
  }

  start() {
    if (!env.WHATSAPP_AUTO_DISPATCH_ENABLED) {
      this.logger.info('WhatsApp auto-dispatch desativado por configuração.');
      return;
    }

    if (this.timer) {
      return;
    }

    this.logger.info(
      {
        timezone: this.timezone,
        morning: env.WHATSAPP_MORNING_TIME,
        activeWindowStart: env.WHATSAPP_ACTIVE_WINDOW_START,
        activeWindowEnd: env.WHATSAPP_ACTIVE_WINDOW_END,
        upcomingEveryMinutes: this.upcomingEveryMinutes,
        upcomingWithinMinutes: this.upcomingWithinMinutes
      },
      'WhatsApp auto-dispatch iniciado.'
    );

    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private activeWindowMinutes() {
    const start = this.activeWindowStart.hour * 60 + this.activeWindowStart.minute;
    const end = this.activeWindowEnd.hour * 60 + this.activeWindowEnd.minute;
    return { start, end };
  }

  private isInsideActiveWindow(clock: LocalClock) {
    const { start, end } = this.activeWindowMinutes();
    if (start <= end) {
      return clock.totalMinutes >= start && clock.totalMinutes <= end;
    }
    return clock.totalMinutes >= start || clock.totalMinutes <= end;
  }

  private rememberSent(key: string) {
    this.sentKeys.add(key);
  }

  private wasSent(key: string) {
    return this.sentKeys.has(key);
  }

  private compactSentKeys(currentDateKey: string) {
    for (const key of this.sentKeys) {
      if (!key.includes(currentDateKey)) {
        this.sentKeys.delete(key);
      }
    }
  }

  private async enqueueMessage(message: string) {
    await publishEvent(queueNames.sendWhatsappMessage, {
      to: env.DEFAULT_PHONE_NUMBER,
      message
    });
  }

  private async tick() {
    try {
      const clock = formatNowToClock(new Date(), this.timezone);
      this.compactSentKeys(clock.dateKey);

      const morningMinutes = this.morningTime.hour * 60 + this.morningTime.minute;
      const morningKey = `morning:${clock.dateKey}`;

      // ── Morning briefing ───────────────────────────────────────────────────
      if (clock.totalMinutes >= morningMinutes && !this.wasSent(morningKey)) {
        const messages: string[] = [];

        // Try intelligent briefing first, fallback to legacy
        try {
          const intelligentMessages = await this.briefingService.buildIntelligentBriefing(
            clock.dateKey
          );
          messages.push(...intelligentMessages);
        } catch {
          // Fallback to legacy briefing
          const morning = await this.commandService.buildMorningBriefing({
            date: clock.dateKey
          });
          messages.push(morning);
        }

        // Add due/followup digests
        const dueDigest = await this.commandService.buildDueReminderDigest({
          date: clock.dateKey
        });
        if (dueDigest) messages.push(dueDigest);

        const followupDigest = await this.commandService.buildWaitingFollowupDigest({
          date: clock.dateKey
        });
        if (followupDigest) messages.push(followupDigest);

        for (const message of messages) {
          await this.enqueueMessage(message);
        }

        // Criar sessão awaiting_focus_confirmation para capturar resposta ao foco sugerido
        if (this.conversationService) {
          try {
            const top3 = await this.briefingService.getTop3ForDate(clock.dateKey);
            await this.conversationService.setSessionPublic(
              env.DEFAULT_PHONE_NUMBER,
              'awaiting_focus_confirmation',
              { top3 } as Prisma.JsonObject,
              60
            );
            this.logger.info({ date: clock.dateKey }, 'Sessão awaiting_focus_confirmation criada após briefing.');
          } catch (err) {
            this.logger.warn({ err }, 'Falha ao criar sessão pós-briefing.');
          }
        }

        this.rememberSent(morningKey);
        this.logger.info({ date: clock.dateKey, sent: messages.length }, 'WhatsApp briefing matinal enviado.');
      }

      // ── Check-in noturno de hábitos (scheduled, before active window guard) ──
      const eveningMinutes = this.eveningTime.hour * 60 + this.eveningTime.minute;
      const eveningKey = `habit_checkin:${clock.dateKey}`;
      if (clock.totalMinutes >= eveningMinutes && clock.totalMinutes <= eveningMinutes + 5 && !this.wasSent(eveningKey)) {
        try {
          const habitService = new HabitService(this.prisma);
          const todayStats = await habitService.getTodayStats(clock.dateKey, 'legacy');

          if (todayStats.length > 0) {
            // Montar lista com status
            const habitPayload = todayStats
              .filter((h) => h.type !== 'vice')
              .map((h, i) => ({
                index: i + 1,
                id: h.id,
                title: h.title,
                alreadyDone: h.isCompletedToday ?? false
              }));

            if (habitPayload.length > 0) {
              const lines = ['🌙 *Fim de dia. Quais hábitos você fez hoje?*', ''];
              for (const h of habitPayload) {
                lines.push(`${h.index}. ${h.alreadyDone ? '✅' : '☐'} ${h.title}`);
              }
              lines.push('', 'Responda com os números. Ex: *1 3*');
              lines.push('Ou *todos* para marcar todos, *nenhum* para pular.');

              await this.enqueueMessage(lines.join('\n'));
              this.rememberSent(eveningKey);
              this.logger.info({ date: clock.dateKey }, 'Check-in noturno de hábitos enviado.');

              if (this.conversationService) {
                try {
                  await this.conversationService.setSessionPublic(
                    env.DEFAULT_PHONE_NUMBER,
                    'habit_checkin',
                    { habits: habitPayload, date: clock.dateKey } as Prisma.JsonObject,
                    120
                  );
                } catch (err) {
                  this.logger.warn({ err }, 'Falha ao criar sessão habit_checkin pós check-in.');
                }
              }
            }
          }
        } catch (err) {
          this.logger.warn({ err }, 'Falha ao enviar check-in noturno de hábitos.');
        }
      }

      if (!this.isInsideActiveWindow(clock)) {
        return;
      }

      // ── Upcoming block digest (existing behavior) ──────────────────────────
      const upcomingBucket = Math.floor(clock.totalMinutes / this.upcomingEveryMinutes);
      const upcomingKey = `upcoming:${clock.dateKey}:${upcomingBucket}`;
      if (!this.wasSent(upcomingKey)) {
        const upcomingDigest = await this.commandService.buildUpcomingBlockDigest({
          date: clock.dateKey,
          withinMinutes: this.upcomingWithinMinutes
        });

        if (upcomingDigest) {
          await this.enqueueMessage(upcomingDigest);
          this.logger.info({ date: clock.dateKey, bucket: upcomingBucket }, 'WhatsApp upcoming block enviado.');
        }

        this.rememberSent(upcomingKey);
      }

      // ── Job noturno 23h — XP de vícios (dias limpos) ──────────────────────
      const viceXpKey = `vice_xp:${clock.dateKey}`;
      if (clock.hour === 23 && !this.wasSent(viceXpKey)) {
        try {
          const habitService = new HabitService(this.prisma);
          await habitService.processViceCleanDayXP(clock.dateKey);
          this.rememberSent(viceXpKey);
          this.logger.info({ date: clock.dateKey }, 'XP de vícios (dias limpos) processado.');
        } catch (err) {
          this.logger.warn({ err }, 'Falha ao processar XP de vícios.');
        }
      }

      // ── Proactivity engine ─────────────────────────────────────────────────
      const proactiveMessage = await this.proactivityEngine.evaluate(clock, null);

      if (proactiveMessage) {
        await this.enqueueMessage(proactiveMessage.message);
        this.logger.info(
          { triggerId: proactiveMessage.triggerId, date: clock.dateKey },
          'WhatsApp proactive trigger disparado.'
        );
      }
    } catch (error) {
      this.logger.error({ error }, 'Falha no tick de auto-dispatch WhatsApp.');
    }
  }
}
