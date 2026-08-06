import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserId } from '../middleware/auth.js';
import { HabitEvolutionService } from '../services/habit-evolution-service.js';
import { HabitService } from '../services/habit-service.js';
import { registerHabitRoutes } from './habits.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: vi.fn(() => 'user_1') }));

describe('habit routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(getUserId).mockReturnValue('user_1');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('passes includeUnscheduled to daily stats', async () => {
    const stats = vi.spyOn(HabitService.prototype, 'getTodayStats').mockResolvedValue([]);
    const app = Fastify();
    registerHabitRoutes(app, {} as never);
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/habits/stats/today?date=2026-08-06&includeUnscheduled=true',
    });

    expect(response.statusCode).toBe(200);
    expect(stats).toHaveBeenCalledWith('2026-08-06', 'user_1', { includeUnscheduled: true });
  });

  it('sets an absolute quantitative total for the signed-in user', async () => {
    vi.spyOn(HabitService.prototype, 'processXP').mockResolvedValue();
    const prisma = {
      habit: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'h1',
          clerkUserId: 'user_1',
          type: 'quantitative',
        }),
      },
      habitLog: {
        upsert: vi.fn().mockResolvedValue({
          id: 'log_1',
          habitId: 'h1',
          date: '2026-08-06',
          value: 20,
          note: null,
        }),
      },
    };
    const app = Fastify();
    registerHabitRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/habits/h1/log',
      payload: { date: '2026-08-06', value: 20 },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.habit.findUnique).toHaveBeenCalledWith({ where: { id: 'h1', clerkUserId: 'user_1' } });
    expect(prisma.habitLog.upsert).toHaveBeenCalledWith({
      where: { habitId_date: { habitId: 'h1', date: '2026-08-06' } },
      create: { habitId: 'h1', date: '2026-08-06', value: 20, note: null },
      update: { value: 20, note: null },
    });
  });

  it('rejects absolute totals for binary habits', async () => {
    const prisma = {
      habit: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'h2',
          clerkUserId: 'user_1',
          type: 'binary',
        }),
      },
      habitLog: { upsert: vi.fn() },
    };
    const app = Fastify();
    registerHabitRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/habits/h2/log',
      payload: { date: '2026-08-06', value: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(prisma.habitLog.upsert).not.toHaveBeenCalled();
  });

  it('loads a validated evolution period for the signed-in user', async () => {
    const evolution = vi.spyOn(HabitEvolutionService.prototype, 'getEvolution').mockResolvedValue({
      startDate: '2026-05-09',
      endDate: '2026-08-06',
      expectedOccurrences: 90,
      completedOccurrences: 66,
      rhythmPct: 73,
      areas: [],
    });
    const app = Fastify();
    registerHabitRoutes(app, {} as never);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/habits/stats/evolution?days=90' });

    expect(response.statusCode).toBe(200);
    expect(evolution).toHaveBeenCalledWith('user_1', 90);
  });

  it('rejects unsupported evolution periods before loading data', async () => {
    const evolution = vi.spyOn(HabitEvolutionService.prototype, 'getEvolution');
    const app = Fastify();
    registerHabitRoutes(app, {} as never);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/habits/stats/evolution?days=7' });

    expect(response.statusCode).toBe(400);
    expect(evolution).not.toHaveBeenCalled();
  });

  it.each([
    { habit: null, payload: { date: '2026-08-06', value: 20 }, status: 404 },
    {
      habit: { id: 'h1', clerkUserId: 'user_1', type: 'quantitative' },
      payload: { date: '2026-08-06', value: 0 },
      status: 400,
    },
    {
      habit: { id: 'h1', clerkUserId: 'user_1', type: 'quantitative' },
      payload: { date: '06/08/2026', value: 20 },
      status: 400,
    },
  ])('validates absolute total requests', async ({ habit, payload, status }) => {
    const prisma = {
      habit: { findUnique: vi.fn().mockResolvedValue(habit) },
      habitLog: { upsert: vi.fn() },
    };
    const app = Fastify();
    registerHabitRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/habits/h1/log',
      payload,
    });

    expect(response.statusCode).toBe(status);
    expect(prisma.habitLog.upsert).not.toHaveBeenCalled();
  });
});
