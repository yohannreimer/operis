import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installMockFetch } from '../../demo/mock-fetch';
import { NoteArtifactPage } from '../../pages/note-artifact';
import { NotasPage } from '../../pages/notas';

function NotesTestRouter({ initialEntries }: { initialEntries: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/notas" element={<NotasPage />} />
        <Route path="/notas/:noteId" element={<NotasPage />} />
        <Route path="/notas/:noteId/artifacts/:artifactId" element={<NoteArtifactPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('notes workspace route flow', () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    originalFetch = window.fetch;
    installMockFetch();
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('captures a note, opens the document and round-trips a visual artifact', async () => {
    render(<NotesTestRouter initialEntries={['/notas']} />);

    const capture = await screen.findByPlaceholderText('Capture uma ideia, frase ou lembrete…');
    fireEvent.change(capture, {
      target: { value: 'Reunião — funil de vendas. Mapear diagnóstico e próximos passos.' }
    });
    fireEvent.keyDown(capture, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir nota capturada' }));

    expect(await screen.findByRole('textbox', { name: 'Título da nota' })).toHaveValue('Reunião — funil de vendas.');
    fireEvent.click(screen.getByRole('button', { name: 'Inserir no documento' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagrama' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Título da nota' })).toBeVisible();
      expect(document.querySelector('.note-artifact-block')).not.toBeNull();
    });
    const artifactBlock = document.querySelector('.note-artifact-block')?.closest('[data-node-type="blockOuter"]');
    const continuationBlock = artifactBlock?.nextElementSibling;
    const continuation = continuationBlock?.querySelector<HTMLElement>('.bn-inline-content');
    expect(continuation).not.toBeNull();
    expect(continuation?.closest('.bn-editor')).toHaveFocus();

    fireEvent.click(await screen.findByRole('button', { name: /editar.*diagrama.*tela cheia/i }));
    const focusWorkspace = await screen.findByRole('main', { name: 'Editor visual em foco' });
    await waitFor(() => expect(focusWorkspace).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a nota' }));

    expect(await screen.findByRole('textbox', { name: 'Título da nota' })).toHaveValue('Reunião — funil de vendas.');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /editar.*diagrama.*tela cheia/i })).toBeVisible();
      const returnedArtifact = document.querySelector('.note-artifact-block')?.closest('[data-node-type="blockOuter"]');
      expect(returnedArtifact?.nextElementSibling?.querySelector('[data-content-type="paragraph"]')).not.toBeNull();
    });
  });
});
