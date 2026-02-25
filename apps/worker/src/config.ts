import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.ENV_FILE ?? '../../.env' });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().url().or(z.string().startsWith('amqp://')),
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: z.string().min(1),
  DEFAULT_PHONE_NUMBER: z.string().min(8),
  FOLLOWUP_REMINDER_DELAY_MINUTES: z.coerce.number().default(15)
});

export const env = envSchema.parse(process.env);
