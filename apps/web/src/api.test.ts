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

async function loadApiForRequests() {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', '/api');
  vi.stubGlobal('window', {
    clearTimeout,
    location: {
      origin: 'https://operis.prymeiradigital.com.br',
      href: 'https://operis.prymeiradigital.com.br/hoje',
      assign: vi.fn()
    },
    setTimeout
  });
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const module = await import('./api.js');
  return { ...module, fetchMock };
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

describe('protected API access denial', () => {
  it('redirects to the Hub only after the protected API reports denied product access', async () => {
    const assign = vi.fn();
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'https://operis.prymeiradigital.com.br/api');
    vi.stubGlobal('window', {
      clearTimeout,
      location: {
        href: 'https://operis.prymeiradigital.com.br/inbox',
        assign
      },
      setTimeout
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'Acesso não liberado pela Prymeira Account.',
        productAccessRequired: true,
        reason: 'no_entitlement',
        accessUrl: 'https://hub.prymeiradigital.com.br/acesso-negado?product_key=operis'
      })
    }));

    const { api, setAuthTokenGetter } = await import('./api.js');
    setAuthTokenGetter(async () => 'clerk-token');

    await expect(api.getWorkspaces()).rejects.toThrow('Acesso não liberado pela Prymeira Account.');
    expect(assign).toHaveBeenCalledWith(
      'https://hub.prymeiradigital.com.br/acesso-negado?product_key=operis'
    );
  });
});

describe('daily execution API client', () => {
  it('loads and assigns daily entries with the expected contract', async () => {
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ entries: [], rollover: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'daily_1', kind: 'inbox', sourceId: 'inbox_1' })
      });

    await api.getDailyExecution('2026-08-05');
    await api.assignDailyExecution('2026-08-05', {
      sourceType: 'inbox', sourceId: 'inbox_1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/daily-execution/2026-08-05',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/daily-execution/2026-08-05/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sourceType: 'inbox', sourceId: 'inbox_1' })
      })
    );
  });

  it('completes, reorders, removes and resolves rollover entries', async () => {
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'daily_1' }) })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'daily_1' }) });

    await api.setDailyExecutionCompleted('daily_1', true);
    await api.reorderDailyExecution('2026-08-05', ['daily_1']);
    await api.removeDailyExecution('daily_1');
    await api.resolveDailyRollover('daily_1', 'keep_today', '2026-08-05');

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/daily-execution-items/daily_1',
      '/api/daily-execution/2026-08-05/order',
      '/api/daily-execution-items/daily_1',
      '/api/daily-execution-items/daily_1/rollover'
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(4, expect.any(String), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'keep_today', targetDate: '2026-08-05' })
    }));
  });
});
