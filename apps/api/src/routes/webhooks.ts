import { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { env } from '../config.js';
import { publishEvent } from '../infra/rabbit.js';
import { queueNames } from '@execution-os/shared';
import { WhatsappCommandService } from '../services/whatsapp-command-service.js';
import { WhatsappConversationService } from '../services/whatsapp-conversation-service.js';
import { WhatsappAudioService } from '../services/whatsapp-audio-service.js';
import { PrismaClient } from '@prisma/client';
import { UserPhoneService } from '../services/user-phone-service.js';

type NormalizedWebhookPayload = {
  from: string;
  message: string;
  externalMessageId?: string;
  audioUrl?: string;
};

type DispatchRequestBody = {
  to?: string;
};

const INBOUND_DEDUP_TTL_MS = 5 * 60 * 1000;
const MULTI_REPLY_DELAY_MS = 300;
const INBOUND_SEMANTIC_DEDUP_TTL_MS = 10 * 1000;
const inboundDedupCache = new Map<string, number>();
const inboundSemanticDedupCache = new Map<string, number>();
const TRANSPORT_PREFIX_REGEX = /^(?:(?:=+|--+|[•·]\s*|[–—-]{2,}\s*))+/;

function pickFirstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function normalizePhone(rawPhone: string) {
  const source = rawPhone.includes('@') ? rawPhone.split('@')[0] : rawPhone;
  const digits = source.replace(/\D/g, '');
  if (digits.length >= 8) {
    return digits;
  }

  return source.trim();
}

function stripTransportArtifacts(input: string) {
  let normalized = input.replace(/[\u200B-\u200D\uFE0E\uFE0F\u2060]/g, '').trim();

  while (TRANSPORT_PREFIX_REGEX.test(normalized)) {
    normalized = normalized.replace(TRANSPORT_PREFIX_REGEX, '').trimStart();
  }

  return normalized;
}

function extractNestedEvolutionPayload(payload: Record<string, unknown>) {
  const data =
    payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : null;

  const key =
    data?.key && typeof data.key === 'object'
      ? (data.key as Record<string, unknown>)
      : null;

  const messageObject =
    data?.message && typeof data.message === 'object'
      ? (data.message as Record<string, unknown>)
      : null;

  const extendedText =
    messageObject?.extendedTextMessage && typeof messageObject.extendedTextMessage === 'object'
      ? (messageObject.extendedTextMessage as Record<string, unknown>)
      : null;

  // Audio message: Evolution API may provide mediaUrl or a nested audioMessage
  const audioMessage =
    messageObject?.audioMessage && typeof messageObject.audioMessage === 'object'
      ? (messageObject.audioMessage as Record<string, unknown>)
      : null;

  const audioUrl =
    pickFirstNonEmptyString(
      typeof data?.mediaUrl === 'string' ? data.mediaUrl : null,
      typeof data?.audioUrl === 'string' ? data.audioUrl : null,
      typeof audioMessage?.url === 'string' ? audioMessage.url : null,
      typeof payload.audioUrl === 'string' ? payload.audioUrl : null,
      typeof payload.mediaUrl === 'string' ? payload.mediaUrl : null
    ) ?? undefined;

  return {
    from: pickFirstNonEmptyString(key?.remoteJid, key?.participant, data?.sender),
    message: pickFirstNonEmptyString(
      messageObject?.conversation,
      extendedText?.text,
      data?.body,
      data?.text
    ),
    externalMessageId: pickFirstNonEmptyString(key?.id, data?.id),
    audioUrl
  };
}

function normalizeWebhookPayload(rawBody: unknown): NormalizedWebhookPayload {
  const payload = z.record(z.unknown()).parse(rawBody) as Record<string, unknown>;
  const nested = extractNestedEvolutionPayload(payload);

  const from = pickFirstNonEmptyString(
    payload.from,
    payload.phone,
    payload.number,
    payload.sender,
    payload.senderNumber,
    nested.from
  );

  const audioUrl =
    pickFirstNonEmptyString(
      typeof payload.audioUrl === 'string' ? payload.audioUrl : null,
      typeof payload.mediaUrl === 'string' ? payload.mediaUrl : null,
      nested.audioUrl ?? null
    ) ?? undefined;

  const message = pickFirstNonEmptyString(
    payload.message,
    payload.text,
    payload.body,
    payload.content,
    nested.message
  );
  const sanitizedMessage = message ? stripTransportArtifacts(message) : null;

  // Accept payload if we have either text or audio
  if (!from || (!sanitizedMessage && !audioUrl)) {
    throw new Error(
      'Payload de WhatsApp inválido: envie from/phone e message/text (ou audioUrl) ou normalize pelo n8n.'
    );
  }

  const externalMessageId = pickFirstNonEmptyString(
    payload.externalMessageId,
    payload.messageId,
    payload.id,
    nested.externalMessageId
  );

  return {
    from: normalizePhone(from),
    message: sanitizedMessage ?? '[audio]',
    externalMessageId: externalMessageId ?? undefined,
    audioUrl
  };
}

function buildInboundDedupKey(payload: NormalizedWebhookPayload) {
  if (payload.externalMessageId) {
    return `ext:${payload.externalMessageId}`;
  }

  const minuteBucket = Math.floor(Date.now() / 60000);
  const hash = createHash('sha256')
    .update(`${payload.from}|${payload.message}`)
    .digest('hex')
    .slice(0, 16);

  return `fallback:${hash}:${minuteBucket}`;
}

function isDuplicateInbound(dedupKey: string) {
  const now = Date.now();

  for (const [key, expiresAt] of inboundDedupCache.entries()) {
    if (expiresAt <= now) {
      inboundDedupCache.delete(key);
    }
  }

  const existing = inboundDedupCache.get(dedupKey);
  if (existing && existing > now) {
    return true;
  }

  inboundDedupCache.set(dedupKey, now + INBOUND_DEDUP_TTL_MS);
  return false;
}

function normalizeMessageForSemanticDedup(message: string) {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSemanticDedupKey(payload: NormalizedWebhookPayload) {
  const normalizedMessage = normalizeMessageForSemanticDedup(payload.message);
  const hash = createHash('sha256')
    .update(`${payload.from}|${normalizedMessage}`)
    .digest('hex')
    .slice(0, 16);

  return `semantic:${hash}`;
}

function isDuplicateInboundSemantic(dedupKey: string) {
  const now = Date.now();

  for (const [key, expiresAt] of inboundSemanticDedupCache.entries()) {
    if (expiresAt <= now) {
      inboundSemanticDedupCache.delete(key);
    }
  }

  const existing = inboundSemanticDedupCache.get(dedupKey);
  if (existing && existing > now) {
    return true;
  }

  inboundSemanticDedupCache.set(dedupKey, now + INBOUND_SEMANTIC_DEDUP_TTL_MS);
  return false;
}

function assertWebhookSecret(headerValue: string | string[] | undefined) {
  const secret = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const expectedSecret = env.WHATSAPP_WEBHOOK_SECRET?.trim() ?? '';

  if (expectedSecret.length > 0 && secret !== expectedSecret) {
    throw new Error('Unauthorized webhook secret');
  }
}

function resolveDispatchRecipient(body: DispatchRequestBody) {
  const direct = typeof body.to === 'string' ? body.to.trim() : '';
  if (direct.length >= 8) {
    return normalizePhone(direct);
  }

  return normalizePhone(env.DEFAULT_PHONE_NUMBER);
}

const audioService = new WhatsappAudioService();

export function registerWebhookRoutes(
  app: FastifyInstance,
  commandService: WhatsappCommandService,
  conversationService: WhatsappConversationService,
  prisma: PrismaClient,
  userPhoneService: UserPhoneService
) {
  const optionalNonEmptyString = z.preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }, z.string().optional());

  const dispatchBaseSchema = z.object({
    to: optionalNonEmptyString
  });

  const morningDispatchSchema = dispatchBaseSchema.extend({
    date: optionalNonEmptyString,
    workspaceId: optionalNonEmptyString,
    includeDueDigest: z.coerce.boolean().optional().default(true),
    includeFollowupDigest: z.coerce.boolean().optional().default(true),
    includeUpcomingDigest: z.coerce.boolean().optional().default(false),
    upcomingWithinMinutes: z.coerce.number().int().min(5).max(120).optional().default(20)
  });

  const dueDispatchSchema = dispatchBaseSchema.extend({
    date: optionalNonEmptyString,
    daysBefore: z.array(z.coerce.number().int().min(0).max(30)).optional()
  });

  const followupDispatchSchema = dispatchBaseSchema;

  const upcomingDispatchSchema = dispatchBaseSchema.extend({
    date: optionalNonEmptyString,
    withinMinutes: z.coerce.number().int().min(5).max(120).optional().default(20)
  });

  app.post('/webhooks/whatsapp', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const payload = normalizeWebhookPayload(request.body);
    const dedupKey = buildInboundDedupKey(payload);
    const semanticDedupKey = buildSemanticDedupKey(payload);

    if (payload.externalMessageId) {
      const persistentDuplicate = await prisma.whatsappEvent.findFirst({
        where: {
          direction: 'in',
          messageContent: {
            startsWith: `[msg:${payload.externalMessageId}] `
          }
        },
        select: {
          id: true
        }
      });

      if (persistentDuplicate) {
        return reply.code(200).send({ ok: true, duplicate: true, reason: 'external_message_id' });
      }
    }

    if (isDuplicateInbound(dedupKey)) {
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    // When upstream provides a unique external message id, semantic dedup is unnecessary
    // and can wrongly block legitimate short replies like "1", "2" or "menu".
    const isShortMessage = payload.message.trim().length <= 3;
    if (!payload.externalMessageId && !isShortMessage && isDuplicateInboundSemantic(semanticDedupKey)) {
      return reply.code(200).send({ ok: true, duplicate: true, reason: 'semantic' });
    }

    // ── Audio transcription ───────────────────────────────────────────────────
    let finalMessage = payload.message;
    if (payload.audioUrl && payload.message === '[audio]') {
      const transcribed = await audioService.transcribeFromUrl(payload.audioUrl);
      if (transcribed) {
        finalMessage = transcribed;
      } else {
        // Cannot transcribe and no text — inform user
        await publishEvent(queueNames.sendWhatsappMessage, {
          to: payload.from,
          message: '🎙️ Recebi seu áudio mas não consegui transcrever. Envie a mensagem por texto.'
        });
        return reply.code(202).send({ ok: true, skipped: 'audio_transcription_failed' });
      }
    }

    const loggedMessage = payload.externalMessageId
      ? `[msg:${payload.externalMessageId}] ${finalMessage}`
      : finalMessage;

    await prisma.whatsappEvent.create({
      data: {
        direction: 'in',
        messageContent: loggedMessage
      }
    });

    const isCheckinReply = /^(1|2|3|4)\s+(?=.*[A-Za-z])[\w-]{3,}$/.test(finalMessage.trim());
    if (isCheckinReply) {
      await publishEvent(queueNames.processWhatsappReply, {
        from: payload.from,
        message: finalMessage
      });

      await publishEvent(queueNames.sendWhatsappMessage, {
        to: payload.from,
        message: 'Resposta recebida. Atualizando seu Execution OS agora.'
      });

      return reply.code(202).send({ ok: true, queued: true });
    }

    // ── Resolve user from phone number ────────────────────────────────────────
    const clerkUserId = await userPhoneService.findUserByPhone(payload.from);
    if (!clerkUserId) {
      // Unknown number — silently acknowledge to WhatsApp provider, no reply
      return reply.code(200).send({ ok: true, skipped: 'unknown_phone' });
    }

    let commandResult: Awaited<ReturnType<typeof conversationService.handleInbound>>;
    try {
      commandResult = await conversationService.handleInbound(payload.from, finalMessage, clerkUserId);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Não consegui processar esse comando.';

      await publishEvent(queueNames.sendWhatsappMessage, {
        to: payload.from,
        message: `Erro no comando: ${message}\nUse "ajuda" para ver os formatos suportados.`
      });

      return reply.code(202).send({
        ok: false,
        error: message,
        externalMessageId: payload.externalMessageId ?? null
      });
    }

    const replies = Array.isArray(commandResult.reply)
      ? commandResult.reply
      : [commandResult.reply];

    for (let i = 0; i < replies.length; i++) {
      await publishEvent(queueNames.sendWhatsappMessage, {
        to: payload.from,
        message: replies[i],
        relatedTaskId: i === 0 ? commandResult.relatedTaskId : undefined // only first message carries the task link
      });
      if (i < replies.length - 1) {
        await new Promise((r) => setTimeout(r, MULTI_REPLY_DELAY_MS));
      }
    }

    return reply.code(202).send({
      ok: true,
      reply: commandResult.reply,
      externalMessageId: payload.externalMessageId ?? null
    });
  });

  app.post('/webhooks/whatsapp/dispatch/morning', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const parsed = morningDispatchSchema.parse(request.body ?? {});
    const to = resolveDispatchRecipient(parsed);
    const messages: string[] = [];

    const morning = await commandService.buildMorningBriefing({
      date: parsed.date,
      workspaceId: parsed.workspaceId
    });
    messages.push(morning);

    if (parsed.includeDueDigest) {
      const dueDigest = await commandService.buildDueReminderDigest({
        date: parsed.date
      });
      if (dueDigest) {
        messages.push(dueDigest);
      }
    }

    if (parsed.includeFollowupDigest) {
      const followupDigest = await commandService.buildWaitingFollowupDigest({
        date: parsed.date
      });
      if (followupDigest) {
        messages.push(followupDigest);
      }
    }

    if (parsed.includeUpcomingDigest) {
      const upcomingDigest = await commandService.buildUpcomingBlockDigest({
        date: parsed.date,
        withinMinutes: parsed.upcomingWithinMinutes
      });
      if (upcomingDigest) {
        messages.push(upcomingDigest);
      }
    }

    for (const message of messages) {
      await publishEvent(queueNames.sendWhatsappMessage, {
        to,
        message
      });
    }

    return reply.code(202).send({
      ok: true,
      to,
      sent: messages.length
    });
  });

  app.post('/webhooks/whatsapp/dispatch/due-dates', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const parsed = dueDispatchSchema.parse(request.body ?? {});
    const to = resolveDispatchRecipient(parsed);
    const digest = await commandService.buildDueReminderDigest({
      date: parsed.date,
      daysBefore: parsed.daysBefore
    });

    if (!digest) {
      return reply.code(200).send({
        ok: true,
        to,
        sent: 0,
        skipped: 'no_due_reminders'
      });
    }

    await publishEvent(queueNames.sendWhatsappMessage, {
      to,
      message: digest
    });

    return reply.code(202).send({
      ok: true,
      to,
      sent: 1
    });
  });

  app.post('/webhooks/whatsapp/dispatch/followups', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const parsed = followupDispatchSchema.parse(request.body ?? {});
    const to = resolveDispatchRecipient(parsed);
    const digest = await commandService.buildWaitingFollowupDigest();

    if (!digest) {
      return reply.code(200).send({
        ok: true,
        to,
        sent: 0,
        skipped: 'no_followups'
      });
    }

    await publishEvent(queueNames.sendWhatsappMessage, {
      to,
      message: digest
    });

    return reply.code(202).send({
      ok: true,
      to,
      sent: 1
    });
  });

  app.post('/webhooks/whatsapp/dispatch/upcoming-blocks', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const parsed = upcomingDispatchSchema.parse(request.body ?? {});
    const to = resolveDispatchRecipient(parsed);
    const digest = await commandService.buildUpcomingBlockDigest({
      date: parsed.date,
      withinMinutes: parsed.withinMinutes
    });

    if (!digest) {
      return reply.code(200).send({
        ok: true,
        to,
        sent: 0,
        skipped: 'no_upcoming_blocks'
      });
    }

    await publishEvent(queueNames.sendWhatsappMessage, {
      to,
      message: digest
    });

    return reply.code(202).send({
      ok: true,
      to,
      sent: 1
    });
  });
}
