import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectExecutionListItem } from './types';
import { ProjectList } from './project-list';

const base = {
  description: null, objective: 'Validar uma oferta repetível', persistedStatus: 'ativo',
  operationalState: 'moving', timeHorizonEnd: null, primaryMetric: null,
  resultStartValue: null, resultCurrentValue: null, resultTargetValue: null,
  progress: { kind: 'phase', value: 'pipeline', label: '3 oportunidades' }, primaryBlocker: null,
  recommendation: null, tasks: [], engine: { key: 'pipeline', methodology: 'pipeline', data: {}, recovered: false }
} as const;

const projectRows: ProjectExecutionListItem[] = [{
  ...base,
  id: 'p1', title: 'Nova oferta recorrente', intentLabel: 'Vender', methodLabel: 'Pipeline',
  workspace: { id: 'w1', name: 'Prymeira Digital', type: 'empresa', color: '#f97316' },
  activeMove: { id: 'm1', projectId: 'p1', text: 'Validar oferta e preço com 5 clientes', source: 'manual', status: 'active' }
}];

describe('ProjectList', () => {
  it('groups active projects by front and exposes the next movement', () => {
    render(<MemoryRouter><ProjectList projects={projectRows} filters={{ search: '', workspaceId: '', state: 'active' }} onFiltersChange={vi.fn()} onNewProject={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Prymeira Digital' })).toBeVisible();
    expect(screen.getByText('Validar oferta e preço com 5 clientes')).toBeVisible();
    expect(screen.getByText('Vender · Pipeline')).toBeVisible();
  });

  it('shows a useful empty state for the selected front', () => {
    const onNewProject = vi.fn();
    render(<MemoryRouter><ProjectList projects={[]} filters={{ search: '', workspaceId: 'w1', state: 'active' }} onFiltersChange={vi.fn()} onNewProject={onNewProject} /></MemoryRouter>);
    const create = screen.getByRole('button', { name: 'Novo Projeto' });
    expect(create).toHaveTextContent('Novo Projeto');
    fireEvent.click(create);
    expect(onNewProject).toHaveBeenCalled();
    expect(screen.getByText(/nenhum projeto corresponde/i)).toBeVisible();
  });

  it('filters attention states without hiding the controls', () => {
    const onFiltersChange = vi.fn();
    render(<MemoryRouter><ProjectList projects={projectRows} filters={{ search: '', workspaceId: '', state: 'active' }} onFiltersChange={onFiltersChange} onNewProject={vi.fn()} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/estado dos projetos/i), { target: { value: 'attention' } });
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ state: 'attention' }));
  });
});
