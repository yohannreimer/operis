import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config.js';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export class CanvasAIError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_response' | 'unavailable' | 'content_too_short'
  ) {
    super(message);
    this.name = 'CanvasAIError';
  }
}

/** Recursively extracts plain text from a TipTap/ProseMirror JSON node */
function extractFromTiptapNode(node: Record<string, unknown>): string {
  if (node.type === 'text') return (node.text as string) ?? '';

  const children: string[] = [];
  const content = node.content as Record<string, unknown>[] | undefined;
  if (Array.isArray(content)) {
    for (const child of content) {
      children.push(extractFromTiptapNode(child));
    }
  }

  const inner = children.join('');
  const block = ['paragraph', 'heading', 'listItem', 'bulletList', 'orderedList',
                  'blockquote', 'codeBlock', 'horizontalRule', 'hardBreak'];
  return block.includes(node.type as string) ? inner + '\n' : inner;
}

/**
 * Extracts clean plain text from note content.
 * Handles both TipTap JSON and legacy HTML strings.
 * Caps output at 8 000 chars to keep AI costs low.
 */
export function extractPlainText(content: string): string {
  const MAX_CHARS = 8000;

  let text = content ?? '';

  // Try to parse as TipTap JSON first
  try {
    const doc = JSON.parse(text);
    if (doc && doc.type === 'doc') {
      text = extractFromTiptapNode(doc);
    }
  } catch {
    // Not JSON — treat as HTML/plain text
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  }

  return text
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}

export interface DiagramData {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: { label: string; [key: string]: unknown };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: string;
  }>;
  viewport: { x: number; y: number; zoom: number };
}

export interface MindMapData {
  nodeData: {
    id: string;
    topic: string;
    children?: MindMapData['nodeData'][];
  };
}

function applyAutoLayout(data: DiagramData): DiagramData {
  const NODE_W = 200;
  const NODE_H = 50;
  const GAP_X = 60;
  const GAP_Y = 100;

  // Detect back-edges (cycles) using DFS so they don't break topological sort
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const backEdgeKeys = new Set<string>();

  function dfs(id: string, adjMap: Map<string, string[]>) {
    visited.add(id);
    inStack.add(id);
    for (const child of adjMap.get(id) ?? []) {
      if (!visited.has(child)) {
        dfs(child, adjMap);
      } else if (inStack.has(child)) {
        backEdgeKeys.add(`${id}->${child}`);
      }
    }
    inStack.delete(id);
  }

  const rawAdj = new Map<string, string[]>();
  for (const node of data.nodes) rawAdj.set(node.id, []);
  for (const edge of data.edges) rawAdj.get(edge.source)?.push(edge.target);
  for (const node of data.nodes) if (!visited.has(node.id)) dfs(node.id, rawAdj);

  // Build adjacency excluding back-edges for layout purposes
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const node of data.nodes) {
    inDegree.set(node.id, 0);
    children.set(node.id, []);
  }
  for (const edge of data.edges) {
    if (backEdgeKeys.has(`${edge.source}->${edge.target}`)) continue;
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    children.get(edge.source)?.push(edge.target);
  }

  // Topological sort → assign ranks (layers)
  const rank = new Map<string, number>();
  const queue: string[] = [];
  const tempDegree = new Map(inDegree);

  for (const [id, deg] of tempDegree) {
    if (deg === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of children.get(id) ?? []) {
      const r = Math.max(rank.get(child) ?? 0, (rank.get(id) ?? 0) + 1);
      rank.set(child, r);
      const deg = (tempDegree.get(child) ?? 1) - 1;
      tempDegree.set(child, deg);
      if (deg === 0) queue.push(child);
    }
  }

  // Group nodes by rank
  const layers = new Map<number, string[]>();
  for (const node of data.nodes) {
    const r = rank.get(node.id) ?? 0;
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r)!.push(node.id);
  }

  // Assign positions
  const posMap = new Map<string, { x: number; y: number }>();
  for (const [layer, ids] of Array.from(layers.entries()).sort(([a], [b]) => a - b)) {
    const totalW = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    const startX = -totalW / 2;
    ids.forEach((id, i) => {
      posMap.set(id, {
        x: startX + i * (NODE_W + GAP_X),
        y: layer * (NODE_H + GAP_Y),
      });
    });
  }

  // Fix decision node edge labels: Sim/Não must be on OUTGOING edges only
  const decisionIds = new Set(data.nodes.filter(n => n.type === 'decision').map(n => n.id));
  const fixedEdges = data.edges.map(e => {
    // Strip Sim/Não from edges going INTO a decision node
    if (decisionIds.has(e.target) && (e.label === 'Sim' || e.label === 'Não')) {
      return { ...e, label: undefined, type: 'smoothstep' };
    }
    return { ...e, type: 'smoothstep' };
  });

  // Ensure each decision node has exactly one "Sim" and one "Não" on outgoing edges
  for (const decId of decisionIds) {
    const outgoing = fixedEdges.filter(e => e.source === decId);
    const hasSim = outgoing.some(e => e.label === 'Sim');
    const hasNao = outgoing.some(e => e.label === 'Não');
    if (!hasSim && !hasNao && outgoing.length === 2) {
      outgoing[0].label = 'Sim';
      outgoing[1].label = 'Não';
    } else if (!hasSim && outgoing.length >= 1) {
      const unlabeled = outgoing.find(e => !e.label);
      if (unlabeled) unlabeled.label = 'Sim';
    } else if (!hasNao && outgoing.length >= 2) {
      const unlabeled = outgoing.find(e => !e.label);
      if (unlabeled) unlabeled.label = 'Não';
    }
  }

  // For decision nodes: move the "Sim" target to the side (classic diamond layout)
  for (const decId of decisionIds) {
    const decPos = posMap.get(decId);
    if (!decPos) continue;
    const simEdge = fixedEdges.find(e => e.source === decId && e.label === 'Sim');
    if (simEdge) {
      const simTarget = simEdge.target;
      // Place Sim branch to the right of the decision node, same Y level
      posMap.set(simTarget, { x: decPos.x + NODE_W + GAP_X * 4, y: decPos.y });
    }
  }

  // Assign sourceHandle/targetHandle so edges always exit bottom → enter top
  // Exception: Sim edge from decision goes right → left (side branch)
  const simSideTargets = new Set<string>();
  for (const decId of decisionIds) {
    const simEdge = fixedEdges.find(e => e.source === decId && e.label === 'Sim');
    if (simEdge) simSideTargets.add(simEdge.target);
  }

  const edgesWithHandles = fixedEdges.map(e => {
    const isSimSide = decisionIds.has(e.source) && e.label === 'Sim' && simSideTargets.has(e.target);
    if (isSimSide) {
      return { ...e, sourceHandle: 'right', targetHandle: 'left' };
    }
    return { ...e, sourceHandle: 'bottom', targetHandle: 'top' };
  });

  return {
    ...data,
    edges: edgesWithHandles,
    nodes: data.nodes.map(n => ({
      ...n,
      position: posMap.get(n.id) ?? n.position,
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export async function generateDiagram(noteContent: string): Promise<DiagramData> {
  const text = extractPlainText(noteContent);
  if (text.length < 50) {
    throw new CanvasAIError('Content too short', 'content_too_short');
  }

  const prompt = `You are a diagram generator. Given the following text, create a flowchart diagram in React Flow JSON format.

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- Use node types: "start", "end", "process", "decision", "warning"
- Use parallel rows when the text describes simultaneous/concurrent steps (e.g. "you need A, B and C" → show A, B, C side by side). Each row: at most 4 nodes sharing the same Y value.
- Rows flow top-to-bottom. Sequential steps go in separate rows.
- Use a "decision" node when the text has a conditional (if/whether/check). It MUST have exactly 2 outgoing edges: one labeled "Sim" and one labeled "Não".
- Use feedback loops (edge pointing back to an earlier node) when the text describes an iterative or cyclic process.
- If "Sim" leads to multiple parallel options, connect "Sim" to ONE intermediate "process" node first, then fan out.
- Keep labels concise (max 5 words)
- Maximum 16 nodes
- Every node must be reachable — no disconnected nodes.
- Do NOT worry about exact coordinates — set all positions to {"x":0,"y":0}, layout will be computed automatically.

Text to diagram:
${text}

Return format:
{
  "nodes": [{"id":"1","type":"start","position":{"x":0,"y":0},"data":{"label":"Start"}}],
  "edges": [{"id":"e1-2","source":"1","target":"2","label":"optional label"}],
  "viewport": {"x":0,"y":0,"zoom":1}
}`;

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new CanvasAIError('No text response', 'invalid_response');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new CanvasAIError('No JSON in response', 'invalid_response');

    const parsed = JSON.parse(jsonMatch[0]) as DiagramData;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      throw new CanvasAIError('Invalid diagram structure', 'invalid_response');
    }

    return applyAutoLayout(parsed);
  } catch (err) {
    if (err instanceof CanvasAIError) throw err;
throw new CanvasAIError('AI unavailable', 'unavailable');
  }
}

export async function generateMindMap(noteContent: string): Promise<MindMapData> {
  const text = extractPlainText(noteContent);
  if (text.length < 50) {
    throw new CanvasAIError('Content too short', 'content_too_short');
  }

  const prompt = `You are a mind map generator. Given the following text, create a mind map in mind-elixir JSON format.

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- Maximum depth: 3 levels
- Maximum 5 children per node
- Keep topics concise (max 4 words)

Text to map:
${text}

Return format:
{
  "nodeData": {
    "id": "root",
    "topic": "Main Topic",
    "children": [
      {
        "id": "1",
        "topic": "Branch 1",
        "children": [{"id": "1-1", "topic": "Sub item"}]
      }
    ]
  }
}`;

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new CanvasAIError('No text response', 'invalid_response');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new CanvasAIError('No JSON in response', 'invalid_response');

    const parsed = JSON.parse(jsonMatch[0]) as MindMapData;
    if (!parsed.nodeData?.topic) {
      throw new CanvasAIError('Invalid mind map structure', 'invalid_response');
    }

    return parsed;
  } catch (err) {
    if (err instanceof CanvasAIError) throw err;
    throw new CanvasAIError('AI unavailable', 'unavailable');
  }
}
