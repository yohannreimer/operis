import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerExecutionSessionRoutes } from './execution-sessions.js';

vi.mock('../middleware/auth.js', () => ({
  getUserId: () => 'user_1'
}));

const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const INBOX_ID = '11111111-1111-4111-8111-111111111111';
const record = {
  id: SESSION_ID,
  clerkUserId: 'user_1',
  dayPlanItemId: null,
  dailyExecutionItemId: null,
  taskId: null,
  inboxItemId: INBOX_ID,
  startedAt: new Date('2026-08-06T14:08:00.000Z'),
  endedAt: null,
  state: 'active',
  task: null,
  inboxItem: { id: INBOX_ID, content: 'Responder cliente' },
  dayPlanItem: null
};

function createService() {
  return {
    getActive: vi.fn().mockResolvedValue(record),
    start: vi.fn().mockResolvedValue(record),
    stop: vi.fn().mockResolvedValue({
      ...record,
      state: 'completed',
      endedAt: new Date('2026-08-06T14:21:00.000Z')
    }),
    cancel: vi.fn().mockResolvedValue({
      ...record,
      state: 'cancelled',
      endedAt: new Date('2026-08-06T14:21:00.000Z')
    })
  };
}

describe('execution session routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function setup() {
    const app = Fastify();
    const service = createService();
    registerExecutionSessionRoutes(app, service as never);
    apps.push(app);
    return { app, service };
  }

  it('serializes the active session with its original inbox source', async () => {
    const { app } = setup();

    const response = await app.inject({ method: 'GET', url: '/execution-sessions/active' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: SESSION_ID,
      kind: 'inbox',
      sourceId: INBOX_ID,
      title: 'Responder cliente',
      startedAt: '2026-08-06T14:08:00.000Z',
      endedAt: null,
      state: 'active',
      dayPlanItemId: null,
      dailyExecutionItemId: null
    });
  });

  it('starts and stops an observed session', async () => {
    const { app, service } = setup();
    const start = await app.inject({
      method: 'POST',
      url: '/execution-sessions/start',
      payload: { sourceType: 'inbox', sourceId: INBOX_ID }
    });
    const stop = await app.inject({
      method: 'POST',
      url: `/execution-sessions/${SESSION_ID}/stop`
    });

    expect(start.statusCode).toBe(201);
    expect(stop.statusCode).toBe(200);
    expect(service.start).toHaveBeenCalledWith('user_1', {
      sourceType: 'inbox',
      sourceId: INBOX_ID
    });
    expect(stop.json()).toMatchObject({ state: 'completed' });
  });
});
