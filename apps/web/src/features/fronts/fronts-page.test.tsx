import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspacesPage } from '../../pages/workspaces';

const apiMock = vi.hoisted(() => ({
  getFrontsOverview: vi.fn(),
  getFrontOverview: vi.fn(),
  getResponsibilityReviews: vi.fn(),
  reviewResponsibility: vi.fn(),
  createResponsibility: vi.fn(),
  updateResponsibility: vi.fn(),
  pauseResponsibility: vi.fn(),
  archiveResponsibility: vi.fn(),
  getWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn()
}));

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, api: apiMock };
});

const responsibility = {
  id: 'r1', workspaceId: 'w1', title: 'Saúde dos clientes', expectedStandard: 'Clientes ativos e satisfeitos',
  cadence: 'weekly', cadenceIntervalDays: null, health: 'attention', nextCare: 'Revisar dois clientes em risco',
  nextReviewAt: '2026-08-06T12:00:00.000Z', lastReviewedAt: null, status: 'active', createdAt: '', updatedAt: ''
};

const detail = {
  id: 'w1', name: 'Prymeira Digital', type: 'empresa', mode: 'expansao', color: '#f97316',
  health: 'attention', activeProjects: 1,
  attention: { kind: 'responsibility', sourceId: 'r1', severity: 'attention', title: 'Saúde dos clientes', reason: 'Revisar dois clientes em risco' },
  projects: [{
    id: 'p1', title: 'Novo posicionamento', objective: 'Reposicionar a marca', methodology: 'entrega',
    canonicalMethodology: 'entrega', engine: 'milestone', status: 'ativo', operationalState: 'moving',
    timeHorizonEnd: null, progress: { kind: 'percent', value: 30, label: '1 de 3 marcos' },
    primaryBlocker: null, activeMove: { id: 'm1', text: 'Validar manifesto', source: 'manual', status: 'active' }, recommendation: null
  }],
  pausedProjects: [], responsibilities: [responsibility], capacity: { activeProjects: 1, todayTasks: 3 }
};

function renderPage(path = '/frentes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/frentes" element={<WorkspacesPage />} />
        <Route path="/frentes/:workspaceId" element={<WorkspacesPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Frentes execution page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FRONTS_PROJECTS_V2', 'true');
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear()
    });
    localStorage.clear();
    Object.values(apiMock).forEach((mock) => mock.mockReset());
    apiMock.getFrontsOverview.mockResolvedValue([
      { id: 'w1', name: 'Prymeira Digital', type: 'empresa', mode: 'expansao', color: '#f97316', health: 'attention', attention: detail.attention, activeProjects: 1 },
      { id: 'w2', name: 'Pessoal', type: 'pessoal', mode: 'manutencao', color: '#60a5fa', health: 'normal', attention: null, activeProjects: 0 }
    ]);
    apiMock.getFrontOverview.mockResolvedValue(detail);
    apiMock.getResponsibilityReviews.mockResolvedValue([]);
  });

  it('selects the highest-attention front and exposes its operational detail', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Nova Frente' })).toHaveTextContent('Nova Frente');
    expect(screen.getByRole('heading', { name: 'Prymeira Digital' })).toBeVisible();
    expect(screen.getByText('Revisar dois clientes em risco')).toBeVisible();
    expect(localStorage.getItem('operis:last-front-id')).toBe('w1');
  });

  it('reviews a responsibility and offers a Today task', async () => {
    apiMock.reviewResponsibility.mockResolvedValue({ responsibility, review: {}, task: { id: 't1' } });
    renderPage('/frentes/w1');
    fireEvent.click(await screen.findByRole('button', { name: /cuidar agora/i }));
    fireEvent.change(screen.getByLabelText(/próximo cuidado/i), { target: { value: 'Revisar inadimplência' } });
    fireEvent.click(screen.getByLabelText(/mandar para hoje/i));
    fireEvent.click(screen.getByRole('button', { name: /salvar revisão/i }));
    await waitFor(() => expect(apiMock.reviewResponsibility).toHaveBeenCalledWith(
      'r1', expect.objectContaining({ nextCare: 'Revisar inadimplência', createTask: 'today' })
    ));
  });

  it('keeps the care action available in the compact responsibility menu', async () => {
    renderPage('/frentes/w1');
    const menu = await screen.findByLabelText('Opções de Saúde dos clientes');
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('button', { name: /^cuidar$/i }));

    expect(screen.getByRole('dialog', { name: /cuidar de saúde dos clientes/i })).toBeVisible();
  });

  it('creates a responsibility with a valid cadence', async () => {
    apiMock.createResponsibility.mockResolvedValue({ ...responsibility, id: 'r2' });
    renderPage('/frentes/w1');
    fireEvent.click(await screen.findByRole('button', { name: /nova responsabilidade/i }));
    fireEvent.change(screen.getByLabelText(/^título/i), { target: { value: 'Saúde financeira' } });
    fireEvent.change(screen.getByLabelText(/padrão esperado/i), { target: { value: 'Manter seis meses de caixa' } });
    fireEvent.change(screen.getByLabelText(/próximo cuidado/i), { target: { value: 'Revisar fluxo de caixa' } });
    fireEvent.click(screen.getByRole('button', { name: /criar responsabilidade/i }));
    await waitFor(() => expect(apiMock.createResponsibility).toHaveBeenCalledWith(
      'w1', expect.objectContaining({ cadence: 'weekly', title: 'Saúde financeira' })
    ));
  });

  it('recovers the front rail after an initial request error', async () => {
    apiMock.getFrontsOverview.mockRejectedValueOnce(new Error('offline'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(await screen.findByRole('heading', { name: 'Prymeira Digital' })).toBeVisible();
    expect(apiMock.getFrontsOverview.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
