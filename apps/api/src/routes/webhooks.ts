import { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { env } from '../config.js';
import { publishEvent } from '../infra/rabbit.js';
import { queueNames } from '@execution-os/shared';
import { WhatsappCommandService } from '../services/whatsapp-command-service.js';
import { PrismaClient } from '@prisma/client';

type NormalizedWebhookPayload = {
  from: string;
  message: string;
  externalMessageId?: string;
};

const INBOUND_DEDUP_TTL_MS = 5 * 60 * 1000;
const inboundDedupCache = new Map<string, number>();

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

  return {
    from: pickFirstNonEmptyString(key?.remoteJid, key?.participant, data?.sender),
    message: pickFirstNonEmptyString(
      messageObject?.conversation,
      extendedText?.text,
      data?.body,
      data?.text
    ),
    externalMessageId: pickFirstNonEmptyString(key?.id, data?.id)
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
  const message = pickFirstNonEmptyString(
    payload.message,
    payload.text,
    payload.body,
    payload.content,
    nested.message
  );

  if (!from || !message) {
    throw new Error(
      'Payload de WhatsApp inválido: envie from/phone e message/text ou normalize pelo n8n.'
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
    message,
    externalMessageId: externalMessageId ?? undefined
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

export function registerWebhookRoutes(
  app: FastifyInstance,
  commandService: WhatsappCommandService,
  prisma: PrismaClient
) {
  app.post('/webhooks/whatsapp', async (request, reply) => {
    const headerSecret = request.headers['x-webhook-secret'];
    const secret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    const expectedSecret = env.WHATSAPP_WEBHOOK_SECRET?.trim() ?? '';

    if (expectedSecret.length > 0 && secret !== expectedSecret) {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const payload = normalizeWebhookPayload(request.body);
    const dedupKey = buildInboundDedupKey(payload);

    if (isDuplicateInbound(dedupKey)) {
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    const loggedMessage = payload.externalMessageId
      ? `[msg:${payload.externalMessageId}] ${payload.message}`
      : payload.message;

    await prisma.whatsappEvent.create({
      data: {
        direction: 'in',
        messageContent: loggedMessage
      }
    });

    const isCheckinReply = /^(1|2|3|4)\s+[\w-]+$/.test(payload.message.trim());
    if (isCheckinReply) {
      await publishEvent(queueNames.processWhatsappReply, {
        from: payload.from,
        message: payload.message
      });

      await publishEvent(queueNames.sendWhatsappMessage, {
        to: payload.from,
        message: 'Resposta recebida. Atualizando seu Execution OS agora.'
      });

      return reply.code(202).send({ ok: true, queued: true });
    }

    const commandResult = await commandService.handle(payload.message);

    await publishEvent(queueNames.sendWhatsappMessage, {
      to: payload.from,
      message: commandResult.reply,
      relatedTaskId: commandResult.relatedTaskId
    });

    return reply.code(202).send({
      ok: true,
      reply: commandResult.reply,
      externalMessageId: payload.externalMessageId ?? null
    });
  });
}
