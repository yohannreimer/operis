# Canvas: Diagramas e Mapas Mentais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar diagramas de fluxo (React Flow) e mapas mentais (mind-elixir) integrados ao editor de notas do Operis, com geração por IA a partir do texto da nota.

**Architecture:** Dois novos modelos Prisma (`Diagram`, `MindMap`) com relação 1-para-1 opcional a `Note`. Backend em `canvas.ts` (rota Fastify separada) com `canvas-ai-service.ts` para geração Claude. Frontend com toggle de modo no editor de notas + dois componentes de canvas (`diagram-canvas.tsx`, `mindmap-canvas.tsx`).

**Tech Stack:** Fastify + Prisma + Claude API (backend) · React + TypeScript + @xyflow/react + mind-elixir (frontend) · CSS custom properties (estilos)

**Spec:** `docs/superpowers/specs/2026-03-23-canvas-diagrams-mindmaps-design.md`

---

## File Structure

```
apps/api/
  prisma/
    schema.prisma                         MODIFY — +Diagram, +MindMap models, +relations on Note
  src/
    routes/
      canvas.ts                           CREATE — 10 endpoints CRUD + generate
    services/
      canvas-ai-service.ts                CREATE — generateDiagram, generateMindMap, extractPlainText
    app.ts                                MODIFY — registerCanvasRoutes

apps/web/
  src/
    api.ts                                MODIFY — +Diagram, +MindMap types + fetch hooks
    utils/
      text.ts                             CREATE (or MODIFY if exists) — extractPlainText shared util
    components/
      diagram-canvas.tsx                  CREATE — React Flow editor completo
      mindmap-canvas.tsx                  CREATE — mind-elixir bridge React
    pages/
      notas.tsx                           MODIFY — toggle de modo + integração dos canvas
    styles.css                            MODIFY — estilos canvas, nodes, toolbar
```

---

## FASE 1 — Diagramas (React Flow)

---

### Task 1: Prisma — novos modelos Diagram e MindMap

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Adicionar modelos ao schema**

Abrir `apps/api/prisma/schema.prisma` e localizar o modelo `Note`. Adicionar as duas relações opcionais a `Note`:

```prisma
// dentro do model Note, após os campos existentes:
diagram  Diagram?
mindMap  MindMap?
```

Adicionar os dois novos modelos ao final do arquivo:

```prisma
model Diagram {
  id        String   @id @default(uuid())
  noteId    String   @unique @map("note_id")
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title     String?
  data      Json
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("diagrams")
}

model MindMap {
  id        String   @id @default(uuid())
  noteId    String   @unique @map("note_id")
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title     String?
  data      Json
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("mind_maps")
}
```

- [ ] **Step 2: Gerar e aplicar migration**

```bash
cd apps/api
npx prisma migrate dev --name add_canvas_models
```

Esperado: migration criada em `prisma/migrations/` e aplicada. Zero erros.

- [ ] **Step 3: Regenerar Prisma Client**

```bash
npx prisma generate
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add Diagram and MindMap prisma models"
```

---

### Task 2: Backend — canvas-ai-service.ts

**Files:**
- Create: `apps/api/src/services/canvas-ai-service.ts`

- [ ] **Step 1: Instalar dependência Anthropic SDK se não existe**

```bash
cd apps/api
grep -q "@anthropic-ai/sdk" package.json && echo "já instalado" || npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Criar o serviço**

Criar `apps/api/src/services/canvas-ai-service.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // usa ANTHROPIC_API_KEY do env

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
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/canvas-ai-service.ts
git commit -m "feat: add canvas AI service for diagram and mindmap generation"
```

---

### Task 3: Backend — canvas.ts routes

**Files:**
- Create: `apps/api/src/routes/canvas.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Criar arquivo de rotas**

Criar `apps/api/src/routes/canvas.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  generateDiagram,
  generateMindMap,
  extractPlainText,
  CanvasAIError,
} from '../services/canvas-ai-service.js';

const MAX_CANVAS_BYTES = 500 * 1024; // 500 KB

const dataSchema = z.record(z.unknown()).refine(
  (val) => JSON.stringify(val).length <= MAX_CANVAS_BYTES,
  { message: 'Canvas data exceeds 500 KB limit' }
);

export async function registerCanvasRoutes(app: FastifyInstance, prisma: PrismaClient) {
  // ── DIAGRAM ──────────────────────────────────────────────────────────────

  app.get('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const diagram = await prisma.diagram.findUnique({ where: { noteId } });
    if (!diagram) return reply.status(404).send({ error: 'not_found' });
    return diagram;
  });

  app.post('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const body = req.body as { data: unknown; title?: string };

    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (existing) return reply.status(409).send({ error: 'diagram_exists' });

    const parsed = dataSchema.safeParse(body.data);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.message });

    const diagram = await prisma.diagram.create({
      data: { noteId, data: parsed.data, title: body.title ?? null },
    });
    return reply.status(201).send(diagram);
  });

  app.patch('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const body = req.body as { data?: unknown; title?: string };

    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    if (body.data) {
      const parsed = dataSchema.safeParse(body.data);
      if (!parsed.success) return reply.status(413).send({ error: parsed.error.message });
    }

    const updated = await prisma.diagram.update({
      where: { noteId },
      data: {
        ...(body.data !== undefined && { data: body.data as object }),
        ...(body.title !== undefined && { title: body.title }),
      },
    });
    return updated;
  });

  app.delete('/canvas/notes/:noteId/diagram', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.diagram.delete({ where: { noteId } });
    return reply.status(204).send();
  });

  app.post('/canvas/notes/:noteId/diagram/generate', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const body = (req.body ?? {}) as { overwrite?: boolean };

    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return reply.status(404).send({ error: 'note_not_found' });

    const plainText = extractPlainText(note.content ?? '');
    if (plainText.length < 50) {
      return reply.status(422).send({ error: 'content_too_short', minLength: 50 });
    }

    const existing = await prisma.diagram.findUnique({ where: { noteId } });
    if (existing && !body.overwrite) {
      return reply.status(409).send({ error: 'diagram_exists' });
    }

    try {
      const data = await generateDiagram(note.content ?? '');
      const diagram = await prisma.diagram.upsert({
        where: { noteId },
        create: { noteId, data: data as object },
        update: { data: data as object },
      });
      return diagram;
    } catch (err) {
      if (err instanceof CanvasAIError) {
        const status = err.code === 'unavailable' ? 503 : 502;
        return reply.status(status).send({ error: err.code });
      }
      throw err;
    }
  });

  // ── MINDMAP ───────────────────────────────────────────────────────────────

  app.get('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const mindMap = await prisma.mindMap.findUnique({ where: { noteId } });
    if (!mindMap) return reply.status(404).send({ error: 'not_found' });
    return mindMap;
  });

  app.post('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const body = req.body as { data: unknown; title?: string };

    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (existing) return reply.status(409).send({ error: 'mindmap_exists' });

    const parsed = dataSchema.safeParse(body.data);
    if (!parsed.success) return reply.status(422).send({ error: parsed.error.message });

    const mindMap = await prisma.mindMap.create({
      data: { noteId, data: parsed.data, title: body.title ?? null },
    });
    return reply.status(201).send(mindMap);
  });

  app.patch('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const body = req.body as { data?: unknown; title?: string };

    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });

    if (body.data) {
      const parsed = dataSchema.safeParse(body.data);
      if (!parsed.success) return reply.status(413).send({ error: parsed.error.message });
    }

    const updated = await prisma.mindMap.update({
      where: { noteId },
      data: {
        ...(body.data !== undefined && { data: body.data as object }),
        ...(body.title !== undefined && { title: body.title }),
      },
    });
    return updated;
  });

  app.delete('/canvas/notes/:noteId/mindmap', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (!existing) return reply.status(404).send({ error: 'not_found' });
    await prisma.mindMap.delete({ where: { noteId } });
    return reply.status(204).send();
  });

  app.post('/canvas/notes/:noteId/mindmap/generate', async (req, reply) => {
    const { noteId } = req.params as { noteId: string };
    const body = (req.body ?? {}) as { overwrite?: boolean };

    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return reply.status(404).send({ error: 'note_not_found' });

    const plainText = extractPlainText(note.content ?? '');
    if (plainText.length < 50) {
      return reply.status(422).send({ error: 'content_too_short', minLength: 50 });
    }

    const existing = await prisma.mindMap.findUnique({ where: { noteId } });
    if (existing && !body.overwrite) {
      return reply.status(409).send({ error: 'mindmap_exists' });
    }

    try {
      const data = await generateMindMap(note.content ?? '');
      const mindMap = await prisma.mindMap.upsert({
        where: { noteId },
        create: { noteId, data: data as object },
        update: { data: data as object },
      });
      return mindMap;
    } catch (err) {
      if (err instanceof CanvasAIError) {
        const status = err.code === 'unavailable' ? 503 : 502;
        return reply.status(status).send({ error: err.code });
      }
      throw err;
    }
  });
}
```

- [ ] **Step 2: Registrar rotas em app.ts**

Abrir `apps/api/src/app.ts`. Adicionar o import e o registro:

```typescript
import { registerCanvasRoutes } from './routes/canvas.js';

// dentro de buildApp, junto dos outros registerXxxRoutes:
registerCanvasRoutes(app, prisma);
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/canvas.ts apps/api/src/app.ts
git commit -m "feat: add canvas routes (diagram + mindmap CRUD + AI generate)"
```

---

### Task 4: Frontend — tipos e hooks em api.ts

**Files:**
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Adicionar tipos e funções**

Abrir `apps/web/src/api.ts`. Localizar a seção de tipos de `Note` e adicionar após:

```typescript
// ── Canvas ────────────────────────────────────────────────────────────────

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

export interface Diagram {
  id: string;
  noteId: string;
  title: string | null;
  data: DiagramData;
  createdAt: string;
  updatedAt: string;
}

export interface MindMap {
  id: string;
  noteId: string;
  title: string | null;
  data: MindMapData;
  createdAt: string;
  updatedAt: string;
}

// ── Canvas API functions ──────────────────────────────────────────────────

export async function getDiagram(noteId: string): Promise<Diagram | null> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/diagram`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch diagram');
  return res.json();
}

export async function createDiagram(noteId: string, data: DiagramData, title?: string): Promise<Diagram> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/diagram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, title }),
  });
  if (!res.ok) throw new Error('Failed to create diagram');
  return res.json();
}

export async function updateDiagram(noteId: string, data: DiagramData): Promise<Diagram> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/diagram`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error('Failed to update diagram');
  return res.json();
}

export async function deleteDiagram(noteId: string): Promise<void> {
  await fetch(`${API_BASE}/canvas/notes/${noteId}/diagram`, { method: 'DELETE' });
}

export async function generateDiagram(
  noteId: string,
  overwrite = false
): Promise<{ diagram: Diagram } | { error: string }> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/diagram/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overwrite }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown' }));
    return { error: (body as { error: string }).error ?? 'unknown' };
  }
  return { diagram: await res.json() };
}

export async function getMindMap(noteId: string): Promise<MindMap | null> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/mindmap`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch mindmap');
  return res.json();
}

export async function createMindMap(noteId: string, data: MindMapData, title?: string): Promise<MindMap> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/mindmap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, title }),
  });
  if (!res.ok) throw new Error('Failed to create mindmap');
  return res.json();
}

export async function updateMindMap(noteId: string, data: MindMapData): Promise<MindMap> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/mindmap`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error('Failed to update mindmap');
  return res.json();
}

export async function deleteMindMap(noteId: string): Promise<void> {
  await fetch(`${API_BASE}/canvas/notes/${noteId}/mindmap`, { method: 'DELETE' });
}

export async function generateMindMap(
  noteId: string,
  overwrite = false
): Promise<{ mindMap: MindMap } | { error: string }> {
  const res = await fetch(`${API_BASE}/canvas/notes/${noteId}/mindmap/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overwrite }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown' }));
    return { error: (body as { error: string }).error ?? 'unknown' };
  }
  return { mindMap: await res.json() };
}
```

> **Nota:** Verificar o nome da constante `API_BASE` no arquivo existente — pode ser `API_URL`, `BASE_URL` ou similar. Usar o mesmo padrão do arquivo.

- [ ] **Step 2: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api.ts
git commit -m "feat: add canvas types and API functions to api.ts"
```

---

### Task 5: Frontend — diagram-canvas.tsx (React Flow)

**Files:**
- Create: `apps/web/src/components/diagram-canvas.tsx`

- [ ] **Step 1: Instalar @xyflow/react**

```bash
cd apps/web && npm install @xyflow/react
```

- [ ] **Step 2: Criar o componente**

Criar `apps/web/src/components/diagram-canvas.tsx`:

```typescript
import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Node,
  Edge,
  NodeTypes,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DiagramData } from '../api';

// ── Custom node components ────────────────────────────────────────────────

function DefaultNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--default">
      <span>{data.label}</span>
    </div>
  );
}

function StartNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--start"><span>{data.label || 'Início'}</span></div>;
}

function EndNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--end"><span>{data.label || 'Fim'}</span></div>;
}

function DecisionNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--decision">
      <div className="rf-node-diamond"><span>{data.label}</span></div>
    </div>
  );
}

function ProcessNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--process"><span>{data.label}</span></div>;
}

function TriggerNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--trigger"><span>{data.label}</span></div>;
}

function DelayNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--delay">⏱ <span>{data.label}</span></div>;
}

function ParallelNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--parallel"><div className="rf-parallel-bar" /><span>{data.label}</span></div>;
}

function CheckpointNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--checkpoint">✓ <span>{data.label}</span></div>;
}

function WarningNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--warning">⚠ <span>{data.label}</span></div>;
}

function PersonNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--person">
      <div className="rf-person-avatar">{data.label[0]?.toUpperCase()}</div>
      <span>{data.label}</span>
    </div>
  );
}

function SystemNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--system"><span>{data.label}</span></div>;
}

function GroupNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--group"><span className="rf-group-label">{data.label}</span></div>;
}

function DatabaseNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--database">
      <svg viewBox="0 0 40 30" width="40" height="30">
        <ellipse cx="20" cy="6" rx="18" ry="5" fill="currentColor" opacity="0.3"/>
        <rect x="2" y="6" width="36" height="18" fill="currentColor" opacity="0.1"/>
        <ellipse cx="20" cy="24" rx="18" ry="5" fill="currentColor" opacity="0.3"/>
      </svg>
      <span>{data.label}</span>
    </div>
  );
}

function MetricNode({ data }: { data: { label: string; value?: string } }) {
  return (
    <div className="rf-node rf-node--metric">
      {data.value && <div className="rf-metric-value">{data.value}</div>}
      <span>{data.label}</span>
    </div>
  );
}

function AnnotationNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--annotation"><span>{data.label}</span></div>;
}

const nodeTypes: NodeTypes = {
  default: DefaultNode,
  start: StartNode,
  end: EndNode,
  decision: DecisionNode,
  process: ProcessNode,
  trigger: TriggerNode,
  delay: DelayNode,
  parallel: ParallelNode,
  checkpoint: CheckpointNode,
  warning: WarningNode,
  person: PersonNode,
  system: SystemNode,
  group: GroupNode,
  database: DatabaseNode,
  metric: MetricNode,
  annotation: AnnotationNode,
};

// ── Templates ─────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, Partial<DiagramData>> = {
  decision_flow: {
    nodes: [
      { id: '1', type: 'start', position: { x: 200, y: 0 }, data: { label: 'Início' } },
      { id: '2', type: 'decision', position: { x: 170, y: 100 }, data: { label: 'Decisão?' } },
      { id: '3', type: 'process', position: { x: 0, y: 240 }, data: { label: 'Caminho A' } },
      { id: '4', type: 'process', position: { x: 340, y: 240 }, data: { label: 'Caminho B' } },
      { id: '5', type: 'end', position: { x: 130, y: 380 }, data: { label: 'Resultado' } },
      { id: '6', type: 'end', position: { x: 310, y: 380 }, data: { label: 'Resultado' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3', label: 'Sim' },
      { id: 'e2-4', source: '2', target: '4', label: 'Não' },
      { id: 'e3-5', source: '3', target: '5' },
      { id: 'e4-6', source: '4', target: '6' },
    ],
  },
  roadmap: {
    nodes: [
      { id: '1', type: 'checkpoint', position: { x: 0, y: 100 }, data: { label: 'Marco 1' } },
      { id: '2', type: 'checkpoint', position: { x: 200, y: 100 }, data: { label: 'Marco 2' } },
      { id: '3', type: 'checkpoint', position: { x: 400, y: 100 }, data: { label: 'Marco 3' } },
      { id: '4', type: 'checkpoint', position: { x: 600, y: 100 }, data: { label: 'Marco 4' } },
      { id: '5', type: 'end', position: { x: 800, y: 100 }, data: { label: 'Entrega' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
      { id: 'e4-5', source: '4', target: '5' },
    ],
  },
  dependencies: {
    nodes: [
      { id: '1', type: 'default', position: { x: 200, y: 0 }, data: { label: 'Tarefa A' } },
      { id: '2', type: 'default', position: { x: 0, y: 150 }, data: { label: 'Tarefa B' } },
      { id: '3', type: 'default', position: { x: 400, y: 150 }, data: { label: 'Tarefa C' } },
      { id: '4', type: 'default', position: { x: 200, y: 300 }, data: { label: 'Tarefa D' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', label: 'bloqueia' },
      { id: 'e1-3', source: '1', target: '3', label: 'bloqueia' },
      { id: 'e2-4', source: '2', target: '4', label: 'bloqueia' },
      { id: 'e3-4', source: '3', target: '4', label: 'bloqueia' },
    ],
  },
  launch_plan: {
    nodes: [
      { id: 'g1', type: 'group', position: { x: 0, y: 0 }, data: { label: 'Pré-lançamento' } },
      { id: '1', type: 'process', position: { x: 20, y: 50 }, data: { label: 'Preparar copy' } },
      { id: '2', type: 'process', position: { x: 20, y: 120 }, data: { label: 'Setup ads' } },
      { id: 'g2', type: 'group', position: { x: 250, y: 0 }, data: { label: 'Lançamento' } },
      { id: '3', type: 'trigger', position: { x: 270, y: 50 }, data: { label: 'Go live' } },
      { id: 'g3', type: 'group', position: { x: 500, y: 0 }, data: { label: 'Pós-lançamento' } },
      { id: '4', type: 'metric', position: { x: 520, y: 50 }, data: { label: 'Resultado', value: '?' } },
    ],
    edges: [
      { id: 'e1-3', source: '1', target: '3' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
    ],
  },
};

// ── Node types menu ───────────────────────────────────────────────────────

const NODE_GROUPS = [
  {
    label: 'Básicos',
    types: [
      { type: 'default', label: 'Passo' },
      { type: 'start', label: 'Início' },
      { type: 'end', label: 'Fim' },
      { type: 'annotation', label: 'Nota' },
    ],
  },
  {
    label: 'Fluxo',
    types: [
      { type: 'decision', label: 'Decisão' },
      { type: 'process', label: 'Processo' },
      { type: 'trigger', label: 'Gatilho' },
      { type: 'delay', label: 'Espera' },
      { type: 'parallel', label: 'Paralelo' },
      { type: 'checkpoint', label: 'Checkpoint' },
      { type: 'warning', label: 'Alerta' },
    ],
  },
  {
    label: 'Pessoas & Sistemas',
    types: [
      { type: 'person', label: 'Pessoa' },
      { type: 'system', label: 'Sistema' },
      { type: 'group', label: 'Grupo' },
    ],
  },
  {
    label: 'Dados & Métricas',
    types: [
      { type: 'database', label: 'Banco de dados' },
      { type: 'metric', label: 'Métrica' },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────

type DiagramCanvasProps = {
  initialData?: DiagramData;
  onSave: (data: DiagramData) => void;
  onGenerate: () => void;
  onDelete: () => void;
  isGenerating: boolean;
  noteTextLength: number;
};

// ── Main Component ────────────────────────────────────────────────────────

export function DiagramCanvas({
  initialData,
  onSave,
  onGenerate,
  onDelete,
  isGenerating,
  noteTextLength,
}: DiagramCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges ?? []);
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!rfInstance.current) return;
      const flow = rfInstance.current.toObject();
      onSave(flow as DiagramData);
    }, 1500);
  }, [onSave]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
      triggerSave();
    },
    [setEdges, triggerSave]
  );

  const addNode = (type: string, label: string) => {
    const id = `node-${Date.now()}`;
    const position = rfInstance.current
      ? { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 }
      : { x: 200, y: 200 };
    setNodes((nds) => [...nds, { id, type, position, data: { label } }]);
    setShowNodeMenu(false);
    triggerSave();
  };

  const applyTemplate = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    setNodes((t.nodes as Node[]) ?? []);
    setEdges((t.edges as Edge[]) ?? []);
    setShowTemplates(false);
    triggerSave();
  };

  return (
    <div className="diagram-canvas-wrapper">
      {/* Toolbar lateral */}
      <div className="diagram-toolbar">
        <button
          className="diagram-toolbar-btn"
          title="Adicionar nó"
          onClick={() => setShowNodeMenu((v) => !v)}
        >+</button>
        <button
          className="diagram-toolbar-btn"
          title="Templates"
          onClick={() => setShowTemplates((v) => !v)}
        >⬡</button>
        <button
          className="diagram-toolbar-btn"
          title="Fit view"
          onClick={() => rfInstance.current?.fitView()}
        >⊡</button>
        <button
          className={`diagram-toolbar-btn ${isGenerating ? 'loading' : ''}`}
          title={noteTextLength < 50 ? 'Nota muito curta para gerar' : 'Gerar com IA'}
          onClick={onGenerate}
          disabled={noteTextLength < 50 || isGenerating}
        >✦</button>
        <button
          className="diagram-toolbar-btn"
          title="Mais opções"
          onClick={() => setShowMenu((v) => !v)}
        >···</button>
      </div>

      {/* Menu de tipos de nó */}
      {showNodeMenu && (
        <div className="diagram-node-menu">
          {NODE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="diagram-node-menu-group">{group.label}</div>
              {group.types.map((t) => (
                <button
                  key={t.type}
                  className="diagram-node-menu-item"
                  onClick={() => addNode(t.type, t.label)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Menu de templates */}
      {showTemplates && (
        <div className="diagram-templates-menu">
          <div className="diagram-node-menu-group">Templates</div>
          {Object.entries({ decision_flow: 'Fluxo de Decisão', roadmap: 'Roadmap de Projeto', dependencies: 'Mapa de Dependências', launch_plan: 'Planejamento de Lançamento' }).map(([key, label]) => (
            <button key={key} className="diagram-node-menu-item" onClick={() => applyTemplate(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Menu ··· */}
      {showMenu && (
        <div className="diagram-overflow-menu">
          <button className="diagram-node-menu-item" onClick={() => { rfInstance.current?.fitView(); setShowMenu(false); }}>
            Fit view
          </button>
          <button
            className="diagram-node-menu-item diagram-node-menu-item--danger"
            onClick={() => { setShowDeleteConfirm(true); setShowMenu(false); }}
          >
            Limpar diagrama
          </button>
        </div>
      )}

      {/* Confirmação de delete */}
      {showDeleteConfirm && (
        <div className="diagram-delete-confirm">
          <p>Tem certeza? Essa ação não pode ser desfeita.</p>
          <div className="diagram-delete-confirm-actions">
            <button className="ghost-button" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
            <button className="diagram-delete-btn" onClick={() => { onDelete(); setShowDeleteConfirm(false); }}>Limpar</button>
          </div>
        </div>
      )}

      {/* React Flow */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => { onNodesChange(changes); triggerSave(); }}
        onEdgesChange={(changes) => { onEdgesChange(changes); triggerSave(); }}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onInit={(inst) => { rfInstance.current = inst; }}
        defaultViewport={initialData?.viewport ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!initialData}
        colorMode="dark"
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.06)" />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/diagram-canvas.tsx
git commit -m "feat: add DiagramCanvas component with React Flow and 16 node types"
```

---

### Task 6: Frontend — integração em notas.tsx + estilos

**Files:**
- Modify: `apps/web/src/pages/notas.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Adicionar estado de modo canvas em notas.tsx**

Localizar o componente principal do editor de notas (função que contém o `contentEditable`). Adicionar:

```typescript
import { DiagramCanvas } from '../components/diagram-canvas';
import { getDiagram, createDiagram, updateDiagram, deleteDiagram, generateDiagram, DiagramData } from '../api';

// Dentro do componente:
type CanvasMode = 'text' | 'diagram' | 'mindmap';
const [canvasMode, setCanvasMode] = useState<CanvasMode>('text');
const [diagramState, setDiagramState] = useState<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle');
const [diagramData, setDiagramData] = useState<DiagramData | null>(null);
const [isGenerating, setIsGenerating] = useState(false);
const [diagramSaveStatus, setDiagramSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
```

- [ ] **Step 2: Adicionar lógica de fetch lazy do diagrama**

```typescript
// Chamado quando o usuário clica no tab Diagrama pela primeira vez
async function loadDiagram(noteId: string) {
  if (diagramState !== 'idle') return; // já carregado ou carregando
  setDiagramState('loading');
  try {
    const diagram = await getDiagram(noteId);
    if (diagram) {
      setDiagramData(diagram.data);
      setDiagramState('ready');
    } else {
      setDiagramState('empty');
    }
  } catch {
    setDiagramState('error');
  }
}

function handleModeChange(mode: CanvasMode) {
  setCanvasMode(mode);
  if (mode === 'diagram' && diagramState === 'idle' && currentNote?.id) {
    void loadDiagram(currentNote.id);
  }
}
```

- [ ] **Step 3: Adicionar handlers de save, generate e delete**

```typescript
async function handleDiagramSave(data: DiagramData) {
  if (!currentNote?.id) return;
  setDiagramSaveStatus('saving');
  try {
    if (diagramState === 'empty') {
      await createDiagram(currentNote.id, data);
      setDiagramData(data);      // must set before state transition so canvas renders
      setDiagramState('ready');
    } else {
      await updateDiagram(currentNote.id, data);
      setDiagramData(data);
    }
    setDiagramSaveStatus('saved');
    setTimeout(() => setDiagramSaveStatus('idle'), 2000);
  } catch {
    setDiagramSaveStatus('error');
  }
}

async function handleDiagramGenerate() {
  if (!currentNote?.id) return;
  setIsGenerating(true);
  try {
    const result = await generateDiagram(currentNote.id, false);
    if ('error' in result) {
      if (result.error === 'diagram_exists') {
        const confirm = window.confirm('Já existe um diagrama. Substituir com o gerado pela IA?');
        if (confirm) {
          const retry = await generateDiagram(currentNote.id, true);
          if ('diagram' in retry) {
            setDiagramData(retry.diagram.data);
            setDiagramState('ready');
          }
        }
      } else {
        const msg = result.error === 'ai_unavailable'
          ? 'IA indisponível, tente em instantes.'
          : 'Não consegui gerar um diagrama para esse texto. Tente reformular a nota.';
        alert(msg); // substituir por toast quando disponível
      }
    } else {
      setDiagramData(result.diagram.data);
      setDiagramState('ready');
    }
  } finally {
    setIsGenerating(false);
  }
}

async function handleDiagramDelete() {
  if (!currentNote?.id) return;
  await deleteDiagram(currentNote.id);
  setDiagramData(null);
  setDiagramState('empty');
}
```

- [ ] **Step 4: Adicionar toggle na toolbar e renderizar canvas no JSX**

Localizar a toolbar do editor de notas. Adicionar o toggle de modo:

```tsx
{/* Toggle de modo — adicionar na toolbar do editor */}
<div className="canvas-mode-toggle">
  <button
    className={`canvas-mode-btn ${canvasMode === 'text' ? 'active' : ''}`}
    onClick={() => handleModeChange('text')}
  >≡ Texto</button>
  <button
    className={`canvas-mode-btn ${canvasMode === 'diagram' ? 'active' : ''}`}
    onClick={() => handleModeChange('diagram')}
  >⬡ Diagrama</button>
  <button
    className={`canvas-mode-btn ${canvasMode === 'mindmap' ? 'active' : ''}`}
    onClick={() => handleModeChange('mindmap')}
    title="Em breve"
    disabled
  >✦ Mapa Mental</button>
</div>
```

Localizar onde o editor contentEditable é renderizado. Envolver com condição:

```tsx
{canvasMode === 'text' && (
  <div /* editor contentEditable existente */ />
)}

{canvasMode === 'diagram' && (
  <div className="canvas-area">
    {diagramState === 'loading' && (
      <div className="canvas-loading">Carregando diagrama...</div>
    )}
    {diagramState === 'error' && (
      <div className="canvas-error">
        <p>Erro ao carregar o diagrama.</p>
        <button onClick={() => { setDiagramState('idle'); void loadDiagram(currentNote!.id); }}>
          Tentar novamente
        </button>
      </div>
    )}
    {diagramState === 'empty' && (
      <div className="canvas-empty-state">
        <div className="canvas-empty-icon">⬡</div>
        <p>Nenhum diagrama ainda</p>
        <div className="canvas-empty-actions">
          <button className="ghost-button" onClick={() => handleDiagramSave({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })}>
            Começar do zero
          </button>
          <button className="ghost-button" onClick={() => {/* abrir seletor de templates */}}>
            Escolher template
          </button>
          {noteTextLength >= 50 && (
            <button onClick={handleDiagramGenerate} disabled={isGenerating}>
              {isGenerating ? 'Gerando...' : '✦ Gerar da nota'}
            </button>
          )}
        </div>
      </div>
    )}
    {diagramState === 'ready' && diagramData && (
      <DiagramCanvas
        initialData={diagramData}
        onSave={handleDiagramSave}
        onGenerate={handleDiagramGenerate}
        onDelete={handleDiagramDelete}
        isGenerating={isGenerating}
        noteTextLength={noteTextLength}
      />
    )}
  </div>
)}
```

> **Nota:** `noteTextLength` deve ser calculado a partir do `plainTextFromHtml(currentNote.content ?? '').length` já existente no código.

- [ ] **Step 5: Adicionar estilos em styles.css**

Adicionar ao final de `apps/web/src/styles.css`:

```css
/* ═══════════════════════════════════════════
   CANVAS — Diagramas e Mapas Mentais
   ═══════════════════════════════════════════ */

/* Mode toggle */
.canvas-mode-toggle {
  display: flex;
  gap: 2px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
}
.canvas-mode-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: none;
  box-shadow: none;
  cursor: pointer;
  transition: all 0.15s;
}
.canvas-mode-btn.active {
  background: rgba(249,115,22,0.12);
  color: var(--accent, #f97316);
  border-bottom: 2px solid var(--accent, #f97316);
}
.canvas-mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.canvas-mode-btn:hover:not(.active):not(:disabled) { color: var(--text); }

/* Canvas area */
.canvas-area {
  height: calc(100vh - 200px);
  min-height: 400px;
  position: relative;
}

/* Empty state */
.canvas-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
  text-align: center;
}
.canvas-empty-icon { font-size: 2.5rem; opacity: 0.3; }
.canvas-empty-state p { color: var(--text-muted); font-size: 0.9rem; margin: 0; }
.canvas-empty-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* Loading / error */
.canvas-loading, .canvas-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* Diagram canvas wrapper */
.diagram-canvas-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg);
  border-radius: 12px;
  overflow: hidden;
}

/* Toolbar lateral */
.diagram-toolbar {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  box-shadow: var(--shadow-md);
}
.diagram-toolbar-btn {
  width: 36px;
  height: 36px;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-size: 1rem;
  border: none;
  box-shadow: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  padding: 0;
}
.diagram-toolbar-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: var(--text); }
.diagram-toolbar-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.diagram-toolbar-btn.loading { animation: pulse 1s infinite; }

/* Node menus */
.diagram-node-menu,
.diagram-templates-menu,
.diagram-overflow-menu {
  position: absolute;
  left: 62px;
  top: 12px;
  z-index: 20;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px;
  min-width: 180px;
  box-shadow: var(--shadow-md);
}
.diagram-node-menu-group {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 6px 8px 2px;
  opacity: 0.7;
}
.diagram-node-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 0.82rem;
  color: var(--text);
  background: transparent;
  border: none;
  box-shadow: none;
  cursor: pointer;
  transition: background 0.1s;
}
.diagram-node-menu-item:hover { background: rgba(255,255,255,0.07); }
.diagram-node-menu-item--danger:hover { background: rgba(248,113,113,0.1); color: #f87171; }

/* Delete confirm */
.diagram-delete-confirm {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-elevated);
  border: 1px solid rgba(248,113,113,0.3);
  border-radius: 10px;
  padding: 16px 20px;
  z-index: 30;
  min-width: 280px;
  box-shadow: var(--shadow-md);
}
.diagram-delete-confirm p { margin: 0 0 12px; font-size: 0.88rem; color: var(--text); }
.diagram-delete-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.diagram-delete-btn {
  background: rgba(248,113,113,0.15);
  color: #f87171;
  border: 1px solid rgba(248,113,113,0.3);
  box-shadow: none;
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.diagram-delete-btn:hover { background: rgba(248,113,113,0.25); }

/* ── React Flow node styles ─────────────────────────────── */
.rf-node {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1.5px solid var(--border);
  background: var(--surface-elevated);
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 500;
  min-width: 100px;
  text-align: center;
  cursor: grab;
}
.rf-node--start { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4); border-radius: 999px; color: #4ade80; }
.rf-node--end { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); border-radius: 999px; color: #f87171; }
.rf-node--decision { background: rgba(249,115,22,0.1); border-color: rgba(249,115,22,0.35); }
.rf-node-diamond { clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); background: rgba(249,115,22,0.15); padding: 14px 20px; }
.rf-node--process { border-left: 3px solid #6366f1; background: rgba(99,102,241,0.08); }
.rf-node--trigger { border: 2px dashed var(--accent, #f97316); background: rgba(249,115,22,0.06); }
.rf-node--delay { background: var(--surface-elevated); gap: 6px; }
.rf-node--parallel { position: relative; }
.rf-parallel-bar { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 8px 8px 0 0; }
.rf-node--checkpoint { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); color: #34d399; }
.rf-node--warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.35); color: #fbbf24; }
.rf-node--person { display: flex; align-items: center; gap: 8px; }
.rf-person-avatar { width: 28px; height: 28px; border-radius: 50%; background: rgba(99,102,241,0.25); color: #a5b4fc; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.rf-node--system { clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%); background: rgba(6,182,212,0.08); border-color: rgba(6,182,212,0.3); }
.rf-node--group { background: rgba(255,255,255,0.02); border: 1.5px dashed rgba(255,255,255,0.12); min-width: 200px; min-height: 120px; border-radius: 12px; }
.rf-group-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.rf-node--database { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rf-node--metric .rf-metric-value { font-size: 1.4rem; font-weight: 700; color: var(--accent, #f97316); }
.rf-node--annotation { background: rgba(251,191,36,0.08); border: 1.5px dashed rgba(251,191,36,0.3); color: #fbbf24; font-style: italic; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
```

- [ ] **Step 6: Verificar TypeScript e build**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/notas.tsx apps/web/src/styles.css
git commit -m "feat: integrate DiagramCanvas into notes editor with mode toggle"
```

---

### Task 7: Verificação da Fase 1 (gate para Fase 2)

- [ ] Criar nota com texto < 50 chars → botão "Gerar da nota" não aparece no empty state
- [ ] Clicar tab Diagrama → loading → empty state com 3 opções
- [ ] "Começar do zero" → canvas React Flow vazio com toolbar lateral
- [ ] "Escolher template" → selecionar "Fluxo de Decisão" → diagrama pré-populado
- [ ] Editar nodes → esperar 1.5s → checar no banco que o diagrama foi salvo
- [ ] Fechar nota, reabrir, clicar Diagrama → diagrama preservado com viewport
- [ ] Trocar para modo Texto → texto intacto; voltar → canvas intacto
- [ ] Gerar com IA (nota > 50 chars) → diagrama aparece
- [ ] Menu `···` → Limpar diagrama → confirmação → empty state
- [ ] `npx tsc --noEmit` → zero erros

---

## FASE 2 — Mapas Mentais (mind-elixir)

> **Gate:** Iniciar somente após todos os itens de Task 7 passarem.

---

### Task 8: Frontend — utils/text.ts (shared plain text extractor)

**Files:**
- Create: `apps/web/src/utils/text.ts`

- [ ] **Step 1: Criar utilitário**

Criar `apps/web/src/utils/text.ts`:

```typescript
/**
 * Extracts plain text from HTML content (as stored in Note.content).
 * Mirrors the backend extractPlainText in canvas-ai-service.ts.
 */
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
```

- [ ] **Step 2: Atualizar notas.tsx para importar de utils/text.ts**

No `notas.tsx`, localizar a função `plainTextFromHtml` (ou equivalente) e substituir por import:

```typescript
import { extractPlainText } from '../utils/text';
```

Substituir todos os usos internos de `plainTextFromHtml(x)` por `extractPlainText(x)`. O cálculo de `noteTextLength` passa a usar `extractPlainText(currentNote.content ?? '').length`.

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/utils/text.ts apps/web/src/pages/notas.tsx
git commit -m "refactor: extract plainText utility to utils/text.ts"
```

---

### Task 10: Frontend — mindmap-canvas.tsx

**Files:**
- Create: `apps/web/src/components/mindmap-canvas.tsx`

- [ ] **Step 1: Instalar mind-elixir**

```bash
cd apps/web && npm install mind-elixir
```

- [ ] **Step 2: Criar o componente bridge**

Criar `apps/web/src/components/mindmap-canvas.tsx`:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import MindElixir, { MindElixirInstance, Options } from 'mind-elixir';
import { MindMapData } from '../api';

const operisTheme = {
  name: 'operis-dark',
  palette: ['#f97316', '#6366f1', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'],
  cssVar: {
    '--main-color': '#e8e4df',
    '--main-bgcolor': '#232328',
    '--color': '#a09a92',
    '--bgcolor': '#2a2a30',
    '--selected': 'rgba(249,115,22,0.15)',
    '--border': 'rgba(255,255,255,0.07)',
    '--line-color': 'rgba(255,255,255,0.2)',
  },
};

const TEMPLATES: Record<string, MindMapData> = {
  idea_map: {
    nodeData: {
      id: 'root', topic: 'Ideia',
      children: [
        { id: '1', topic: 'O quê', children: [] },
        { id: '2', topic: 'Por quê', children: [] },
        { id: '3', topic: 'Como', children: [] },
        { id: '4', topic: 'Riscos', children: [] },
      ],
    },
  },
  problem_analysis: {
    nodeData: {
      id: 'root', topic: 'Problema',
      children: [
        { id: '1', topic: 'Causas', children: [] },
        { id: '2', topic: 'Sintomas', children: [] },
        { id: '3', topic: 'Soluções', children: [] },
      ],
    },
  },
  pros_cons: {
    nodeData: {
      id: 'root', topic: 'Decisão',
      children: [
        { id: '1', topic: 'Prós', children: [] },
        { id: '2', topic: 'Contras', children: [] },
      ],
    },
  },
  five_whys: {
    nodeData: {
      id: 'root', topic: 'Problema',
      children: [{
        id: '1', topic: 'Por quê 1?',
        children: [{
          id: '2', topic: 'Por quê 2?',
          children: [{
            id: '3', topic: 'Por quê 3?',
            children: [{
              id: '4', topic: 'Por quê 4?',
              children: [{ id: '5', topic: 'Por quê 5?', children: [] }],
            }],
          }],
        }],
      }],
    },
  },
};

type MindMapCanvasProps = {
  initialData?: MindMapData;
  onSave: (data: MindMapData) => void;
  onGenerate: () => void;
  onDelete: () => void;
  isGenerating: boolean;
  noteTextLength: number;
};

export function MindMapCanvas({
  initialData,
  onSave,
  onGenerate,
  onDelete,
  isGenerating,
  noteTextLength,
}: MindMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixirInstance | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!meRef.current) return;
      const data = meRef.current.getData();
      onSave({ nodeData: data.nodeData } as MindMapData);
    }, 1500);
  }, [onSave]);

  useEffect(() => {
    if (!containerRef.current) return;

    const options: Options = {
      el: containerRef.current,
      direction: MindElixir.RIGHT,
      draggable: true,
      editable: true,
      theme: operisTheme,
    };

    const me = new MindElixir(options);
    const data = initialData ?? TEMPLATES.idea_map;
    me.init(data as Parameters<typeof me.init>[0]);
    me.bus.addListener('operation', triggerSave);
    meRef.current = me;

    return () => {
      me.bus.removeListener('operation', triggerSave);
      meRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(key: string) {
    const t = TEMPLATES[key];
    if (!t || !meRef.current) return;
    meRef.current.refresh(t as Parameters<typeof meRef.current.refresh>[0]);
    setShowTemplates(false);
    triggerSave();
  }

  const TEMPLATE_LABELS: Record<string, string> = {
    idea_map: 'Mapa de Ideia',
    problem_analysis: 'Análise de Problema',
    pros_cons: 'Pros & Cons',
    five_whys: '5 Porquês',
  };

  return (
    <div className="mindmap-canvas-wrapper">
      <div className="diagram-toolbar">
        <button
          className="diagram-toolbar-btn"
          title="Templates"
          onClick={() => setShowTemplates((v) => !v)}
        >⬡</button>
        <button
          className={`diagram-toolbar-btn ${isGenerating ? 'loading' : ''}`}
          title={noteTextLength < 50 ? 'Nota muito curta' : 'Gerar com IA'}
          onClick={onGenerate}
          disabled={noteTextLength < 50 || isGenerating}
        >✦</button>
        <button
          className="diagram-toolbar-btn"
          title="Mais opções"
          onClick={() => setShowDeleteConfirm(true)}
        >···</button>
      </div>

      {showTemplates && (
        <div className="diagram-templates-menu">
          <div className="diagram-node-menu-group">Templates</div>
          {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
            <button key={key} className="diagram-node-menu-item" onClick={() => applyTemplate(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {showDeleteConfirm && (
        <div className="diagram-delete-confirm">
          <p>Tem certeza? Essa ação não pode ser desfeita.</p>
          <div className="diagram-delete-confirm-actions">
            <button className="ghost-button" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
            <button className="diagram-delete-btn" onClick={() => { onDelete(); setShowDeleteConfirm(false); }}>Limpar</button>
          </div>
        </div>
      )}

      <div ref={containerRef} className="mindmap-container" />
    </div>
  );
}
```

- [ ] **Step 3: Integrar em notas.tsx**

Adicionar import:

```typescript
import { MindMapCanvas } from '../components/mindmap-canvas';
import { getMindMap, createMindMap, updateMindMap, deleteMindMap, generateMindMap as generateMindMapAPI, MindMapData } from '../api';
```

Adicionar estado ao componente principal (junto dos estados de diagrama existentes):

```typescript
const [mindmapState, setMindmapState] = useState<'idle' | 'loading' | 'empty' | 'ready' | 'error'>('idle');
const [mindmapData, setMindmapData] = useState<MindMapData | null>(null);
const [isMindmapGenerating, setIsMindmapGenerating] = useState(false);
const [mindmapSaveStatus, setMindmapSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
```

Adicionar handlers:

```typescript
async function loadMindMap(noteId: string) {
  if (mindmapState !== 'idle') return;
  setMindmapState('loading');
  try {
    const mindMap = await getMindMap(noteId);
    if (mindMap) {
      setMindmapData(mindMap.data);
      setMindmapState('ready');
    } else {
      setMindmapState('empty');
    }
  } catch {
    setMindmapState('error');
  }
}

// Atualizar handleModeChange para incluir mindmap:
function handleModeChange(mode: CanvasMode) {
  setCanvasMode(mode);
  if (mode === 'diagram' && diagramState === 'idle' && currentNote?.id) {
    void loadDiagram(currentNote.id);
  }
  if (mode === 'mindmap' && mindmapState === 'idle' && currentNote?.id) {
    void loadMindMap(currentNote.id);
  }
}

async function handleMindMapSave(data: MindMapData) {
  if (!currentNote?.id) return;
  setMindmapSaveStatus('saving');
  try {
    if (mindmapState === 'empty') {
      await createMindMap(currentNote.id, data);
      setMindmapData(data);
      setMindmapState('ready');
    } else {
      await updateMindMap(currentNote.id, data);
      setMindmapData(data);
    }
    setMindmapSaveStatus('saved');
    setTimeout(() => setMindmapSaveStatus('idle'), 2000);
  } catch {
    setMindmapSaveStatus('error');
  }
}

async function handleMindMapGenerate() {
  if (!currentNote?.id) return;
  setIsMindmapGenerating(true);
  try {
    const result = await generateMindMapAPI(currentNote.id, false);
    if ('error' in result) {
      if (result.error === 'mindmap_exists') {
        const confirm = window.confirm('Já existe um mapa mental. Substituir com o gerado pela IA?');
        if (confirm) {
          const retry = await generateMindMapAPI(currentNote.id, true);
          if ('mindMap' in retry) {
            setMindmapData(retry.mindMap.data);
            setMindmapState('ready');
          }
        }
      } else {
        const msg = result.error === 'ai_unavailable'
          ? 'IA indisponível, tente em instantes.'
          : 'Não consegui gerar um mapa para esse texto. Tente reformular a nota.';
        alert(msg);
      }
    } else {
      setMindmapData(result.mindMap.data);
      setMindmapState('ready');
    }
  } finally {
    setIsMindmapGenerating(false);
  }
}

async function handleMindMapDelete() {
  if (!currentNote?.id) return;
  await deleteMindMap(currentNote.id);
  setMindmapData(null);
  setMindmapState('empty');
}
```

Atualizar o botão "Mapa Mental" no toggle — remover `disabled` e `title="Em breve"`:

```tsx
<button
  className={`canvas-mode-btn ${canvasMode === 'mindmap' ? 'active' : ''}`}
  onClick={() => handleModeChange('mindmap')}
>✦ Mapa Mental</button>
```

Adicionar bloco `canvasMode === 'mindmap'` no JSX após o bloco de diagrama:

```tsx
{canvasMode === 'mindmap' && (
  <div className="canvas-area">
    {mindmapState === 'loading' && (
      <div className="canvas-loading">Carregando mapa mental...</div>
    )}
    {mindmapState === 'error' && (
      <div className="canvas-error">
        <p>Erro ao carregar o mapa mental.</p>
        <button onClick={() => { setMindmapState('idle'); void loadMindMap(currentNote!.id); }}>
          Tentar novamente
        </button>
      </div>
    )}
    {mindmapState === 'empty' && (
      <div className="canvas-empty-state">
        <div className="canvas-empty-icon">✦</div>
        <p>Nenhum mapa mental ainda</p>
        <div className="canvas-empty-actions">
          <button className="ghost-button" onClick={() => handleMindMapSave({ nodeData: { id: 'root', topic: 'Ideia', children: [] } })}>
            Começar do zero
          </button>
          <button className="ghost-button" onClick={() => {/* template panel handled by MindMapCanvas */}}>
            Escolher template
          </button>
          {noteTextLength >= 50 && (
            <button onClick={handleMindMapGenerate} disabled={isMindmapGenerating}>
              {isMindmapGenerating ? 'Gerando...' : '✦ Gerar da nota'}
            </button>
          )}
        </div>
      </div>
    )}
    {mindmapState === 'ready' && mindmapData && (
      <MindMapCanvas
        initialData={mindmapData}
        onSave={handleMindMapSave}
        onGenerate={handleMindMapGenerate}
        onDelete={handleMindMapDelete}
        isGenerating={isMindmapGenerating}
        noteTextLength={noteTextLength}
      />
    )}
  </div>
)}
```

- [ ] **Step 4: Adicionar estilos do mindmap**

Adicionar ao final de `styles.css`:

```css
/* ── Mind Map ─────────────────────────────────────── */
.mindmap-canvas-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}
.mindmap-container {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/mindmap-canvas.tsx apps/web/src/pages/notas.tsx apps/web/src/styles.css
git commit -m "feat: add MindMapCanvas component with mind-elixir and 4 templates"
```

---

### Task 11: Verificação da Fase 2

- [ ] Clicar tab "Mapa Mental" → loading → empty state com 3 opções
- [ ] "Começar do zero" → canvas mind-elixir com nó raiz
- [ ] `Tab` → adiciona filho; `Enter` → adiciona irmão; `Delete` → remove nó
- [ ] Duplo clique em nó → edição inline
- [ ] Drag de nó → reordena e salva após 1.5s
- [ ] Template "Pros & Cons" → estrutura bifurcada aparece
- [ ] "Gerar da nota" → mapa mental gerado
- [ ] Fechar e reabrir nota → mapa preservado
- [ ] Limpar mapa → empty state restaurado
- [ ] `npx tsc --noEmit` → zero erros
