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

  it('returns lightweight rows for the notes library', async () => {
    const noteId = '00000000-0000-4000-8000-000000000001';
    const prisma = {
      note: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: noteId,
            title: 'Funil',
            contentText: 'Resumo',
            content: null,
            editVersion: 1,
            type: 'geral',
            tags: [],
            pinned: false,
            folderId: null,
            workspaceId: null,
            projectId: null,
            taskId: null,
            createdAt: new Date('2026-08-07T11:00:00.000Z'),
            updatedAt: new Date('2026-08-07T12:00:00.000Z')
          }
        ])
      }
    };
    const app = Fastify();
    registerNoteRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/notes/library?view=inbox' });
    const [libraryRow] = response.json();

    expect(response.statusCode).toBe(200);
    expect(libraryRow).toEqual(
      expect.objectContaining({ id: noteId, title: 'Funil', excerpt: 'Resumo', editVersion: 1 })
    );
    expect(libraryRow).not.toHaveProperty('contentBlocks');
  });

  it('returns a full note with lazily hydrated artifact blocks', async () => {
    const noteId = '00000000-0000-4000-8000-000000000001';
    const artifactId = '00000000-0000-4000-8000-000000000002';
    const prisma = {
      note: {
        findFirst: vi.fn().mockResolvedValue({
          id: noteId,
          title: 'Funil',
          contentBlocks: [{ id: 'p1', type: 'paragraph', content: 'Resumo' }],
          artifacts: [
            {
              id: artifactId,
              kind: 'diagram',
              title: 'Fluxo',
              editVersion: 1,
              updatedAt: new Date('2026-08-07T12:00:00.000Z')
            }
          ]
        })
      }
    };
    const app = Fastify();
    registerNoteRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: `/notes/${noteId}` });
    const detail = response.json();

    expect(response.statusCode).toBe(200);
    expect(detail).toEqual(
      expect.objectContaining({
        id: noteId,
        contentBlocks: expect.any(Array),
        artifacts: expect.any(Array)
      })
    );
    expect(detail.contentBlocks.at(-1)).toMatchObject({
      type: 'operisArtifact',
      props: { artifactId, artifactKind: 'diagram' }
    });
  });

  it('returns a conflict when saving from a stale note version', async () => {
    const noteId = '00000000-0000-4000-8000-000000000001';
    const prisma = {
      note: {
        findFirst: vi.fn().mockResolvedValue({
          id: noteId,
          title: 'Funil',
          content: null,
          contentBlocks: null,
          contentText: null,
          contentHtml: null,
          contentVersion: 1,
          editVersion: 2,
          type: 'geral',
          tags: [],
          pinned: false,
          folderId: null,
          workspaceId: null,
          projectId: null,
          taskId: null
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      }
    };
    const app = Fastify();
    registerNoteRoutes(app, prisma as never);
    apps.push(app);

    const staleResponse = await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}`,
      payload: { title: 'Funil novo', baseVersion: 1 }
    });

    expect(staleResponse.statusCode).toBe(409);
    expect(staleResponse.json()).toMatchObject({ error: 'note_version_conflict' });
  });

  it('includes embedded artifacts in a manual checkpoint', async () => {
    const noteId = '00000000-0000-4000-8000-000000000001';
    const artifactId = '00000000-0000-4000-8000-000000000002';
    const note = {
      id: noteId,
      title: 'Funil',
      content: null,
      contentBlocks: [],
      contentText: null,
      contentHtml: null,
      contentVersion: 1,
      editVersion: 1,
      type: 'geral',
      tags: [],
      pinned: false,
      folderId: null,
      workspaceId: null,
      projectId: null,
      taskId: null
    };
    const prisma = {
      note: { findFirst: vi.fn().mockResolvedValue(note) },
      noteArtifact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: artifactId,
            kind: 'diagram',
            title: 'Fluxo',
            data: { nodes: [] },
            editVersion: 1
          }
        ])
      },
      noteRevision: { create: vi.fn().mockResolvedValue({ id: 'revision_1' }) }
    };
    const app = Fastify();
    registerNoteRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/notes/${noteId}/revisions`,
      payload: { source: 'checkpoint' }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.noteRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        noteId,
        artifactSnapshots: {
          create: [
            expect.objectContaining({ artifactId, kind: 'diagram', data: { nodes: [] } })
          ]
        }
      })
    });
  });

  it('restores a note and its artifacts in one transaction', async () => {
    const noteId = '00000000-0000-4000-8000-000000000001';
    const revisionId = '00000000-0000-4000-8000-000000000004';
    const artifactId = '00000000-0000-4000-8000-000000000002';
    const current = {
      id: noteId,
      title: 'Atual',
      content: null,
      contentBlocks: [],
      contentText: null,
      contentHtml: null,
      contentVersion: 1,
      editVersion: 3,
      type: 'geral',
      tags: [],
      pinned: false,
      folderId: null,
      workspaceId: null,
      projectId: null,
      taskId: null
    };
    const revision = {
      id: revisionId,
      noteId,
      title: 'Versão anterior',
      content: 'Texto',
      contentBlocks: [{ type: 'paragraph', content: 'Texto' }],
      contentText: 'Texto',
      contentHtml: '<p>Texto</p>',
      contentVersion: 1,
      type: 'geral',
      tags: [],
      pinned: false,
      folderId: null,
      workspaceId: null,
      projectId: null,
      taskId: null,
      artifactSnapshots: [
        {
          artifactId,
          kind: 'diagram',
          title: 'Fluxo anterior',
          data: { nodes: [{ id: 'n1' }] },
          editVersion: 2
        }
      ]
    };
    const restored = { ...current, ...revision, editVersion: 4 };
    const tx = {
      note: {
        update: vi.fn().mockResolvedValue(restored),
        findUnique: vi.fn().mockResolvedValue({ ...restored, artifacts: revision.artifactSnapshots })
      },
      noteArtifact: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: artifactId,
              kind: 'diagram',
              title: 'Fluxo anterior',
              data: { nodes: [{ id: 'n1' }] },
              editVersion: 2
            }
          ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      noteRevision: { create: vi.fn().mockResolvedValue({ id: 'backup_1' }) }
    };
    const prisma = {
      note: { findFirst: vi.fn().mockResolvedValue(current) },
      noteRevision: { findFirst: vi.fn().mockResolvedValue(revision) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    };
    const app = Fastify();
    registerNoteRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/notes/${noteId}/revisions/${revisionId}/restore`
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.noteRevision.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ source: 'restore_backup' }) })
    );
    expect(tx.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: noteId },
        data: expect.objectContaining({ title: 'Versão anterior', editVersion: { increment: 1 } })
      })
    );
    expect(tx.noteArtifact.deleteMany).toHaveBeenCalledWith({ where: { noteId } });
    expect(tx.noteArtifact.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: artifactId,
          noteId,
          kind: 'diagram',
          data: { nodes: [{ id: 'n1' }] }
        })
      ]
    });
  });
});
