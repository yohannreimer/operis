import { describe, expect, it, vi } from 'vitest';

import { MAX_NOTE_ARTIFACT_BYTES, NoteArtifactService } from './note-artifact-service.js';

const noteId = '00000000-0000-4000-8000-000000000001';
const artifactId = '00000000-0000-4000-8000-000000000002';

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: artifactId,
    noteId,
    kind: 'diagram',
    title: 'Funil',
    data: { nodes: [] },
    editVersion: 1,
    legacySource: null,
    legacyId: null,
    createdAt: new Date('2026-08-07T12:00:00.000Z'),
    updatedAt: new Date('2026-08-07T12:00:00.000Z'),
    ...overrides
  };
}

function prismaMock() {
  return {
    note: {
      findFirst: vi.fn().mockResolvedValue({ id: noteId })
    },
    noteArtifact: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(artifact()),
      findUnique: vi.fn().mockResolvedValue(artifact({ editVersion: 2 })),
      create: vi.fn().mockResolvedValue(artifact()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue(artifact())
    }
  };
}

describe('NoteArtifactService', () => {
  it('rejects artifact creation when the note is not owned by the user', async () => {
    const prisma = prismaMock();
    prisma.note.findFirst.mockResolvedValue(null);
    const service = new NoteArtifactService(prisma as never);

    await expect(
      service.create('user_1', noteId, { kind: 'diagram', title: 'Funil', data: {} })
    ).rejects.toMatchObject({ code: 'note_not_found', statusCode: 404 });
    expect(prisma.noteArtifact.create).not.toHaveBeenCalled();
  });

  it('rejects data above the artifact payload limit', async () => {
    const prisma = prismaMock();
    const service = new NoteArtifactService(prisma as never);

    await expect(
      service.create('user_1', noteId, {
        kind: 'whiteboard',
        data: { value: 'x'.repeat(MAX_NOTE_ARTIFACT_BYTES + 1) }
      })
    ).rejects.toMatchObject({ code: 'artifact_too_large', statusCode: 413 });
  });

  it('updates an artifact using optimistic concurrency', async () => {
    const prisma = prismaMock();
    const service = new NoteArtifactService(prisma as never);

    const result = await service.update('user_1', noteId, artifactId, {
      data: { nodes: [{ id: 'n1' }] },
      baseVersion: 1
    });

    expect(prisma.noteArtifact.updateMany).toHaveBeenCalledWith({
      where: { id: artifactId, noteId, editVersion: 1 },
      data: {
        data: { nodes: [{ id: 'n1' }] },
        editVersion: { increment: 1 }
      }
    });
    expect(result.editVersion).toBe(2);
  });

  it('returns a conflict when the base version is stale', async () => {
    const prisma = prismaMock();
    prisma.noteArtifact.updateMany.mockResolvedValue({ count: 0 });
    const service = new NoteArtifactService(prisma as never);

    await expect(
      service.update('user_1', noteId, artifactId, {
        data: { nodes: [] },
        baseVersion: 3
      })
    ).rejects.toMatchObject({ code: 'artifact_version_conflict', statusCode: 409 });
  });
});
