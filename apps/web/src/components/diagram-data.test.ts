import { describe, expect, it } from 'vitest';

import { normalizeDiagramData } from './diagram-data';

describe('normalizeDiagramData', () => {
  it('upgrades legacy label-only nodes into React Flow nodes', () => {
    expect(normalizeDiagramData({
      nodes: [
        { id: 'lead', label: 'Lead' },
        { id: 'proposal', label: 'Proposta' },
      ],
      edges: [{ source: 'lead', target: 'proposal' }],
    })).toEqual({
      nodes: [
        { id: 'lead', type: 'default', position: { x: 0, y: 0 }, data: { label: 'Lead' } },
        { id: 'proposal', type: 'default', position: { x: 220, y: 0 }, data: { label: 'Proposta' } },
      ],
      edges: [{ id: 'edge-lead-proposal-1', source: 'lead', target: 'proposal' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  it('preserves valid current data and removes broken edges', () => {
    const normalized = normalizeDiagramData({
      nodes: [{
        id: 'start',
        type: 'start',
        position: { x: 12, y: 34 },
        data: { label: 'Começar', border: '#f97316' },
      }],
      edges: [{ id: 'broken', source: 'start', target: 'missing' }],
      viewport: { x: 5, y: 8, zoom: 1.2 },
    });

    expect(normalized.nodes[0]).toMatchObject({
      id: 'start',
      type: 'start',
      position: { x: 12, y: 34 },
      data: { label: 'Começar', border: '#f97316' },
    });
    expect(normalized.edges).toEqual([]);
    expect(normalized.viewport).toEqual({ x: 5, y: 8, zoom: 1.2 });
  });
});
