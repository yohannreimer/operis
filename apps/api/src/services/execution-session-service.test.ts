import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionSessionService } from './execution-session-service.js';

const USER_ID = 'user_1';
const INBOX_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

const executionDelegate = () => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn()
});

function executionPrisma() {
  return {
    inboxItem: executionDelegate(),
    task: executionDelegate(),
    dayPlanItem: executionDelegate(),
    dailyExecutionItem: executionDelegate(),
    executionSession: executionDelegate(),
    deepWorkSession: executionDelegate()
  };
}

const activeInboxSession = () => ({
  id: SESSION_ID,
  clerkUserId: USER_ID,
  dayPlanItemId: null,
  dailyExecutionItemId: null,
  taskId: null,
  inboxItemId: INBOX_ID,
  startedAt: new Date('2026-08-06T14:08:00.000Z'),
  endedAt: null,
  state: 'active',
  task: null,
  inboxItem: { id: INBOX_ID, content: 'Responder cliente' },
  dayPlanItem: null
});

const taskSource = () => ({ sourceType: 'task' as const, sourceId: TASK_ID });

function executionPrismaWithOwnedSession(startedAt: string) {
  const prisma = executionPrisma();
  prisma.executionSession.findFirst.mockResolvedValue({
    ...activeInboxSession(),
    startedAt: new Date(startedAt)
  });
  prisma.executionSession.update.mockResolvedValue({
    ...activeInboxSession(),
    endedAt: new Date('2026-08-06T14:21:00.000Z'),
    state: 'completed'
  });
  return prisma;
}

const service = (prisma: ReturnType<typeof executionPrisma>) =>
  new ExecutionSessionService(prisma as never);

describe('ExecutionSessionService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-06T14:21:00.000Z');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts an inbox session without creating a task', async () => {
    const prisma = executionPrisma();
    prisma.inboxItem.findFirst.mockResolvedValue({ id: INBOX_ID, clerkUserId: USER_ID });
    prisma.executionSession.findFirst.mockResolvedValue(null);
    prisma.deepWorkSession.findFirst.mockResolvedValue(null);
    prisma.executionSession.create.mockResolvedValue(activeInboxSession());

    await service(prisma).start(USER_ID, { sourceType: 'inbox', sourceId: INBOX_ID });

    expect(prisma.executionSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inboxItemId: INBOX_ID, taskId: null })
      })
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects a second active generic session', async () => {
    const prisma = executionPrisma();
    prisma.executionSession.findFirst.mockResolvedValue(activeInboxSession());

    await expect(service(prisma).start(USER_ID, taskSource())).rejects.toThrow(
      'Já existe uma execução ativa.'
    );
  });

  it('rejects a generic session while deep work is active', async () => {
    const prisma = executionPrisma();
    prisma.executionSession.findFirst.mockResolvedValue(null);
    prisma.deepWorkSession.findFirst.mockResolvedValue({ id: 'deep_1' });

    await expect(service(prisma).start(USER_ID, taskSource())).rejects.toThrow(
      'Já existe uma execução ativa.'
    );
  });

  it('stops with observed timestamps and does not complete the source', async () => {
    const prisma = executionPrismaWithOwnedSession('2026-08-06T14:08:00.000Z');

    await service(prisma).stop(USER_ID, SESSION_ID);

    expect(prisma.executionSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { endedAt: new Date('2026-08-06T14:21:00.000Z'), state: 'completed' }
      })
    );
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.inboxItem.update).not.toHaveBeenCalled();
  });

  it('returns an already stopped session without changing its observed end', async () => {
    const prisma = executionPrisma();
    const completed = {
      ...activeInboxSession(),
      state: 'completed',
      endedAt: new Date('2026-08-06T14:15:00.000Z')
    };
    prisma.executionSession.findFirst.mockResolvedValue(completed);

    await expect(service(prisma).stop(USER_ID, SESSION_ID)).resolves.toBe(completed);
    expect(prisma.executionSession.update).not.toHaveBeenCalled();
  });
});
