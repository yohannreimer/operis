# Inbox: Grupo Aguardando + Modo Hoje — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a virtual "Aguardando" group that always renders last and collapsed, plus a "Modo Hoje" split-screen activated by a FAB where the user drags inbox items into a persistent daily plan that resets at midnight.

**Architecture:** "Aguardando" is a pure frontend grouping change — no backend needed. "Modo Hoje" adds a `InboxTodayItem` DB table, 4 API endpoints, a midnight-reset worker job, and three new React components (`TodayFAB`, `TodayItem`, `TodayPanel`) wired into `inbox.tsx` via `@dnd-kit/core` + `@dnd-kit/sortable`. `framer-motion` (already installed) handles FAB animation.

**Tech Stack:** Fastify + Prisma (PostgreSQL) · React 18 + TypeScript + Vite · framer-motion (installed) · @dnd-kit/core + @dnd-kit/sortable (to install)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/prisma/schema.prisma` | Modify | Add `InboxTodayItem` model + relation on `InboxItem` |
| `apps/api/src/routes/inbox.ts` | Modify | Add 4 `/inbox/today` endpoints |
| `apps/api/src/services/inbox-watcher-service.ts` | Modify | Add `resetPastTodayItems()` |
| `apps/web/src/api.ts` | Modify | Add `InboxTodayItem` type + 4 API methods |
| `apps/web/src/components/inbox-group.tsx` | Modify | Accept `isVirtual` prop; hide reorder/add buttons |
| `apps/web/src/pages/inbox.tsx` | Modify | Aguardando grouping + todayMode state + split layout + DndContext |
| `apps/web/src/components/inbox-item.tsx` | Modify | Optional `draggable` prop using `useDraggable` |
| `apps/web/src/components/today-fab.tsx` | Create | Floating action button with framer-motion animation |
| `apps/web/src/components/today-item.tsx` | Create | Sortable item inside TodayPanel |
| `apps/web/src/components/today-panel.tsx` | Create | Left panel: pending list + done section + droppable zone |
| `apps/web/src/styles.css` | Modify | CSS for all new components |

---

## Task 1 — Prisma Schema: InboxTodayItem

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1.1: Add reverse relation to InboxItem**

In `apps/api/prisma/schema.prisma`, find the `InboxItem` model. The last relation line before `@@index` is:
```
  inboxContext    InboxContext?   @relation(fields: [inboxContextId], references: [id], onDelete: SetNull)
```
Add the following line immediately after it:
```prisma
  todayItems      InboxTodayItem[]
```

- [ ] **Step 1.2: Add InboxTodayItem model**

After the closing `}` of the `InboxContext` model (around line 556), add:
```prisma
model InboxTodayItem {
  id          String    @id @default(uuid())
  clerkUserId String    @map("clerk_user_id")
  inboxItemId String    @map("inbox_item_id")
  todayDate   String    @map("today_date")
  position    Int       @default(0)
  completedAt DateTime? @map("completed_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  inboxItem   InboxItem @relation(fields: [inboxItemId], references: [id], onDelete: Cascade)

  @@unique([clerkUserId, inboxItemId, todayDate])
  @@index([clerkUserId, todayDate])
  @@map("inbox_today_items")
}
```

- [ ] **Step 1.3: Run migration**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api
npx prisma migrate dev --name add_inbox_today_items
```

Expected output: `✔ Generated Prisma Client` and a new migration folder in `prisma/migrations/`.

- [ ] **Step 1.4: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add InboxTodayItem schema + migration"
```

---

## Task 2 — API: /inbox/today Endpoints

**Files:**
- Modify: `apps/api/src/routes/inbox.ts`

- [ ] **Step 2.1: Add today routes**

In `apps/api/src/routes/inbox.ts`, find the closing `}` of the `registerInboxRoutes` function (line 303). Insert the following block immediately before that closing `}`:

```typescript
  // ── Today ─────────────────────────────────────────────────────────────────

  // GET /inbox/today
  app.get('/inbox/today', async (request) => {
    const clerkUserId = getUserId(request);
    const { todayDate } = z.object({
      todayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);

    return prisma.inboxTodayItem.findMany({
      where: { clerkUserId, todayDate },
      orderBy: { position: 'asc' },
      include: {
        inboxItem: {
          include: {
            workspace: { select: { id: true, name: true, color: true } },
            inboxContext: { select: { id: true, name: true } },
          },
        },
      },
    });
  });

  // POST /inbox/today
  app.post('/inbox/today', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const payload = z.object({
      inboxItemId: z.string().uuid(),
      todayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      position: z.number().int().default(0),
    }).parse(request.body);

    const item = await prisma.inboxItem.findUniqueOrThrow({ where: { id: payload.inboxItemId } });
    assertOwnership(clerkUserId, item.clerkUserId);

    const todayItem = await prisma.inboxTodayItem.create({
      data: {
        clerkUserId,
        inboxItemId: payload.inboxItemId,
        todayDate: payload.todayDate,
        position: payload.position,
      },
      include: {
        inboxItem: {
          include: {
            workspace: { select: { id: true, name: true, color: true } },
            inboxContext: { select: { id: true, name: true } },
          },
        },
      },
    });

    return reply.code(201).send(todayItem);
  });

  // PATCH /inbox/today/:id
  app.patch('/inbox/today/:id', async (request) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const payload = z.object({
      position: z.number().int().optional(),
      completedAt: z.string().datetime().nullable().optional(),
    }).parse(request.body);

    const existing = await prisma.inboxTodayItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    return prisma.inboxTodayItem.update({
      where: { id },
      data: {
        ...(payload.position !== undefined && { position: payload.position }),
        ...('completedAt' in payload && {
          completedAt: payload.completedAt ? new Date(payload.completedAt) : null,
        }),
      },
      include: {
        inboxItem: {
          include: {
            workspace: { select: { id: true, name: true, color: true } },
            inboxContext: { select: { id: true, name: true } },
          },
        },
      },
    });
  });

  // DELETE /inbox/today/:id
  app.delete('/inbox/today/:id', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const existing = await prisma.inboxTodayItem.findUniqueOrThrow({ where: { id } });
    assertOwnership(clerkUserId, existing.clerkUserId);

    await prisma.inboxTodayItem.delete({ where: { id } });
    return reply.code(204).send();
  });
```

- [ ] **Step 2.2: Typecheck API**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/api/src/routes/inbox.ts
git commit -m "feat: add /inbox/today CRUD endpoints"
```

---

## Task 3 — Worker: resetPastTodayItems

**Files:**
- Modify: `apps/api/src/services/inbox-watcher-service.ts`

- [ ] **Step 3.1: Replace file contents**

Replace the entire content of `apps/api/src/services/inbox-watcher-service.ts` with:

```typescript
import { PrismaClient } from '@prisma/client';

export class InboxWatcherService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  start() {
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
    await Promise.all([
      this.convertWaitingItems(),
      this.resetPastTodayItems(),
    ]);
  }

  private async convertWaitingItems() {
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

  private async resetPastTodayItems() {
    const today = new Date().toISOString().slice(0, 10);

    const pastItems = await this.prisma.inboxTodayItem.findMany({
      where: { todayDate: { lt: today } },
    });

    if (pastItems.length === 0) return;

    const completedItemIds = pastItems
      .filter((t) => t.completedAt !== null)
      .map((t) => t.inboxItemId);

    if (completedItemIds.length > 0) {
      await this.prisma.inboxItem.updateMany({
        where: { id: { in: completedItemIds } },
        data: { status: 'feito' },
      });
    }

    await this.prisma.inboxTodayItem.deleteMany({
      where: { id: { in: pastItems.map((t) => t.id) } },
    });
  }
}
```

- [ ] **Step 3.2: Typecheck**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/api/src/services/inbox-watcher-service.ts
git commit -m "feat: add midnight reset for InboxTodayItems in watcher service"
```

---

## Task 4 — Frontend: API Types + Client Methods

**Files:**
- Modify: `apps/web/src/api.ts`

- [ ] **Step 4.1: Add InboxTodayItem type**

In `apps/web/src/api.ts`, find the closing `};` of `InboxListResponse` (around line 1025):
```typescript
export type InboxListResponse = {
  items: InboxItem[];
  contexts: InboxContext[];
};
```

Add the following type immediately after it:

```typescript
export type InboxTodayItem = {
  id: string;
  clerkUserId: string;
  inboxItemId: string;
  todayDate: string;
  position: number;
  completedAt: string | null;
  createdAt: string;
  inboxItem: InboxItem & {
    workspace: WorkspaceRef | null;
    inboxContext: InboxContextRef | null;
  };
};
```

- [ ] **Step 4.2: Add API methods**

In `apps/web/src/api.ts`, find the `deleteInboxContext` method:
```typescript
  deleteInboxContext: (id: string) =>
    apiRequest<void>(`/inbox/contexts/${id}`, { method: 'DELETE' }),
```

Add the following four methods immediately after it:

```typescript
  getTodayItems: (todayDate: string) =>
    apiRequest<InboxTodayItem[]>(`/inbox/today?todayDate=${todayDate}`),

  addTodayItem: (payload: { inboxItemId: string; todayDate: string; position: number }) =>
    apiRequest<InboxTodayItem>('/inbox/today', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTodayItem: (id: string, patch: { position?: number; completedAt?: string | null }) =>
    apiRequest<InboxTodayItem>(`/inbox/today/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  removeTodayItem: (id: string) =>
    apiRequest<void>(`/inbox/today/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 4.3: Typecheck**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4.4: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/web/src/api.ts
git commit -m "feat: add InboxTodayItem type and API client methods"
```

---

## Task 5 — Grupo Aguardando: inbox-group.tsx + inbox.tsx + CSS

**Files:**
- Modify: `apps/web/src/components/inbox-group.tsx`
- Modify: `apps/web/src/pages/inbox.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 5.1: Update inbox-group.tsx to accept isVirtual prop**

Replace the entire content of `apps/web/src/components/inbox-group.tsx` with:

```typescript
import { ChevronDown, ChevronRight, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { InboxItem as InboxItemType, InboxContext, Workspace } from '../api';
import { InboxItem } from './inbox-item';

type ItemCallbacks = {
  onToggleDone: (item: InboxItemType) => void;
  onEdit: (item: InboxItemType, newContent: string) => void;
  onDelete: (item: InboxItemType) => void;
  onWaiting: (item: InboxItemType, date: string, person?: string, note?: string) => void;
  onExecute: (item: InboxItemType) => void;
  onConvert: (item: InboxItemType) => void;
  onMoveContext: (item: InboxItemType, workspaceId: string | null, inboxContextId: string | null) => void;
  onMoveItemUp?: (item: InboxItemType) => void;
  onMoveItemDown?: (item: InboxItemType) => void;
  canMoveItemUp?: (item: InboxItemType) => boolean;
  canMoveItemDown?: (item: InboxItemType) => boolean;
};

type Props = ItemCallbacks & {
  label: string;
  items: InboxItemType[];
  contexts: InboxContext[];
  workspaces: Workspace[];
  onAddItem?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isVirtual?: boolean;
  draggable?: boolean;
};

export function InboxGroup({
  label,
  items,
  contexts,
  workspaces,
  onAddItem,
  collapsed = false,
  onToggleCollapse,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isVirtual = false,
  draggable = false,
  ...callbacks
}: Props) {
  if (items.length === 0) return null;

  return (
    <div className={`inbox-group${isVirtual ? ' inbox-group--virtual' : ''}`}>
      {label && (
        <div className="inbox-group-header">
          {onToggleCollapse && (
            <button
              type="button"
              className="inbox-group-collapse ghost-button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expandir' : 'Recolher'}
            >
              {collapsed
                ? <ChevronRight size={12} />
                : <ChevronDown size={12} />}
            </button>
          )}
          <span className="inbox-group-label">{label}</span>
          <span className="inbox-group-count">{items.length}</span>

          {!isVirtual && (onMoveUp || onMoveDown) && (
            <div className="inbox-group-reorder">
              <button
                type="button"
                className="inbox-group-reorder-btn ghost-button"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                aria-label="Mover grupo para cima"
              >
                <ArrowUp size={11} />
              </button>
              <button
                type="button"
                className="inbox-group-reorder-btn ghost-button"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                aria-label="Mover grupo para baixo"
              >
                <ArrowDown size={11} />
              </button>
            </div>
          )}

          {!isVirtual && onAddItem && (
            <button
              type="button"
              className="inbox-group-add ghost-button"
              onClick={onAddItem}
              aria-label="Adicionar item"
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      )}

      {!collapsed && (
        <div className="inbox-group-items">
          {items.map((item) => (
            <InboxItem
              key={item.id}
              item={item}
              contexts={contexts}
              workspaces={workspaces}
              draggable={draggable}
              {...callbacks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2: Add virtual group CSS**

Append the following to the end of `apps/web/src/styles.css`:

```css
/* ── Inbox Group Virtual (Aguardando) ─────────────────────────────────────── */
.inbox-group--virtual .inbox-group-header {
  opacity: 0.6;
  border-bottom-style: dashed;
}

.inbox-group--virtual .inbox-group-label {
  color: var(--muted);
}
```

- [ ] **Step 5.3: Update inbox.tsx — remove showWaiting, update filteredItems**

In `apps/web/src/pages/inbox.tsx`:

**a)** Change the `collapsedGroups` initial state from `new Set()` to `new Set(['__aguardando__'])`:

Find:
```typescript
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
```
Replace with:
```typescript
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['__aguardando__']));
```

**b)** Remove `showWaiting` state. Find and delete this line:
```typescript
  const [showWaiting, setShowWaiting] = useState(true);
```

**c)** Update `filteredItems` to drop the showWaiting condition. Find:
```typescript
  const filteredItems = useMemo(
    () => items.filter((i) => {
      if (!showDone && i.status === 'feito') return false;
      if (!showWaiting && i.status === 'aguardando') return false;
      return true;
    }),
    [items, showDone, showWaiting]
  );
```
Replace with:
```typescript
  const filteredItems = useMemo(
    () => items.filter((i) => {
      if (!showDone && i.status === 'feito') return false;
      return true;
    }),
    [items, showDone]
  );
```

- [ ] **Step 5.4: Update inbox.tsx — rawGroups to extract aguardando + virtual group**

Find the entire `rawGroups` useMemo block:
```typescript
  const rawGroups = useMemo(() => {
    const workspaceGroups = (workspaces as Workspace[]).map((w) => ({
      id: w.id,
      label: w.name,
      type: 'workspace' as const,
      items: filteredItems.filter((i) => i.workspaceId === w.id),
    }));

    const contextGroups = contexts.map((c) => ({
      id: c.id,
      label: c.name,
      type: 'context' as const,
      items: filteredItems.filter((i) => i.inboxContextId === c.id),
    }));

    const noContext = {
      id: 'no-context',
      label: 'Sem contexto',
      type: 'noContext' as const,
      items: filteredItems.filter((i) => !i.workspaceId && !i.inboxContextId),
    };

    return [...workspaceGroups, ...contextGroups, noContext].filter((g) => g.items.length > 0);
  }, [filteredItems, workspaces, contexts]);
```
Replace with:
```typescript
  const rawGroups = useMemo(() => {
    const aguardandoItems = filteredItems.filter((i) => i.status === 'aguardando');
    const activeItems = filteredItems.filter((i) => i.status !== 'aguardando');

    const workspaceGroups = (workspaces as Workspace[]).map((w) => ({
      id: w.id,
      label: w.name,
      type: 'workspace' as const,
      isVirtual: false,
      items: activeItems.filter((i) => i.workspaceId === w.id),
    }));

    const contextGroups = contexts.map((c) => ({
      id: c.id,
      label: c.name,
      type: 'context' as const,
      isVirtual: false,
      items: activeItems.filter((i) => i.inboxContextId === c.id),
    }));

    const noContext = {
      id: 'no-context',
      label: 'Sem contexto',
      type: 'noContext' as const,
      isVirtual: false,
      items: activeItems.filter((i) => !i.workspaceId && !i.inboxContextId),
    };

    const groups: Array<{
      id: string;
      label: string;
      type: string;
      isVirtual: boolean;
      items: InboxItem[];
    }> = [...workspaceGroups, ...contextGroups, noContext].filter((g) => g.items.length > 0);

    if (aguardandoItems.length > 0) {
      groups.push({
        id: '__aguardando__',
        label: 'Aguardando',
        type: 'virtual',
        isVirtual: true,
        items: aguardandoItems,
      });
    }

    return groups;
  }, [filteredItems, workspaces, contexts]);
```

- [ ] **Step 5.5: Update inbox.tsx — orderedGroups to always place virtual last**

Find the `orderedGroups` useMemo:
```typescript
  const orderedGroups = useMemo(() => {
    const byId = new Map(rawGroups.map((g) => [g.id, g]));
    const known = groupOrder.flatMap((id) => { const g = byId.get(id); return g ? [g] : []; });
    const newOnes = rawGroups.filter((g) => !groupOrder.includes(g.id));
    return [...known, ...newOnes];
  }, [rawGroups, groupOrder]);
```
Replace with:
```typescript
  const orderedGroups = useMemo(() => {
    const byId = new Map(rawGroups.map((g) => [g.id, g]));
    const regularGroups = rawGroups.filter((g) => !g.isVirtual);
    const virtualGroups = rawGroups.filter((g) => g.isVirtual);
    const known = groupOrder.flatMap((id) => { const g = byId.get(id); return g && !g.isVirtual ? [g] : []; });
    const newOnes = regularGroups.filter((g) => !groupOrder.includes(g.id));
    return [...known, ...newOnes, ...virtualGroups];
  }, [rawGroups, groupOrder]);
```

- [ ] **Step 5.6: Update inbox.tsx — exclude virtual groups from groupOrder sync**

Find:
```typescript
  useEffect(() => {
    const newIds = rawGroups.map((g) => g.id).filter((id) => !groupOrder.includes(id));
    if (newIds.length > 0) persistGroupOrder([...groupOrder, ...newIds]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawGroups]);
```
Replace with:
```typescript
  useEffect(() => {
    const newIds = rawGroups
      .filter((g) => !g.isVirtual)
      .map((g) => g.id)
      .filter((id) => !groupOrder.includes(id));
    if (newIds.length > 0) persistGroupOrder([...groupOrder, ...newIds]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawGroups]);
```

- [ ] **Step 5.7: Update inbox.tsx — render groups with isVirtual prop + correct move boundaries**

Find the `orderedGroups.map` render block:
```typescript
            orderedGroups.map((group, idx) => (
              <InboxGroup
                key={group.id}
                label={group.label}
                items={group.items}
                contexts={contexts}
                workspaces={workspaces}
                collapsed={collapsedGroups.has(group.id)}
                onToggleCollapse={() => toggleCollapse(group.id)}
                canMoveUp={idx > 0}
                canMoveDown={idx < orderedGroups.length - 1}
                onMoveUp={() => handleMoveGroup(group.id, 'up')}
                onMoveDown={() => handleMoveGroup(group.id, 'down')}
                {...itemCallbacks}
                {...itemCallbacksWithReorder(group.items)}
              />
            ))
```
Replace with:
```typescript
            (() => {
              const nonVirtualGroups = orderedGroups.filter((g) => !g.isVirtual);
              return orderedGroups.map((group) => {
                const nvIdx = nonVirtualGroups.findIndex((g) => g.id === group.id);
                return (
                  <InboxGroup
                    key={group.id}
                    label={group.label}
                    items={group.items}
                    contexts={contexts}
                    workspaces={workspaces}
                    isVirtual={group.isVirtual}
                    collapsed={collapsedGroups.has(group.id)}
                    onToggleCollapse={() => toggleCollapse(group.id)}
                    canMoveUp={nvIdx > 0}
                    canMoveDown={nvIdx !== -1 && nvIdx < nonVirtualGroups.length - 1}
                    onMoveUp={group.isVirtual ? undefined : () => handleMoveGroup(group.id, 'up')}
                    onMoveDown={group.isVirtual ? undefined : () => handleMoveGroup(group.id, 'down')}
                    {...itemCallbacks}
                    {...itemCallbacksWithReorder(group.items)}
                  />
                );
              });
            })()
```

- [ ] **Step 5.8: Update inbox.tsx — fix handleMoveGroup to skip virtual groups**

Find:
```typescript
  function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    // Work on the ordered visible group IDs
    const visibleIds = orderedGroups.map((g) => g.id);
```
Replace with:
```typescript
  function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    const visibleIds = orderedGroups.filter((g) => !g.isVirtual).map((g) => g.id);
```

- [ ] **Step 5.9: Remove showWaiting from the filter menu UI**

Find and delete this block in the JSX (around lines 487–492):
```typescript
                  <label className="inbox-vis-filter-item">
                    <input
                      type="checkbox"
                      checked={showWaiting}
                      onChange={(e) => setShowWaiting(e.target.checked)}
                    />
                    Mostrar aguardando
                  </label>
```

- [ ] **Step 5.10: Typecheck**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5.11: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/web/src/components/inbox-group.tsx apps/web/src/pages/inbox.tsx apps/web/src/styles.css
git commit -m "feat: Grupo Aguardando — virtual group always last and collapsed"
```

---

## Task 6 — TodayFAB Component

**Files:**
- Create: `apps/web/src/components/today-fab.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 6.1: Create today-fab.tsx**

Create `apps/web/src/components/today-fab.tsx` with:

```typescript
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, X } from 'lucide-react';

type Props = {
  active: boolean;
  onToggle: () => void;
};

export function TodayFAB({ active, onToggle }: Props) {
  return (
    <motion.button
      type="button"
      className={`today-fab${active ? ' today-fab--active' : ''}`}
      onClick={onToggle}
      title={active ? 'Fechar Modo Hoje' : 'Modo Hoje'}
      whileHover={{ scale: 1.08, boxShadow: '0 8px 28px rgba(0,0,0,0.35)' }}
      whileTap={{ scale: 0.93 }}
      animate={{ opacity: active ? 1 : 0.4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {active ? (
          <motion.span
            key="close"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex' }}
          >
            <X size={18} />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex' }}
          >
            <Sun size={18} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
```

- [ ] **Step 6.2: Add TodayFAB CSS**

Append to `apps/web/src/styles.css`:

```css
/* ── Today FAB ─────────────────────────────────────────────────────────────── */
.today-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 50;
  box-shadow: var(--shadow-sm);
  padding: 0;
  transition: background var(--transition-normal) var(--ease-out),
              border-color var(--transition-normal) var(--ease-out),
              color var(--transition-normal) var(--ease-out);
}

.today-fab--active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
```

- [ ] **Step 6.3: Typecheck**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/web/src/components/today-fab.tsx apps/web/src/styles.css
git commit -m "feat: TodayFAB component with framer-motion animation"
```

---

## Task 7 — TodayItem, TodayPanel + dnd-kit

**Files:**
- Install: `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- Create: `apps/web/src/components/today-item.tsx`
- Create: `apps/web/src/components/today-panel.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 7.1: Install dnd-kit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/web
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `node_modules` and `package.json`.

- [ ] **Step 7.2: Create today-item.tsx**

Create `apps/web/src/components/today-item.tsx` with:

```typescript
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { InboxTodayItem } from '../api';

type Props = {
  todayItem: InboxTodayItem;
  onComplete: (todayItem: InboxTodayItem) => void;
  onUncomplete: (todayItem: InboxTodayItem) => void;
};

export function TodayItem({ todayItem, onComplete, onUncomplete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todayItem.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const completed = todayItem.completedAt !== null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`today-item${completed ? ' today-item--completed' : ''}`}
    >
      <button
        type="button"
        className={`today-item-checkbox${completed ? ' today-item-checkbox--checked' : ''}`}
        onClick={() => (completed ? onUncomplete(todayItem) : onComplete(todayItem))}
        aria-label={completed ? 'Desmarcar' : 'Concluir'}
      />
      <span className="today-item-content">{todayItem.inboxItem.content}</span>
      <span
        className="today-item-handle"
        {...attributes}
        {...listeners}
        aria-label="Arrastar para reordenar"
      >
        <GripVertical size={14} />
      </span>
    </div>
  );
}
```

- [ ] **Step 7.3: Create today-panel.tsx**

Create `apps/web/src/components/today-panel.tsx` with:

```typescript
import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { InboxTodayItem } from '../api';
import { TodayItem } from './today-item';

type Props = {
  items: InboxTodayItem[];
  onComplete: (todayItem: InboxTodayItem) => void;
  onUncomplete: (todayItem: InboxTodayItem) => void;
};

export function TodayPanel({ items, onComplete, onUncomplete }: Props) {
  const [showDone, setShowDone] = useState(false);

  const pending = items.filter((i) => i.completedAt === null);
  const done = items.filter((i) => i.completedAt !== null);

  const { setNodeRef, isOver } = useDroppable({ id: 'today-panel-drop' });

  return (
    <div className="today-panel">
      <div className="today-panel-header">
        <span className="today-panel-title">Hoje</span>
        {pending.length > 0 && (
          <span className="today-panel-count">{pending.length}</span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`today-panel-body${isOver ? ' today-panel-body--over' : ''}`}
      >
        <SortableContext
          items={pending.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {pending.length === 0 ? (
            <div className={`today-panel-empty${isOver ? ' today-panel-empty--over' : ''}`}>
              Arraste tarefas aqui para planejar seu dia
            </div>
          ) : (
            pending.map((item) => (
              <TodayItem
                key={item.id}
                todayItem={item}
                onComplete={onComplete}
                onUncomplete={onUncomplete}
              />
            ))
          )}
        </SortableContext>

        {done.length > 0 && (
          <div className="today-panel-done-section">
            <button
              type="button"
              className="today-panel-done-toggle ghost-button"
              onClick={() => setShowDone((v) => !v)}
            >
              {showDone ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Feitos ({done.length})</span>
            </button>
            {showDone && (
              <div className="today-panel-done-items">
                {done.map((item) => (
                  <TodayItem
                    key={item.id}
                    todayItem={item}
                    onComplete={onComplete}
                    onUncomplete={onUncomplete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7.4: Add TodayPanel + TodayItem CSS**

Append to `apps/web/src/styles.css`:

```css
/* ── Today Panel ─────────────────────────────────────────────────────────── */
.today-panel {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  height: 100%;
}

.today-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.today-panel-title {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--primary);
  flex: 1;
}

.today-panel-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  color: var(--primary);
  background: var(--primary-soft);
  border: 1px solid var(--primary-glow);
  border-radius: 999px;
  padding: 1px 7px;
  min-width: 22px;
  text-align: center;
}

.today-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  transition: background var(--transition-fast);
}

.today-panel-body--over {
  background: var(--primary-soft);
}

.today-panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  border: 1.5px dashed var(--border-hover);
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: 0.82rem;
  text-align: center;
  padding: 16px;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.today-panel-empty--over {
  border-color: var(--primary);
  color: var(--primary);
}

.today-panel-done-section {
  margin-top: 8px;
  border-top: 1px solid var(--border);
  padding-top: 6px;
}

.today-panel-done-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--muted);
  padding: 4px 6px;
  width: 100%;
  text-align: left;
  border-color: transparent;
}

.today-panel-done-items {
  margin-top: 4px;
}

/* ── Today Item ──────────────────────────────────────────────────────────── */
.today-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.today-item:hover {
  background: var(--surface-soft);
}

.today-item:hover .today-item-handle {
  opacity: 1;
}

.today-item--completed .today-item-content {
  text-decoration: line-through;
  opacity: 0.45;
}

.today-item-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--muted);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  min-height: unset;
  box-shadow: none;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.today-item-checkbox:hover {
  border-color: var(--primary);
}

.today-item-checkbox--checked {
  background: var(--success);
  border-color: var(--success);
}

.today-item-content {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.4;
}

.today-item-handle {
  color: var(--muted);
  cursor: grab;
  opacity: 0;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.today-item-handle:active {
  cursor: grabbing;
}

/* ── Inbox Today Split Layout ────────────────────────────────────────────── */
.inbox-today-split {
  display: flex;
  gap: 16px;
  height: calc(100vh - 160px);
  min-height: 400px;
}

.inbox-today-split-today {
  width: 40%;
  flex-shrink: 0;
}

.inbox-today-split-inbox {
  flex: 1;
  overflow-y: auto;
}
```

- [ ] **Step 7.5: Typecheck**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7.6: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/web/src/components/today-item.tsx apps/web/src/components/today-panel.tsx apps/web/src/styles.css apps/web/package.json apps/web/package-lock.json
git commit -m "feat: TodayItem + TodayPanel components with dnd-kit"
```

---

## Task 8 — Split Layout Integration: inbox-item.tsx + inbox.tsx

**Files:**
- Modify: `apps/web/src/components/inbox-item.tsx`
- Modify: `apps/web/src/pages/inbox.tsx`

- [ ] **Step 8.1: Add optional draggable to InboxItem**

In `apps/web/src/components/inbox-item.tsx`, add the import for useDraggable. Find the existing import line:
```typescript
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
```
Replace with:
```typescript
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
```

Add `draggable?: boolean` to the `Props` type. Find:
```typescript
  onMoveItemUp?: (item: InboxItemType) => void;
  onMoveItemDown?: (item: InboxItemType) => void;
  canMoveItemUp?: (item: InboxItemType) => boolean;
  canMoveItemDown?: (item: InboxItemType) => boolean;
};
```
Replace with:
```typescript
  onMoveItemUp?: (item: InboxItemType) => void;
  onMoveItemDown?: (item: InboxItemType) => void;
  canMoveItemUp?: (item: InboxItemType) => boolean;
  canMoveItemDown?: (item: InboxItemType) => boolean;
  draggable?: boolean;
};
```

Add `draggable = false` to the function destructuring. Find the function signature that ends with:
```typescript
  canMoveItemUp,
  canMoveItemDown,
}: Props) {
```
Replace with:
```typescript
  canMoveItemUp,
  canMoveItemDown,
  draggable = false,
}: Props) {
```

Add useDraggable hook after the existing useState calls (after `const [showMoveContext, setShowMoveContext] = useState(false);`). Find that line and add after it:
```typescript
  const { attributes: dragAttributes, listeners: dragListeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: item.id,
    data: { type: 'inbox-item', inboxItemId: item.id },
    disabled: !draggable,
  });
```

Apply the drag ref and visual feedback to the item's outer container. Find the outermost `.inbox-item` div render — it typically looks like:
```typescript
  return (
    <div className="inbox-item">
```
Replace with:
```typescript
  return (
    <div
      ref={setDragRef}
      className={`inbox-item${isDragging ? ' inbox-item--dragging' : ''}`}
      style={isDragging ? { opacity: 0.4 } : undefined}
    >
```

Add a drag handle icon that appears when `draggable` is true. In the item header area, add before the closing of the action buttons area. Find the line with the check icon button (typically `<Check size={14} />`). After all action buttons, before the closing of the item header div, add:
```typescript
              {draggable && (
                <button
                  type="button"
                  className="inbox-item-drag-handle ghost-button"
                  {...dragAttributes}
                  {...dragListeners}
                  aria-label="Arrastar para o Hoje"
                >
                  <GripVertical size={13} />
                </button>
              )}
```

Also add `GripVertical` to the lucide-react import. Find:
```typescript
import { Check, Clock, Play, Calendar, ArrowRight, Trash2, MoveRight, ChevronUp, ChevronDown } from 'lucide-react';
```
Replace with:
```typescript
import { Check, Clock, Play, Calendar, ArrowRight, Trash2, MoveRight, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
```

Add CSS for the drag handle. Append to `apps/web/src/styles.css`:

```css
/* ── Inbox item drag handle (Modo Hoje) ──────────────────────────────────── */
.inbox-item-drag-handle {
  color: var(--muted);
  cursor: grab;
  padding: 2px 4px;
  min-height: unset;
  border-color: transparent;
  box-shadow: none;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.inbox-item:hover .inbox-item-drag-handle {
  opacity: 1;
}

.inbox-item-drag-handle:hover {
  color: var(--text-secondary);
  background: var(--surface-elevated);
}

.inbox-item--dragging {
  opacity: 0.4;
}
```

- [ ] **Step 8.2: Add todayMode state + helpers to inbox.tsx**

At the top of `apps/web/src/pages/inbox.tsx`, add new imports. Find:
```typescript
import {
  api,
  DeepWorkSession,
  InboxContext,
  InboxItem,
  InboxItemStatus,
  Task,
  Workspace,
} from '../api';
```
Replace with:
```typescript
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  api,
  DeepWorkSession,
  InboxContext,
  InboxItem,
  InboxItemStatus,
  InboxTodayItem,
  Task,
  Workspace,
} from '../api';
import { TodayFAB } from '../components/today-fab';
import { TodayPanel } from '../components/today-panel';
```

Add the `getTodayDateString` helper before the `InboxPage` function:
```typescript
function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 8.3: Add todayMode + todayItems state inside InboxPage**

Inside `InboxPage`, after the existing state declarations (after `const [convertingItem, setConvertingItem] = useState...`), add:
```typescript
  const [todayMode, setTodayMode] = useState(false);
  const [todayItems, setTodayItems] = useState<InboxTodayItem[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }));
```

- [ ] **Step 8.4: Add loadTodayItems + today handlers inside InboxPage**

After the `handleAddContext` function, add:

```typescript
  // ── Today Mode ────────────────────────────────────────────────────────────

  async function loadTodayItems() {
    try {
      const items = await api.getTodayItems(getTodayDateString());
      setTodayItems(items);
    } catch {
      toast.error('Erro ao carregar Modo Hoje.');
    }
  }

  async function handleAddToToday(inboxItemId: string) {
    const alreadyIn = todayItems.some((i) => i.inboxItemId === inboxItemId);
    if (alreadyIn) return;
    try {
      const position = todayItems.filter((i) => i.completedAt === null).length;
      const todayItem = await api.addTodayItem({ inboxItemId, todayDate: getTodayDateString(), position });
      setTodayItems((prev) => [...prev, todayItem]);
    } catch {
      toast.error('Erro ao adicionar ao Hoje.');
    }
  }

  async function handleCompleteToday(todayItem: InboxTodayItem) {
    const completedAt = new Date().toISOString();
    setTodayItems((prev) => prev.map((i) => (i.id === todayItem.id ? { ...i, completedAt } : i)));
    try {
      await api.updateTodayItem(todayItem.id, { completedAt });
    } catch {
      toast.error('Erro ao concluir.');
      setTodayItems((prev) => prev.map((i) => (i.id === todayItem.id ? { ...i, completedAt: null } : i)));
    }
  }

  async function handleUncompleteToday(todayItem: InboxTodayItem) {
    setTodayItems((prev) => prev.map((i) => (i.id === todayItem.id ? { ...i, completedAt: null } : i)));
    try {
      await api.updateTodayItem(todayItem.id, { completedAt: null });
    } catch {
      toast.error('Erro ao desmarcar.');
      setTodayItems((prev) => prev.map((i) => (i.id === todayItem.id ? { ...i, completedAt: todayItem.completedAt } : i)));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    // Inbox item dropped onto today panel
    if (over.id === 'today-panel-drop' && active.data.current?.type === 'inbox-item') {
      await handleAddToToday(active.data.current.inboxItemId as string);
      return;
    }

    // Reorder within today panel
    if (active.id !== over.id) {
      const pending = todayItems.filter((i) => i.completedAt === null);
      const oldIndex = pending.findIndex((i) => i.id === active.id);
      const newIndex = pending.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(pending, oldIndex, newIndex);
      const done = todayItems.filter((i) => i.completedAt !== null);
      setTodayItems([...reordered, ...done]);

      try {
        await Promise.all([
          api.updateTodayItem(reordered[newIndex].id, { position: newIndex }),
          api.updateTodayItem(reordered[oldIndex].id, { position: oldIndex }),
        ]);
      } catch {
        toast.error('Erro ao reordenar.');
        await loadTodayItems();
      }
    }
  }
```

- [ ] **Step 8.5: Add useEffect to load todayItems when todayMode activates**

After the existing `useEffect` hooks (after the deep work timer effect), add:
```typescript
  useEffect(() => {
    if (todayMode) loadTodayItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayMode]);
```

- [ ] **Step 8.6: Wrap render in DndContext + add split layout**

In the `return` statement, wrap the entire `<PremiumPage>` content with `<DndContext>`. Find:
```typescript
  return (
    <PremiumPage>
```
Replace with:
```typescript
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <PremiumPage>
```

Close the DndContext before the final closing tag. Find the last `</PremiumPage>` and replace with:
```typescript
    </PremiumPage>
    </DndContext>
```

- [ ] **Step 8.7: Replace grouped inbox render with conditional split layout**

Find the `/* Modo agrupado */` block — the outer `<div className="inbox-groups">` and everything inside it, up to and including its closing `</div>`. Replace it with:

```typescript
        /* Modo agrupado */
        todayMode ? (
          <div className="inbox-today-split">
            <div className="inbox-today-split-today">
              <TodayPanel
                items={todayItems}
                onComplete={handleCompleteToday}
                onUncomplete={handleUncompleteToday}
              />
            </div>
            <div className="inbox-today-split-inbox inbox-groups">
              {orderedGroups.length === 0 ? (
                <div className="inbox-empty">
                  Nenhum item {filter === 'hoje' ? 'hoje' : 'nesse período'}. Use o campo acima para capturar.
                </div>
              ) : (
                (() => {
                  const nonVirtualGroups = orderedGroups.filter((g) => !g.isVirtual);
                  return orderedGroups.map((group) => {
                    const nvIdx = nonVirtualGroups.findIndex((g) => g.id === group.id);
                    return (
                      <InboxGroup
                        key={group.id}
                        label={group.label}
                        items={group.items}
                        contexts={contexts}
                        workspaces={workspaces}
                        isVirtual={group.isVirtual}
                        draggable
                        collapsed={collapsedGroups.has(group.id)}
                        onToggleCollapse={() => toggleCollapse(group.id)}
                        canMoveUp={nvIdx > 0}
                        canMoveDown={nvIdx !== -1 && nvIdx < nonVirtualGroups.length - 1}
                        onMoveUp={group.isVirtual ? undefined : () => handleMoveGroup(group.id, 'up')}
                        onMoveDown={group.isVirtual ? undefined : () => handleMoveGroup(group.id, 'down')}
                        {...itemCallbacks}
                        {...itemCallbacksWithReorder(group.items)}
                      />
                    );
                  });
                })()
              )}
            </div>
          </div>
        ) : (
          <div className="inbox-groups">
            {orderedGroups.length === 0 ? (
              <div className="inbox-empty">
                Nenhum item {filter === 'hoje' ? 'hoje' : 'nesse período'}. Use o campo acima para capturar.
              </div>
            ) : (
              (() => {
                const nonVirtualGroups = orderedGroups.filter((g) => !g.isVirtual);
                return orderedGroups.map((group) => {
                  const nvIdx = nonVirtualGroups.findIndex((g) => g.id === group.id);
                  return (
                    <InboxGroup
                      key={group.id}
                      label={group.label}
                      items={group.items}
                      contexts={contexts}
                      workspaces={workspaces}
                      isVirtual={group.isVirtual}
                      collapsed={collapsedGroups.has(group.id)}
                      onToggleCollapse={() => toggleCollapse(group.id)}
                      canMoveUp={nvIdx > 0}
                      canMoveDown={nvIdx !== -1 && nvIdx < nonVirtualGroups.length - 1}
                      onMoveUp={group.isVirtual ? undefined : () => handleMoveGroup(group.id, 'up')}
                      onMoveDown={group.isVirtual ? undefined : () => handleMoveGroup(group.id, 'down')}
                      {...itemCallbacks}
                      {...itemCallbacksWithReorder(group.items)}
                    />
                  );
                });
              })()
            )}

            <button
              type="button"
              className="inbox-add-context ghost-button"
              onClick={handleAddContext}
            >
              + Novo contexto
            </button>
          </div>
        )
```

- [ ] **Step 8.8: Add TodayFAB to render**

Just before the `{/* Convert to task modal */}` comment, add:
```typescript
      <TodayFAB active={todayMode} onToggle={() => setTodayMode((v) => !v)} />
```

- [ ] **Step 8.9: Typecheck**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8.10: Commit**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis
git add apps/web/src/components/inbox-item.tsx apps/web/src/pages/inbox.tsx apps/web/src/styles.css
git commit -m "feat: Modo Hoje — split layout with DndContext, TodayFAB, and drag from inbox"
```

---

## Self-Review Checklist

- [x] Spec §2 (Grupo Aguardando): Covered in Tasks 5.3–5.9
- [x] Spec §3 data model: Covered in Task 1
- [x] Spec §3 API endpoints: Covered in Task 2
- [x] Spec §3 worker reset: Covered in Task 3
- [x] Spec §3 TodayFAB: Covered in Task 6
- [x] Spec §3 TodayPanel: Covered in Task 7
- [x] Spec §3 split layout: Covered in Task 8
- [x] Spec §3 drag from inbox → today: Covered in Tasks 8.1 (InboxItem draggable) + 8.4 (handleDragEnd)
- [x] Spec §3 reorder within today: Covered in Tasks 7.2 (useSortable) + 8.4 (handleDragEnd reorder)
- [x] Spec §3 midnight reset: Covered in Task 3
- [x] Spec §3 completedAt → feito at reset: Covered in Task 3 `resetPastTodayItems`
- [x] Type consistency: `InboxTodayItem` defined in Task 4, used in Tasks 7, 8 — consistent
- [x] Method names: `handleAddToToday`, `handleCompleteToday`, `handleUncompleteToday`, `handleDragEnd` — consistent throughout
- [x] `getTodayDateString` defined once (Task 8.2), used in Tasks 8.3, 8.4
- [x] No TBDs or placeholders
