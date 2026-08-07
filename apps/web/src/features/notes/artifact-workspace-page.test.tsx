import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtifactWorkspacePage } from './artifact-workspace-page';

const apiMock = vi.hoisted(() => ({
  getNoteArtifact: vi.fn(),
  updateNoteArtifact: vi.fn()
}));
vi.mock('../../api', () => ({ api: apiMock }));

function CanvasMock({
  kind,
  onSave,
  registerFlush
}: {
  kind: string;
  onSave(data: Record<string, unknown>): Promise<void> | void;
  registerFlush?(flush: () => Promise<void>): void;
}) {
  useEffect(() => {
    registerFlush?.(async () => { await onSave({ changed: true }); });
  }, [onSave, registerFlush]);
  return <div data-testid={`${kind}-canvas`}>{kind}</div>;
}

vi.mock('../../components/diagram-canvas', () => ({
  DiagramCanvas: (props: Parameters<typeof CanvasMock>[0]) => <CanvasMock {...props} kind="diagram" />
}));
vi.mock('../../components/mindmap-canvas', () => ({
  MindMapCanvas: (props: Parameters<typeof CanvasMock>[0]) => <CanvasMock {...props} kind="mindmap" />
}));
vi.mock('../../components/whiteboard-canvas', () => ({
  WhiteboardCanvas: (props: Parameters<typeof CanvasMock>[0]) => <CanvasMock {...props} kind="whiteboard" />
}));

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/notas/note-1/artifacts/artifact-1']}>
      <Routes>
        <Route
          path="/notas/:noteId/artifacts/:artifactId"
          element={<ArtifactWorkspacePage noteId="note-1" artifactId="artifact-1" />}
        />
        <Route path="/notas/note-1" element={<div>Documento</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ArtifactWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getNoteArtifact.mockResolvedValue({
      id: 'artifact-1',
      noteId: 'note-1',
      kind: 'diagram',
      title: 'Funil',
      data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      editVersion: 1,
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:00:00.000Z'
    });
    apiMock.updateNoteArtifact.mockResolvedValue({
      id: 'artifact-1',
      noteId: 'note-1',
      kind: 'diagram',
      title: 'Funil',
      data: { changed: true },
      editVersion: 2,
      createdAt: '2026-08-07T10:00:00.000Z',
      updatedAt: '2026-08-07T10:01:00.000Z'
    });
  });

  it('renders a full-screen visual editor without the app navigation', async () => {
    renderWorkspace();
    const main = await screen.findByRole('main', { name: 'Editor visual em foco' });
    expect(main).toHaveClass('note-artifact-focus');
    expect(main).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(main).toHaveFocus());
    expect(screen.getByTestId('diagram-canvas')).toBeInTheDocument();
    expect(screen.queryByText('Hoje')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar para a nota' })).toBeInTheDocument();
  });

  it.each(['diagram', 'mindmap', 'whiteboard'] as const)('selects the %s adapter', async (kind) => {
    apiMock.getNoteArtifact.mockResolvedValueOnce({
      id: 'artifact-1', noteId: 'note-1', kind, title: null, data: {}, editVersion: 1,
      createdAt: '2026-08-07T10:00:00.000Z', updatedAt: '2026-08-07T10:00:00.000Z'
    });
    renderWorkspace();
    expect(await screen.findByTestId(`${kind}-canvas`)).toBeInTheDocument();
  });

  it('keeps focus mode open when flush fails and exposes both recovery choices', async () => {
    apiMock.updateNoteArtifact.mockRejectedValue(new Error('offline'));
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar para a nota' }));

    expect(await screen.findByText(/Não foi possível salvar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar com alterações pendentes' })).toBeInTheDocument();
    expect(screen.queryByText('Documento')).not.toBeInTheDocument();
  });

  it('uses Escape to return only when no dialog is open', async () => {
    renderWorkspace();
    await screen.findByTestId('diagram-canvas');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(apiMock.updateNoteArtifact).not.toHaveBeenCalled();
    expect(screen.queryByText('Documento')).not.toBeInTheDocument();

    dialog.remove();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(await screen.findByText('Documento')).toBeInTheDocument();
  });
});
