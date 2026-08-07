import { describe, expect, it, vi } from 'vitest';

vi.mock('../infra/rabbit.js', () => ({ publishEvent: vi.fn() }));

import { persistTaskCompletion } from './task-service.js';

describe('persistTaskCompletion', () => {
  it('completes the task and resolves linked active moves atomically', async () => {
    const completedAt = new Date('2026-08-06T12:00:00.000Z');
    const prisma = {
      task: { update: vi.fn().mockResolvedValue({ id: 'task_1', status: 'feito', completedAt }) },
      projectNextMove: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn()
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

    const result = await persistTaskCompletion(prisma as never, 'task_1', completedAt);

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_1' },
      data: { status: 'feito', completedAt }
    });
    expect(prisma.projectNextMove.updateMany).toHaveBeenCalledWith({
      where: { taskId: 'task_1', status: 'active' },
      data: { status: 'resolved', resolvedAt: completedAt }
    });
    expect(result).toMatchObject({ id: 'task_1', status: 'feito' });
  });
});
