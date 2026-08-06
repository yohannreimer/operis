import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../infra/rabbit.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./strategic-decision-service.js', () => ({
  safeRecordStrategicDecisionEvent: vi.fn().mockResolvedValue(undefined)
}));

import { DayPlanService } from './day-plan-service.js';

const USER_ID = 'user_1';
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const INBOX_ID = '44444444-4444-4444-8444-444444444444';
const TASK_ID = '55555555-5555-4555-8555-555555555555';

const delegate = () => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn()
});

function createPrismaMock() {
  return {
    dayPlan: delegate(),
    dayPlanItem: delegate(),
    inboxItem: delegate(),
    task: delegate(),
    strategicDecisionEvent: delegate(),
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  };
}

const taskService = {
  complete: vi.fn(),
  notConfirmed: vi.fn(),
  postpone: vi.fn()
};

const service = (prisma: ReturnType<typeof createPrismaMock>) =>
  new DayPlanService(prisma as never, taskService as never);

function configuredTaskPrisma() {
  const prisma = createPrismaMock();
  prisma.dayPlan.findUnique.mockResolvedValue({ id: PLAN_ID, clerkUserId: USER_ID });
  prisma.task.findFirst.mockResolvedValue({
    id: TASK_ID,
    title: 'Curso',
    estimatedMinutes: 360,
    executionKind: 'construcao',
    workspaceId: 'workspace_1',
    projectId: null,
    workspace: { clerkUserId: USER_ID, name: 'Prymeira', mode: 'expansao' }
  });
  prisma.dayPlanItem.findMany.mockResolvedValue([]);
  prisma.dayPlanItem.create.mockResolvedValue({ id: ITEM_ID, taskId: TASK_ID, task: null });
  prisma.task.update.mockResolvedValue({ id: TASK_ID });
  return prisma;
}

function configuredOwnedItemPrisma() {
  const prisma = configuredTaskPrisma();
  prisma.dayPlanItem.findUnique.mockResolvedValue({
    id: ITEM_ID,
    dayPlanId: PLAN_ID,
    taskId: TASK_ID,
    inboxItemId: null,
    startTime: new Date('2026-08-06T09:00:00.000Z'),
    endTime: new Date('2026-08-06T10:00:00.000Z'),
    completedAt: null,
    blockType: 'task',
    dayPlan: { id: PLAN_ID, clerkUserId: USER_ID, date: new Date('2026-08-06T00:00:00.000Z') }
  });
  return prisma;
}

const taskBlock = (startTime: string) => ({
  clerkUserId: USER_ID,
  date: startTime.slice(0, 10),
  taskId: TASK_ID,
  startTime,
  endTime: new Date(new Date(startTime).getTime() + 60 * 60_000).toISOString(),
  blockType: 'task' as const
});

describe('DayPlanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules an owned inbox item without converting it', async () => {
    const prisma = createPrismaMock();
    prisma.inboxItem.findFirst.mockResolvedValue({ id: INBOX_ID, clerkUserId: USER_ID });
    prisma.dayPlan.findUnique.mockResolvedValue({ id: PLAN_ID, clerkUserId: USER_ID });
    prisma.dayPlanItem.findMany.mockResolvedValue([]);
    prisma.dayPlanItem.create.mockResolvedValue({
      id: ITEM_ID,
      inboxItemId: INBOX_ID,
      taskId: null,
      inboxItem: { id: INBOX_ID }
    });

    await service(prisma).addItem({
      clerkUserId: USER_ID,
      date: '2026-08-06',
      inboxItemId: INBOX_ID,
      startTime: '2026-08-06T14:00:00.000Z',
      endTime: '2026-08-06T14:15:00.000Z',
      blockType: 'task'
    });

    expect(prisma.dayPlanItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inboxItemId: INBOX_ID, taskId: null })
      })
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('keeps multiple pending blocks for the same task', async () => {
    const prisma = configuredTaskPrisma();

    await service(prisma).addItem(taskBlock('2026-08-06T09:00:00.000Z'));
    await service(prisma).addItem(taskBlock('2026-08-07T09:00:00.000Z'));

    expect(prisma.dayPlanItem.deleteMany).not.toHaveBeenCalled();
    expect(prisma.dayPlanItem.create).toHaveBeenCalledTimes(2);
  });

  it('moves a block into another day plan without changing its id', async () => {
    const prisma = configuredOwnedItemPrisma();
    prisma.dayPlan.findUnique.mockResolvedValue({
      id: TARGET_PLAN_ID,
      clerkUserId: USER_ID,
      date: new Date('2026-08-07T00:00:00.000Z')
    });
    prisma.dayPlanItem.update.mockResolvedValue({ id: ITEM_ID, dayPlanId: TARGET_PLAN_ID });

    await service(prisma).updateItem(
      ITEM_ID,
      {
        date: '2026-08-07',
        startTime: '2026-08-07T11:00:00.000Z',
        endTime: '2026-08-07T11:30:00.000Z'
      },
      USER_ID
    );

    expect(prisma.dayPlanItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ITEM_ID },
        data: expect.objectContaining({ dayPlanId: TARGET_PLAN_ID })
      })
    );
  });

  it('stores overlapping blocks so the client can present a conflict warning', async () => {
    const prisma = configuredTaskPrisma();
    prisma.dayPlanItem.findMany.mockResolvedValue([
      {
        id: 'fixed_1',
        blockType: 'fixed',
        startTime: new Date('2026-08-06T09:30:00.000Z'),
        endTime: new Date('2026-08-06T10:30:00.000Z')
      }
    ]);

    await expect(
      service(prisma).addItem(taskBlock('2026-08-06T09:00:00.000Z'))
    ).resolves.toEqual(expect.objectContaining({ id: ITEM_ID }));
  });

  it('rejects a work block without exactly one source', async () => {
    const prisma = createPrismaMock();

    await expect(
      service(prisma).addItem({
        clerkUserId: USER_ID,
        date: '2026-08-06',
        startTime: '2026-08-06T09:00:00.000Z',
        endTime: '2026-08-06T09:30:00.000Z',
        blockType: 'task'
      })
    ).rejects.toThrow('Bloco de trabalho precisa de uma única origem.');
  });

  it('completes one task block without completing the whole task', async () => {
    const prisma = createPrismaMock();
    prisma.dayPlanItem.findFirst.mockResolvedValue({ id: ITEM_ID });
    prisma.dayPlanItem.update.mockResolvedValue({
      id: ITEM_ID,
      taskId: TASK_ID,
      inboxItemId: null
    });

    await service(prisma).confirmDone(ITEM_ID, USER_ID);

    expect(prisma.dayPlanItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmationState: 'confirmed_done',
          completedAt: expect.any(Date)
        })
      })
    );
    expect(taskService.complete).not.toHaveBeenCalled();
  });

  it('completes the capture when its planned block is completed', async () => {
    const prisma = createPrismaMock();
    prisma.dayPlanItem.findFirst.mockResolvedValue({ id: ITEM_ID });
    prisma.dayPlanItem.update.mockResolvedValue({
      id: ITEM_ID,
      taskId: null,
      inboxItemId: INBOX_ID
    });

    await service(prisma).confirmDone(ITEM_ID, USER_ID);

    expect(prisma.inboxItem.update).toHaveBeenCalledWith({
      where: { id: INBOX_ID },
      data: { status: 'feito' }
    });
  });

  it('keeps the capture status in sync when completion is patched and undone', async () => {
    const prisma = createPrismaMock();
    prisma.dayPlanItem.findUnique.mockResolvedValue({
      id: ITEM_ID,
      dayPlanId: PLAN_ID,
      taskId: null,
      inboxItemId: INBOX_ID,
      startTime: new Date('2026-08-06T14:00:00.000Z'),
      endTime: new Date('2026-08-06T14:15:00.000Z'),
      completedAt: null,
      blockType: 'task',
      dayPlan: {
        id: PLAN_ID,
        clerkUserId: USER_ID,
        date: new Date('2026-08-06T00:00:00.000Z')
      }
    });
    prisma.inboxItem.findFirst.mockResolvedValue({ id: INBOX_ID });
    prisma.dayPlanItem.update
      .mockResolvedValueOnce({ id: ITEM_ID, taskId: null, inboxItemId: INBOX_ID })
      .mockResolvedValueOnce({ id: ITEM_ID, taskId: null, inboxItemId: INBOX_ID });

    await service(prisma).updateItem(
      ITEM_ID,
      { completedAt: '2026-08-06T14:10:00.000Z' },
      USER_ID
    );
    await service(prisma).updateItem(ITEM_ID, { completedAt: null }, USER_ID);

    expect(prisma.dayPlanItem.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          completedAt: new Date('2026-08-06T14:10:00.000Z'),
          confirmationState: 'confirmed_done'
        })
      })
    );
    expect(prisma.dayPlanItem.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          completedAt: null,
          confirmationState: 'pending'
        })
      })
    );
    expect(prisma.inboxItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: INBOX_ID },
      data: { status: 'feito' }
    });
    expect(prisma.inboxItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: INBOX_ID },
      data: { status: 'pendente' }
    });
  });
});
