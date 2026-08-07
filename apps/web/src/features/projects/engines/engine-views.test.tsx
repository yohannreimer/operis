import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectCockpit } from '../types';
import { MetricEngine } from './metric-engine';
import { MilestoneEngine } from './milestone-engine';
import { PipelineEngine } from './pipeline-engine';
import { ExplorationEngine } from './exploration-engine';
import { FunnelEngine } from './funnel-engine';

const apiMock = vi.hoisted(() => ({
  getProjectScorecard: vi.fn(), createProjectMetricCheckin: vi.fn(), createProjectFrameworkCheckin: vi.fn(),
  updateProject: vi.fn(), updateMethodologyItem: vi.fn(), addMethodologyItem: vi.fn(), deleteMethodologyItem: vi.fn()
}));
vi.mock('../../../api', async () => {
  const actual = await vi.importActual('../../../api');
  return { ...actual, api: apiMock };
});

const workspace = { id: 'w1', name: 'Prymeira Digital', type: 'empresa' as const };
function cockpit(methodology: ProjectCockpit['engine']['methodology'], data: ProjectCockpit['engine']['data']): ProjectCockpit {
  return {
    id: 'p1', title: 'Projeto teste', objective: 'Chegar ao resultado', workspace,
    intentLabel: 'Atingir uma meta', methodLabel: '4DX', persistedStatus: 'ativo', operationalState: 'moving',
    timeHorizonEnd: null, progress: { kind: 'percent', value: 40, label: '40 de 100' }, primaryBlocker: null,
    activeMove: null, recommendation: null, engine: { key: 'metric', methodology, data, recovered: false }, tasks: []
  };
}

describe('project engine views', () => {
  beforeEach(() => {
    Object.values(apiMock).forEach((mock) => mock.mockReset());
    apiMock.getProjectScorecard.mockResolvedValue({
      project: { id: 'p1', weekStart: '2026-08-03' },
      metrics: [
        { id: 'lead-1', projectId: 'p1', kind: 'lead', name: 'Conversas por semana', currentValue: 4, targetValue: 5, weekChecked: true, weekCheckin: null, latestCheckin: null, history: [] },
        { id: 'lag-1', projectId: 'p1', kind: 'lag', name: 'Receita', currentValue: 40, targetValue: 100, weekChecked: true, weekCheckin: null, latestCheckin: null, history: [] }
      ],
      summary: { leadMetricsCount: 1, lagMetricsCount: 1, weeklyLeadCompliancePercent: 80, weeklyCheckinsMissing: 0, lagProgressPercent: 40, lastScorecardCheckinAt: null, cadenceDays: 7, isWeeklyCheckinMissing: false },
      framework: { methodology: 'fourdx', guide: '', board: { chartFamily: 'line', xAxis: '', yAxis: '' }, cards: [], rituals: [], weekly: null }
    });
  });

  it('renders 4DX pace and opens a scorecard check-in', async () => {
    const project = cockpit('fourdx', { blockers: [] });
    render(<MetricEngine project={project} data={project.engine.data} onReload={vi.fn()} />);
    expect(await screen.findByText(/ritmo esperado/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /registrar check-in/i }));
    expect(await screen.findByLabelText(/valor atual/i)).toBeVisible();
  });

  it('toggles a milestone without replacing the full methodology object', async () => {
    apiMock.updateMethodologyItem.mockResolvedValue({});
    const data = { milestones: [{ id: 'm1', title: 'Backend concluído', done: false, order: 1 }], blockers: [] };
    const project = { ...cockpit('entrega', data), methodLabel: 'Marcos', engine: { key: 'milestone', methodology: 'entrega' as const, data, recovered: false } };
    render(<MilestoneEngine project={project} data={data} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Backend concluído' }));
    await waitFor(() => expect(apiMock.updateMethodologyItem).toHaveBeenCalledWith('p1', 'm1', { arrayKey: 'milestones', item: { done: true } }));
  });

  it('moves a deal between pipeline stages', async () => {
    apiMock.updateMethodologyItem.mockResolvedValue({});
    const data = {
      stages: [{ id: 'open', label: 'Aberto', order: 1 }, { id: 'closed', label: 'Fechado', order: 2 }],
      deals: [{ id: 'd1', name: 'Empresa Alfa', stageId: 'open', amount: 12000, probability: 50, createdAt: '2026-08-01' }]
    };
    const project = { ...cockpit('pipeline', data), engine: { key: 'pipeline', methodology: 'pipeline' as const, data, recovered: false } };
    render(<PipelineEngine project={project} data={data} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /mover Empresa Alfa/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fechado' }));
    await waitFor(() => expect(apiMock.updateMethodologyItem).toHaveBeenCalledWith('p1', 'd1', { arrayKey: 'deals', item: expect.objectContaining({ stageId: 'closed' }) }));
  });

  it('opens evidence capture for an exploration project', () => {
    const data = { hypothesis: 'Clientes pagam por auditoria', hypothesisCriteria: '3 pré-vendas', discoveries: [], blockers: [] };
    const project = { ...cockpit('exploracao', data), engine: { key: 'exploration', methodology: 'exploracao' as const, data, recovered: false } };
    render(<ExplorationEngine project={project} data={data} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /registrar evidência/i }));
    expect(screen.getByRole('dialog', { name: /nova evidência/i })).toBeVisible();
  });

  it('updates a funnel stage without replacing the funnel', async () => {
    apiMock.updateMethodologyItem.mockResolvedValue({});
    const data = { funilStages: [{ id: 'visits', label: 'Visitas', value: 100, order: 1 }, { id: 'sales', label: 'Vendas', value: 10, order: 2 }] };
    const project = { ...cockpit('funil', data), engine: { key: 'funnel', methodology: 'funil' as const, data, recovered: false } };
    render(<FunnelEngine project={project} data={data} onReload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/valor de vendas/i), { target: { value: '12' } });
    fireEvent.blur(screen.getByLabelText(/valor de vendas/i));
    await waitFor(() => expect(apiMock.updateMethodologyItem).toHaveBeenCalledWith('p1', 'sales', { arrayKey: 'funilStages', item: { value: 12 } }));
  });
});
