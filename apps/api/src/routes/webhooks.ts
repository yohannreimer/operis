import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../config.js';
import { publishEvent } from '../infra/rabbit.js';
import { queueNames } from '@execution-os/shared';
import { WhatsappCommandService } from '../services/whatsapp-command-service.js';
import { PrismaClient } from '@prisma/client';

type WebhookPayload = {
  from: string;
  message: string;
};

export function registerWebhookRoutes(
  app: FastifyInstance,
  commandService: WhatsappCommandService,
  prisma: PrismaClient
) {
  app.post('/webhooks/whatsapp', async (request, reply) => {
    const secret = request.headers['x-webhook-secret'];

    if (secret !== env.WHATSAPP_WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const payload = z
      .object({
        from: z.string().min(8),
        message: z.string().min(1)
      })
      .parse(request.body) as WebhookPayload;

    await prisma.whatsappEvent.create({
      data: {
        direction: 'in',
        messageContent: payload.message
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

    return reply.code(202).send({ ok: true, reply: commandResult.reply });
  });
}
