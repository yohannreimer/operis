import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectNextMoveService } from './project-next-move-service.js';

function prismaMock() {
  const prisma = {
    project: { findFirst: vi.fn() },
    projectNextMove: {
      findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn()
    },
    task: { create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn()
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return prisma;
}

describe('ProjectNextMoveService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: ProjectNextMoveService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new ProjectNextMoveService(prisma as never);
  });

  it('resolves the active move before creating the replacement', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.projectNextMove.create.mockResolvedValue({ id: 'new', text: 'Validar preço', status: 'active' });

    await service.replaceActive('p1', { text: 'Validar preço', source: 'manual' }, 'user_1');

    expect(prisma.projectNextMove.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', status: 'active' },
      data: { status: 'resolved', resolvedAt: expect.any(Date) }
    });
    expect(prisma.projectNextMove.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'p1', text: 'Validar preço', source: 'manual' })
    });
  });

  it('reuses the linked task when a move is sent to today again', async () => {
    prisma.projectNextMove.findFirst.mockResolvedValue({
      id: 'm1', projectId: 'p1', taskId: 't1', idempotencyKey: 'key-1', text: 'Retomar cliente',
      project: { workspaceId: 'w1' }
    });
    prisma.task.update.mockResolvedValue({ id: 't1', status: 'hoje' });

    const result = await service.sendToToday('p1', 'm1', 'key-1', 'user_1');

    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'hoje' } });
    expect(result.task).toMatchObject({ id: 't1', status: 'hoje' });
  });

  it('creates and links a Today task when none exists', async () => {
    prisma.projectNextMove.findFirst.mockResolvedValue({
      id: 'm1', projectId: 'p1', taskId: null, idempotencyKey: null, text: 'Retomar Empresa Alfa',
      project: { workspaceId: 'w1' }
    });
    prisma.task.create.mockResolvedValue({ id: 't1', status: 'hoje' });
    prisma.projectNextMove.update.mockResolvedValue({ id: 'm1', taskId: 't1', idempotencyKey: 'key-2' });

    await service.sendToToday('p1', 'm1', 'key-2', 'user_1');

    expect(prisma.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      workspaceId: 'w1', projectId: 'p1', title: 'Retomar Empresa Alfa', status: 'hoje'
    }) });
    expect(prisma.projectNextMove.update).toHaveBeenCalledWith({
      where: { id: 'm1' }, data: { taskId: 't1', idempotencyKey: 'key-2' }
    });
  });

  it('resolves only a move owned by the signed-in user', async () => {
    prisma.projectNextMove.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.projectNextMove.update.mockResolvedValue({ id: 'm1', status: 'resolved' });

    await service.resolve('p1', 'm1', 'user_1');

    expect(prisma.projectNextMove.findFirst).toHaveBeenCalledWith({
      where: { id: 'm1', projectId: 'p1', project: { workspace: { clerkUserId: 'user_1' } } },
      select: { id: true }
    });
  });
});
