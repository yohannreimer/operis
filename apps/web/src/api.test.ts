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

describe('habit ritual API client', () => {
  it('loads all date stats, sets an absolute total and loads evolution', async () => {
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await api.getHabitsTodayStats('2026-08-06', { includeUnscheduled: true });
    await api.setHabitTotal('h-1', { date: '2026-08-06', value: 20 });
    await api.getHabitEvolution(90);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/habits/stats/today?date=2026-08-06&includeUnscheduled=true',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/habits/h-1/log',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ date: '2026-08-06', value: 20 }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/habits/stats/evolution?days=90',
      expect.any(Object)
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

describe('task backlog API client', () => {
  it('loads the dated projection and supports progressive writes', async () => {
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200, json: async () => ({ date: '2026-08-08', items: [] })
      })
      .mockResolvedValueOnce({
        ok: true, status: 201, json: async () => ({ id: 'task_1', title: 'Preparar proposta' })
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    await api.getTaskBacklog({ date: '2026-08-08', workspaceId: 'ws_1' });
    await api.createTask({ workspaceId: 'ws_1', title: 'Preparar proposta' });
    await api.reorderTaskSubtasks('task_1', ['step_2', 'step_1']);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/tasks/backlog?date=2026-08-08&workspaceId=ws_1',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workspaceId: 'ws_1', title: 'Preparar proposta' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/tasks/task_1/subtasks/order',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ orderedIds: ['step_2', 'step_1'] })
      })
    );
  });
});

describe('weekly agenda API client', () => {
  it('loads a week and schedules a quick block without conversion', async () => {
    const inboxId = '22222222-2222-4222-8222-222222222222';
    const weekFixture = {
      weekStart: '2026-08-03',
      resourceErrors: { commitments: null },
      days: [],
      unscheduled: { tasks: [], inbox: [] }
    };
    const quickBlockFixture = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'inbox',
      sourceId: inboxId
    };
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => weekFixture })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => quickBlockFixture });

    await api.getAgendaWeek('2026-08-03');
    await api.createDayPlanItem('2026-08-06', {
      inboxItemId: inboxId,
      startTime: '2026-08-06T14:00:00.000Z',
      endTime: '2026-08-06T14:15:00.000Z',
      blockType: 'task'
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/agenda/week/2026-08-03',
      '/api/day-plans/2026-08-06/items'
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ body: expect.stringContaining('"inboxItemId"') })
    );
  });

  it('starts, stops and cancels observed execution sessions', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const sourceId = '22222222-2222-4222-8222-222222222222';
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: sessionId }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: sessionId }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: sessionId }) });

    await api.getActiveExecutionSession();
    await api.startExecutionSession({ sourceType: 'inbox', sourceId });
    await api.stopExecutionSession(sessionId);
    await api.cancelExecutionSession(sessionId);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/execution-sessions/active',
      '/api/execution-sessions/start',
      `/api/execution-sessions/${sessionId}/stop`,
      `/api/execution-sessions/${sessionId}/cancel`
    ]);
  });
});

describe('fronts and project cockpit API client', () => {
  it('loads a project cockpit and sends a recommendation to Today idempotently', async () => {
    const cockpitFixture = { id: 'p1', title: 'Pipeline Q3' };
    const moveFixture = { move: { id: 'm1' }, task: { id: 't1' } };
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => cockpitFixture })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => moveFixture });

    await api.getProjectCockpit('p1');
    await api.sendProjectMoveToToday('p1', 'm1', 'key-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/project-execution/p1',
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/p1/next-moves/m1/to-today',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers)
      })
    );
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Idempotency-Key')).toBe('key-1');
  });

  it('creates a project with a stable idempotency key', async () => {
    const { api, fetchMock } = await loadApiForRequests();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ project: { id: 'p1' }, activeMove: { id: 'm1' }, task: null })
    });
    const input = {
      workspaceId: 'w1', methodology: 'entrega' as const, title: 'Novo site',
      objective: 'Publicar o site', methodologyData: { milestones: [] },
      nextMove: 'Definir escopo', nextMoveDestination: 'project' as const
    };

    await api.createExecutionProject(input, 'wizard-key-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/project-execution',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
        body: JSON.stringify(input)
      })
    );
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Idempotency-Key')).toBe('wizard-key-1');
  });
});
