import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '../../api';
import { NoteWorkspacePage } from './note-workspace-page';

const apiMock = vi.hoisted(() => ({
  getNote: vi.fn(),
  updateNote: vi.fn(),
  createNoteRevision: vi.fn(),
  getNotesLibrary: vi.fn(),
  generateNoteArtifact: vi.fn()
}));
const saveState = vi.hoisted(() => ({
  status: 'idle',
  baseVersion: 1,
  draft: null,
  markDirty: vi.fn(),
  retry: vi.fn()
}));

vi.mock('../../api', () => ({ api: apiMock }));
vi.mock('./use-note-save-state', () => ({ useNoteSaveState: () => saveState }));
vi.mock('./note-document-editor', () => ({
  NoteDocumentEditor: ({ note }: { note: Note }) => (
    <div>
      <span data-testid="block-count">{note.contentBlocks?.length ?? 0}</span>
      <button type="button" data-block-id="return-block">Bloco de retorno</button>
    </div>
  )
}));

const note: Note = {
  id: 'note-1',
  title: 'Reunião',
  contentBlocks: [{ id: 'p1', type: 'paragraph', content: 'Texto' }],
  contentText: 'Texto',
  editVersion: 1,
  type: 'geral',
  tags: [],
  pinned: false,
  folderId: null,
  createdAt: '2026-08-07T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z',
  artifacts: [
    {
      id: 'artifact-1',
      noteId: 'note-1',
      kind: 'diagram',
      title: 'Funil',
      editVersion: 1,
      updatedAt: '2026-08-07T10:00:00.000Z'
    }
  ]
};

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/notas/note-1']}>
      <Routes>
        <Route path="/notas/:noteId" element={<NoteWorkspacePage noteId="note-1" />} />
        <Route path="/notas" element={<div>Biblioteca</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NoteWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveState.status = 'idle';
    apiMock.getNote.mockResolvedValue(note);
    apiMock.getNotesLibrary.mockResolvedValue([]);
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('loads full detail and hydrates a legacy artifact exactly once', async () => {
    renderWorkspace();

    expect(await screen.findByRole('heading', { name: 'Reunião' })).toBeInTheDocument();
    expect(apiMock.getNote).toHaveBeenCalledWith('note-1');
    expect(screen.getByTestId('block-count')).toHaveTextContent('2');
    expect(screen.queryByText('Detalhes da nota')).not.toBeInTheDocument();
    expect(screen.queryByText('Ações da nota')).not.toBeInTheDocument();
    const related = screen.getByText('Notas relacionadas').closest('details');
    expect(related).not.toHaveAttribute('open');
  });

  it.each([
    ['saving', 'Salvando'],
    ['saved', 'Salvo'],
    ['failed', 'Não salvo'],
    ['conflict', 'Conflito']
  ])('shows %s as %s in the topbar', async (status, label) => {
    saveState.status = status;
    renderWorkspace();
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('restores focus to the artifact opener block', async () => {
    sessionStorage.setItem(
      'operis.notes.return:note-1',
      JSON.stringify({ blockId: 'return-block' })
    );
    renderWorkspace();

    const block = await screen.findByRole('button', { name: 'Bloco de retorno' });
    await waitFor(() => expect(block).toHaveFocus());
    expect(sessionStorage.getItem('operis.notes.return:note-1')).toBeNull();
  });

  it('alerts and returns to the library when the note is missing', async () => {
    apiMock.getNote.mockRejectedValue(new Error('Nota não encontrada.'));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderWorkspace();

    expect(await screen.findByText('Biblioteca')).toBeInTheDocument();
    expect(alert).toHaveBeenCalledWith('Nota não encontrada.');
  });
});
