import { afterEach, describe, expect, it, vi } from 'vitest';

const baseEnv = {
  CLERK_SECRET_KEY: 'sk_test',
  DATABASE_URL: 'postgresql://execution:execution@localhost:5432/execution_os',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  ENV_FILE: '/tmp/operis-test-env-does-not-exist'
};

async function loadAudioService() {
  vi.resetModules();
  Object.entries(baseEnv).forEach(([key, value]) => vi.stubEnv(key, value));
  return import('./whatsapp-audio-service.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('WhatsApp audio URL safety', () => {
  it('blocks localhost and private network targets before fetch', async () => {
    const { isSafeWhatsappAudioUrl } = await loadAudioService();

    expect(isSafeWhatsappAudioUrl('http://127.0.0.1:8080/audio.ogg')).toBe(false);
    expect(isSafeWhatsappAudioUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeWhatsappAudioUrl('http://192.168.0.10/audio.ogg')).toBe(false);
    expect(isSafeWhatsappAudioUrl('file:///etc/passwd')).toBe(false);
  });

  it('allows public http and https signed media URLs', async () => {
    const { isSafeWhatsappAudioUrl } = await loadAudioService();

    expect(isSafeWhatsappAudioUrl('https://cdn.example.com/media/audio.ogg?token=abc')).toBe(true);
    expect(isSafeWhatsappAudioUrl('http://media.example.com/audio.mp3')).toBe(true);
  });
});
