import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.ENV_FILE ?? '../../.env' });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().url().or(z.string().startsWith('amqp://')),
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(1),
  DEFAULT_PHONE_NUMBER: z.string().min(8)
});

export const env = envSchema.parse(process.env);
