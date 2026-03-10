import { FastifyBaseLogger } from 'fastify';

import { queueNames } from '@execution-os/shared';

import { env } from '../config.js';
import { publishEvent } from '../infra/rabbit.js';
import { WhatsappCommandService } from './whatsapp-command-service.js';

type LocalClock = {
  dateKey: string;
  hour: number;
  minute: number;
  totalMinutes: number;
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

  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
    totalMinutes: hour * 60 + minute
  };
}

export class WhatsappAutoDispatchService {
  private timer: NodeJS.Timeout | null = null;
  private readonly sentKeys = new Set<string>();
  private readonly timezone = env.WHATSAPP_TIMEZONE;
  private readonly morningTime = parseTimeToken(env.WHATSAPP_MORNING_TIME, 8, 0);
  private readonly activeWindowStart = parseTimeToken(env.WHATSAPP_ACTIVE_WINDOW_START, 8, 0);
  private readonly activeWindowEnd = parseTimeToken(env.WHATSAPP_ACTIVE_WINDOW_END, 21, 0);
  private readonly upcomingEveryMinutes = Math.max(5, Math.min(120, env.WHATSAPP_UPCOMING_EVERY_MINUTES));
  private readonly upcomingWithinMinutes = Math.max(5, Math.min(120, env.WHATSAPP_UPCOMING_WITHIN_MINUTES));

  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly commandService: WhatsappCommandService
  ) {}

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
    return {
      start,
      end
    };
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

      if (clock.totalMinutes >= morningMinutes && !this.wasSent(morningKey)) {
        const messages: string[] = [];
        const morning = await this.commandService.buildMorningBriefing({
          date: clock.dateKey
        });
        messages.push(morning);

        const dueDigest = await this.commandService.buildDueReminderDigest({
          date: clock.dateKey
        });
        if (dueDigest) {
          messages.push(dueDigest);
        }

        const followupDigest = await this.commandService.buildWaitingFollowupDigest({
          date: clock.dateKey
        });
        if (followupDigest) {
          messages.push(followupDigest);
        }

        for (const message of messages) {
          await this.enqueueMessage(message);
        }

        this.rememberSent(morningKey);
        this.logger.info(
          {
            date: clock.dateKey,
            sent: messages.length
          },
          'WhatsApp auto-dispatch manhã enviado.'
        );
      }

      if (!this.isInsideActiveWindow(clock)) {
        return;
      }

      const upcomingBucket = Math.floor(clock.totalMinutes / this.upcomingEveryMinutes);
      const upcomingKey = `upcoming:${clock.dateKey}:${upcomingBucket}`;
      if (this.wasSent(upcomingKey)) {
        return;
      }

      const upcomingDigest = await this.commandService.buildUpcomingBlockDigest({
        date: clock.dateKey,
        withinMinutes: this.upcomingWithinMinutes
      });

      if (upcomingDigest) {
        await this.enqueueMessage(upcomingDigest);
        this.logger.info(
          {
            date: clock.dateKey,
            bucket: upcomingBucket
          },
          'WhatsApp auto-dispatch de janela ativa enviado.'
        );
      }
      this.rememberSent(upcomingKey);
    } catch (error) {
      this.logger.error(
        {
          error
        },
        'Falha no tick de auto-dispatch WhatsApp.'
      );
    }
  }
}
