import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerDailyExecutionRoutes } from './daily-execution.js';

vi.mock('../middleware/auth.js', () => ({
  getUserId: () => 'user_1'
}));

const inboxRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  clerkUserId: 'user_1',
  date: new Date('2026-08-05T00:00:00.000Z'),
  sourceType: 'inbox',
  inboxItemId: '22222222-2222-4222-8222-222222222222',
  taskId: null,
  position: 0,
  completedAt: null,
  createdAt: new Date('2026-08-05T10:00:00.000Z'),
  updatedAt: new Date('2026-08-05T10:00:00.000Z'),
  inboxItem: {
    id: '22222222-2222-4222-8222-222222222222',
    content: 'Postar stories',
    inboxContext: { name: 'Conteúdo' },
    workspace: null
  },
  task: null
};

function createService() {
  return {
    listDay: vi.fn().mockResolvedValue([inboxRecord]),
    listRollover: vi.fn().mockResolvedValue([]),
    assign: vi.fn().mockResolvedValue(inboxRecord),
    setCompleted: vi.fn().mockResolvedValue({
      ...inboxRecord,
      completedAt: new Date('2026-08-05T12:00:00.000Z')
    }),
    reorder: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    resolveRollover: vi.fn().mockResolvedValue(inboxRecord)
  };
}

describe('daily execution routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function setup() {
    const app = Fastify();
    const service = createService();
    registerDailyExecutionRoutes(app, service as never);
    apps.push(app);
    return { app, service };
  }

  it('returns the serialized day and rollover', async () => {
    const { app } = setup();

    const response = await app.inject({ method: 'GET', url: '/daily-execution/2026-08-05' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      entries: [{
        id: inboxRecord.id,
        kind: 'inbox',
        sourceId: inboxRecord.inboxItemId,
        date: '2026-08-05',
        title: 'Postar stories',
        position: 0,
        completedAt: null,
        context: 'Conteúdo'
      }],
      rollover: []
    });
  });

  it('assigns an inbox source', async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: 'POST',
      url: '/daily-execution/2026-08-05/items',
      payload: {
        sourceType: 'inbox',
        sourceId: '22222222-2222-4222-8222-222222222222'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(service.assign).toHaveBeenCalledWith('user_1', '2026-08-05', {
      sourceType: 'inbox', sourceId: '22222222-2222-4222-8222-222222222222'
    });
    expect(response.json()).toMatchObject({ kind: 'inbox', title: 'Postar stories' });
  });

  it('updates completion', async () => {
    const { app } = setup();
    const response = await app.inject({
      method: 'PATCH',
      url: '/daily-execution-items/11111111-1111-4111-8111-111111111111',
      payload: { completed: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: 'inbox', completedAt: '2026-08-05T12:00:00.000Z'
    });
  });

  it.each([
    ['/daily-execution/not-a-date', undefined],
    ['/daily-execution/2026-08-05/items', { sourceType: 'note', sourceId: inboxRecord.inboxItemId }]
  ])('returns 400 for invalid input at %s', async (url, payload) => {
    const { app } = setup();
    const response = await app.inject({ method: payload ? 'POST' : 'GET', url, payload });
    expect(response.statusCode).toBe(400);
  });

  it('returns 204 for reorder and removal', async () => {
    const { app } = setup();
    const reorder = await app.inject({
      method: 'PUT',
      url: '/daily-execution/2026-08-05/order',
      payload: { orderedIds: [inboxRecord.id] }
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: `/daily-execution-items/${inboxRecord.id}`
    });

    expect(reorder.statusCode).toBe(204);
    expect(remove.statusCode).toBe(204);
  });
});
