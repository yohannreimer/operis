import { describe, expect, it, vi } from 'vitest';

import { HabitEvolutionService } from './habit-evolution-service.js';

function evolutionFixture(habits: Array<Record<string, unknown>>, logs: Array<Record<string, unknown>>) {
  return {
    habit: { findMany: vi.fn().mockResolvedValue(habits) },
    habitLog: { findMany: vi.fn().mockResolvedValue(logs) },
    habitXPEvent: { aggregate: vi.fn().mockResolvedValue({ _sum: { xp: 0 } }) },
  };
}

describe('HabitEvolutionService', () => {
  it('caps weekly completions at the target and excludes dates before creation', async () => {
    const prisma = evolutionFixture(
      [
        {
          id: 'h1',
          type: 'binary',
          frequencyType: 'weekly',
          frequencyTarget: 2,
          specificDays: [],
          createdAt: new Date('2026-08-03T00:00:00Z'),
          lifeArea: 'corpo',
        },
      ],
      [
        { habitId: 'h1', date: '2026-08-03', value: 1 },
        { habitId: 'h1', date: '2026-08-04', value: 1 },
        { habitId: 'h1', date: '2026-08-05', value: 1 },
      ],
    );

    const result = await new HabitEvolutionService(prisma as never).getEvolution(
      'user_1',
      7,
      '2026-08-06',
    );

    expect(result.expectedOccurrences).toBe(2);
    expect(result.completedOccurrences).toBe(2);
    expect(result.rhythmPct).toBe(100);
  });

  it.each([
    {
      name: 'daily',
      habit: {
        id: 'd',
        type: 'binary',
        frequencyType: 'daily',
        frequencyTarget: 1,
        specificDays: [],
        createdAt: new Date('2026-08-01T00:00:00Z'),
        lifeArea: 'corpo',
      },
      logs: ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'].map(
        (date) => ({ habitId: 'd', date, value: 1 }),
      ),
      expected: 7,
      completed: 5,
    },
    {
      name: 'specific weekdays',
      habit: {
        id: 's',
        type: 'binary',
        frequencyType: 'specific_days',
        frequencyTarget: 1,
        specificDays: ['seg', 'qui'],
        createdAt: new Date('2026-08-01T00:00:00Z'),
        lifeArea: 'mente',
      },
      logs: [{ habitId: 's', date: '2026-08-03', value: 1 }],
      expected: 2,
      completed: 1,
    },
    {
      name: 'partial monthly target',
      habit: {
        id: 'm',
        type: 'binary',
        frequencyType: 'monthly',
        frequencyTarget: 3,
        specificDays: [],
        createdAt: new Date('2026-08-01T00:00:00Z'),
        lifeArea: 'trabalho',
      },
      logs: [
        { habitId: 'm', date: '2026-08-02', value: 1 },
        { habitId: 'm', date: '2026-08-05', value: 1 },
      ],
      expected: 3,
      completed: 2,
    },
    {
      name: 'vice with one relapse',
      habit: {
        id: 'v',
        type: 'vice',
        frequencyType: 'daily',
        frequencyTarget: 1,
        specificDays: [],
        createdAt: new Date('2026-08-01T00:00:00Z'),
        lifeArea: 'corpo',
      },
      logs: [{ habitId: 'v', date: '2026-08-04', value: -1 }],
      expected: 7,
      completed: 6,
    },
  ])('$name', async ({ habit, logs, expected, completed }) => {
    const service = new HabitEvolutionService(evolutionFixture([habit], logs) as never);
    const result = await service.getEvolution('user_1', 7, '2026-08-07');

    expect(result.expectedOccurrences).toBe(expected);
    expect(result.completedOccurrences).toBe(completed);
  });

  it('returns zero rhythm when there are no expected occurrences', async () => {
    const service = new HabitEvolutionService(evolutionFixture([], []) as never);
    const result = await service.getEvolution('user_1', 30, '2026-08-07');

    expect(result.expectedOccurrences).toBe(0);
    expect(result.completedOccurrences).toBe(0);
    expect(result.rhythmPct).toBe(0);
    expect(result.areas).toHaveLength(6);
  });
});
