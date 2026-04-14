import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';

import { EventEnvelope, EventPayloadByQueue, QueueName } from '@execution-os/shared';
import { env } from '../config.js';

let connection: amqplib.ChannelModel | null = null;
let channel: amqplib.Channel | null = null;

async function getChannel(): Promise<amqplib.Channel> {
  if (channel) {
    return channel;
  }

  if (!connection) {
    connection = await amqplib.connect(env.RABBITMQ_URL);

    // Sem esses handlers, qualquer ECONNRESET/close vira erro não tratado
    // e derruba o processo inteiro
    connection.on('error', (err) => {
      console.error('[RabbitMQ] connection error:', err.message);
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      console.warn('[RabbitMQ] connection closed — will reconnect on next publish');
      connection = null;
      channel = null;
    });
  }

  channel = await connection.createChannel();

  channel.on('error', (err) => {
    console.error('[RabbitMQ] channel error:', err.message);
    channel = null;
  });

  channel.on('close', () => {
    console.warn('[RabbitMQ] channel closed');
    channel = null;
  });

  return channel;
}

export async function publishEvent<TQueue extends QueueName>(
  queue: TQueue,
  payload: EventPayloadByQueue[TQueue]
) {
  const ch = await getChannel();
  await ch.assertQueue(queue, { durable: true });

  const event: EventEnvelope<TQueue> = {
    id: randomUUID(),
    queue,
    createdAt: new Date().toISOString(),
    payload
  };

  ch.sendToQueue(queue, Buffer.from(JSON.stringify(event)), {
    persistent: true,
    contentType: 'application/json'
  });
}

export async function closeRabbit(): Promise<void> {
  if (channel) {
    await channel.close();
    channel = null;
  }

  if (connection) {
    await connection.close();
    connection = null;
  }
}
