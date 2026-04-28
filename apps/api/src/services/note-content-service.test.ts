import { describe, expect, it } from 'vitest';
import {
  hasNativeNoteSnapshotChanged,
  normalizeNativeNoteContent,
  validateBlockPayloadSize
} from './note-content-service';

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

  it('rejects block payloads over the configured size', () => {
    expect(() => validateBlockPayloadSize([{ text: 'x'.repeat(1024) }], 100)).toThrow(
      'note_content_blocks_too_large'
    );
  });
});
