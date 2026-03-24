import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export class CanvasAIError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_response' | 'unavailable' | 'content_too_short'
  ) {
    super(message);
    this.name = 'CanvasAIError';
  }
}

export function extractPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

export async function generateDiagram(noteContent: string): Promise<DiagramData> {
  const text = extractPlainText(noteContent);
  if (text.length < 50) {
    throw new CanvasAIError('Content too short', 'content_too_short');
  }

  const prompt = `You are a diagram generator. Given the following text, create a flowchart diagram in React Flow JSON format.

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- Use node types: "default", "decision", "start", "end", "process", "warning"
- Position nodes logically (x/y coordinates, space them 200px apart)
- Keep labels concise (max 5 words)
- Maximum 12 nodes

Text to diagram:
${text}

Return format:
{
  "nodes": [{"id":"1","type":"start","position":{"x":0,"y":0},"data":{"label":"Start"}}],
  "edges": [{"id":"e1-2","source":"1","target":"2","label":"optional label"}],
  "viewport": {"x":0,"y":0,"zoom":1}
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
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

    return parsed;
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
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
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
