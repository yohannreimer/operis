import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note, NoteFolder, NoteSummary } from '../../api';
import { useNotesLibrary } from './use-notes-library';

const apiMock = vi.hoisted(() => ({
  getNotesLibrary: vi.fn(),
  getNoteFolders: vi.fn()
}));
vi.mock('../../api', () => ({ api: apiMock }));

const folder: NoteFolder = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Vendas',
  parentId: null,
  sortOrder: 0,
  createdAt: '2026-08-07T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z'
};
const row: NoteSummary = {
  id: 'note-1',
  title: 'Funil',
  excerpt: 'Resumo',
  editVersion: 1,
  type: 'geral',
  tags: [],
  pinned: false,
  folderId: null,
  createdAt: '2026-08-07T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z',
  folder: null
};

describe('useNotesLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getNotesLibrary.mockResolvedValue([row]);
    apiMock.getNoteFolders.mockResolvedValue([folder]);
  });

  it('keeps notes and folder failures independent', async () => {
    apiMock.getNotesLibrary.mockRejectedValue(new Error('notas offline'));
    const { result } = renderHook(() => useNotesLibrary());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notesError).toBe('notas offline');
    expect(result.current.foldersError).toBeNull();
    expect(result.current.folders).toEqual([folder]);
  });

  it('maps synthetic views and concrete folder selection to the API contract', async () => {
    const { result } = renderHook(() => useNotesLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSelectedView('inbox'));
    await waitFor(() => expect(apiMock.getNotesLibrary).toHaveBeenCalledWith({ view: 'inbox' }));

    act(() => result.current.setSelectedView(folder.id));
    await waitFor(() =>
      expect(apiMock.getNotesLibrary).toHaveBeenCalledWith({ folderId: folder.id })
    );
  });

  it('debounces search, preserves successful rows on failure and prepends captures', async () => {
    const { result } = renderHook(() => useNotesLibrary());
    await waitFor(() => expect(result.current.rows).toEqual([row]));
    apiMock.getNotesLibrary.mockRejectedValueOnce(new Error('busca offline'));

    act(() => result.current.setQuery('pipeline'));
    expect(apiMock.getNotesLibrary).not.toHaveBeenCalledWith({ view: 'recent', q: 'pipeline' });
    await waitFor(
      () => expect(result.current.notesError).toBe('busca offline'),
      { timeout: 1_000 }
    );
    expect(result.current.rows).toEqual([row]);

    const captured: Note = {
      id: 'note-2',
      title: 'Nova ideia',
      contentText: 'Corpo da ideia',
      editVersion: 1,
      type: 'geral',
      tags: [],
      pinned: false,
      folderId: null,
      createdAt: '2026-08-07T12:00:00.000Z',
      updatedAt: '2026-08-07T12:00:00.000Z'
    };
    act(() => result.current.addCaptured(captured));
    expect(result.current.rows[0]).toMatchObject({ id: 'note-2', excerpt: 'Corpo da ideia' });
  });
});
