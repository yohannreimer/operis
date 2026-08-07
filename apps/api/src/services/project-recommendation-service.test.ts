import { describe, expect, it } from 'vitest';

import { normalizeProjectEngine } from '../domain/project-engine-domain.js';
import {
  getProjectRecommendation,
  type RecommendationContext
} from './project-recommendation-service.js';

const now = new Date('2026-08-06T12:00:00.000Z');

function context(
  methodology: string,
  data: Record<string, unknown>,
  overrides: Partial<RecommendationContext> = {}
): RecommendationContext {
  const normalized = normalizeProjectEngine(methodology, data);
  return {
    now,
    project: {
      id: 'p1',
      methodology,
      status: 'ativo',
      timeHorizonEnd: null,
      lastScorecardCheckinAt: null,
      scorecardCadenceDays: 7,
      updatedAt: '2026-08-05T12:00:00.000Z'
    },
    data: normalized.data,
    activeMove: null,
    tasks: [],
    ...overrides
  };
}

describe('global recommendation precedence', () => {
  it('prefers a critical blocker over a stalled deal', () => {
    const recommendation = getProjectRecommendation(context('pipeline', {
      blockers: [{ id: 'b1', title: 'Preço não validado', resolvedAt: null }],
      stages: [{ id: 's1', label: 'Proposta', order: 1 }],
      deals: [{
        id: 'd1', name: 'Empresa Alfa', stageId: 's1', amount: 8500,
        createdAt: '2026-07-20T12:00:00.000Z', stageEnteredAt: '2026-07-20T12:00:00.000Z'
      }]
    }));

    expect(recommendation).toMatchObject({
      ruleKey: 'global.critical-blocker',
      text: 'Resolver: Preço não validado',
      severity: 'critical'
    });
  });

  it('keeps an active move instead of inventing another recommendation', () => {
    const recommendation = getProjectRecommendation(context('entrega', {
      milestones: [{ id: 'm1', title: 'Publicar', done: false }]
    }, {
      activeMove: { id: 'move-1', text: 'Revisar QA' }
    }));

    expect(recommendation).toBeNull();
  });

  it('prioritizes an overdue task before the engine rule', () => {
    const recommendation = getProjectRecommendation(context('okr', {
      krs: [{ id: 'kr1', description: 'Receita', currentValue: 10, targetValue: 100, confidence: 'baixa', order: 1 }]
    }, {
      tasks: [{ id: 't1', title: 'Atualizar proposta', status: 'backlog', dueDate: '2026-08-05T12:00:00.000Z' }]
    }));

    expect(recommendation?.ruleKey).toBe('global.overdue-task');
  });
});

describe('recommendations by engine', () => {
  it('recommends the oldest stalled pipeline deal with an explanation', () => {
    const recommendation = getProjectRecommendation(context('pipeline', {
      stages: [{ id: 's1', label: 'Proposta', order: 1 }],
      deals: [{
        id: 'd1', name: 'Empresa Alfa', stageId: 's1', amount: 8500,
        createdAt: '2026-07-20T12:00:00.000Z', stageEnteredAt: '2026-07-20T12:00:00.000Z'
      }]
    }));

    expect(recommendation).toMatchObject({
      ruleKey: 'pipeline.stalled-deal',
      text: 'Retomar Empresa Alfa',
      sourceId: 'd1'
    });
    expect(recommendation?.reason).toContain('17 dias');
  });

  it('asks for a 4DX check-in when cadence is overdue', () => {
    const recommendation = getProjectRecommendation(context('fourdx', {}, {
      project: {
        id: 'p1', methodology: 'fourdx', status: 'ativo', timeHorizonEnd: null,
        lastScorecardCheckinAt: '2026-07-28T12:00:00.000Z', scorecardCadenceDays: 7,
        updatedAt: '2026-08-05T12:00:00.000Z'
      }
    }));

    expect(recommendation?.ruleKey).toBe('fourdx.checkin-due');
  });

  it('selects the next critical milestone', () => {
    const recommendation = getProjectRecommendation(context('entrega', {
      milestones: [
        { id: 'm1', title: 'Revisar QA', done: false, critical: true, order: 2 },
        { id: 'm2', title: 'Ajustar copy', done: false, order: 1 }
      ]
    }));

    expect(recommendation).toMatchObject({ ruleKey: 'milestone.next-critical', sourceId: 'm1' });
  });

  it('asks for the next exploration evidence', () => {
    const recommendation = getProjectRecommendation(context('exploracao', {
      hypothesis: 'LinkedIn gera leads',
      hypothesisCriteria: '10 leads em 30 dias',
      discoveries: []
    }));

    expect(recommendation?.ruleKey).toBe('exploration.next-evidence');
  });

  it('selects the earliest unfinished campaign task', () => {
    const recommendation = getProjectRecommendation(context('campanha', {
      launchDate: '2026-08-18T12:00:00.000Z',
      dailyTasks: [
        { id: 'c2', date: '2026-08-08', text: 'Subir anúncios', done: false },
        { id: 'c1', date: '2026-08-07', text: 'Revisar checkout', done: false }
      ]
    }));

    expect(recommendation).toMatchObject({ ruleKey: 'campaign.next-critical', sourceId: 'c1' });
  });

  it('finds the first incompletely scored decision option', () => {
    const recommendation = getProjectRecommendation(context('decisao', {
      criteria: [{ id: 'speed', label: 'Velocidade', weight: 2 }],
      options: [{ id: 'agency', label: 'Agência', scores: {} }]
    }));

    expect(recommendation).toMatchObject({ ruleKey: 'decision.incomplete-option', sourceId: 'agency' });
  });

  it('prioritizes the lowest-confidence KR', () => {
    const recommendation = getProjectRecommendation(context('okr', {
      krs: [
        { id: 'kr1', description: 'Seguidores', currentValue: 500, targetValue: 1000, confidence: 'baixa', order: 1 },
        { id: 'kr2', description: 'Artigos', currentValue: 5, targetValue: 10, confidence: 'alta', order: 2 }
      ]
    }));

    expect(recommendation).toMatchObject({ ruleKey: 'okr.low-confidence', sourceId: 'kr1' });
  });
});

describe('advanced and legacy recommendations', () => {
  it.each([
    ['captacao', { stages: [], deals: [{ id: 'd1', name: 'Fundo A', stageId: 's1', amount: 100, probability: 50, createdAt: '2026-08-05' }], totalGoal: 1000 }, 'fundraising.weighted-forecast'],
    ['funil', { funilStages: [{ id: 's1', label: 'Visitas', value: 1000, order: 1 }, { id: 's2', label: 'Leads', value: 100, order: 2 }] }, 'funnel.conversion-drop'],
    ['runway', { availableCash: null, burnRateMonthly: null }, 'runway.refresh-inputs'],
    ['sistema_receita', { stages: [], deals: [], stageCriteria: [{ id: 'sc1', stageId: 's1', text: 'Validar oferta', done: false }] }, 'revenue.next-stage-criterion'],
    ['mentoria', { sessions: [{ id: 's1', date: '2026-08-01', learned: 'Foco', commitments: [{ id: 'cm1', text: 'Falar com clientes', done: false }] }] }, 'mentoring.pending-commitment'],
    ['autoridade', { milestones: [], proofs: [] }, 'authority.next-proof'],
    ['cenario', { scenarios: [{ id: 's1', label: 'Brasil' }], scenarioActions: [{ id: 'a1', text: 'Manter caixa', done: false, scenarioIds: ['s1'] }] }, 'scenario.no-regret-action'],
    ['processo', { cycleTemplate: [{ id: 'ct1', text: 'Conciliar contas', order: 1 }], cycles: [{ id: 'cy1', periodLabel: 'Semana', startDate: '2026-08-03', items: [{ templateId: 'ct1', done: false }] }] }, 'recurring.next-cycle-item']
  ])('supports %s with %s', (methodology, data, ruleKey) => {
    expect(getProjectRecommendation(context(methodology, data))?.ruleKey).toBe(ruleKey);
  });
});
