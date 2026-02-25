import amqplib from 'amqplib';

import { EventEnvelope, QueueName, queueNames } from '@execution-os/shared';
import { env } from './config.js';
import { dispatchQueueEvent } from './handlers.js';
import { prisma } from './db.js';

const queueList = Object.values(queueNames);

async function bootstrap() {
  const connection = await amqplib.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

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

  console.log(`Worker iniciado. Filas ativas: ${queueList.join(', ')}`);

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

await bootstrap();
