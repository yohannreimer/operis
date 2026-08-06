import { describe, expect, it, vi } from 'vitest';

import { DailyExecutionService } from './daily-execution-service.js';

const delegate = () => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn()
});

function createPrismaMock() {
  const prisma = {
    inboxItem: delegate(),
    inboxTodayItem: delegate(),
    task: delegate(),
    dailyExecutionItem: delegate(),
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  };
  return prisma;
}

describe('DailyExecutionService assignment', () => {
  it('adds an owned inbox item without converting it into a task', async () => {
    const prisma = createPrismaMock();
    prisma.inboxItem.findFirst.mockResolvedValue({ id: 'inbox_1', clerkUserId: 'user_1' });
    prisma.dailyExecutionItem.findFirst.mockResolvedValue(null);
    prisma.dailyExecutionItem.count.mockResolvedValue(2);
    prisma.dailyExecutionItem.create.mockResolvedValue({ id: 'daily_1', sourceType: 'inbox' });
    const service = new DailyExecutionService(prisma as never);

    await service.assign('user_1', '2026-08-05', { sourceType: 'inbox', sourceId: 'inbox_1' });

    expect(prisma.dailyExecutionItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inboxItemId: 'inbox_1', taskId: null, position: 2 })
    }));
    expect(prisma.inboxItem.update).not.toHaveBeenCalled();
  });

  it('rejects a task owned by another user', async () => {
    const prisma = createPrismaMock();
    prisma.task.findFirst.mockResolvedValue(null);
    const service = new DailyExecutionService(prisma as never);

    await expect(service.assign('user_1', '2026-08-05', {
      sourceType: 'task', sourceId: 'task_other'
    })).rejects.toThrow('Origem diária não encontrada.');
  });

  it('returns an existing assignment instead of duplicating it', async () => {
    const prisma = createPrismaMock();
    prisma.inboxItem.findFirst.mockResolvedValue({ id: 'inbox_1', clerkUserId: 'user_1' });
    prisma.dailyExecutionItem.findFirst.mockResolvedValue({ id: 'daily_existing' });
    const service = new DailyExecutionService(prisma as never);

    const result = await service.assign('user_1', '2026-08-05', {
      sourceType: 'inbox', sourceId: 'inbox_1'
    });

    expect(result).toEqual({ id: 'daily_existing' });
    expect(prisma.dailyExecutionItem.create).not.toHaveBeenCalled();
  });

  it('backfills legacy inbox and task allocations idempotently for today', async () => {
    const prisma = createPrismaMock();
    const today = new Date().toISOString().slice(0, 10);
    prisma.inboxTodayItem.findMany.mockResolvedValue([{ inboxItemId: 'inbox_1' }]);
    prisma.task.findMany.mockResolvedValue([{ id: 'task_1' }]);
    prisma.inboxItem.findFirst.mockResolvedValue({ id: 'inbox_1', clerkUserId: 'user_1' });
    prisma.task.findFirst.mockResolvedValue({ id: 'task_1', workspace: { clerkUserId: 'user_1' } });
    prisma.dailyExecutionItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'existing' });
    prisma.dailyExecutionItem.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.dailyExecutionItem.create
      .mockResolvedValueOnce({ id: 'daily_inbox' })
      .mockResolvedValueOnce({ id: 'daily_task' });
    prisma.dailyExecutionItem.findMany.mockResolvedValue([]);
    const service = new DailyExecutionService(prisma as never);

    await service.listDay('user_1', today);
    await service.listDay('user_1', today);

    expect(prisma.dailyExecutionItem.create).toHaveBeenCalledTimes(2);
    expect(prisma.dailyExecutionItem.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
    }));
  });
});
