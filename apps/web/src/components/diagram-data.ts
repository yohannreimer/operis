import type { DiagramData } from '../api';

const SUPPORTED_NODE_TYPES = new Set([
  'default',
  'start',
  'end',
  'decision',
  'process',
  'trigger',
  'delay',
  'parallel',
  'checkpoint',
  'warning',
  'person',
  'system',
  'group',
  'database',
  'metric',
  'annotation',
]);

type LooseRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Converts diagrams saved by earlier versions (and imperfect AI responses) into
 * the complete shape React Flow expects. Keeping this at the rendering boundary
 * lets old notes open safely and saves them back in the current format.
 */
export function normalizeDiagramData(input: unknown): DiagramData {
  const record = isRecord(input) ? input : {};
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const usedIds = new Set<string>();

  const nodes = rawNodes.map((rawNode, index) => {
    const node = isRecord(rawNode) ? rawNode : {};
    const proposedId = typeof node.id === 'string' && node.id.trim()
      ? node.id.trim()
      : `node-${index + 1}`;
    let id = proposedId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${proposedId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    const rawPosition = isRecord(node.position) ? node.position : {};
    const position = {
      x: isFiniteNumber(rawPosition.x) ? rawPosition.x : (index % 4) * 220,
      y: isFiniteNumber(rawPosition.y) ? rawPosition.y : Math.floor(index / 4) * 140,
    };
    const rawData = isRecord(node.data) ? node.data : {};
    const label = typeof rawData.label === 'string' && rawData.label.trim()
      ? rawData.label
      : typeof node.label === 'string' && node.label.trim()
        ? node.label
        : `Nó ${index + 1}`;
    const type = typeof node.type === 'string' && SUPPORTED_NODE_TYPES.has(node.type)
      ? node.type
      : 'default';

    return {
      id,
      type,
      position,
      data: { ...rawData, label },
    };
  });

  const rawEdges = Array.isArray(record.edges) ? record.edges : [];
  const edges = rawEdges.flatMap((rawEdge, index) => {
    if (!isRecord(rawEdge) || typeof rawEdge.source !== 'string' || typeof rawEdge.target !== 'string') {
      return [];
    }
    if (!usedIds.has(rawEdge.source) || !usedIds.has(rawEdge.target)) return [];

    return [{
      id: typeof rawEdge.id === 'string' && rawEdge.id.trim()
        ? rawEdge.id
        : `edge-${rawEdge.source}-${rawEdge.target}-${index + 1}`,
      source: rawEdge.source,
      target: rawEdge.target,
      ...(typeof rawEdge.label === 'string' ? { label: rawEdge.label } : {}),
    }];
  });

  const rawViewport = isRecord(record.viewport) ? record.viewport : {};
  const viewport = {
    x: isFiniteNumber(rawViewport.x) ? rawViewport.x : 0,
    y: isFiniteNumber(rawViewport.y) ? rawViewport.y : 0,
    zoom: isFiniteNumber(rawViewport.zoom) && rawViewport.zoom > 0 ? rawViewport.zoom : 1,
  };

  return { nodes, edges, viewport };
}
