import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserId } from '../middleware/auth.js';
import { registerNoteRoutes } from './notes.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: vi.fn(() => 'user_1') }));
vi.mock('../config.js', () => ({
  env: {
    DEEPGRAM_API_KEY: '',
    DEEPGRAM_MODEL: 'nova-3',
    NOTES_TRANSCRIBE_WEBHOOK_URL: '',
    NOTES_TRANSCRIBE_WEBHOOK_SECRET: '',
    NOTES_TRANSCRIBE_TIMEOUT_MS: 30_000,
    OPENROUTER_API_KEY: '',
    OPENROUTER_CLEANUP_MODEL: 'openai/gpt-4o-mini',
    OPENROUTER_TRANSCRIBE_MODEL: 'openai/gpt-4o-mini-transcribe'
  }
}));

describe('notes workspace routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(getUserId).mockReturnValue('user_1');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('lists the signed-in user notes in the current route', async () => {
    const prisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: '00000000-0000-4000-8000-000000000001',
            title: 'Funil',
            contentText: 'Resumo',
            folderId: null
          }
        ])
      }
    };
    const app = Fastify();
    registerNoteRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/notes' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Funil'
      })
    ]);
    expect(prisma.note.findMany).toHaveBeenCalledOnce();
  });
});
