import { buildApp } from './app.js';
import { env } from './config.js';
import { prisma } from './db.js';
import { closeRabbit } from './infra/rabbit.js';

const app = await buildApp();

const close = async () => {
  await app.close();
  await closeRabbit();
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

await app.listen({
  port: env.PORT,
  host: '0.0.0.0'
});
