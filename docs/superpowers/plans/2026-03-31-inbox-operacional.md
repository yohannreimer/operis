# Inbox Operacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma aba dedicada de Inbox Operacional — captura rápida de itens com contexto, 5 estados (pendente/feito/convertido/agenda/aguardando), conversão para tarefa, integração com agenda e deep work, e modo bruto.

**Architecture:** O modelo `InboxItem` existente é substituído por uma versão rica com status enum, vínculos opcionais a frentes (Workspace) ou contextos próprios da inbox (InboxContext), e campos de waiting/scheduling. Um novo conjunto de rotas `/inbox` substitui as existentes. O painel de inbox dentro de `tarefas.tsx` é removido. O modal de criação de tarefa é extraído para um componente reutilizável `CreateTaskModal`, usado tanto em `tarefas.tsx` quanto em `inbox.tsx`.

**Tech Stack:** Fastify + Prisma (PostgreSQL), React 18 + TypeScript, Radix UI, lucide-react, react-router-dom, sonner (toasts)

---

## File Map

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Modify | `apps/api/prisma/schema.prisma` | Adicionar enums, InboxContext model, reescrever InboxItem |
| Create | `apps/api/prisma/migrations/<timestamp>_inbox_operacional/migration.sql` | Migração SQL |
| Rewrite | `apps/api/src/routes/inbox.ts` | Todos os novos endpoints |
| Create | `apps/api/src/services/inbox-watcher-service.ts` | Cron diário: aguardando → pendente |
| Modify | `apps/api/src/app.ts` | Registrar InboxWatcherService |
| Modify | `apps/web/src/api.ts` | Novos tipos e métodos de API |
| Create | `apps/web/src/components/create-task-modal.tsx` | Modal de criação de tarefa (extraído de tarefas.tsx) |
| Modify | `apps/web/src/pages/tarefas.tsx` | Usar CreateTaskModal, remover painel inbox |
| Create | `apps/web/src/components/inbox-schedule-sheet.tsx` | Bottom sheet Agora/Agendar hora |
| Create | `apps/web/src/components/inbox-item.tsx` | Item individual (checkbox, inline edit, menu) |
| Create | `apps/web/src/components/inbox-group.tsx` | Grupo de itens por contexto |
| Create | `apps/web/src/components/inbox-input.tsx` | Campo de captura com autocomplete @ |
| Create | `apps/web/src/pages/inbox.tsx` | Página principal da Inbox Operacional |
| Modify | `apps/web/src/App.tsx` | Rota /inbox, remover redirect |
| Modify | `apps/web/src/components/layout.tsx` | Adicionar Inbox na nav (entre Hoje e Agenda) |

---

## Task 1: Database Schema — Enums, InboxContext e InboxItem

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migração via `prisma migrate dev`

- [ ] **Step 1: Adicionar enum `InboxItemStatus` ao schema**

Abrir `apps/api/prisma/schema.prisma`. Após o enum `InboxSource` (linha ~127), adicionar:

```prisma
enum InboxItemStatus {
  pendente
  feito
  convertido
  agenda
  aguardando
}
```

- [ ] **Step 2: Adicionar model `InboxContext`**

Após o model `InboxItem` (linha ~514), adicionar:

```prisma
model InboxContext {
  id          String      @id @default(uuid())
  clerkUserId String      @map("clerk_user_id")
  name        String
  position    Int         @default(0)
  createdAt   DateTime    @default(now()) @map("created_at")

  items       InboxItem[]

  @@index([clerkUserId])
  @@map("inbox_contexts")
}
```

- [ ] **Step 3: Substituir o model `InboxItem`**

Substituir o model existente (linhas 505–515) por:

```prisma
model InboxItem {
  id             String          @id @default(uuid())
  clerkUserId    String          @map("clerk_user_id")
  content        String
  source         InboxSource     @default(app)
  status         InboxItemStatus @default(pendente)

  workspaceId    String?         @map("workspace_id")
  inboxContextId String?         @map("inbox_context_id")
  position       Int             @default(0)

  waitingDate    DateTime?       @map("waiting_date")
  waitingPerson  String?         @map("waiting_person")
  waitingNote    String?         @map("waiting_note")

  scheduledAt    DateTime?       @map("scheduled_at")
  convertedTaskId String?        @map("converted_task_id")

  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt      @map("updated_at")

  workspace      Workspace?      @relation(fields: [workspaceId], references: [id], onDelete: SetNull)
  inboxContext   InboxContext?   @relation(fields: [inboxContextId], references: [id], onDelete: SetNull)

  @@index([clerkUserId, status])
  @@map("inbox_items")
}
```

- [ ] **Step 4: Adicionar relação inversa em Workspace**

No model `Workspace`, adicionar a linha de relação:

```prisma
  inboxItems   InboxItem[]
```

- [ ] **Step 5: Rodar a migração**

```bash
cd apps/api
npx prisma migrate dev --name inbox_operacional
```

Esperado: Prisma cria a migration em `prisma/migrations/` e aplica ao banco. Se houver erro de coluna `processed` não nula, a migração SQL gerada precisará ter `ALTER TABLE inbox_items ADD COLUMN status ...` com um DEFAULT. Verificar o SQL gerado antes de confirmar.

- [ ] **Step 6: Regenerar o Prisma Client**

```bash
npx prisma generate
```

- [ ] **Step 7: Typecheck do backend**

```bash
npm run typecheck
```

Esperado: 0 erros. Se houver erros em `routes/inbox.ts` por conta das mudanças de tipo, serão resolvidos na Task 2.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add InboxItemStatus enum, InboxContext model, migrate InboxItem"
```

---

## Task 2: Backend — Reescrever `inbox.ts`

**Files:**
- Rewrite: `apps/api/src/routes/inbox.ts`

- [ ] **Step 1: Reescrever o arquivo completo**

```typescript
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getUserId } from '../middleware/auth.js';

export function registerInboxRoutes(app: FastifyInstance, prisma: PrismaClient) {

  // ── Helpers ─────────────────────────────────────────────────────────────

  function dateRangeForFilter(filter: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    if (filter === 'hoje') {
      return { gte: todayStart, lt: todayEnd };
    }
    if (filter === 'ontem') {
      const start = new Date(todayStart.getTime() - 86400000);
      return { gte: start, lt: todayStart };
    }
    if (filter === 'semana') {
      const start = new Date(todayStart.getTime() - 6 * 86400000);
      return { gte: start, lt: todayEnd };
    }
    return undefined; // 'tudo'
  }

  function assertOwnership(clerkUserId: string, itemClerkUserId: string) {
    if (itemClerkUserId !== clerkUserId) {
      throw new Error('Não autorizado.');
    }
  }

  function validateContextMutualExclusion(workspaceId?: string | null, inboxContextId?: string | null) {
    if (workspaceId && inboxContextId) {
      throw new Error('Um item não pode ter workspaceId e inboxContextId simultaneamente.');
    }
  }

  // ── Items ────────────────────────────────────────────────────────────────

  // GET /inbox — lista itens + contexts do usuário
  app.get('/inbox', async (request) => {
    const clerkUserId = getUserId(request);
    const query = z.object({
      filter: z.enum(['hoje', 'ontem', 'semana', 'tudo']).default('hoje'),
    }).parse(request.query);

    const dateRange = dateRangeForFilter(query.filter);

    const [items, contexts] = await Promise.all([
      prisma.inboxItem.findMany({
        where: {
          clerkUserId,
          ...(dateRange ? { createdAt: dateRange } : {}),
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
        include: {
          workspace: { select: { id: true, name: true, color: true } },
          inboxContext: { select: { id: true, name: true } },
        },
      }),
      prisma.inboxContext.findMany({
        where: { clerkUserId },
        orderBy: { position: 'asc' },
      }),
    ]);

    return { items, contexts };
  });

  // POST /inbox — cria item
  app.post('/inbox', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const payload = z.object({
      content: z.string().min(1),
      source: z.enum(['whatsapp', 'app']).default('app'),
      workspaceId: z.string().uuid().nullish(),
      inboxContextId: z.string().uuid().nullish(),
    }).parse(request.body);

    validateContextMutualExclusion(payload.workspaceId, payload.inboxContextId);

    const item = await prisma.inboxItem.create({
      data: {
        clerkUserId,
        content: payload.content,
        source: payload.source,
        workspaceId: payload.workspaceId ?? null,
        inboxContextId: payload.inboxContextId ?? null,
      },
      include: {
        workspace: { select: { id: true, name: true, color: true } },
        inboxContext: { select: { id: true, name: true } },
      },
    });

    return reply.code(201).send(item);
  });

  // PATCH /inbox/:id — atualiza item
  app.patch('/inbox/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z.object({
      content: z.string().min(1).optional(),
      status: z.enum(['pendente', 'feito', 'convertido', 'agenda', 'aguardando']).optional(),
      workspaceId: z.string().uuid().nullish(),
      inboxContextId: z.string().uuid().nullish(),
      position: z.number().int().optional(),
      waitingDate: z.string().datetime().nullish(),
      waitingPerson: z.string().nullish(),
      waitingNote: z.string().nullish(),
      scheduledAt: z.string().datetime().nullish(),
      convertedTaskId: z.string().uuid().nullish(),
    }).parse(request.body);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    const nextWorkspaceId = 'workspaceId' in payload ? payload.workspaceId : existing.workspaceId;
    const nextContextId = 'inboxContextId' in payload ? payload.inboxContextId : existing.inboxContextId;
    validateContextMutualExclusion(nextWorkspaceId, nextContextId);

    const updated = await prisma.inboxItem.update({
      where: { id },
      data: {
        ...(payload.content !== undefined && { content: payload.content }),
        ...(payload.status !== undefined && { status: payload.status }),
        ...('workspaceId' in payload && { workspaceId: payload.workspaceId ?? null }),
        ...('inboxContextId' in payload && { inboxContextId: payload.inboxContextId ?? null }),
        ...(payload.position !== undefined && { position: payload.position }),
        ...('waitingDate' in payload && { waitingDate: payload.waitingDate ? new Date(payload.waitingDate) : null }),
        ...('waitingPerson' in payload && { waitingPerson: payload.waitingPerson ?? null }),
        ...('waitingNote' in payload && { waitingNote: payload.waitingNote ?? null }),
        ...('scheduledAt' in payload && { scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null }),
        ...('convertedTaskId' in payload && { convertedTaskId: payload.convertedTaskId ?? null }),
      },
      include: {
        workspace: { select: { id: true, name: true, color: true } },
        inboxContext: { select: { id: true, name: true } },
      },
    });

    return updated;
  });

  // DELETE /inbox/:id
  app.delete('/inbox/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    await prisma.inboxItem.delete({ where: { id } });
    return reply.code(204).send();
  });

  // POST /inbox/:id/convert — converte em tarefa (frontend já cria a tarefa via /tasks; esse endpoint só atualiza o status)
  app.post('/inbox/:id/convert', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { taskId } = z.object({ taskId: z.string().uuid() }).parse(request.body);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    const updated = await prisma.inboxItem.update({
      where: { id },
      data: { status: 'convertido', convertedTaskId: taskId },
    });

    return updated;
  });

  // POST /inbox/:id/schedule — aloca na agenda
  app.post('/inbox/:id/schedule', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { mode, scheduledAt } = z.object({
      mode: z.enum(['now', 'scheduled']),
      scheduledAt: z.string().datetime().optional(),
    }).parse(request.body);

    const existing = await prisma.inboxItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    const updated = await prisma.inboxItem.update({
      where: { id },
      data: {
        status: 'agenda',
        scheduledAt: mode === 'now' ? new Date() : scheduledAt ? new Date(scheduledAt) : new Date(),
      },
    });

    return updated;
  });

  // ── Contexts ─────────────────────────────────────────────────────────────

  // GET /inbox/contexts
  app.get('/inbox/contexts', async (request) => {
    const clerkUserId = getUserId(request);
    return prisma.inboxContext.findMany({
      where: { clerkUserId },
      orderBy: { position: 'asc' },
    });
  });

  // POST /inbox/contexts
  app.post('/inbox/contexts', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { name } = z.object({ name: z.string().min(1) }).parse(request.body);

    const context = await prisma.inboxContext.create({
      data: { clerkUserId, name },
    });

    return reply.code(201).send(context);
  });

  // PATCH /inbox/contexts/:id
  app.patch('/inbox/contexts/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z.object({
      name: z.string().min(1).optional(),
      position: z.number().int().optional(),
    }).parse(request.body);

    const existing = await prisma.inboxContext.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    return prisma.inboxContext.update({
      where: { id },
      data: payload,
    });
  });

  // DELETE /inbox/contexts/:id — itens ficam sem contexto
  app.delete('/inbox/contexts/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const existing = await prisma.inboxContext.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    await prisma.inboxItem.updateMany({
      where: { inboxContextId: id },
      data: { inboxContextId: null },
    });

    await prisma.inboxContext.delete({ where: { id } });
    return reply.code(204).send();
  });
}
```

- [ ] **Step 2: Typecheck do backend**

```bash
cd apps/api && npm run typecheck
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/inbox.ts
git commit -m "feat(api): rewrite inbox routes with full Inbox Operacional endpoints"
```

---

## Task 3: Backend — InboxWatcherService (aguardando → pendente)

**Files:**
- Create: `apps/api/src/services/inbox-watcher-service.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Criar o service**

```typescript
// apps/api/src/services/inbox-watcher-service.ts
import { PrismaClient } from '@prisma/client';

export class InboxWatcherService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  start() {
    // Roda imediatamente e depois a cada hora
    this.runCheck().catch(() => {});
    this.timer = setInterval(() => {
      this.runCheck().catch(() => {});
    }, 60 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCheck() {
    const now = new Date();
    await this.prisma.inboxItem.updateMany({
      where: {
        status: 'aguardando',
        waitingDate: { lte: now },
      },
      data: {
        status: 'pendente',
        waitingDate: null,
        waitingPerson: null,
        waitingNote: null,
      },
    });
  }
}
```

- [ ] **Step 2: Registrar em `app.ts`**

No arquivo `apps/api/src/app.ts`:

Adicionar import no topo (junto aos outros imports de services):
```typescript
import { InboxWatcherService } from './services/inbox-watcher-service.js';
```

Dentro de `buildApp()`, após a criação dos outros services, adicionar:
```typescript
const inboxWatcherService = new InboxWatcherService(prisma);
```

Onde aparece `whatsappAutoDispatchService.start()`, adicionar logo abaixo:
```typescript
inboxWatcherService.start();
```

No hook `onClose`, adicionar:
```typescript
inboxWatcherService.stop();
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/inbox-watcher-service.ts apps/api/src/app.ts
git commit -m "feat(api): add InboxWatcherService to auto-revert waiting items to pending"
```

---

## Task 4: Frontend — Tipos e métodos de API (`api.ts`)

**Files:**
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Atualizar o tipo `InboxItem`**

Localizar o tipo `InboxItem` (linha ~964) e substituir por:

```typescript
export type InboxItemStatus = 'pendente' | 'feito' | 'convertido' | 'agenda' | 'aguardando';

export type InboxContextRef = {
  id: string;
  name: string;
};

export type WorkspaceRef = {
  id: string;
  name: string;
  color: string;
};

export type InboxItem = {
  id: string;
  content: string;
  source: 'app' | 'whatsapp';
  status: InboxItemStatus;
  workspaceId: string | null;
  inboxContextId: string | null;
  position: number;
  waitingDate: string | null;
  waitingPerson: string | null;
  waitingNote: string | null;
  scheduledAt: string | null;
  convertedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  workspace: WorkspaceRef | null;
  inboxContext: InboxContextRef | null;
};

export type InboxContext = {
  id: string;
  clerkUserId: string;
  name: string;
  position: number;
  createdAt: string;
};

export type InboxListResponse = {
  items: InboxItem[];
  contexts: InboxContext[];
};
```

- [ ] **Step 2: Substituir os métodos de inbox no objeto `api`**

Localizar os métodos `getInbox`, `createInboxItem`, `processInboxItem` (linhas ~1810–1830) e substituir por:

```typescript
  // ── Inbox Operacional ──────────────────────────────────────────────────
  getInbox: (filter: 'hoje' | 'ontem' | 'semana' | 'tudo' = 'hoje') =>
    apiRequest<InboxListResponse>(`/inbox?filter=${filter}`),

  createInboxItem: (payload: {
    content: string;
    source?: 'app' | 'whatsapp';
    workspaceId?: string | null;
    inboxContextId?: string | null;
  }) =>
    apiRequest<InboxItem>('/inbox', {
      method: 'POST',
      body: JSON.stringify({ source: 'app', ...payload }),
    }),

  updateInboxItem: (
    id: string,
    patch: Partial<{
      content: string;
      status: InboxItemStatus;
      workspaceId: string | null;
      inboxContextId: string | null;
      position: number;
      waitingDate: string | null;
      waitingPerson: string | null;
      waitingNote: string | null;
      scheduledAt: string | null;
      convertedTaskId: string | null;
    }>
  ) =>
    apiRequest<InboxItem>(`/inbox/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteInboxItem: (id: string) =>
    apiRequest<void>(`/inbox/${id}`, { method: 'DELETE' }),

  convertInboxItem: (id: string, taskId: string) =>
    apiRequest<InboxItem>(`/inbox/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    }),

  scheduleInboxItem: (id: string, payload: { mode: 'now' | 'scheduled'; scheduledAt?: string }) =>
    apiRequest<InboxItem>(`/inbox/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getInboxContexts: () =>
    apiRequest<InboxContext[]>('/inbox/contexts'),

  createInboxContext: (name: string) =>
    apiRequest<InboxContext>('/inbox/contexts', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateInboxContext: (id: string, patch: { name?: string; position?: number }) =>
    apiRequest<InboxContext>(`/inbox/contexts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteInboxContext: (id: string) =>
    apiRequest<void>(`/inbox/contexts/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 3: Typecheck do frontend**

```bash
cd apps/web && npm run typecheck
```

Erros esperados em `tarefas.tsx` porque `InboxItem` mudou (campo `processed` não existe mais). Serão resolvidos na Task 6.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts
git commit -m "feat(web/api): update InboxItem type and add Inbox Operacional API methods"
```

---

## Task 5: Frontend — Extrair `CreateTaskModal`

**Files:**
- Create: `apps/web/src/components/create-task-modal.tsx`
- Modify: `apps/web/src/pages/tarefas.tsx`

O modal de criação de tarefa está inline em `tarefas.tsx`. Precisamos extraí-lo para um componente reutilizável que possa ser aberto a partir da Inbox.

- [ ] **Step 1: Criar `create-task-modal.tsx`**

O componente encapsula todo o estado do formulário internamente, recebe `prefill` opcional (title + workspaceId) e chama `onCreated(task)` ao concluir.

```typescript
// apps/web/src/components/create-task-modal.tsx
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  Project,
  Task,
  TaskEnergy,
  TaskExecutionKind,
  TaskHorizon,
  TaskType,
  Workspace,
  WaitingPriority,
  WaitingType,
} from '../api';
import { Modal } from './modal';

type Props = {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  prefill?: { title?: string; workspaceId?: string };
  onCreated?: (task: Task) => void;
};

const TASK_TYPE_PRIORITY: Record<TaskType, number> = { a: 5, b: 3, c: 1 };

function suggestedPriority(type: TaskType) {
  return TASK_TYPE_PRIORITY[type];
}

export function CreateTaskModal({ open, onClose, workspaces, prefill, onCreated }: Props) {
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [dod, setDod] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [estimatedMinutes, setEstimatedMinutes] = useState('60');
  const [taskType, setTaskType] = useState<TaskType>('b');
  const [energyLevel, setEnergyLevel] = useState<TaskEnergy>('media');
  const [executionKind, setExecutionKind] = useState<TaskExecutionKind>('operacao');
  const [horizon, setHorizon] = useState<TaskHorizon>('active');
  const [priority, setPriority] = useState(3);

  // Apply prefill when modal opens
  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? '');
      setWorkspaceId(prefill?.workspaceId ?? '');
      setProjectId('');
      setDod('');
      setEstimatedMinutes('60');
      setTaskType('b');
      setEnergyLevel('media');
      setExecutionKind('operacao');
      setHorizon('active');
      setPriority(3);
    }
  }, [open, prefill?.title, prefill?.workspaceId]);

  // Load projects when workspace changes
  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      setProjectId('');
      return;
    }
    api.getProjects(workspaceId).then((list) => setProjects(list)).catch(() => {});
  }, [workspaceId]);

  const filteredProjects = useMemo(
    () => projects.filter((p) => p.workspaceId === workspaceId && p.status === 'ativo'),
    [projects, workspaceId]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId) {
      toast.error('Selecione uma frente.');
      return;
    }
    setBusy(true);
    try {
      const task = await api.createTask({
        workspaceId,
        projectId: projectId || null,
        title: title.trim(),
        definitionOfDone: dod.trim(),
        taskType,
        energyLevel,
        executionKind,
        horizon,
        priority,
        estimatedMinutes: Number(estimatedMinutes) || 60,
      });
      toast.success('Tarefa criada.');
      onCreated?.(task);
      onClose();
    } catch {
      toast.error('Erro ao criar tarefa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova tarefa" subtitle="Criar tarefa estruturada" size="lg">
      <form className="minimal-form create-task-modal-form" onSubmit={handleSubmit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Verbo + objeto (ex: Fechar proposta comercial)"
          required
        />
        <input
          value={dod}
          onChange={(e) => setDod(e.target.value)}
          placeholder="Definição de pronto"
          required
        />
        <div className="row-2">
          <select
            value={workspaceId}
            onChange={(e) => { setWorkspaceId(e.target.value); setProjectId(''); }}
            required
          >
            <option value="">Frente</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Sem projeto</option>
            {filteredProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        <label>
          Tempo estimado (min)
          <input
            type="number"
            min={1}
            step={1}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            required
          />
        </label>
        <section className="compose-choice-group">
          <div className="compose-choice-label">Tipo (impacto)</div>
          <div className="compose-option-grid">
            {([
              { value: 'a' as TaskType, title: 'Tipo A', subtitle: 'Alto impacto' },
              { value: 'b' as TaskType, title: 'Tipo B', subtitle: 'Importante' },
              { value: 'c' as TaskType, title: 'Tipo C', subtitle: 'Conveniência' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={taskType === opt.value ? `compose-option-card active tone-${opt.value}` : `compose-option-card tone-${opt.value}`}
                onClick={() => { setTaskType(opt.value); setPriority(suggestedPriority(opt.value)); }}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="compose-choice-group">
          <div className="compose-choice-label">Energia necessária</div>
          <div className="compose-option-grid">
            {([
              { value: 'alta' as TaskEnergy, title: 'Alta energia', subtitle: 'Foco intenso' },
              { value: 'media' as TaskEnergy, title: 'Média energia', subtitle: 'Fluxo padrão' },
              { value: 'baixa' as TaskEnergy, title: 'Baixa energia', subtitle: 'Leve/rápida' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={energyLevel === opt.value ? `compose-option-card active tone-energy-${opt.value}` : `compose-option-card tone-energy-${opt.value}`}
                onClick={() => setEnergyLevel(opt.value)}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="compose-choice-group">
          <div className="compose-choice-label">Natureza</div>
          <div className="compose-option-grid two">
            {([
              { value: 'construcao' as TaskExecutionKind, title: 'Construção', subtitle: 'Cria algo novo' },
              { value: 'otimizacao' as TaskExecutionKind, title: 'Otimização', subtitle: 'Melhora o que existe' },
              { value: 'operacao' as TaskExecutionKind, title: 'Operação', subtitle: 'Mantém funcionando' },
              { value: 'suporte' as TaskExecutionKind, title: 'Suporte', subtitle: 'Apoia outros' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={executionKind === opt.value ? 'compose-option-card active' : 'compose-option-card'}
                onClick={() => setExecutionKind(opt.value)}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="compose-choice-group">
          <div className="compose-choice-label">Horizonte</div>
          <div className="compose-option-grid two">
            {([
              { value: 'active' as TaskHorizon, title: 'Ativo', subtitle: 'Executar agora' },
              { value: 'future' as TaskHorizon, title: 'Futuro', subtitle: 'Backlog futuro' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={horizon === opt.value ? 'compose-option-card active' : 'compose-option-card'}
                onClick={() => setHorizon(opt.value)}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </button>
            ))}
          </div>
        </section>
        <div className="compose-footer">
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Criando...' : 'Criar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Atualizar `tarefas.tsx` para usar o novo componente**

No topo de `tarefas.tsx`, adicionar import:
```typescript
import { CreateTaskModal } from '../components/create-task-modal';
```

Localizar o bloco `<Modal open={composeMode} ...>` e a `<form>` dentro dele (linhas ~1480–1700 aprox.) e substituir por:
```tsx
<CreateTaskModal
  open={composeMode}
  onClose={() => setTaskComposeMode(false)}
  workspaces={workspaces}
  onCreated={() => load()}
/>
```

Remover todos os estados `create*` que eram usados pelo formulário inline (createTitle, createDefinitionOfDone, createPriority, createTaskType, createEnergyLevel, createExecutionKind, createHorizon, createEstimatedMinutes, createDueDate, createIsMultiBlock, createUseDueDate, createUseRestriction, createRestrictionTitle, createRestrictionDetail, createRestrictionDependsOnPerson, createRestrictionWaitingOnPerson, createRestrictionWaitingType, createRestrictionWaitingPriority, createRestrictionWaitingDueDate, createWorkspaceId, createProjectId, createProjects).

Remover a função `createTask()` e `suggestedPriorityFromTaskType()` de `tarefas.tsx` (agora estão no CreateTaskModal).

> ⚠️ Fazer isso incrementalmente, removendo um estado por vez e rodando typecheck para confirmar que não há referências ativas.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npm run typecheck
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/create-task-modal.tsx apps/web/src/pages/tarefas.tsx
git commit -m "feat(web): extract CreateTaskModal component from tarefas.tsx"
```

---

## Task 6: Frontend — Remover painel de inbox de `tarefas.tsx`

**Files:**
- Modify: `apps/web/src/pages/tarefas.tsx`

- [ ] **Step 1: Remover os estados de inbox**

Localizar e remover os estados que não são mais usados (após Task 5 já foram removidos os `create*`). Remover também:
- `inboxItems` state (linha ~200)
- `taskPanel` state (linha ~205)
- `captureText` state (linha ~240)
- `processingWorkspaceId`, `processingProjectId`, `processingHorizon` states (linhas ~241-243)
- `pendingInbox`, `processedInbox` derivados (linhas ~575-576)

Remover o tipo `TaskPanel = 'tasks' | 'inbox'` (linha ~52).

- [ ] **Step 2: Remover os efeitos e funções de inbox**

Remover:
- O `useEffect` que faz `setTaskPanel('tasks')` quando composeMode muda (linhas ~331-334)
- O `useEffect` que faz `setTaskPanel('tasks')` quando focusMode muda (linhas ~341-348)
- A função `captureToQueue` (linha ~891)
- A função `processInboxItem` (linha ~910)

- [ ] **Step 3: Remover a chamada `api.getInbox()` dentro de `load()`**

Localizar dentro da função `load()` a linha que chama `api.getInbox()` (linha ~278-321) e removê-la, junto com `setInboxItems(...)`.

- [ ] **Step 4: Remover o switcher de painel e o painel de inbox do JSX**

Localizar e remover:
- Os botões de toggle `taskPanel === 'tasks'` / `taskPanel === 'inbox'` no header (linhas ~1156-1168)
- Todo o bloco `else` do condicional `{focusMode || taskPanel === 'tasks' ? ... : <section className="two-col-grid large">...</section>}` — manter apenas o conteúdo do `then` (lista de tarefas), remover o `else` com o painel de inbox (linhas ~2474-2593)

Remover o import de `InboxItem` do topo se não houver mais referências.

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npm run typecheck
```

Esperado: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/tarefas.tsx
git commit -m "feat(web): remove inbox panel from tarefas page"
```

---

## Task 7: Frontend — `InboxScheduleSheet` (bottom sheet Agora/Agendar hora)

**Files:**
- Create: `apps/web/src/components/inbox-schedule-sheet.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// apps/web/src/components/inbox-schedule-sheet.tsx
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onNow: () => void;
  onScheduled: (isoTime: string) => void;
};

export function InboxScheduleSheet({ open, onClose, onNow, onScheduled }: Props) {
  const [time, setTime] = useState('');

  function handleScheduled() {
    if (!time) return;
    const today = new Date().toISOString().slice(0, 10);
    const isoDateTime = `${today}T${time}:00`;
    onScheduled(isoDateTime);
    setTime('');
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content schedule-sheet" aria-describedby={undefined}>
          <Dialog.Title className="modal-title">Executar hoje</Dialog.Title>

          <div className="schedule-sheet-options">
            <button
              type="button"
              className="schedule-sheet-option primary"
              onClick={() => { onNow(); onClose(); }}
            >
              <strong>Agora</strong>
              <small>Iniciar deep work imediatamente</small>
            </button>

            <div className="schedule-sheet-divider">ou</div>

            <div className="schedule-sheet-time-row">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="HH:MM"
              />
              <button
                type="button"
                className="ghost-button"
                onClick={handleScheduled}
                disabled={!time}
              >
                Agendar
              </button>
            </div>
          </div>

          <button type="button" className="ghost-button" onClick={onClose}>
            Cancelar
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/inbox-schedule-sheet.tsx
git commit -m "feat(web): add InboxScheduleSheet component"
```

---

## Task 8: Frontend — `InboxItem` (item individual)

**Files:**
- Create: `apps/web/src/components/inbox-item.tsx`

O componente renderiza um item da inbox com: checkbox, texto (editável inline), badge de status, menu de ações, e o formulário de "aguardando" (expand inline).

- [ ] **Step 1: Criar o componente**

```typescript
// apps/web/src/components/inbox-item.tsx
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Check, Clock, Calendar, ArrowRight, Trash2, MoreHorizontal, Edit2, MoveRight } from 'lucide-react';
import { InboxItem as InboxItemType, InboxContext, Workspace } from '../api';

type Props = {
  item: InboxItemType;
  contexts: InboxContext[];
  workspaces: Workspace[];
  onToggleDone: (item: InboxItemType) => void;
  onEdit: (item: InboxItemType, newContent: string) => void;
  onDelete: (item: InboxItemType) => void;
  onWaiting: (item: InboxItemType, date: string, person?: string, note?: string) => void;
  onSchedule: (item: InboxItemType) => void;
  onConvert: (item: InboxItemType) => void;
  onMoveContext: (item: InboxItemType, workspaceId: string | null, inboxContextId: string | null) => void;
};

export function InboxItem({
  item,
  contexts,
  workspaces,
  onToggleDone,
  onEdit,
  onDelete,
  onWaiting,
  onSchedule,
  onConvert,
  onMoveContext,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.content);
  const [showMenu, setShowMenu] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [showMoveContext, setShowMoveContext] = useState(false);
  const [waitingDate, setWaitingDate] = useState('');
  const [waitingPerson, setWaitingPerson] = useState('');
  const [waitingNote, setWaitingNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    setEditValue(item.content);
    setEditing(true);
    setShowMenu(false);
  }

  function commitEdit() {
    if (editValue.trim() && editValue.trim() !== item.content) {
      onEdit(item, editValue.trim());
    }
    setEditing(false);
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setEditing(false); setEditValue(item.content); }
  }

  function handleWaitingSave() {
    if (!waitingDate) return;
    onWaiting(item, waitingDate, waitingPerson || undefined, waitingNote || undefined);
    setShowWaiting(false);
    setWaitingDate('');
    setWaitingPerson('');
    setWaitingNote('');
  }

  const isDone = item.status === 'feito';
  const isWaiting = item.status === 'aguardando';
  const isConverted = item.status === 'convertido';
  const isAgenda = item.status === 'agenda';

  function formatWaitingDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  return (
    <div className={`inbox-item ${isDone ? 'inbox-item--done' : ''} ${isWaiting ? 'inbox-item--waiting' : ''}`}>
      <div className="inbox-item-row">
        {/* Checkbox */}
        <button
          type="button"
          className={`inbox-item-checkbox ${isDone ? 'checked' : ''}`}
          onClick={() => onToggleDone(item)}
          aria-label={isDone ? 'Desmarcar' : 'Marcar como feito'}
        >
          {isDone && <Check size={12} />}
        </button>

        {/* Content */}
        <div className="inbox-item-content">
          {editing ? (
            <input
              ref={inputRef}
              className="inbox-item-edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
            />
          ) : (
            <span
              className={`inbox-item-text ${isDone ? 'inbox-item-text--strikethrough' : ''}`}
              onClick={startEdit}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && startEdit()}
            >
              {item.content}
            </span>
          )}

          {/* Badges */}
          <div className="inbox-item-badges">
            {item.source === 'whatsapp' && (
              <span className="inbox-badge inbox-badge--whatsapp">📱 WhatsApp</span>
            )}
            {isWaiting && item.waitingDate && (
              <span className="inbox-badge inbox-badge--waiting">
                <Clock size={10} /> {formatWaitingDate(item.waitingDate)}
                {item.waitingPerson && ` · ${item.waitingPerson}`}
              </span>
            )}
            {isConverted && (
              <span className="inbox-badge inbox-badge--converted">→ Tarefa</span>
            )}
            {isAgenda && item.scheduledAt && (
              <span className="inbox-badge inbox-badge--agenda">
                <Calendar size={10} /> {new Date(item.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <div className="inbox-item-actions">
          <button
            type="button"
            className="inbox-item-menu-trigger ghost-button"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Ações"
          >
            <MoreHorizontal size={14} />
          </button>

          {showMenu && (
            <div className="inbox-item-menu" onBlur={() => setShowMenu(false)}>
              <button type="button" onClick={() => { onToggleDone(item); setShowMenu(false); }}>
                <Check size={12} /> {isDone ? 'Desmarcar' : 'Marcar como feito'}
              </button>
              <button type="button" onClick={startEdit}>
                <Edit2 size={12} /> Editar
              </button>
              <button type="button" onClick={() => { setShowWaiting(true); setShowMenu(false); }}>
                <Clock size={12} /> Aguardando...
              </button>
              <button type="button" onClick={() => { onSchedule(item); setShowMenu(false); }}>
                <Calendar size={12} /> Executar hoje
              </button>
              <button type="button" onClick={() => { onConvert(item); setShowMenu(false); }}>
                <ArrowRight size={12} /> Transformar em tarefa
              </button>
              <button type="button" onClick={() => { setShowMoveContext(true); setShowMenu(false); }}>
                <MoveRight size={12} /> Mover para contexto
              </button>
              <button type="button" className="danger" onClick={() => { onDelete(item); setShowMenu(false); }}>
                <Trash2 size={12} /> Deletar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Waiting form (inline expand) */}
      {showWaiting && (
        <div className="inbox-item-waiting-form">
          <input
            type="date"
            value={waitingDate}
            onChange={(e) => setWaitingDate(e.target.value)}
            placeholder="Data de lembrete"
            required
          />
          <input
            value={waitingPerson}
            onChange={(e) => setWaitingPerson(e.target.value)}
            placeholder="De quem? (opcional)"
          />
          <input
            value={waitingNote}
            onChange={(e) => setWaitingNote(e.target.value)}
            placeholder="Nota (opcional)"
          />
          <div className="inbox-item-waiting-actions">
            <button type="button" className="ghost-button" onClick={() => setShowWaiting(false)}>
              Cancelar
            </button>
            <button type="button" onClick={handleWaitingSave} disabled={!waitingDate}>
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Move context submenu */}
      {showMoveContext && (
        <div className="inbox-item-move-context">
          <small>Mover para:</small>
          <button type="button" className="ghost-button" onClick={() => { onMoveContext(item, null, null); setShowMoveContext(false); }}>
            Sem contexto
          </button>
          {workspaces.map((w) => (
            <button key={w.id} type="button" className="ghost-button" onClick={() => { onMoveContext(item, w.id, null); setShowMoveContext(false); }}>
              {w.name}
            </button>
          ))}
          {contexts.map((c) => (
            <button key={c.id} type="button" className="ghost-button" onClick={() => { onMoveContext(item, null, c.id); setShowMoveContext(false); }}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/inbox-item.tsx
git commit -m "feat(web): add InboxItem component with inline edit, actions menu, waiting form"
```

---

## Task 9: Frontend — `InboxGroup` (grupo de contexto)

**Files:**
- Create: `apps/web/src/components/inbox-group.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// apps/web/src/components/inbox-group.tsx
import { Plus } from 'lucide-react';
import { InboxItem as InboxItemType, InboxContext, Workspace } from '../api';
import { InboxItem } from './inbox-item';

type Props = {
  label: string;
  items: InboxItemType[];
  contexts: InboxContext[];
  workspaces: Workspace[];
  onAddItem?: () => void; // foca o input principal com esse contexto
  onToggleDone: (item: InboxItemType) => void;
  onEdit: (item: InboxItemType, newContent: string) => void;
  onDelete: (item: InboxItemType) => void;
  onWaiting: (item: InboxItemType, date: string, person?: string, note?: string) => void;
  onSchedule: (item: InboxItemType) => void;
  onConvert: (item: InboxItemType) => void;
  onMoveContext: (item: InboxItemType, workspaceId: string | null, inboxContextId: string | null) => void;
};

export function InboxGroup({
  label,
  items,
  contexts,
  workspaces,
  onAddItem,
  onToggleDone,
  onEdit,
  onDelete,
  onWaiting,
  onSchedule,
  onConvert,
  onMoveContext,
}: Props) {
  if (items.length === 0) return null;

  return (
    <div className="inbox-group">
      <div className="inbox-group-header">
        <span className="inbox-group-label">{label}</span>
        <span className="inbox-group-count">{items.length}</span>
        {onAddItem && (
          <button type="button" className="inbox-group-add ghost-button" onClick={onAddItem} aria-label="Adicionar item">
            <Plus size={12} />
          </button>
        )}
      </div>
      <div className="inbox-group-items">
        {items.map((item) => (
          <InboxItem
            key={item.id}
            item={item}
            contexts={contexts}
            workspaces={workspaces}
            onToggleDone={onToggleDone}
            onEdit={onEdit}
            onDelete={onDelete}
            onWaiting={onWaiting}
            onSchedule={onSchedule}
            onConvert={onConvert}
            onMoveContext={onMoveContext}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/inbox-group.tsx
git commit -m "feat(web): add InboxGroup component"
```

---

## Task 10: Frontend — `InboxInput` (campo de captura com @ autocomplete)

**Files:**
- Create: `apps/web/src/components/inbox-input.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// apps/web/src/components/inbox-input.tsx
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { InboxContext, Workspace } from '../api';

type ContextOption = {
  type: 'workspace' | 'inboxContext';
  id: string;
  name: string;
};

type Props = {
  workspaces: Workspace[];
  contexts: InboxContext[];
  focusRef?: React.RefObject<HTMLInputElement>;
  onSubmit: (content: string, workspaceId: string | null, inboxContextId: string | null) => void;
};

export function InboxInput({ workspaces, contexts, focusRef, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [selectedContext, setSelectedContext] = useState<ContextOption | null>(null);
  const [autocomplete, setAutocomplete] = useState<ContextOption[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [atQuery, setAtQuery] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = focusRef ?? inputRef;

  // Detect @ trigger and filter options
  useEffect(() => {
    const atIdx = value.lastIndexOf('@');
    if (atIdx === -1) {
      setShowAutocomplete(false);
      return;
    }
    const query = value.slice(atIdx + 1).toLowerCase();
    setAtQuery(query);

    const allOptions: ContextOption[] = [
      ...workspaces.map((w) => ({ type: 'workspace' as const, id: w.id, name: w.name })),
      ...contexts.map((c) => ({ type: 'inboxContext' as const, id: c.id, name: c.name })),
    ];

    const filtered = query
      ? allOptions.filter((o) => o.name.toLowerCase().includes(query))
      : allOptions;

    setAutocomplete(filtered);
    setAutocompleteIndex(0);
    setShowAutocomplete(filtered.length > 0);
  }, [value, workspaces, contexts]);

  function applyContext(option: ContextOption) {
    // Remove the @query from the input value
    const atIdx = value.lastIndexOf('@');
    const cleaned = value.slice(0, atIdx).trimEnd();
    setValue(cleaned);
    setSelectedContext(option);
    setShowAutocomplete(false);
    ref.current?.focus();
  }

  function clearContext() {
    setSelectedContext(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex((i) => Math.min(i + 1, autocomplete.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (autocomplete[autocompleteIndex]) {
          applyContext(autocomplete[autocompleteIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === 'Enter' && !showAutocomplete) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    const content = value.trim();
    if (!content) return;

    const workspaceId = selectedContext?.type === 'workspace' ? selectedContext.id : null;
    const inboxContextId = selectedContext?.type === 'inboxContext' ? selectedContext.id : null;

    onSubmit(content, workspaceId, inboxContextId);
    setValue('');
    setSelectedContext(null);
  }

  return (
    <div className="inbox-input-container">
      <div className="inbox-input-row">
        {selectedContext && (
          <span className="inbox-input-context-tag">
            @{selectedContext.name}
            <button type="button" onClick={clearContext} aria-label="Remover contexto">×</button>
          </span>
        )}
        <input
          ref={ref}
          className="inbox-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedContext ? 'Digite e pressione Enter...' : 'Digite qualquer coisa... @frente'}
          autoComplete="off"
        />
        <button
          type="button"
          className="inbox-input-submit ghost-button"
          onClick={handleSubmit}
          disabled={!value.trim()}
          aria-label="Criar item"
        >
          ↵
        </button>
      </div>

      {showAutocomplete && (
        <div className="inbox-autocomplete">
          {autocomplete.map((option, idx) => (
            <button
              key={option.id}
              type="button"
              className={`inbox-autocomplete-item ${idx === autocompleteIndex ? 'active' : ''}`}
              onClick={() => applyContext(option)}
            >
              <span className="inbox-autocomplete-type">
                {option.type === 'workspace' ? '🏢' : '📁'}
              </span>
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/inbox-input.tsx
git commit -m "feat(web): add InboxInput component with @ autocomplete"
```

---

## Task 11: Frontend — Página `inbox.tsx`

**Files:**
- Create: `apps/web/src/pages/inbox.tsx`

- [ ] **Step 1: Criar a página**

```typescript
// apps/web/src/pages/inbox.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  api,
  InboxContext,
  InboxItem,
  InboxItemStatus,
  Task,
  Workspace,
} from '../api';
import { useShellContext } from '../components/shell-context';
import { PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
import { InboxInput } from '../components/inbox-input';
import { InboxGroup } from '../components/inbox-group';
import { InboxScheduleSheet } from '../components/inbox-schedule-sheet';
import { CreateTaskModal } from '../components/create-task-modal';

type Filter = 'hoje' | 'ontem' | 'semana' | 'tudo';

export function InboxPage() {
  const { workspaces } = useShellContext();
  const navigate = useNavigate();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [contexts, setContexts] = useState<InboxContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('hoje');
  const [bruteMode, setBruteMode] = useState(false);

  // Schedule sheet state
  const [schedulingItem, setSchedulingItem] = useState<InboxItem | null>(null);

  // Convert to task state
  const [convertingItem, setConvertingItem] = useState<InboxItem | null>(null);

  async function load() {
    try {
      const data = await api.getInbox(filter);
      setItems(data.items);
      setContexts(data.contexts);
    } catch {
      toast.error('Erro ao carregar inbox.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
  }, [filter]);

  // ── Item actions ──────────────────────────────────────────────────────────

  async function handleCreate(content: string, workspaceId: string | null, inboxContextId: string | null) {
    try {
      const item = await api.createInboxItem({ content, workspaceId, inboxContextId });
      setItems((prev) => [item, ...prev]);
    } catch {
      toast.error('Erro ao criar item.');
    }
  }

  async function handleToggleDone(item: InboxItem) {
    const newStatus: InboxItemStatus = item.status === 'feito' ? 'pendente' : 'feito';
    try {
      const updated = await api.updateInboxItem(item.id, { status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao atualizar item.');
    }
  }

  async function handleEdit(item: InboxItem, newContent: string) {
    try {
      const updated = await api.updateInboxItem(item.id, { content: newContent });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao editar item.');
    }
  }

  async function handleDelete(item: InboxItem) {
    try {
      await api.deleteInboxItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      toast.error('Erro ao deletar item.');
    }
  }

  async function handleWaiting(item: InboxItem, date: string, person?: string, note?: string) {
    try {
      const updated = await api.updateInboxItem(item.id, {
        status: 'aguardando',
        waitingDate: new Date(date).toISOString(),
        waitingPerson: person ?? null,
        waitingNote: note ?? null,
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao configurar espera.');
    }
  }

  async function handleScheduleNow(item: InboxItem) {
    try {
      const updated = await api.scheduleInboxItem(item.id, { mode: 'now' });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      navigate('/hoje');
    } catch {
      toast.error('Erro ao agendar item.');
    }
  }

  async function handleScheduleTime(item: InboxItem, isoTime: string) {
    try {
      const updated = await api.scheduleInboxItem(item.id, { mode: 'scheduled', scheduledAt: isoTime });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      toast.success('Agendado com sucesso.');
    } catch {
      toast.error('Erro ao agendar item.');
    }
  }

  async function handleMoveContext(item: InboxItem, workspaceId: string | null, inboxContextId: string | null) {
    try {
      const updated = await api.updateInboxItem(item.id, { workspaceId, inboxContextId });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao mover item.');
    }
  }

  async function handleTaskCreated(task: Task) {
    if (!convertingItem) return;
    try {
      const updated = await api.convertInboxItem(convertingItem.id, task.id);
      setItems((prev) => prev.map((i) => (i.id === convertingItem.id ? updated : i)));
    } catch {
      // silently ignore — task was created, just badge won't appear
    }
    setConvertingItem(null);
  }

  async function handleAddContext() {
    const name = prompt('Nome do novo contexto:');
    if (!name?.trim()) return;
    try {
      const ctx = await api.createInboxContext(name.trim());
      setContexts((prev) => [...prev, ctx]);
    } catch {
      toast.error('Erro ao criar contexto.');
    }
  }

  // ── Grouping logic ────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    if (bruteMode) return null;

    const workspaceGroups = workspaces.map((w) => ({
      id: w.id,
      label: w.name,
      items: items.filter((i) => i.workspaceId === w.id),
    }));

    const contextGroups = contexts.map((c) => ({
      id: c.id,
      label: c.name,
      items: items.filter((i) => i.inboxContextId === c.id),
    }));

    const noContext = {
      id: 'no-context',
      label: 'Sem contexto',
      items: items.filter((i) => !i.workspaceId && !i.inboxContextId),
    };

    return [...workspaceGroups, ...contextGroups, noContext].filter((g) => g.items.length > 0);
  }, [items, workspaces, contexts, bruteMode]);

  const bruteItems = useMemo(() => {
    if (!bruteMode) return [];
    return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, bruteMode]);

  const pendingCount = items.filter((i) => i.status === 'pendente').length;

  const itemCallbacks = {
    onToggleDone: handleToggleDone,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onWaiting: handleWaiting,
    onSchedule: (item: InboxItem) => setSchedulingItem(item),
    onConvert: (item: InboxItem) => setConvertingItem(item),
    onMoveContext: handleMoveContext,
  };

  return (
    <PremiumPage>
      <PremiumHeader
        title="Inbox Operacional"
        subtitle={`${pendingCount} pendente${pendingCount !== 1 ? 's' : ''}`}
      >
        <div className="inbox-header-actions">
          {/* Filter dropdown */}
          <select
            className="ghost-button"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="hoje">Hoje</option>
            <option value="ontem">Ontem</option>
            <option value="semana">Semana</option>
            <option value="tudo">Tudo</option>
          </select>

          {/* Brute mode toggle */}
          <button
            type="button"
            className={bruteMode ? 'ghost-button active' : 'ghost-button'}
            onClick={() => setBruteMode((v) => !v)}
            title="Modo bruto — todos os itens sem agrupamento"
          >
            Bruto
          </button>
        </div>
      </PremiumHeader>

      {/* Capture input — always visible */}
      <div className="inbox-capture-bar">
        <InboxInput
          workspaces={workspaces}
          contexts={contexts}
          onSubmit={handleCreate}
        />
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonBlock />
      ) : bruteMode ? (
        /* Brute mode — flat chronological list */
        <div className="inbox-brute-list">
          {bruteItems.length === 0 ? (
            <div className="inbox-empty">Nenhum item nesse período.</div>
          ) : (
            bruteItems.map((item) => (
              <div key={item.id} className="inbox-brute-item-wrapper">
                {/* Import InboxItem here directly since we don't need grouping */}
                <InboxGroup
                  label=""
                  items={[item]}
                  contexts={contexts}
                  workspaces={workspaces}
                  {...itemCallbacks}
                />
              </div>
            ))
          )}
        </div>
      ) : (
        /* Grouped mode */
        <div className="inbox-groups">
          {(!groups || groups.length === 0) ? (
            <div className="inbox-empty">
              Nenhum item {filter === 'hoje' ? 'hoje' : 'nesse período'}. Use o campo acima para capturar.
            </div>
          ) : (
            groups.map((group) => (
              <InboxGroup
                key={group.id}
                label={group.label}
                items={group.items}
                contexts={contexts}
                workspaces={workspaces}
                {...itemCallbacks}
              />
            ))
          )}

          {/* Add new context button */}
          <button type="button" className="inbox-add-context ghost-button" onClick={handleAddContext}>
            + Novo contexto
          </button>
        </div>
      )}

      {/* Schedule sheet */}
      <InboxScheduleSheet
        open={Boolean(schedulingItem)}
        onClose={() => setSchedulingItem(null)}
        onNow={() => schedulingItem && handleScheduleNow(schedulingItem)}
        onScheduled={(isoTime) => schedulingItem && handleScheduleTime(schedulingItem, isoTime)}
      />

      {/* Convert to task modal */}
      <CreateTaskModal
        open={Boolean(convertingItem)}
        onClose={() => setConvertingItem(null)}
        workspaces={workspaces}
        prefill={{
          title: convertingItem?.content,
          workspaceId: convertingItem?.workspaceId ?? undefined,
        }}
        onCreated={handleTaskCreated}
      />
    </PremiumPage>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/inbox.tsx
git commit -m "feat(web): add InboxPage with full Inbox Operacional UI"
```

---

## Task 12: Frontend — Routing e navegação

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/layout.tsx`

- [ ] **Step 1: Adicionar rota `/inbox` em `App.tsx`**

Adicionar import lazy no topo (junto aos outros lazy imports):
```typescript
const InboxPage = lazy(() => import('./pages/inbox').then((module) => ({ default: module.InboxPage })));
```

Dentro do bloco `<Routes>`, substituir:
```tsx
<Route path="inbox" element={<Navigate to="/tarefas" replace />} />
```
Por:
```tsx
<Route path="inbox" element={<InboxPage />} />
```

- [ ] **Step 2: Adicionar Inbox na navegação em `layout.tsx`**

Localizar o array `links` (linha ~157) e adicionar a entrada de Inbox **entre Hoje e Agenda**:

```typescript
const links: NavItem[] = [
  { to: '/hoje', label: 'Hoje', caption: 'Execução diária', icon: CalendarCheck2 },
  { to: '/inbox', label: 'Inbox', caption: 'Captura rápida', icon: Inbox },  // ← NOVO
  { to: '/agenda', label: 'Agenda', caption: 'Compromissos', icon: CalendarClock },
  // ... restante igual
];
```

O ícone `Inbox` já está importado de `lucide-react` (linha 14 de layout.tsx).

- [ ] **Step 3: Adicionar atalho de teclado `i` para inbox**

Localizar o objeto `GO_ROUTE_MAP` (linha ~168) e adicionar:
```typescript
const GO_ROUTE_MAP: Record<string, string> = {
  h: '/hoje',
  i: '/inbox',   // ← NOVO
  a: '/agenda',
  p: '/projetos',
  t: '/tarefas',
  n: '/notas',
  d: '/'
};
```

- [ ] **Step 4: Typecheck final completo**

```bash
cd apps/web && npm run typecheck
cd ../api && npm run typecheck
```

Esperado: 0 erros em ambos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/layout.tsx
git commit -m "feat(web): add /inbox route and Inbox nav item"
```

---

## Task 13: Verificação manual e polish

- [ ] **Step 1: Subir backend e frontend**

```bash
# Terminal 1 — API
cd apps/api && npm run dev

# Terminal 2 — Web
cd apps/web && npm run dev
```

- [ ] **Step 2: Fluxos a verificar manualmente**

1. **Captura básica**: Digitar no input → Enter → item aparece em "Sem contexto"
2. **Captura com @**: Digitar `@` → autocomplete aparece → selecionar frente → Enter → item aparece no grupo correto
3. **Marcar como feito**: Checkbox → item fica riscado
4. **Edição inline**: Clicar no texto → editar → Enter → texto salvo
5. **Aguardando**: Menu ··· → Aguardando → preencher data → salvar → badge ⏳ aparece
6. **Executar hoje (Agendar hora)**: Menu → Executar hoje → bottom sheet → escolher hora → Agendar → badge de horário
7. **Executar hoje (Agora)**: Menu → Executar hoje → Agora → navega para /hoje
8. **Transformar em tarefa**: Menu → Transformar em tarefa → modal abre com título e frente pré-preenchidos → criar → badge → Tarefa aparece
9. **Mover contexto**: Menu → Mover para contexto → selecionar outro grupo → item se move
10. **Modo bruto**: Toggle Bruto → todos os itens em ordem cronológica sem agrupamento
11. **Filtro temporal**: Selecionar Semana → ver itens da semana
12. **Novo contexto**: Botão + Novo contexto → prompt → contexto aparece na lista e no @ autocomplete
13. **Tarefas sem inbox**: Confirmar que /tarefas não mostra mais o painel de inbox

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: Inbox Operacional — captura rápida com contextos, 5 estados, deep work e conversão de tarefas"
```
