import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApiWithBase(apiBase: string) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', apiBase);
  vi.stubGlobal('window', {
    location: {
      origin: 'https://operis.yrdnegocios.com.br',
      href: 'https://operis.yrdnegocios.com.br/inbox',
      assign: vi.fn()
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

    expect(apiWebSocketUrl('/notes/dictation-stream')).toBe(
      'wss://operis.yrdnegocios.com.br/api/notes/dictation-stream'
    );
  });

  it('keeps absolute API origins supported', async () => {
    const { apiWebSocketUrl } = await loadApiWithBase('https://api.operis.local/base/');

    expect(apiWebSocketUrl('/notes/dictation-stream')).toBe(
      'wss://api.operis.local/base/notes/dictation-stream'
    );
  });
});

describe('productAccessDeniedUrl', () => {
  it('points denied Operis users to the central Prymeira Hub page', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_PRYMEIRA_HUB_URL', 'https://hub.prymeiradigital.com.br');
    vi.stubEnv('VITE_PRYMEIRA_PRODUCT_KEY', 'operis');
    vi.stubGlobal('window', {
      location: {
        href: 'https://operis.prymeiradigital.com.br/inbox',
        assign: vi.fn()
      }
    });

    const { productAccessDeniedUrl } = await import('./api.js');

    expect(productAccessDeniedUrl('no_entitlement')).toBe(
      'https://hub.prymeiradigital.com.br/acesso-negado?product_key=operis&reason=no_entitlement&return_url=https%3A%2F%2Foperis.prymeiradigital.com.br%2Finbox'
    );
  });
});
