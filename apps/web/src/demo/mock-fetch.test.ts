import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockFetch } from './mock-fetch';

describe('demo fetch contracts', () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    window.fetch = vi.fn(async () => new Response(JSON.stringify({ external: true }), {
      status: 418,
      headers: { 'Content-Type': 'application/json' }
    })) as typeof window.fetch;
    installMockFetch();
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it.each([
    ['/api/workspaces/overview', 'GET'],
    ['/api/workspaces/ws-1/overview', 'GET'],
    ['/api/project-execution', 'GET'],
    ['/api/project-execution/proj-1', 'GET'],
    ['/api/workspaces/ws-1/responsibilities', 'GET']
  ])('serves %s %s in demo mode', async (url, method) => {
    const response = await window.fetch(url, { method });

    expect(response.ok).toBe(true);
    expect(await response.json()).toBeTruthy();
  });

  it('keeps non-Operis requests delegated to the original fetch', async () => {
    const response = await window.fetch('https://example.com/data');
    expect(response.status).toBe(418);
  });

  it('persists an adopted movement and can send it to Today', async () => {
    const movementResponse = await window.fetch('/api/projects/proj-2/next-moves', {
      method: 'POST',
      body: JSON.stringify({ text: 'Replanejar o KR de artigos', source: 'recommendation' })
    });
    const movement = await movementResponse.json() as { id: string };

    const todayResponse = await window.fetch(`/api/projects/proj-2/next-moves/${movement.id}/to-today`, { method: 'POST' });
    const result = await todayResponse.json() as { task: { title: string; status: string } };

    expect(result.task).toMatchObject({ title: 'Replanejar o KR de artigos', status: 'hoje' });
    const cockpit = await (await window.fetch('/api/project-execution/proj-2')).json() as { activeMove: { id: string } };
    expect(cockpit.activeMove.id).toBe(movement.id);
  });

  it('persists a responsibility review in the front overview', async () => {
    const response = await window.fetch('/api/responsibilities/resp-1/reviews', {
      method: 'POST',
      body: JSON.stringify({ health: 'healthy', nextCare: 'Conferir caixa na sexta' })
    });

    expect(response.status).toBe(201);
    const overview = await (await window.fetch('/api/workspaces/ws-1/overview')).json() as {
      responsibilities: Array<{ id: string; health: string; nextCare: string }>;
    };
    expect(overview.responsibilities.find((item) => item.id === 'resp-1')).toMatchObject({
      health: 'healthy', nextCare: 'Conferir caixa na sexta'
    });
  });
});
