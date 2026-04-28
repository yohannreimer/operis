import { describe, expect, it } from 'vitest';
import {
  hasNativeNoteSnapshotChanged,
  normalizeNativeNoteContent,
  validateBlockPayloadSize
} from './note-content-service.js';

describe('note-content-service', () => {
  it('normalizes native content and keeps legacy content compatible', () => {
    const result = normalizeNativeNoteContent({
      content: '<p>Legacy</p>',
      contentBlocks: [{ type: 'paragraph', content: 'Native' }],
      contentText: 'Native',
      contentHtml: '<p>Native</p>',
      contentVersion: 1
    });

    expect(result).toEqual({
      content: '<p>Native</p>',
      contentBlocks: [{ type: 'paragraph', content: 'Native' }],
      contentText: 'Native',
      contentHtml: '<p>Native</p>',
      contentVersion: 1
    });
  });

  it('falls back to legacy content when native fields are absent', () => {
    const result = normalizeNativeNoteContent({
      content: 'Plain note'
    });

    expect(result).toEqual({
      content: 'Plain note',
      contentBlocks: null,
      contentText: null,
      contentHtml: null,
      contentVersion: 1
    });
  });

  it('detects native block changes', () => {
    const changed = hasNativeNoteSnapshotChanged(
      {
        title: 'A',
        content: 'A',
        contentBlocks: [{ type: 'paragraph', content: 'A' }],
        contentText: 'A',
        contentHtml: '<p>A</p>',
        contentVersion: 1,
        type: 'geral',
        tags: [],
        pinned: false,
        folderId: null,
        workspaceId: null,
        projectId: null,
        taskId: null
      },
      {
        title: 'A',
        content: 'B',
        contentBlocks: [{ type: 'paragraph', content: 'B' }],
        contentText: 'B',
        contentHtml: '<p>B</p>',
        contentVersion: 1,
        type: 'geral',
        tags: [],
        pinned: false,
        folderId: null,
        workspaceId: null,
        projectId: null,
        taskId: null
      }
    );

    expect(changed).toBe(true);
  });

  it('does not detect native block changes for objects with different key order', () => {
    const changed = hasNativeNoteSnapshotChanged(
      {
        title: 'A',
        content: 'A',
        contentBlocks: [
          {
            type: 'paragraph',
            attrs: { level: 1, id: 'intro' },
            content: [{ text: 'A', marks: [{ type: 'bold', attrs: { inclusive: true, priority: 1 } }] }]
          }
        ],
        contentText: 'A',
        contentHtml: '<p>A</p>',
        contentVersion: 1,
        type: 'geral',
        tags: [],
        pinned: false,
        folderId: null,
        workspaceId: null,
        projectId: null,
        taskId: null
      },
      {
        title: 'A',
        content: 'A',
        contentBlocks: [
          {
            content: [{ marks: [{ attrs: { priority: 1, inclusive: true }, type: 'bold' }], text: 'A' }],
            attrs: { id: 'intro', level: 1 },
            type: 'paragraph'
          }
        ],
        contentText: 'A',
        contentHtml: '<p>A</p>',
        contentVersion: 1,
        type: 'geral',
        tags: [],
        pinned: false,
        folderId: null,
        workspaceId: null,
        projectId: null,
        taskId: null
      }
    );

    expect(changed).toBe(false);
  });

  it('rejects block payloads over the configured size', () => {
    expect(() => validateBlockPayloadSize([{ text: 'x'.repeat(1024) }], 100)).toThrow(
      'note_content_blocks_too_large'
    );
  });
});
