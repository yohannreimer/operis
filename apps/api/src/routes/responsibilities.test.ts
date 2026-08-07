import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserId } from '../middleware/auth.js';
import { registerResponsibilityRoutes } from './responsibilities.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: vi.fn(() => 'user_1') }));

describe('responsibility routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(getUserId).mockReturnValue('user_1');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('creates a responsibility for a workspace', async () => {
    const service = { create: vi.fn().mockResolvedValue({ id: 'r1' }) };
    const app = Fastify();
    registerResponsibilityRoutes(app, service as never);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/workspaces/00000000-0000-0000-0000-000000000001/responsibilities',
      payload: {
        title: 'Saúde financeira', expectedStandard: 'Seis meses de caixa',
        cadence: 'weekly', nextCare: 'Revisar fluxo', nextReviewAt: '2026-08-13T12:00:00.000Z'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(service.create).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001', expect.objectContaining({ cadence: 'weekly' }), 'user_1');
  });

  it('rejects custom cadence without a valid interval', async () => {
    const service = { create: vi.fn() };
    const app = Fastify();
    registerResponsibilityRoutes(app, service as never);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/workspaces/00000000-0000-0000-0000-000000000001/responsibilities',
      payload: {
        title: 'Marca', expectedStandard: 'Peças revisadas', cadence: 'custom',
        nextCare: 'Revisar peças', nextReviewAt: '2026-08-13T12:00:00.000Z'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
