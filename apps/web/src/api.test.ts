import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApiWithBase(apiBase: string) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', apiBase);
  vi.stubGlobal('window', {
    location: {
      origin: 'https://operis.yrdnegocios.com.br'
    }
  });

  return import('./api.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('apiWebSocketUrl', () => {
  it('builds websocket URLs when the API base is a relative production prefix', async () => {
    const { apiWebSocketUrl } = await loadApiWithBase('/api');

    expect(apiWebSocketUrl('/notes/dictation-stream?sessionId=abc')).toBe(
      'wss://operis.yrdnegocios.com.br/api/notes/dictation-stream?sessionId=abc'
    );
  });

  it('keeps absolute API origins supported', async () => {
    const { apiWebSocketUrl } = await loadApiWithBase('https://api.operis.local/base/');

    expect(apiWebSocketUrl('/notes/dictation-stream?sessionId=abc')).toBe(
      'wss://api.operis.local/base/notes/dictation-stream?sessionId=abc'
    );
  });
});
