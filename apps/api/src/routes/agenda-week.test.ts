import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerAgendaWeekRoutes } from './agenda-week.js';

vi.mock('../middleware/auth.js', () => ({
  getUserId: () => 'user_1'
}));

describe('agenda week routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('returns 400 for a non-Monday and 200 for a valid week', async () => {
    const app = Fastify();
    const service = {
      getWeek: vi.fn().mockResolvedValue({
        weekStart: '2026-08-03',
        resourceErrors: { commitments: null },
        days: [],
        unscheduled: { tasks: [], inbox: [] }
      })
    };
    registerAgendaWeekRoutes(app, service as never);
    apps.push(app);

    const invalid = await app.inject({ method: 'GET', url: '/agenda/week/2026-08-04' });
    const valid = await app.inject({ method: 'GET', url: '/agenda/week/2026-08-03' });

    expect(invalid.statusCode).toBe(400);
    expect(valid.statusCode).toBe(200);
    expect(service.getWeek).toHaveBeenCalledOnce();
    expect(service.getWeek).toHaveBeenCalledWith('user_1', '2026-08-03');
  });
});
