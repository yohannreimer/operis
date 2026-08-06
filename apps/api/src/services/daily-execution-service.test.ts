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

describe('DailyExecutionService transitions', () => {
  it.each([
    ['inbox', 'inbox_1'],
    ['task', 'task_1']
  ] as const)('completes %s source and assignment atomically', async (sourceType, sourceId) => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findFirst.mockResolvedValue({
      id: 'daily_1',
      clerkUserId: 'user_1',
      sourceType,
      inboxItemId: sourceType === 'inbox' ? sourceId : null,
      taskId: sourceType === 'task' ? sourceId : null
    });
    prisma.dailyExecutionItem.update.mockResolvedValue({ id: 'daily_1', sourceType });
    const service = new DailyExecutionService(prisma as never);

    await service.setCompleted('user_1', 'daily_1', true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    if (sourceType === 'inbox') {
      expect(prisma.inboxItem.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: 'feito' }
      }));
    } else {
      expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'feito' })
      }));
    }
  });

  it('undoes completion on both the task and assignment', async () => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findFirst.mockResolvedValue({
      id: 'daily_1', clerkUserId: 'user_1', sourceType: 'task', inboxItemId: null, taskId: 'task_1'
    });
    prisma.dailyExecutionItem.update.mockResolvedValue({ id: 'daily_1', sourceType: 'task' });
    const service = new DailyExecutionService(prisma as never);

    await service.setCompleted('user_1', 'daily_1', false);

    expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'hoje', completedAt: null }
    }));
    expect(prisma.dailyExecutionItem.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { completedAt: null }
    }));
  });

  it('reorders mixed sources in one transaction', async () => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const service = new DailyExecutionService(prisma as never);

    await service.reorder('user_1', '2026-08-05', ['b', 'a']);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.dailyExecutionItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'b' }, data: { position: 0 }
    });
  });

  it('rejects a partial reorder', async () => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const service = new DailyExecutionService(prisma as never);

    await expect(service.reorder('user_1', '2026-08-05', ['a'])).rejects.toThrow(
      'A ordem deve conter todos os itens do dia.'
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lists every older incomplete item for rollover', async () => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findMany.mockResolvedValue([]);
    const service = new DailyExecutionService(prisma as never);

    await service.listRollover('user_1', '2026-08-05');

    expect(prisma.dailyExecutionItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ completedAt: null, date: { lt: expect.any(Date) } })
    }));
  });

  it('returns a removed task to backlog so legacy backfill does not recreate it', async () => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findFirst.mockResolvedValue({
      id: 'daily_1', sourceType: 'task', taskId: 'task_1', inboxItemId: null
    });
    const service = new DailyExecutionService(prisma as never);

    await service.remove('user_1', 'daily_1');

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: 'task_1', status: 'hoje' }, data: { status: 'backlog' }
    });
    expect(prisma.dailyExecutionItem.delete).toHaveBeenCalledWith({ where: { id: 'daily_1' } });
  });

  it('moves an older allocation into today at the end of the list', async () => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findFirst
      .mockResolvedValueOnce({
        id: 'daily_1',
        clerkUserId: 'user_1',
        date: new Date('2026-08-04T00:00:00.000Z'),
        sourceType: 'inbox',
        inboxItemId: 'inbox_1',
        taskId: null
      })
      .mockResolvedValueOnce(null);
    prisma.dailyExecutionItem.findMany.mockResolvedValue([]);
    prisma.dailyExecutionItem.count.mockResolvedValue(3);
    prisma.dailyExecutionItem.update.mockResolvedValue({ id: 'daily_1', position: 3 });
    const service = new DailyExecutionService(prisma as never);

    await service.resolveRollover('user_1', 'daily_1', {
      action: 'keep_today', targetDate: '2026-08-05'
    });

    expect(prisma.dailyExecutionItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'daily_1' },
      data: { date: new Date('2026-08-05T00:00:00.000Z'), position: 3 }
    }));
  });

  it('does not offer the inbox rollover action to tasks', async () => {
    const prisma = createPrismaMock();
    prisma.dailyExecutionItem.findFirst.mockResolvedValue({
      id: 'daily_1', sourceType: 'task', taskId: 'task_1', inboxItemId: null
    });
    const service = new DailyExecutionService(prisma as never);

    await expect(service.resolveRollover('user_1', 'daily_1', {
      action: 'return_inbox', targetDate: '2026-08-05'
    })).rejects.toThrow('Somente capturas rápidas podem voltar ao Inbox.');
  });
});
