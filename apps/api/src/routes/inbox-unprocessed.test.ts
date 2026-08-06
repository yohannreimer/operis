import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerInboxRoutes } from './inbox.js';

vi.mock('../middleware/auth.js', () => ({
  getUserId: () => 'user_1'
}));

describe('GET /inbox?view=unprocessed', () => {
  const app = Fastify();
  const prisma = {
    inboxItem: { findMany: vi.fn().mockResolvedValue([]) },
    inboxContext: { findMany: vi.fn().mockResolvedValue([]) }
  };

  registerInboxRoutes(app, prisma as never);

  afterEach(async () => {
    await app.close();
  });

  it('returns only pending items without an allocation on the requested date', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/inbox?view=unprocessed&date=2026-08-05'
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.inboxItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clerkUserId: 'user_1',
        status: 'pendente',
        dailyExecutionItems: {
          none: {
            clerkUserId: 'user_1',
            date: new Date('2026-08-05T00:00:00.000Z')
          }
        }
      })
    }));
  });
});
