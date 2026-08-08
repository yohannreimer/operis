import { describe, expect, it, vi } from 'vitest';

vi.mock('../infra/rabbit.js', () => ({ publishEvent: vi.fn() }));
vi.mock('./strategic-decision-service.js', () => ({
  safeRecordStrategicDecisionEvent: vi.fn(),
  signalFromImpact: vi.fn(() => 'neutral')
}));

import { persistTaskCompletion, TaskService } from './task-service.js';

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

describe('TaskService progressive backlog contracts', () => {
  it('applies domain defaults when creating with title only', async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({ name: 'Pessoal', mode: 'expansao' })
      },
      task: {
        create: vi.fn().mockResolvedValue({
          id: 'task_1', workspaceId: 'ws_1', projectId: null,
          title: 'Preparar proposta', taskType: 'b', energyLevel: 'media',
          executionKind: 'operacao', estimatedMinutes: null
        })
      }
    };
    const service = new TaskService(prisma as never);

    await service.create({
      clerkUserId: 'user_1', workspaceId: 'ws_1', title: 'Preparar proposta'
    });

    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Preparar proposta', definitionOfDone: null, nextStep: null,
        taskType: 'b', energyLevel: 'media', executionKind: 'operacao',
        horizon: 'active', priority: 3, estimatedMinutes: undefined, status: 'backlog'
      })
    });
  });

  it('assigns the next position to a new step', async () => {
    const prisma = {
      task: { findFirst: vi.fn().mockResolvedValue({ id: 'task_1' }) },
      subtask: {
        findFirst: vi.fn().mockResolvedValue({ position: 3 }),
        create: vi.fn().mockResolvedValue({ id: 'step_5', position: 4 })
      }
    };
    const service = new TaskService(prisma as never);

    await service.createSubtask('task_1', '  Enviar revisão  ', { clerkUserId: 'user_1' });

    expect(prisma.subtask.create).toHaveBeenCalledWith({
      data: { taskId: 'task_1', title: 'Enviar revisão', status: 'backlog', position: 4 }
    });
  });

  it('rejects an incomplete step order before writing', async () => {
    const prisma = {
      task: { findFirst: vi.fn().mockResolvedValue({ id: 'task_1' }) },
      subtask: {
        findMany: vi.fn().mockResolvedValue([{ id: 'step_1' }, { id: 'step_2' }]),
        update: vi.fn()
      },
      $transaction: vi.fn()
    };
    const service = new TaskService(prisma as never);

    await expect(service.reorderSubtasks(
      'task_1', ['step_1'], { clerkUserId: 'user_1' }
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
