import amqplib from 'amqplib';

import { EventEnvelope, QueueName, queueNames } from '@execution-os/shared';
import { env } from './config.js';
import { dispatchQueueEvent } from './handlers.js';
import { prisma } from './db.js';

const queueList = Object.values(queueNames);

const RECONNECT_DELAY_MS = 5000;

async function bootstrap(): Promise<void> {
  let connection: amqplib.ChannelModel;
  let channel: amqplib.Channel;

  try {
    connection = await amqplib.connect(env.RABBITMQ_URL);
    channel = await connection.createChannel();
  } catch (err) {
    console.error('[Worker] Falha ao conectar ao RabbitMQ:', err);
    console.log(`[Worker] Tentando reconectar em ${RECONNECT_DELAY_MS / 1000}s...`);
    await new Promise((res) => setTimeout(res, RECONNECT_DELAY_MS));
    return bootstrap();
  }

  // Sem esses handlers, ECONNRESET vira exceção não tratada e derruba o processo
  connection.on('error', (err) => {
    console.error('[Worker] RabbitMQ connection error:', err.message);
  });

  connection.on('close', () => {
    console.warn('[Worker] RabbitMQ connection closed — reconectando...');
    setTimeout(() => void bootstrap(), RECONNECT_DELAY_MS);
  });

  channel.on('error', (err) => {
    console.error('[Worker] RabbitMQ channel error:', err.message);
  });

  for (const queue of queueList) {
    await channel.assertQueue(queue, { durable: true });

    await channel.consume(queue, async (msg) => {
      if (!msg) {
        return;
      }

      try {
        const envelope = JSON.parse(msg.content.toString()) as EventEnvelope<QueueName>;
        await dispatchQueueEvent(queue, envelope.payload);
        channel.ack(msg);
      } catch (error) {
        console.error(`Erro ao processar fila ${queue}`, error);
        channel.nack(msg, false, false);
      }
    });
  }

  console.log(`[Worker] Iniciado. Filas ativas: ${queueList.join(', ')}`);

  const close = async () => {
    await channel.close();
    await connection.close();
    await prisma.$disconnect();
  };

  process.on('SIGINT', async () => {
    await close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await close();
    process.exit(0);
  });
}

// Safety net global para qualquer erro TCP não tratado que escape
process.on('uncaughtException', (err) => {
  console.error('[Worker] uncaughtException:', err.message);
  // Não deixa o processo morrer — o handler de connection.close() já cuida da reconexão
});

await bootstrap();
