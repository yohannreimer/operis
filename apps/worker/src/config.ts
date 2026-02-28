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
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().url().or(z.string().startsWith('amqp://')),
  WHATSAPP_TRANSPORT: z.enum(['n8n', 'evolution']).default('evolution'),
  WHATSAPP_OUTBOUND_WEBHOOK_URL: optionalUrl(),
  WHATSAPP_OUTBOUND_WEBHOOK_SECRET: optionalString(),
  EVOLUTION_API_URL: optionalUrl(),
  EVOLUTION_API_KEY: optionalString(),
  DEFAULT_PHONE_NUMBER: z.string().min(8),
  FOLLOWUP_REMINDER_DELAY_MINUTES: z.coerce.number().default(15)
});

export const env = envSchema.parse(process.env);
