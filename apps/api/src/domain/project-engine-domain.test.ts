import { describe, expect, it } from 'vitest';

import {
  deriveOperationalState,
  normalizeProjectEngine,
  projectProgress
} from './project-engine-domain.js';

describe('normalizeProjectEngine', () => {
  it('maps legacy delivery to milestone without losing data', () => {
    const result = normalizeProjectEngine('delivery', {
      milestones: [{ id: 'm1', title: 'Publicar', done: false }],
      customLegacyKey: 'preserved'
    });

    expect(result.engine).toBe('milestone');
    expect(result.methodology).toBe('entrega');
    expect(result.data.milestones).toHaveLength(1);
    expect(result.data.customLegacyKey).toBe('preserved');
    expect(result.recovered).toBe(false);
  });

  it('returns safe defaults for malformed pipeline JSON', () => {
    const result = normalizeProjectEngine('pipeline', {
      stages: 'invalid',
      deals: null
    });

    expect(result.data).toMatchObject({
      stages: [],
      deals: [],
      blockers: [],
      currency: 'BRL'
    });
    expect(result.recovered).toBe(true);
  });

  it.each([
    ['launch', 'campanha', 'campaign'],
    ['discovery', 'exploracao', 'exploration'],
    ['growth', 'exploracao', 'exploration']
  ])('maps legacy %s to %s', (legacy, canonical, engine) => {
    expect(normalizeProjectEngine(legacy, {})).toMatchObject({
      methodology: canonical,
      engine
    });
  });

  it('normalizes missing OKR values without throwing', () => {
    expect(normalizeProjectEngine('okr', { krs: [{ invalid: true }] })).toMatchObject({
      engine: 'okr',
      recovered: true,
      data: { krs: [] }
    });
  });
});

describe('projectProgress', () => {
  it('calculates milestone completion', () => {
    const engine = normalizeProjectEngine('entrega', {
      milestones: [
        { id: 'm1', title: 'Um', done: true },
        { id: 'm2', title: 'Dois', done: false }
      ]
    });

    expect(projectProgress({ methodology: 'entrega', data: engine.data })).toEqual({
      kind: 'percent',
      value: 50,
      label: '1 de 2 marcos'
    });
  });

  it('uses a phase for exploration instead of inventing a percentage', () => {
    const engine = normalizeProjectEngine('exploracao', {
      discoveries: [],
      decision: null
    });

    expect(projectProgress({ methodology: 'exploracao', data: engine.data })).toEqual({
      kind: 'phase',
      value: 'evidence',
      label: 'Coletando evidências'
    });
  });
});

describe('deriveOperationalState', () => {
  it('keeps persisted terminal and paused states ahead of derived signals', () => {
    expect(deriveOperationalState({ persistedStatus: 'concluido', hasCriticalBlocker: true, overdue: true, stalled: true })).toBe('completed');
    expect(deriveOperationalState({ persistedStatus: 'pausado', hasCriticalBlocker: true, overdue: true, stalled: true })).toBe('paused');
  });

  it('prioritizes blockers and risk for active projects', () => {
    expect(deriveOperationalState({ persistedStatus: 'ativo', hasCriticalBlocker: true, overdue: true, stalled: true })).toBe('blocked');
    expect(deriveOperationalState({ persistedStatus: 'ativo', hasCriticalBlocker: false, overdue: true, stalled: true })).toBe('at_risk');
    expect(deriveOperationalState({ persistedStatus: 'ativo', hasCriticalBlocker: false, overdue: false, stalled: true })).toBe('stalled');
  });
});
