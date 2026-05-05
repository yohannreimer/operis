import { describe, expect, it } from 'vitest';
import { accessibleNoteWhere } from './note-access-service.js';

describe('accessibleNoteWhere', () => {
  it('allows notes owned through workspace, folder, or direct user ownership', () => {
    expect(accessibleNoteWhere('user_123', { id: 'note_123' })).toEqual({
      id: 'note_123',
      AND: [
        {
          OR: [
            { workspace: { clerkUserId: 'user_123' } },
            { workspaceId: null, folder: { clerkUserId: 'user_123' } },
            { workspaceId: null, folderId: null, clerkUserId: 'user_123' }
          ]
        }
      ]
    });
  });

  it('preserves existing AND clauses while adding the shared ownership gate', () => {
    expect(
      accessibleNoteWhere('user_123', {
        archivedAt: null,
        AND: [{ type: 'conclusao_tarefa' }]
      })
    ).toEqual({
      archivedAt: null,
      AND: [
        { type: 'conclusao_tarefa' },
        {
          OR: [
            { workspace: { clerkUserId: 'user_123' } },
            { workspaceId: null, folder: { clerkUserId: 'user_123' } },
            { workspaceId: null, folderId: null, clerkUserId: 'user_123' }
          ]
        }
      ]
    });
  });
});
