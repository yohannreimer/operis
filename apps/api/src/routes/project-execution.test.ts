import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserId } from '../middleware/auth.js';
import { registerProjectNextMoveRoutes } from './project-execution.js';

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
