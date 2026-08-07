import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserId } from '../middleware/auth.js';
import { registerProjectCockpitRoutes, registerProjectNextMoveRoutes } from './project-execution.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: vi.fn(() => 'user_1') }));

describe('project next move routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(getUserId).mockReturnValue('user_1');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('creates a manual next move', async () => {
    const service = { replaceActive: vi.fn().mockResolvedValue({ id: 'm1' }) };
    const app = Fastify();
    registerProjectNextMoveRoutes(app, service as never);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/projects/00000000-0000-0000-0000-000000000001/next-moves',
      payload: { text: 'Validar preço', source: 'manual' }
    });

    expect(response.statusCode).toBe(201);
    expect(service.replaceActive).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      { text: 'Validar preço', source: 'manual' },
      'user_1'
    );
  });

  it('requires an idempotency key when sending to Today', async () => {
    const service = { sendToToday: vi.fn() };
    const app = Fastify();
    registerProjectNextMoveRoutes(app, service as never);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/projects/00000000-0000-0000-0000-000000000001/next-moves/00000000-0000-0000-0000-000000000002/to-today'
    });

    expect(response.statusCode).toBe(400);
    expect(service.sendToToday).not.toHaveBeenCalled();
  });
});

describe('project cockpit routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(getUserId).mockReturnValue('user_1');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('loads the safe project detail read model', async () => {
    const service = { detail: vi.fn().mockResolvedValue({ id: 'p1', engine: { recovered: true } }) };
    const app = Fastify();
    registerProjectCockpitRoutes(app, service as never);
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/project-execution/00000000-0000-0000-0000-000000000001'
    });

    expect(response.statusCode).toBe(200);
    expect(service.detail).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001', 'user_1');
  });

  it('requires an idempotency key when creating a project', async () => {
    const service = { create: vi.fn() };
    const app = Fastify();
    registerProjectCockpitRoutes(app, service as never);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/project-execution',
      payload: {
        workspaceId: '00000000-0000-0000-0000-000000000001',
        methodology: 'entrega',
        title: 'Novo site',
        objective: 'Site publicado',
        methodologyData: { milestones: [] },
        nextMove: 'Definir escopo',
        nextMoveDestination: 'today'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('passes the idempotency key to atomic project creation', async () => {
    const service = { create: vi.fn().mockResolvedValue({ project: { id: 'p1' }, activeMove: { id: 'm1' }, task: null }) };
    const app = Fastify();
    registerProjectCockpitRoutes(app, service as never);
    apps.push(app);
    const payload = {
      workspaceId: '00000000-0000-0000-0000-000000000001',
      methodology: 'entrega',
      title: 'Novo site',
      objective: 'Site publicado',
      methodologyData: { milestones: [] },
      nextMove: 'Definir escopo',
      nextMoveDestination: 'project'
    };

    const response = await app.inject({
      method: 'POST',
      url: '/project-execution',
      headers: { 'idempotency-key': 'create-project-key-1' },
      payload
    });

    expect(response.statusCode).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      { ...payload, creationKey: 'create-project-key-1' },
      'user_1'
    );
  });
});
