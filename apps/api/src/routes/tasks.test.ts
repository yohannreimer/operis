import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerTaskRoutes } from './tasks.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: () => 'user_1' }));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const STEP_ONE_ID = '33333333-3333-4333-8333-333333333333';
const STEP_TWO_ID = '44444444-4444-4444-8444-444444444444';

function createService() {
  return {
    list: vi.fn().mockResolvedValue([]),
    listBacklog: vi.fn().mockResolvedValue({ date: '2026-08-08', items: [] }),
    getWaitingRadar: vi.fn().mockResolvedValue({ rows: [] }),
    create: vi.fn().mockImplementation(async (input) => ({ id: TASK_ID, ...input })),
    update: vi.fn().mockImplementation(async (_id, input) => ({ id: TASK_ID, ...input })),
    reopen: vi.fn().mockResolvedValue({ id: TASK_ID, status: 'backlog' }),
    archive: vi.fn().mockResolvedValue({ id: TASK_ID, status: 'arquivado' }),
    reorderSubtasks: vi.fn().mockResolvedValue(undefined)
  };
}

describe('task routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function setup() {
    const app = Fastify();
    const service = createService();
    registerTaskRoutes(app, service as never);
    apps.push(app);
    return { app, service };
  }

  it('accepts progressive task creation', async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { workspaceId: WORKSPACE_ID, title: 'Preparar proposta' }
    });

    expect(response.statusCode).toBe(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      clerkUserId: 'user_1', workspaceId: WORKSPACE_ID, title: 'Preparar proposta'
    }));
  });

  it('returns the backlog projection for a local date', async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: 'GET',
      url: `/tasks/backlog?date=2026-08-08&workspaceId=${WORKSPACE_ID}`
    });

    expect(response.statusCode).toBe(200);
    expect(service.listBacklog).toHaveBeenCalledWith({
      clerkUserId: 'user_1', date: '2026-08-08', workspaceId: WORKSPACE_ID
    });
  });

  it('updates the independent next step', async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: 'PATCH',
      url: `/tasks/${TASK_ID}`,
      payload: { nextStep: 'Enviar rascunho para revisão' }
    });

    expect(response.statusCode).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      TASK_ID,
      { nextStep: 'Enviar rascunho para revisão' },
      { clerkUserId: 'user_1' }
    );
  });

  it('reorders every step exactly once', async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: 'PUT',
      url: `/tasks/${TASK_ID}/subtasks/order`,
      payload: { orderedIds: [STEP_TWO_ID, STEP_ONE_ID] }
    });

    expect(response.statusCode).toBe(204);
    expect(service.reorderSubtasks).toHaveBeenCalledWith(
      TASK_ID,
      [STEP_TWO_ID, STEP_ONE_ID],
      { clerkUserId: 'user_1' }
    );
  });

  it('reopens and archives through explicit lifecycle routes', async () => {
    const { app, service } = setup();
    const reopened = await app.inject({ method: 'POST', url: `/tasks/${TASK_ID}/reopen` });
    const archived = await app.inject({ method: 'POST', url: `/tasks/${TASK_ID}/archive` });
    expect(reopened.statusCode).toBe(200);
    expect(archived.statusCode).toBe(200);
    expect(service.reopen).toHaveBeenCalledWith(TASK_ID, { clerkUserId: 'user_1' });
    expect(service.archive).toHaveBeenCalledWith(TASK_ID, { clerkUserId: 'user_1' });
  });
});
