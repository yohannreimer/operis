import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as registry from './engine-registry';
import { ProjectShell } from './project-shell';
import { cockpitFixture } from './project-test-fixtures';

const apiMock = vi.hoisted(() => ({
  updateProject: vi.fn(), deleteProject: vi.fn(), createProjectNextMove: vi.fn(),
  sendProjectMoveToToday: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), completeTask: vi.fn()
}));
vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, api: apiMock };
});

describe('ProjectShell', () => {
  beforeEach(() => Object.values(apiMock).forEach((mock) => mock.mockReset()));
  afterEach(() => vi.restoreAllMocks());

  it('keeps the next move visible and renders the selected engine', () => {
    render(<MemoryRouter><ProjectShell project={cockpitFixture} onReload={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Retomar Empresa Alfa')).toBeVisible();
    expect(screen.getByText('Empresa Alfa está há 5 dias sem avançar.')).toBeVisible();
    expect(screen.getByRole('button', { name: /tarefas · 4/i })).toBeVisible();
  });

  it('contains an engine render failure without blanking the shell', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const definition = registry.getEngineDefinition('pipeline');
    vi.spyOn(registry, 'getEngineDefinition').mockReturnValue({ ...definition, View: () => { throw new Error('bad data'); } });
    render(<MemoryRouter><ProjectShell project={cockpitFixture} onReload={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: cockpitFixture.title })).toBeVisible();
    expect(screen.getByText(/não foi possível abrir este motor/i)).toBeVisible();
  });

  it('offers an explicit repair for recovered methodology data', async () => {
    apiMock.updateProject.mockResolvedValue({});
    render(<MemoryRouter><ProjectShell project={{ ...cockpitFixture, engine: { ...cockpitFixture.engine, recovered: true } }} onReload={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /reparar dados do motor/i }));
    await waitFor(() => expect(apiMock.updateProject).toHaveBeenCalledWith('p1', { methodologyData: cockpitFixture.engine.data }));
  });

  it.each(['delivery', 'launch', 'discovery', 'growth', 'processo'] as const)('opens legacy methodology %s without blanking the shell', (methodology) => {
    const data = methodology === 'processo'
      ? { cycleTemplate: [{ id: 'item-1', text: 'Fechar mês', order: 1 }], cycles: [{ id: 'cycle-1', periodLabel: 'Agosto', startDate: '2026-08-01', items: [{ templateId: 'item-1', done: false }] }] }
      : cockpitFixture.engine.data;
    render(<MemoryRouter><ProjectShell project={{ ...cockpitFixture, engine: { ...cockpitFixture.engine, methodology, data, recovered: true } }} onReload={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: cockpitFixture.title })).toBeVisible();
    expect(screen.queryByText(/erro interno/i)).not.toBeInTheDocument();
  });
});
