import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUserId } from '../middleware/auth.js';
import {
  NoteArtifactService,
  NoteArtifactServiceError
} from '../services/note-artifact-service.js';
import { registerNoteArtifactRoutes } from './note-artifacts.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: vi.fn(() => 'user_1') }));

const noteId = '00000000-0000-4000-8000-000000000001';
const artifactId = '00000000-0000-4000-8000-000000000002';

function artifact(id: string, title: string, editVersion = 1) {
  return {
    id,
    noteId,
    kind: 'diagram' as const,
    title,
    data: {},
    editVersion,
    legacySource: null,
    legacyId: null,
    createdAt: new Date('2026-08-07T12:00:00.000Z'),
    updatedAt: new Date('2026-08-07T12:00:00.000Z')
  };
}

describe('note artifact routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(getUserId).mockReturnValue('user_1');
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('creates two diagrams for the same note', async () => {
    const create = vi
      .spyOn(NoteArtifactService.prototype, 'create')
      .mockResolvedValueOnce(artifact(artifactId, 'A'))
      .mockResolvedValueOnce(
        artifact('00000000-0000-4000-8000-000000000003', 'B')
      );
    const app = Fastify();
    registerNoteArtifactRoutes(app, {} as never);
    apps.push(app);

    const first = await app.inject({
      method: 'POST',
      url: `/notes/${noteId}/artifacts`,
      payload: { kind: 'diagram', title: 'A', data: {} }
    });
    const second = await app.inject({
      method: 'POST',
      url: `/notes/${noteId}/artifacts`,
      payload: { kind: 'diagram', title: 'B', data: {} }
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(create).toHaveBeenNthCalledWith(1, 'user_1', noteId, {
      kind: 'diagram',
      title: 'A',
      data: {}
    });
    expect(create).toHaveBeenNthCalledWith(2, 'user_1', noteId, {
      kind: 'diagram',
      title: 'B',
      data: {}
    });
  });

  it('returns 409 for a stale artifact version', async () => {
    vi.spyOn(NoteArtifactService.prototype, 'update').mockRejectedValue(
      new NoteArtifactServiceError('artifact_version_conflict', 409)
    );
    const app = Fastify();
    registerNoteArtifactRoutes(app, {} as never);
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}/artifacts/${artifactId}`,
      payload: { data: {}, baseVersion: 1 }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'artifact_version_conflict' });
  });

  it('validates UUID params before calling the service', async () => {
    const list = vi.spyOn(NoteArtifactService.prototype, 'list');
    const app = Fastify();
    registerNoteArtifactRoutes(app, {} as never);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/notes/not-a-uuid/artifacts' });

    expect(response.statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
});
