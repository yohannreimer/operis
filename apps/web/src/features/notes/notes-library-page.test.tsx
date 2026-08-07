import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotesLibraryPage } from './notes-library-page';

const controller = vi.hoisted(() => ({
  rows: [
    {
      id: 'note-1',
      title: 'Funil de vendas',
      excerpt: 'Resumo da reunião comercial',
      editVersion: 1,
      type: 'geral',
      tags: [],
      pinned: false,
      folderId: null,
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:00:00.000Z',
      folder: null
    }
  ],
  folders: [
    {
      id: 'folder-1',
      name: 'Vendas',
      parentId: null,
      sortOrder: 0,
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:00:00.000Z'
    }
  ],
  selectedView: 'recent',
  query: '',
  loading: false,
  notesError: null as string | null,
  foldersError: null as string | null,
  setSelectedView: vi.fn(),
  setQuery: vi.fn(),
  addCaptured: vi.fn(),
  reload: vi.fn()
}));

vi.mock('./use-notes-library', () => ({ useNotesLibrary: () => controller }));
vi.mock('../../api', () => ({ api: { createNote: vi.fn() } }));

describe('NotesLibraryPage', () => {
  beforeEach(() => {
    controller.notesError = null;
    controller.foldersError = null;
  });

  it('composes capture, filters, search and a dense list without a permanent editor', () => {
    render(
      <MemoryRouter>
        <NotesLibraryPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Notas' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Capture uma ideia, frase ou lembrete…')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar em notas' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pastas de notas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Funil de vendas/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Conteúdo da nota' })).not.toBeInTheDocument();
  });

  it('keeps folder and note errors visible as separate resources', () => {
    controller.foldersError = 'Pastas indisponíveis';
    controller.notesError = 'Notas indisponíveis';
    render(
      <MemoryRouter>
        <NotesLibraryPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Pastas indisponíveis')).toBeInTheDocument();
    expect(screen.getByText('Notas indisponíveis')).toBeInTheDocument();
  });

  it('keeps templates behind Nova nota and long/date filters inside advanced search', () => {
    render(
      <MemoryRouter>
        <NotesLibraryPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Longas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Busca avançada' }));
    expect(screen.getByLabelText('Somente notas longas')).toBeInTheDocument();
    expect(screen.getByLabelText('Atualizadas depois de')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
    expect(screen.getByRole('dialog', { name: 'Escolher template' })).toBeInTheDocument();
  });
});
