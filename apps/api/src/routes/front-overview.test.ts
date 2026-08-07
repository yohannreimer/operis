import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserId } from '../middleware/auth.js';
import { registerFrontOverviewRoutes } from './front-overview.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: vi.fn(() => 'user_1') }));

describe('front overview routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(getUserId).mockReturnValue('user_1');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('loads the signed-in user front rail', async () => {
    const service = { list: vi.fn().mockResolvedValue([{ id: 'w1' }]) };
    const app = Fastify();
    registerFrontOverviewRoutes(app, service as never);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/workspaces/overview' });
    expect(response.statusCode).toBe(200);
    expect(service.list).toHaveBeenCalledWith('user_1');
  });
});
