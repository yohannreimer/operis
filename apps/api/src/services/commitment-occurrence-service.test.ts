import { describe, expect, it, vi } from 'vitest';

import { CommitmentOccurrenceService } from './commitment-occurrence-service.js';

const USER_ID = 'user_1';

const baseCommitment = {
  id: '11111111-1111-4111-8111-111111111111',
  clerkUserId: USER_ID,
  workspaceId: null,
  projectId: null,
  title: 'Academia',
  description: null,
  type: 'fixo',
  status: 'ativo',
  startTime: '09:00',
  durationMin: 60,
  recurrenceDays: ['seg', 'qua'],
  date: new Date('2026-08-03T00:00:00.000Z'),
  recurrenceEnd: null,
  exceptions: []
};

function createCommitmentPrisma() {
  return {
    commitment: {
      findMany: vi.fn().mockResolvedValue([
        baseCommitment,
        {
          ...baseCommitment,
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Consulta',
          type: 'variavel',
          recurrenceDays: [],
          date: new Date('2026-08-07T00:00:00.000Z')
        }
      ])
    },
    commitmentException: { findMany: vi.fn().mockResolvedValue([]) }
  };
}

function serviceWithExceptions(
  exceptions: Array<{
    date: string;
    action: string;
    newDate?: string;
    newTime?: string;
  }>
) {
  const stored = exceptions.map((item, index) => ({
    id: `exception_${index}`,
    commitmentId: baseCommitment.id,
    date: new Date(`${item.date}T00:00:00.000Z`),
    action: item.action,
    newDate: item.newDate ? new Date(`${item.newDate}T00:00:00.000Z`) : null,
    newTime: item.newTime ?? null,
    commitment: baseCommitment
  }));
  const prisma = {
    commitment: {
      findMany: vi.fn().mockResolvedValue([{ ...baseCommitment, exceptions: stored }])
    },
    commitmentException: {
      findMany: vi.fn().mockResolvedValue(
        stored.filter((item) => item.action === 'rescheduled')
      )
    }
  };
  return new CommitmentOccurrenceService(prisma as never);
}

describe('CommitmentOccurrenceService', () => {
  it('expands recurring and one-off commitments into seven dates', async () => {
    const prisma = createCommitmentPrisma();

    const result = await new CommitmentOccurrenceService(prisma as never).listWeek(
      USER_ID,
      '2026-08-03'
    );

    expect(result.map((item) => [item.date, item.title])).toEqual([
      ['2026-08-03', 'Academia'],
      ['2026-08-05', 'Academia'],
      ['2026-08-07', 'Consulta']
    ]);
  });

  it('removes cancelled occurrences and uses the rescheduled date and time', async () => {
    const result = await serviceWithExceptions([
      { date: '2026-08-03', action: 'cancelled' },
      {
        date: '2026-08-05',
        action: 'rescheduled',
        newDate: '2026-08-06',
        newTime: '10:30'
      }
    ]).listWeek(USER_ID, '2026-08-03');

    expect(result).not.toContainEqual(expect.objectContaining({ date: '2026-08-03' }));
    expect(result).toContainEqual(
      expect.objectContaining({ date: '2026-08-06', startTime: '10:30', rescheduled: true })
    );
    expect(result).not.toContainEqual(expect.objectContaining({ date: '2026-08-05' }));
  });
});
