import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Note, NoteSummary } from '../../api';
import { FolderFilterStrip } from './folder-filter-strip';
import { NoteDocumentEditor } from './note-document-editor';
import { NotesList } from './notes-list';
import { QuickCapture } from './quick-capture';

vi.mock('../../api', () => ({
  api: {
    createNote: vi.fn(),
    createNoteArtifact: vi.fn(),
    deleteNoteArtifact: vi.fn(),
    createNoteFolder: vi.fn(),
    updateNoteFolder: vi.fn()
  }
}));

vi.mock('./editor', () => ({
  OperisBlockEditor: () => <div data-testid="block-editor">Editor</div>,
  serializeNoteBlocks: () => ({ text: '', html: '' })
}));

const note: Note = {
  id: 'note-1', title: 'Funil', editVersion: 1, type: 'geral', tags: [], pinned: false,
  folderId: null, workspaceId: null, projectId: null, taskId: null,
  contentBlocks: [], createdAt: '2026-08-07T10:00:00.000Z', updatedAt: '2026-08-07T10:00:00.000Z'
};

const row: NoteSummary = {
  id: note.id, title: note.title, excerpt: 'Uma nota', editVersion: 1, type: 'geral', tags: [],
  pinned: false, folderId: null, folder: null, createdAt: note.createdAt, updatedAt: note.updatedAt
};

describe('notes accessibility and responsive structure', () => {
  it('uses live status, navigation semantics and links for the library', () => {
    render(
      <MemoryRouter>
        <QuickCapture onCaptured={vi.fn()} />
        <FolderFilterStrip controller={{
          folders: [], foldersError: null, selectedView: 'recent',
          setSelectedView: vi.fn(), reload: vi.fn()
        }} />
        <NotesList rows={[row]} loading={false} error={null} query="" onRetry={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: 'Pastas de notas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Funil/ })).toHaveAttribute('href', '/notas/note-1');
    expect(screen.getByText(/Enter captura/).parentElement).toHaveAttribute('aria-live', 'polite');
  });

  it('gives icon-only controls names and keeps the compact insert control after the editor', () => {
    const { container } = render(
      <MemoryRouter>
        <NoteDocumentEditor note={note} onChange={vi.fn()} onOpenArtifact={vi.fn()} />
        <FolderFilterStrip controller={{
          folders: [{ ...row, name: 'Vendas', parentId: null, sortOrder: 0 }],
          foldersError: null, selectedView: 'recent', setSelectedView: vi.fn(), reload: vi.fn()
        }} />
      </MemoryRouter>
    );

    const editor = screen.getByTestId('block-editor');
    const insert = screen.getByRole('button', { name: 'Inserir no documento' });
    expect(editor.compareDocumentPosition(insert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    for (const button of Array.from(container.querySelectorAll('button'))) {
      if (!button.textContent?.trim()) expect(button).toHaveAccessibleName();
    }
  });
});
