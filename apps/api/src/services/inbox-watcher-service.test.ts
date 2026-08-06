import { describe, expect, it, vi } from 'vitest';

import { InboxWatcherService } from './inbox-watcher-service.js';

function createWatcherPrismaMock() {
  return {
    inboxItem: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    inboxTodayItem: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'legacy_1', inboxItemId: 'inbox_1', completedAt: null }
      ]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    dailyExecutionItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    }
  };
}

describe('InboxWatcherService', () => {
  it('does not delete incomplete allocations from previous dates', async () => {
    const prisma = createWatcherPrismaMock();
    const watcher = new InboxWatcherService(prisma as never);

    await watcher.runOnce();

    expect(prisma.inboxItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'aguardando' })
    }));
    expect(prisma.inboxTodayItem.deleteMany).not.toHaveBeenCalled();
    expect(prisma.dailyExecutionItem.deleteMany).not.toHaveBeenCalled();
  });
});
