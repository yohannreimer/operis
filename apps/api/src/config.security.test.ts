import { afterEach, describe, expect, it, vi } from 'vitest';

const baseEnv = {
  ENV_FILE: '/tmp/operis-test-env-does-not-exist',
  CLERK_SECRET_KEY: 'sk_test',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/operis',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://operis.prymeiradigital.com.br',
  PRYMEIRA_ACCESS_CHECK_ENABLED: 'true',
  WHATSAPP_WEBHOOK_SECRET: 'webhook_secret'
};

async function loadEnvWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const [key, value] of Object.entries({ ...baseEnv, ...overrides })) {
    if (value === undefined) {
      vi.stubEnv(key, '');
    } else {
      vi.stubEnv(key, value);
    }
  }

  return import('./config.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('security env validation', () => {
  it('rejects production without an explicit CORS allowlist', async () => {
    await expect(loadEnvWith({ CORS_ORIGINS: '' })).rejects.toThrow();
  });

  it('rejects production when Prymeira access checks are disabled', async () => {
    await expect(loadEnvWith({ PRYMEIRA_ACCESS_CHECK_ENABLED: 'false' })).rejects.toThrow();
  });

  it('rejects production without a WhatsApp webhook secret', async () => {
    await expect(loadEnvWith({ WHATSAPP_WEBHOOK_SECRET: '' })).rejects.toThrow();
  });
});
