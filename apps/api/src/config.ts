import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.ENV_FILE ?? '../../.env' });

const optionalString = () =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().optional()
  );

const optionalUrl = () =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    z.string().url().optional()
  );

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().url().or(z.string().startsWith('amqp://')),
  EVOLUTION_API_URL: optionalUrl(),
  EVOLUTION_API_KEY: optionalString(),
  NOTES_TRANSCRIBE_WEBHOOK_URL: optionalUrl(),
  NOTES_TRANSCRIBE_WEBHOOK_SECRET: optionalString(),
  NOTES_TRANSCRIBE_TIMEOUT_MS: z.coerce.number().int().min(5000).max(180000).default(45000),
  WHATSAPP_WEBHOOK_SECRET: optionalString(),
  DEFAULT_PHONE_NUMBER: z.string().min(8)
});

export const env = envSchema.parse(process.env);
