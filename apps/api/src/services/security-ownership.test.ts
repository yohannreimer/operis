import { describe, expect, it, vi } from 'vitest';
import { DayPlanService } from './day-plan-service.js';
import { DeepWorkService } from './deep-work-service.js';
import { TaskService } from './task-service.js';
import { WhatsappCommandService } from './whatsapp-command-service.js';

describe('multi-user ownership guards', () => {
  it('rejects task updates for tasks owned by another Clerk user', async () => {
    const prisma = {
      task: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({ id: 'task_1' })
      },
      workspace: { findFirst: vi.fn() },
      project: { findFirst: vi.fn() },
      executionEvent: { create: vi.fn() },
      strategicDecisionEvent: { create: vi.fn() }
    };
    const service = new TaskService(prisma as any);

    await expect(
      service.update('task_1', { title: 'Enviar proposta final' }, { clerkUserId: 'user_current' })
    ).rejects.toThrow('Tarefa não encontrada.');

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('rejects day plan item updates owned by another Clerk user', async () => {
    const taskService = {
      complete: vi.fn(),
      notConfirmed: vi.fn(),
      postpone: vi.fn()
    };
    const prisma = {
      dayPlanItem: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'item_1',
          dayPlanId: 'plan_1',
          taskId: null,
          startTime: new Date('2026-07-04T10:00:00.000Z'),
          endTime: new Date('2026-07-04T11:00:00.000Z'),
          blockType: 'fixed',
          dayPlan: { id: 'plan_1', clerkUserId: 'user_other' }
        }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({ id: 'item_1' })
      },
      dayPlan: { findUnique: vi.fn() },
      task: { findUnique: vi.fn(), update: vi.fn() }
    };
    const service = new DayPlanService(prisma as any, taskService as any);

    await expect(
      service.updateItem(
        'item_1',
        { startTime: '2026-07-04T12:00:00.000Z', endTime: '2026-07-04T13:00:00.000Z' },
        'user_current'
      )
    ).rejects.toThrow('Item de planejamento não encontrado.');

    expect(prisma.dayPlanItem.update).not.toHaveBeenCalled();
  });

  it('rejects deep work break updates for sessions owned by another Clerk user', async () => {
    const prisma = {
      deepWorkSession: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({ id: 'session_1' })
      }
    };
    const service = new DeepWorkService(prisma as any);

    await expect(service.registerBreak('session_1', 'user_current')).rejects.toThrow(
      'Sessão de Deep Work não encontrada.'
    );

    expect(prisma.deepWorkSession.update).not.toHaveBeenCalled();
  });

  it('scopes WhatsApp task lists to the linked Clerk user', async () => {
    const prisma = {
      task: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };
    const service = new WhatsappCommandService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    await service.handle('tarefas', 'user_current');

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspace: expect.objectContaining({ clerkUserId: 'user_current' })
        })
      })
    );
  });
});
