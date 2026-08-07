import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FrontOverviewService,
  selectPrimaryAttention
} from './front-overview-service.js';

const now = new Date('2026-08-06T12:00:00.000Z');

const frontFixture = {
  id: 'w1', name: 'Prymeira Digital', type: 'empresa', category: 'Empresa', mode: 'expansao', color: '#f97316',
  projects: [{
    id: 'p1', title: 'Novo site', methodology: 'entrega', status: 'ativo', objective: 'Publicar site',
    timeHorizonEnd: new Date('2026-08-05T12:00:00.000Z'), resultStartValue: null, resultCurrentValue: null,
    resultTargetValue: null, lastScorecardCheckinAt: null, scorecardCadenceDays: 7,
    updatedAt: new Date('2026-08-05T12:00:00.000Z'), methodologyData: { milestones: [] },
    tasks: [], nextMoves: []
  }],
  responsibilities: [{
    id: 'r1', title: 'Saúde financeira', health: 'critical', status: 'active',
    nextCare: 'Revisar caixa', nextReviewAt: new Date('2026-08-06T12:00:00.000Z'),
    expectedStandard: 'Seis meses de caixa', cadence: 'weekly', cadenceIntervalDays: null,
    lastReviewedAt: null, createdAt: now, updatedAt: now, archivedAt: null, workspaceId: 'w1'
  }],
  tasks: Array.from({ length: 7 }, (_, index) => ({ id: `t${index}` }))
};

describe('selectPrimaryAttention', () => {
  it('chooses critical severity before attention', () => {
    expect(selectPrimaryAttention([
      { kind: 'project', sourceId: 'p1', severity: 'attention', title: 'Projeto', reason: 'Atrasado' },
      { kind: 'responsibility', sourceId: 'r1', severity: 'critical', title: 'Financeiro', reason: 'Crítico' }
    ])).toMatchObject({ sourceId: 'r1', severity: 'critical' });
  });
});

describe('FrontOverviewService', () => {
  const prisma = {
    workspace: { findMany: vi.fn(), findFirst: vi.fn() }
  };
  let service: FrontOverviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FrontOverviewService(prisma as never);
  });

  it('chooses a critical responsibility before an at-risk project', async () => {
    prisma.workspace.findMany.mockResolvedValue([frontFixture]);
    const result = await service.list('user_1', now);
    expect(result[0].attention).toMatchObject({
      kind: 'responsibility', severity: 'critical', sourceId: 'r1'
    });
  });

  it('reports observable capacity without an overload score', async () => {
    prisma.workspace.findFirst.mockResolvedValue(frontFixture);
    const result = await service.detail('w1', 'user_1', now);
    expect(result.capacity).toEqual({ activeProjects: 1, todayTasks: 7 });
    expect(result.capacity).not.toHaveProperty('score');
    expect(result.health).toBe('critical');
  });
});
