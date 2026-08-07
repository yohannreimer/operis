import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  nextReviewDate,
  ResponsibilityService
} from './responsibility-service.js';

function prismaMock() {
  const prisma = {
    workspace: { findFirst: vi.fn() },
    responsibility: {
      findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn()
    },
    responsibilityReview: { create: vi.fn(), findMany: vi.fn() },
    task: { create: vi.fn() },
    $transaction: vi.fn()
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return prisma;
}

describe('nextReviewDate', () => {
  it.each([
    ['weekly', null, '2026-08-13'],
    ['biweekly', null, '2026-08-20'],
    ['monthly', null, '2026-09-06'],
    ['quarterly', null, '2026-11-06'],
    ['custom', 10, '2026-08-16']
  ] as const)('calculates %s cadence', (cadence, interval, expected) => {
    expect(nextReviewDate(new Date('2026-08-06T12:00:00Z'), cadence, interval).toISOString().slice(0, 10)).toBe(expected);
  });
});

describe('ResponsibilityService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: ResponsibilityService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new ResponsibilityService(prisma as never);
  });

  it('stores a review and its optional Today task in one transaction', async () => {
    prisma.responsibility.findFirst.mockResolvedValue({
      id: 'r1', workspaceId: 'w1', title: 'Saúde financeira', cadence: 'weekly', cadenceIntervalDays: null
    });
    prisma.task.create.mockResolvedValue({ id: 't1' });
    prisma.responsibility.update.mockResolvedValue({ id: 'r1' });
    prisma.responsibilityReview.create.mockResolvedValue({ id: 'rr1', createdTaskId: 't1' });

    await service.review('r1', {
      health: 'attention', nextCare: 'Revisar inadimplência', createTask: 'today'
    }, 'user_1', new Date('2026-08-06T12:00:00Z'));

    expect(prisma.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'hoje', workspaceId: 'w1', title: 'Revisar inadimplência'
    }) });
    expect(prisma.responsibilityReview.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      responsibilityId: 'r1', createdTaskId: 't1', health: 'attention', nextCare: 'Revisar inadimplência'
    }) });
    expect(prisma.responsibility.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({ health: 'attention', lastReviewedAt: expect.any(Date), status: 'active' })
    });
  });

  it('rejects a responsibility owned by another user', async () => {
    prisma.responsibility.findFirst.mockResolvedValue(null);
    await expect(service.review('r1', { health: 'healthy', nextCare: 'Revisar caixa' }, 'user_2')).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
