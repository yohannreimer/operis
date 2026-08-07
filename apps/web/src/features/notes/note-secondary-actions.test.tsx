import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Note } from '../../api';
import { FolderFilterStrip } from './folder-filter-strip';
import { NoteActionsMenu } from './note-actions-menu';
import { NoteDetailsPanel } from './note-details-panel';

const apiMock = vi.hoisted(() => ({
  getNoteFolders: vi.fn(),
  getWorkspaces: vi.fn(),
  getProjects: vi.fn(),
  getTasks: vi.fn(),
  createNoteFolder: vi.fn(),
  updateNoteFolder: vi.fn(),
  deleteNoteFolder: vi.fn()
}));
vi.mock('../../api', () => ({ api: apiMock }));

const note: Note = {
  id: 'note-1', title: 'Funil', editVersion: 1, type: 'geral', tags: [], pinned: false,
  folderId: null, workspaceId: null, projectId: null, taskId: null,
  createdAt: '2026-08-07T10:00:00.000Z', updatedAt: '2026-08-07T10:00:00.000Z'
};

describe('secondary note workflows', () => {
  it('keeps templates, revisions, dictation and all export formats in the action menu', () => {
    const onOpenTemplates = vi.fn();
    const onOpenHistory = vi.fn();
    const onStartDictation = vi.fn();
    const onExport = vi.fn();
    render(
      <NoteActionsMenu
        note={note}
        onPin={vi.fn()}
        onOpenTemplates={onOpenTemplates}
        onOpenHistory={onOpenHistory}
        onStartDictation={onStartDictation}
        onExport={onExport}
        onArchive={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Histórico e checkpoints' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ditado' }));
    for (const label of ['Copiar', 'TXT', 'PDF', 'WhatsApp']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }

    expect(onOpenTemplates).toHaveBeenCalledOnce();
    expect(onOpenHistory).toHaveBeenCalledOnce();
    expect(onStartDictation).toHaveBeenCalledOnce();
    expect(onExport.mock.calls.map(([format]) => format)).toEqual(['copy', 'txt', 'pdf', 'whatsapp']);
  });

  it('edits folder, tags, type and optional operational links', async () => {
    apiMock.getNoteFolders.mockResolvedValue([{ id: 'folder-1', name: 'Vendas', parentId: null }]);
    apiMock.getWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Negócios' }]);
    apiMock.getProjects.mockResolvedValue([{ id: 'project-1', title: 'Pipeline', workspaceId: 'ws-1' }]);
    apiMock.getTasks.mockResolvedValue([{ id: 'task-1', title: 'Revisar proposta', projectId: 'project-1' }]);
    const onChange = vi.fn();
    render(<NoteDetailsPanel note={note} onChange={onChange} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('option', { name: 'Vendas' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'produto' } });
    fireEvent.change(screen.getByLabelText('Pasta'), { target: { value: 'folder-1' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'vendas, reunião' } });
    fireEvent.change(screen.getByLabelText(/Frente/), { target: { value: 'ws-1' } });

    expect(onChange).toHaveBeenCalledWith({ type: 'produto' });
    expect(onChange).toHaveBeenCalledWith({ folderId: 'folder-1' });
    expect(onChange).toHaveBeenCalledWith({ tags: ['vendas', 'reunião'] });
    expect(onChange).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
  });

  it('opens folder management with nested creation and maintenance actions', () => {
    render(
      <FolderFilterStrip
        controller={{
          folders: [{
            id: 'folder-1', name: 'Vendas', parentId: null, sortOrder: 0,
            createdAt: '2026-08-07T10:00:00.000Z', updatedAt: '2026-08-07T10:00:00.000Z'
          }],
          foldersError: null,
          selectedView: 'recent',
          setSelectedView: vi.fn(),
          reload: vi.fn()
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar pastas' }));
    expect(screen.getByRole('dialog', { name: 'Gerenciar pastas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova pasta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renomear Vendas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar Vendas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover Vendas para cima' })).toBeInTheDocument();
  });
});
