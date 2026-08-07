import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectWizard } from './project-wizard';

const apiMock = vi.hoisted(() => ({ createExecutionProject: vi.fn() }));
vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, api: apiMock };
});

const workspaces = [{ id: 'w1', name: 'Prymeira Digital', type: 'empresa' as const }];

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/projetos']}>
      <Routes>
        <Route path="/projetos" element={<ProjectWizard open workspaces={workspaces} onClose={vi.fn()} />} />
        <Route path="/projetos/:projectId" element={<h1>Projeto criado</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

function reachNextMoveStep() {
  fireEvent.click(screen.getByRole('button', { name: /escolher entregar algo/i }));
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
  fireEvent.change(screen.getByLabelText(/^nome do projeto/i), { target: { value: 'Novo site' } });
  fireEvent.change(screen.getByLabelText(/^direção do projeto/i), { target: { value: 'Publicar o novo site' } });
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
}

describe('ProjectWizard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    apiMock.createExecutionProject.mockReset();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  });

  it('walks through direction, setup and first movement', () => {
    renderWizard();
    expect(screen.getByRole('heading', { name: /o que você quer mover/i })).toBeVisible();
    reachNextMoveStep();
    expect(screen.getByRole('heading', { name: /qual é o primeiro movimento/i })).toBeVisible();
  });

  it('submits the movement destination and navigates only after project and movement exist', async () => {
    apiMock.createExecutionProject.mockResolvedValue({
      project: { id: 'p1' }, activeMove: { id: 'm1' }, task: { id: 't1' }
    });
    renderWizard();
    reachNextMoveStep();
    fireEvent.change(screen.getByLabelText(/primeiro movimento/i), { target: { value: 'Definir escopo' } });
    fireEvent.click(screen.getByLabelText(/mandar para hoje/i));
    fireEvent.click(screen.getByRole('button', { name: /criar projeto/i }));

    await waitFor(() => expect(apiMock.createExecutionProject).toHaveBeenCalledWith(
      expect.objectContaining({ nextMove: 'Definir escopo', nextMoveDestination: 'today' }),
      '11111111-1111-4111-8111-111111111111'
    ));
    expect(await screen.findByRole('heading', { name: 'Projeto criado' })).toBeVisible();
    expect(sessionStorage.getItem('operis:project-wizard-draft')).toBeNull();
  });

  it('keeps the same draft and creation key after a failed request', async () => {
    apiMock.createExecutionProject.mockRejectedValue(new Error('timeout'));
    renderWizard();
    reachNextMoveStep();
    fireEvent.change(screen.getByLabelText(/primeiro movimento/i), { target: { value: 'Definir escopo' } });
    fireEvent.click(screen.getByRole('button', { name: /criar projeto/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('timeout');
    const draft = JSON.parse(sessionStorage.getItem('operis:project-wizard-draft') ?? '{}');
    expect(draft).toMatchObject({
      creationKey: '11111111-1111-4111-8111-111111111111',
      values: { title: 'Novo site', nextMove: 'Definir escopo' }
    });
  });
});
