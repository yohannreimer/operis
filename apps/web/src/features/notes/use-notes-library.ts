import { useCallback, useEffect, useRef, useState } from 'react';

import { api, type Note, type NoteFolder, type NoteSummary } from '../../api';

export type NotesLibraryController = {
  rows: NoteSummary[];
  folders: NoteFolder[];
  selectedView: 'inbox' | 'pinned' | 'recent' | string;
  query: string;
  loading: boolean;
  notesError: string | null;
  foldersError: string | null;
  setSelectedView(value: string): void;
  setQuery(value: string): void;
  addCaptured(note: Note): void;
  reload(): Promise<void>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function noteSummary(note: Note): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    excerpt: (note.contentText ?? note.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
    editVersion: note.editVersion,
    type: note.type,
    tags: note.tags,
    pinned: note.pinned,
    folderId: note.folderId,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    folder: note.folder
      ? { id: note.folder.id, name: note.folder.name, parentId: note.folder.parentId }
      : null
  };
}

export function useNotesLibrary(): NotesLibraryController {
  const [rows, setRows] = useState<NoteSummary[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [selectedView, setSelectedView] = useState<string>('recent');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const loadFolders = useCallback(async () => {
    try {
      const result = await api.getNoteFolders();
      setFolders(result);
      setFoldersError(null);
    } catch (error) {
      setFoldersError(errorMessage(error, 'Não foi possível carregar as pastas.'));
    }
  }, []);

  const loadNotes = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const syntheticView = ['inbox', 'pinned', 'recent'].includes(selectedView);
    const request = {
      ...(syntheticView
        ? { view: selectedView as 'inbox' | 'pinned' | 'recent' }
        : { folderId: selectedView }),
      ...(debouncedQuery ? { q: debouncedQuery } : {})
    };
    setLoading(true);

    try {
      const result = await api.getNotesLibrary(request);
      if (sequence !== requestSequence.current) return;
      setRows(result);
      setNotesError(null);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setNotesError(errorMessage(error, 'Não foi possível carregar as notas.'));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [debouncedQuery, selectedView]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const reload = useCallback(async () => {
    await Promise.all([loadNotes(), loadFolders()]);
  }, [loadFolders, loadNotes]);

  const addCaptured = useCallback((note: Note) => {
    const summary = noteSummary(note);
    setRows((current) => [summary, ...current.filter((row) => row.id !== note.id)]);
  }, []);

  return {
    rows,
    folders,
    selectedView,
    query,
    loading,
    notesError,
    foldersError,
    setSelectedView,
    setQuery,
    addCaptured,
    reload
  };
}
