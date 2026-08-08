import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, type NoteArtifact } from '../../api';
import { ArtifactBlock, ArtifactBlockProvider } from './artifact-block';

const diagramArtifact: NoteArtifact = {
  id: 'artifact-1',
  noteId: 'note-1',
  kind: 'diagram',
  title: 'Funil',
  data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  editVersion: 1,
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z'
};

afterEach(() => vi.restoreAllMocks());

describe('ArtifactBlock', () => {
  it('loads the referenced artifact once and opens it from the document', async () => {
    const onOpen = vi.fn();
    const getArtifact = vi.spyOn(api, 'getNoteArtifact').mockResolvedValue(diagramArtifact);
    render(
      <ArtifactBlockProvider noteId="note-1" onOpen={onOpen}>
        <ArtifactBlock artifactId="artifact-1" artifactKind="diagram" title="Funil" />
        <ArtifactBlock artifactId="artifact-1" artifactKind="diagram" title="Funil" />
      </ArtifactBlockProvider>
    );

    expect(screen.getAllByRole('status', { name: 'Carregando diagrama Funil' })).toHaveLength(2);
    expect(await screen.findAllByLabelText('Prévia do diagrama Funil')).toHaveLength(2);
    expect(getArtifact).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar diagrama Funil em tela cheia' })[0]);
    expect(onOpen).toHaveBeenCalledWith('artifact-1');
  });

  it('retries a failed artifact request', async () => {
    vi.spyOn(api, 'getNoteArtifact')
      .mockRejectedValueOnce(new Error('Falha temporária'))
      .mockResolvedValueOnce(diagramArtifact);

    render(
      <ArtifactBlockProvider noteId="note-1" onOpen={() => undefined}>
        <ArtifactBlock artifactId="artifact-1" artifactKind="diagram" title="Funil" />
      </ArtifactBlockProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar carregar diagrama Funil novamente' }));
    await waitFor(() => expect(screen.getByLabelText('Prévia do diagrama Funil')).toBeVisible());
    expect(api.getNoteArtifact).toHaveBeenCalledTimes(2);
  });
});
