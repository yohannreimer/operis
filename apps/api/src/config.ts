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

const optionalTime = (fallback: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? fallback : value),
    z.string().regex(/^([01]?\d|2[0-3]):([0-5]\d)$/)
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
  DEFAULT_PHONE_NUMBER: z.string().min(8),
  WHATSAPP_AUTO_DISPATCH_ENABLED: z.coerce.boolean().default(true),
  WHATSAPP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  WHATSAPP_MORNING_TIME: optionalTime('08:00').default('08:00'),
  WHATSAPP_ACTIVE_WINDOW_START: optionalTime('08:00').default('08:00'),
  WHATSAPP_ACTIVE_WINDOW_END: optionalTime('21:00').default('21:00'),
  WHATSAPP_UPCOMING_EVERY_MINUTES: z.coerce.number().int().min(5).max(120).default(20),
  WHATSAPP_UPCOMING_WITHIN_MINUTES: z.coerce.number().int().min(5).max(120).default(20)
});

export const env = envSchema.parse(process.env);
