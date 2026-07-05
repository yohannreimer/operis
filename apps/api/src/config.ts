import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.ENV_FILE ?? '../../.env', override: true });

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

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
  return value;
}, z.boolean());

const envSchema = z
  .object({
    CLERK_SECRET_KEY: z.string().min(1),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    RABBITMQ_URL: z.string().url().or(z.string().startsWith('amqp://')),
    CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5178'),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_TIME_WINDOW: z.string().trim().min(1).default('1 minute'),
    PRYMEIRA_ACCOUNT_API_URL: optionalUrl().default('https://hub.prymeiradigital.com.br/api'),
    PRYMEIRA_PRODUCT_KEY: z.string().trim().min(1).default('operis'),
    PRYMEIRA_ACCESS_CHECK_ENABLED: booleanFromEnv.default(true),
    EVOLUTION_API_URL: optionalUrl(),
    EVOLUTION_API_KEY: optionalString(),
    NOTES_TRANSCRIBE_WEBHOOK_URL: optionalUrl(),
    NOTES_TRANSCRIBE_WEBHOOK_SECRET: optionalString(),
    NOTES_TRANSCRIBE_TIMEOUT_MS: z.coerce.number().int().min(5000).max(180000).default(45000),
    OPENROUTER_API_KEY: optionalString(),
    OPENROUTER_TRANSCRIBE_MODEL: z.string().trim().min(1).default('openai/whisper-large-v3'),
    OPENROUTER_CLEANUP_MODEL: z.string().trim().min(1).default('google/gemini-2.5-flash'),
    DEEPGRAM_API_KEY: optionalString(),
    DEEPGRAM_MODEL: z.string().trim().min(1).default('nova-3'),
    WHATSAPP_WEBHOOK_SECRET: optionalString(),
    OPENAI_API_KEY: optionalString(),
    ANTHROPIC_API_KEY: optionalString(),
    WHATSAPP_AUTO_DISPATCH_ENABLED: booleanFromEnv.default(true),
    WHATSAPP_TIMEZONE: z.string().default('America/Sao_Paulo'),
    WHATSAPP_MORNING_TIME: optionalTime('08:00').default('08:00'),
    WHATSAPP_ACTIVE_WINDOW_START: optionalTime('08:00').default('08:00'),
    WHATSAPP_ACTIVE_WINDOW_END: optionalTime('21:00').default('21:00'),
    WHATSAPP_EVENING_TIME: optionalTime('21:00').default('21:00'),
    WHATSAPP_UPCOMING_EVERY_MINUTES: z.coerce.number().int().min(5).max(120).default(20),
    WHATSAPP_UPCOMING_WITHIN_MINUTES: z.coerce.number().int().min(5).max(120).default(20)
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') {
      return;
    }

    if (!value.CORS_ORIGINS.split(',').some((origin) => origin.trim().length > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must include at least one production origin.'
      });
    }

    if (!value.PRYMEIRA_ACCESS_CHECK_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PRYMEIRA_ACCESS_CHECK_ENABLED'],
        message: 'PRYMEIRA_ACCESS_CHECK_ENABLED cannot be false in production.'
      });
    }

    if (!value.WHATSAPP_WEBHOOK_SECRET?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WHATSAPP_WEBHOOK_SECRET'],
        message: 'WHATSAPP_WEBHOOK_SECRET is required in production.'
      });
    }
  });

export const env = envSchema.parse(process.env);
