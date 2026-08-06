# Inbox e Hoje Unificados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir Inbox e Hoje separados por um workspace diário único, no qual capturas rápidas e tarefas complexas compartilham uma lista ordenada, com Inbox contextual, agenda compacta, planejamento opcional e revisão de pendências.

**Architecture:** Preservar `InboxItem`, `Task`, `DayPlanItem` e `InboxTodayItem`, adicionando `DailyExecutionItem` como contêiner de alocação e ordenação diária. Uma camada de serviço fornece operações atômicas e uma união de leitura; o frontend consome essa união num workspace composto por lista, bandeja, compromissos, revisão e modo Planejar.

**Tech Stack:** TypeScript, React 18, React Router, Vite, Vitest, Testing Library, Fastify, Zod, Prisma 5, PostgreSQL, Sonner, dnd-kit, CSS existente do Operis.

---

## Mapa de arquivos

### Banco e API

- Modify: `apps/api/prisma/schema.prisma` — enum, relações e modelo `DailyExecutionItem`.
- Create: `apps/api/prisma/migrations/20260805000000_add_daily_execution_items/migration.sql` — tabela e índices sem apagar estruturas antigas.
- Create: `apps/api/src/services/daily-execution-service.ts` — regra de domínio, ownership, ordenação, conclusão e rollover.
- Create: `apps/api/src/services/daily-execution-service.test.ts` — testes unitários da regra de domínio.
- Create: `apps/api/src/routes/daily-execution.ts` — endpoints autenticados.
- Create: `apps/api/src/routes/daily-execution.test.ts` — contrato HTTP com Fastify inject.
- Modify: `apps/api/src/routes/inbox.ts` — visão `unprocessed` exclui alocações ativas.
- Modify: `apps/api/src/services/inbox-watcher-service.ts` — parar de apagar pendências antigas.
- Create: `apps/api/src/services/inbox-watcher-service.test.ts` — regressão do rollover.
- Modify: `apps/api/src/app.ts` — construir serviço e registrar rotas.

### Frontend

- Modify: `apps/web/src/api.ts` — tipos e cliente da execução diária.
- Modify: `apps/web/src/api.test.ts` — contrato das novas chamadas.
- Create: `apps/web/src/features/today/types.ts` — tipos de apresentação.
- Create: `apps/web/src/features/today/use-today-workspace.ts` — carregamento, mutações otimistas e rollback.
- Create: `apps/web/src/features/today/use-today-workspace.test.tsx` — testes do estado.
- Create: `apps/web/src/features/today/today-execution-row.tsx` — linha comum para inbox e task.
- Create: `apps/web/src/features/today/today-execution-list.tsx` — lista ordenável.
- Create: `apps/web/src/features/today/today-execution-list.test.tsx` — renderização e acessibilidade.
- Create: `apps/web/src/features/today/compact-agenda.tsx` — compromissos compactos.
- Create: `apps/web/src/features/today/rollover-review.tsx` — revisão das pendências anteriores.
- Create: `apps/web/src/features/today/inbox-tray.tsx` — bandeja contextual.
- Create: `apps/web/src/features/today/planner-mode.tsx` — calendário existente encapsulado numa superfície contextual.
- Create: `apps/web/src/features/today/today-workspace.tsx` — composição da experiência.
- Create: `apps/web/src/features/today/today-workspace.test.tsx` — fluxos integrados de UI.
- Create: `apps/web/src/features/inbox/use-inbox-controller.ts` — estado reutilizável extraído da página atual.
- Create: `apps/web/src/features/inbox/use-inbox-controller.test.tsx` — preservação das regras atuais.
- Modify: `apps/web/src/pages/inbox.tsx` — usar controller durante a compatibilidade e remover Modo Hoje antigo.
- Modify: `apps/web/src/pages/hoje.tsx` — tornar `TodayWorkspace` a visão padrão e calendário um modo.
- Modify: `apps/web/src/App.tsx` — `/hoje` canônico e `/inbox` compatível.
- Modify: `apps/web/src/components/layout.tsx` — remover Inbox da navegação e atualizar atalhos.
- Modify: `apps/web/src/components/layout.test.tsx` — novo contrato da navegação.
- Modify: `apps/web/src/styles.css` — linguagem visual desktop/mobile.
- Remove after cutover: `apps/web/src/components/today-fab.tsx`, `apps/web/src/components/today-panel.tsx`, `apps/web/src/components/today-item.tsx` — UI antiga não utilizada.

## Task 1: Criar o contêiner diário no banco

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260805000000_add_daily_execution_items/migration.sql`

- [ ] **Step 1: Adicionar enum, relações reversas e modelo ao schema**

Adicionar `DailyExecutionSource` junto aos enums de Inbox e as relações `dailyExecutionItems` em `Task` e `InboxItem`:

```prisma
enum DailyExecutionSource {
  inbox
  task
}

// Dentro de Task:
dailyExecutionItems DailyExecutionItem[]

// Dentro de InboxItem:
dailyExecutionItems DailyExecutionItem[]

model DailyExecutionItem {
  id          String               @id @default(uuid())
  clerkUserId String               @map("clerk_user_id")
  date        DateTime             @db.Date
  sourceType  DailyExecutionSource @map("source_type")
  inboxItemId String?              @map("inbox_item_id")
  taskId      String?              @map("task_id")
  position    Int                  @default(0)
  completedAt DateTime?            @map("completed_at")
  createdAt   DateTime             @default(now()) @map("created_at")
  updatedAt   DateTime             @updatedAt @map("updated_at")

  inboxItem InboxItem? @relation(fields: [inboxItemId], references: [id], onDelete: Cascade)
  task      Task?      @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@unique([clerkUserId, date, inboxItemId])
  @@unique([clerkUserId, date, taskId])
  @@index([clerkUserId, date, position])
  @@map("daily_execution_items")
}
```

- [ ] **Step 2: Escrever a migration aditiva**

```sql
CREATE TYPE "DailyExecutionSource" AS ENUM ('inbox', 'task');

CREATE TABLE "daily_execution_items" (
  "id" TEXT NOT NULL,
  "clerk_user_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "source_type" "DailyExecutionSource" NOT NULL,
  "inbox_item_id" TEXT,
  "task_id" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_execution_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_execution_items_exactly_one_source_check"
    CHECK (("inbox_item_id" IS NOT NULL)::int + ("task_id" IS NOT NULL)::int = 1),
  CONSTRAINT "daily_execution_items_source_matches_check"
    CHECK (
      ("source_type" = 'inbox' AND "inbox_item_id" IS NOT NULL AND "task_id" IS NULL)
      OR
      ("source_type" = 'task' AND "task_id" IS NOT NULL AND "inbox_item_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "daily_execution_items_user_date_inbox_key"
  ON "daily_execution_items"("clerk_user_id", "date", "inbox_item_id");
CREATE UNIQUE INDEX "daily_execution_items_user_date_task_key"
  ON "daily_execution_items"("clerk_user_id", "date", "task_id");
CREATE INDEX "daily_execution_items_user_date_position_idx"
  ON "daily_execution_items"("clerk_user_id", "date", "position");

ALTER TABLE "daily_execution_items"
  ADD CONSTRAINT "daily_execution_items_inbox_item_id_fkey"
  FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_execution_items"
  ADD CONSTRAINT "daily_execution_items_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Não copiar dados nesta migration. O backfill é lazy e idempotente para respeitar a data local do usuário.

- [ ] **Step 3: Validar Prisma e gerar client**

Run:

```bash
npm run prisma:generate --workspace @execution-os/api
cd apps/api && npx prisma validate
```

Expected: `✔ Generated Prisma Client` e `The schema ... is valid`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260805000000_add_daily_execution_items/migration.sql
git commit -m "feat: add daily execution container"
```

## Task 2: Implementar atribuição, leitura e backfill idempotente

**Files:**
- Create: `apps/api/src/services/daily-execution-service.ts`
- Create: `apps/api/src/services/daily-execution-service.test.ts`

- [ ] **Step 1: Escrever testes que falham para atribuição e ownership**

```ts
import { describe, expect, it, vi } from 'vitest';
import { DailyExecutionService } from './daily-execution-service.js';

describe('DailyExecutionService assignment', () => {
  it('adds an owned inbox item without converting it into a task', async () => {
    const prisma = createPrismaMock();
    prisma.inboxItem.findFirst.mockResolvedValue({ id: 'inbox_1', clerkUserId: 'user_1' });
    prisma.dailyExecutionItem.findFirst.mockResolvedValue(null);
    prisma.dailyExecutionItem.count.mockResolvedValue(2);
    prisma.dailyExecutionItem.create.mockResolvedValue({ id: 'daily_1', sourceType: 'inbox' });
    const service = new DailyExecutionService(prisma as never);

    await service.assign('user_1', '2026-08-05', { sourceType: 'inbox', sourceId: 'inbox_1' });

    expect(prisma.dailyExecutionItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inboxItemId: 'inbox_1', taskId: null, position: 2 })
    }));
    expect(prisma.inboxItem.update).not.toHaveBeenCalled();
  });

  it('rejects a task owned by another user', async () => {
    const prisma = createPrismaMock();
    prisma.task.findFirst.mockResolvedValue(null);
    const service = new DailyExecutionService(prisma as never);

    await expect(service.assign('user_1', '2026-08-05', {
      sourceType: 'task', sourceId: 'task_other'
    })).rejects.toThrow('Origem diária não encontrada.');
  });

  it('returns an existing assignment instead of duplicating it', async () => {
    const prisma = createPrismaMock();
    prisma.inboxItem.findFirst.mockResolvedValue({ id: 'inbox_1', clerkUserId: 'user_1' });
    prisma.dailyExecutionItem.findFirst.mockResolvedValue({ id: 'daily_existing' });
    const service = new DailyExecutionService(prisma as never);

    const result = await service.assign('user_1', '2026-08-05', {
      sourceType: 'inbox', sourceId: 'inbox_1'
    });

    expect(result).toEqual({ id: 'daily_existing' });
    expect(prisma.dailyExecutionItem.create).not.toHaveBeenCalled();
  });
});
```

Usar este helper no próprio arquivo de teste; adicionar operações somente quando um teste novo realmente as consumir:

```ts
const delegate = () => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn()
});

function createPrismaMock() {
  const prisma = {
    inboxItem: delegate(),
    inboxTodayItem: delegate(),
    task: delegate(),
    dailyExecutionItem: delegate(),
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations))
  };
  return prisma;
}
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run:

```bash
npm --workspace @execution-os/api test -- src/services/daily-execution-service.test.ts
```

Expected: FAIL porque `daily-execution-service.ts` ainda não existe.

- [ ] **Step 3: Implementar tipos, normalização da data e `assign`**

```ts
import { PrismaClient } from '@prisma/client';
import { startOfDay } from '../utils/time.js';

export type DailySourceInput = {
  sourceType: 'inbox' | 'task';
  sourceId: string;
};

export class DailyExecutionService {
  constructor(private readonly prisma: PrismaClient) {}

  private normalizedDate(date: string) {
    return startOfDay(date);
  }

  async assign(clerkUserId: string, date: string, input: DailySourceInput) {
    const normalizedDate = this.normalizedDate(date);
    const inboxItem = input.sourceType === 'inbox'
      ? await this.prisma.inboxItem.findFirst({ where: { id: input.sourceId, clerkUserId } })
      : null;
    const task = input.sourceType === 'task'
      ? await this.prisma.task.findFirst({
          where: { id: input.sourceId, workspace: { clerkUserId } }
        })
      : null;

    if (!inboxItem && !task) throw new Error('Origem diária não encontrada.');

    const existing = await this.prisma.dailyExecutionItem.findFirst({
      where: {
        clerkUserId,
        date: normalizedDate,
        ...(inboxItem ? { inboxItemId: inboxItem.id } : { taskId: task!.id })
      },
      include: this.includeSource()
    });
    if (existing) return existing;

    const position = await this.prisma.dailyExecutionItem.count({
      where: { clerkUserId, date: normalizedDate }
    });
    return this.prisma.dailyExecutionItem.create({
      data: {
        clerkUserId,
        date: normalizedDate,
        sourceType: input.sourceType,
        inboxItemId: inboxItem?.id ?? null,
        taskId: task?.id ?? null,
        position
      },
      include: this.includeSource()
    });
  }

  private includeSource() {
    return {
      inboxItem: { include: { workspace: true, inboxContext: true } },
      task: { include: { workspace: true, project: true } }
    } as const;
  }
}
```

- [ ] **Step 4: Adicionar teste e implementação de `listDay` com backfill**

O teste deve provar que `InboxTodayItem` e tarefas `status = hoje` são copiados apenas quando ainda não possuem `DailyExecutionItem`. Implementar:

```ts
async listDay(clerkUserId: string, date: string) {
  const normalizedDate = this.normalizedDate(date);
  await this.backfillLegacy(clerkUserId, date, normalizedDate);
  return this.prisma.dailyExecutionItem.findMany({
    where: { clerkUserId, date: normalizedDate },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: this.includeSource()
  });
}
```

`backfillLegacy` deve ler `InboxTodayItem` pela string `todayDate`, ler tarefas `status: hoje` somente quando `date` é a data atual solicitada, e usar `assign()` para manter a operação idempotente. Ao importar uma tarefa legada, a existência do `DailyExecutionItem` passa a ser a fonte canônica; remover essa alocação no futuro também muda a tarefa de `hoje` para `backlog`, impedindo que o backfill a recrie.

- [ ] **Step 5: Rodar testes e typecheck**

```bash
npm --workspace @execution-os/api test -- src/services/daily-execution-service.test.ts
npm run typecheck --workspace @execution-os/api
```

Expected: todos os testes do arquivo PASS e TypeScript sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/daily-execution-service.ts apps/api/src/services/daily-execution-service.test.ts
git commit -m "feat: add daily execution assignment service"
```

## Task 3: Implementar conclusão, remoção, reordenação e rollover

**Files:**
- Modify: `apps/api/src/services/daily-execution-service.ts`
- Modify: `apps/api/src/services/daily-execution-service.test.ts`

- [ ] **Step 1: Escrever testes de transição que falham**

Cobrir estes casos com mocks explícitos:

```ts
it.each([
  ['inbox', 'inbox_1'],
  ['task', 'task_1']
])('completes %s source and assignment atomically', async (sourceType, sourceId) => {
  const prisma = createPrismaMock();
  prisma.dailyExecutionItem.findFirst.mockResolvedValue({
    id: 'daily_1', clerkUserId: 'user_1', sourceType, inboxItemId: sourceType === 'inbox' ? sourceId : null,
    taskId: sourceType === 'task' ? sourceId : null
  });
  const service = new DailyExecutionService(prisma as never);

  await service.setCompleted('user_1', 'daily_1', true);

  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

it('reorders mixed sources in one transaction', async () => {
  const prisma = createPrismaMock();
  prisma.dailyExecutionItem.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
  const service = new DailyExecutionService(prisma as never);
  await service.reorder('user_1', '2026-08-05', ['b', 'a']);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

it('lists every older incomplete item for rollover', async () => {
  const prisma = createPrismaMock();
  const service = new DailyExecutionService(prisma as never);
  await service.listRollover('user_1', '2026-08-05');
  expect(prisma.dailyExecutionItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ completedAt: null, date: { lt: expect.any(Date) } })
  }));
});
```

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/api test -- src/services/daily-execution-service.test.ts
```

Expected: FAIL indicando métodos ausentes.

- [ ] **Step 3: Implementar métodos atômicos**

Declarar uma constante de include e derivar o tipo Prisma uma única vez:

```ts
import { Prisma } from '@prisma/client';

const dailyExecutionInclude = {
  inboxItem: { include: { workspace: true, inboxContext: true } },
  task: { include: { workspace: true, project: true } }
} satisfies Prisma.DailyExecutionItemInclude;

export type DailyExecutionRecord = Prisma.DailyExecutionItemGetPayload<{
  include: typeof dailyExecutionInclude;
}>;

setCompleted(clerkUserId: string, id: string, completed: boolean): Promise<DailyExecutionRecord>
remove(clerkUserId: string, id: string): Promise<void>
reorder(clerkUserId: string, date: string, orderedIds: string[]): Promise<void>
listRollover(clerkUserId: string, targetDate: string): Promise<DailyExecutionRecord[]>
resolveRollover(
  clerkUserId: string,
  id: string,
  input: { action: 'keep_today' | 'return_inbox' | 'complete'; targetDate: string }
): Promise<DailyExecutionRecord | void>
```

Regras:

- Buscar todas as alocações por `id + clerkUserId`.
- `setCompleted` atualiza alocação e origem na mesma `$transaction`.
- Inbox concluído recebe `status: feito`; Task usa `completedAt` e `status: feito`, conforme o enum existente.
- `remove` apaga apenas a alocação de Inbox. Para Task em `status: hoje`, a mesma transação também retorna a origem a `status: backlog`, evitando reimportação pelo backfill legado.
- `reorder` valida que a lista recebida contém exatamente os ids do dia do usuário.
- `keep_today` muda `date`, normaliza posições e preserva a origem.
- `return_inbox` só é válido para origem Inbox; para Task, remover de Hoje mantém o estado coerente do backlog.
- `complete` reutiliza `setCompleted`.

- [ ] **Step 4: Rodar testes**

```bash
npm --workspace @execution-os/api test -- src/services/daily-execution-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/daily-execution-service.ts apps/api/src/services/daily-execution-service.test.ts
git commit -m "feat: add daily execution transitions"
```

## Task 4: Expor contrato HTTP autenticado

**Files:**
- Create: `apps/api/src/routes/daily-execution.ts`
- Create: `apps/api/src/routes/daily-execution.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever teste HTTP que falha**

Usar `Fastify()` isolado, mockar `getUserId` para `user_1` e registrar a rota com um serviço fake. Cobrir:

```ts
expect((await app.inject({ method: 'GET', url: '/daily-execution/2026-08-05' })).statusCode).toBe(200);
expect((await app.inject({
  method: 'POST',
  url: '/daily-execution/2026-08-05/items',
  payload: { sourceType: 'inbox', sourceId: '11111111-1111-4111-8111-111111111111' }
})).statusCode).toBe(201);
expect((await app.inject({
  method: 'PATCH',
  url: '/daily-execution-items/11111111-1111-4111-8111-111111111111',
  payload: { completed: true }
})).statusCode).toBe(200);
```

Também verificar 400 para data inválida e payload com `sourceType` inválido.

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/api test -- src/routes/daily-execution.test.ts
```

Expected: FAIL porque o módulo de rotas não existe.

- [ ] **Step 3: Implementar rotas e schemas Zod**

Endpoints obrigatórios:

```text
GET    /daily-execution/:date
POST   /daily-execution/:date/items
PATCH  /daily-execution-items/:id
PUT    /daily-execution/:date/order
DELETE /daily-execution-items/:id
GET    /daily-execution/:date/rollover
POST   /daily-execution-items/:id/rollover
```

O `GET` retorna `{ entries, rollover }`. O PATCH aceita apenas `{ completed: boolean }`. O PUT aceita `{ orderedIds: uuid[] }`. O POST de rollover aceita `{ action, targetDate }`.

Serializar todos os records dentro da rota; nenhum objeto Prisma cru atravessa o contrato HTTP:

```ts
type DailyExecutionDto =
  | { id: string; kind: 'inbox'; sourceId: string; title: string; position: number; completedAt: string | null; context: string | null }
  | { id: string; kind: 'task'; sourceId: string; title: string; position: number; completedAt: string | null; project: string | null; estimatedMinutes: number | null; deadline: string | null };

function toDailyExecutionDto(record: DailyExecutionRecord): DailyExecutionDto {
  if (record.sourceType === 'inbox' && record.inboxItem) {
    return {
      id: record.id,
      kind: 'inbox',
      sourceId: record.inboxItem.id,
      title: record.inboxItem.content,
      position: record.position,
      completedAt: record.completedAt?.toISOString() ?? null,
      context: record.inboxItem.inboxContext?.name ?? record.inboxItem.workspace?.name ?? null
    };
  }
  if (record.sourceType === 'task' && record.task) {
    return {
      id: record.id,
      kind: 'task',
      sourceId: record.task.id,
      title: record.task.title,
      position: record.position,
      completedAt: record.completedAt?.toISOString() ?? null,
      project: record.task.project?.name ?? null,
      estimatedMinutes: record.task.estimatedMinutes,
      deadline: record.task.dueDate?.toISOString() ?? null
    };
  }
  throw new Error('DailyExecutionItem sem origem válida.');
}
```

POST, PATCH e rollover devolvem o mesmo DTO. DELETE e PUT respondem `204`. Erros de ownership são `404`; validação Zod é `400`.

- [ ] **Step 4: Registrar o serviço em `buildApp`**

Adicionar importações e wiring:

```ts
const dailyExecutionService = new DailyExecutionService(prisma);
registerDailyExecutionRoutes(app, dailyExecutionService);
```

- [ ] **Step 5: Rodar teste, suíte API e typecheck**

```bash
npm --workspace @execution-os/api test -- src/routes/daily-execution.test.ts
npm run test --workspace @execution-os/api
npm run typecheck --workspace @execution-os/api
```

Expected: PASS, zero falhas e typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/daily-execution.ts apps/api/src/routes/daily-execution.test.ts apps/api/src/app.ts
git commit -m "feat: expose daily execution API"
```

## Task 5: Transformar Inbox em fila e preservar pendências antigas

**Files:**
- Modify: `apps/api/src/routes/inbox.ts`
- Modify: `apps/api/src/services/inbox-watcher-service.ts`
- Create: `apps/api/src/services/inbox-watcher-service.test.ts`

- [ ] **Step 1: Escrever teste de regressão do watcher**

```ts
it('does not delete incomplete allocations from previous dates', async () => {
  const prisma = createWatcherPrismaMock();
  const watcher = new InboxWatcherService(prisma as never);
  await watcher.runOnce();
  expect(prisma.inboxTodayItem.deleteMany).not.toHaveBeenCalled();
  expect(prisma.dailyExecutionItem.deleteMany).not.toHaveBeenCalled();
});
```

Expor `runOnce()` como método público que chama as verificações uma vez; `start()` continua usando o mesmo método.

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/api test -- src/services/inbox-watcher-service.test.ts
```

Expected: FAIL porque `runOnce` não existe e o watcher atual apaga registros.

- [ ] **Step 3: Remover o reset destrutivo**

`runOnce()` deve executar apenas `convertWaitingItems()`. Não atualizar concluídos nem deletar itens anteriores; essa responsabilidade pertence ao serviço de execução diária.

- [ ] **Step 4: Adicionar `view=unprocessed` à rota GET do Inbox**

Estender query:

```ts
const query = z.object({
  filter: z.enum(['hoje', 'ontem', 'semana', 'tudo']).default('hoje'),
  view: z.enum(['all', 'unprocessed']).default('all'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  utcOffset: z.coerce.number().int().default(0)
}).parse(request.query);
```

Quando `view === 'unprocessed'`, excluir itens com `status !== pendente` e ids que possuem `DailyExecutionItem` para `date`. Manter `view=all` com comportamento atual.

- [ ] **Step 5: Rodar testes**

```bash
npm --workspace @execution-os/api test -- src/services/inbox-watcher-service.test.ts
npm run test --workspace @execution-os/api
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/inbox.ts apps/api/src/services/inbox-watcher-service.ts apps/api/src/services/inbox-watcher-service.test.ts
git commit -m "fix: preserve daily rollover items"
```

## Task 6: Adicionar tipos e cliente web

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/api.test.ts`
- Create: `apps/web/src/features/today/types.ts`

- [ ] **Step 1: Escrever testes do contrato do cliente**

Adicionar casos que mockam `fetch` e verificam URL, método e body de `getDailyExecution`, `assignDailyExecution`, `setDailyExecutionCompleted`, `reorderDailyExecution`, `removeDailyExecution` e `resolveDailyRollover`.

Exemplo obrigatório:

```ts
await api.assignDailyExecution('2026-08-05', { sourceType: 'inbox', sourceId: 'inbox_1' });
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining('/daily-execution/2026-08-05/items'),
  expect.objectContaining({ method: 'POST', body: JSON.stringify({ sourceType: 'inbox', sourceId: 'inbox_1' }) })
);
```

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/web test -- src/api.test.ts
```

Expected: FAIL indicando métodos ausentes.

- [ ] **Step 3: Implementar os tipos discriminados**

```ts
export type TodayEntry =
  | { id: string; kind: 'inbox'; sourceId: string; title: string; position: number; completedAt: string | null; context: string | null }
  | { id: string; kind: 'task'; sourceId: string; title: string; position: number; completedAt: string | null; project: string | null; estimatedMinutes: number | null; deadline: string | null };

export type DailyExecutionResponse = {
  entries: TodayEntry[];
  rollover: TodayEntry[];
};
```

O tipo espelha o DTO serializado pela rota; componentes nunca recebem objetos Prisma.

- [ ] **Step 4: Implementar os métodos do cliente**

```ts
getDailyExecution: (date: string) => apiRequest<DailyExecutionResponse>(`/daily-execution/${date}`),
assignDailyExecution: (date: string, payload: { sourceType: 'inbox' | 'task'; sourceId: string }) =>
  apiRequest<TodayEntry>(`/daily-execution/${date}/items`, { method: 'POST', body: JSON.stringify(payload) }),
setDailyExecutionCompleted: (id: string, completed: boolean) =>
  apiRequest<TodayEntry>(`/daily-execution-items/${id}`, { method: 'PATCH', body: JSON.stringify({ completed }) }),
reorderDailyExecution: (date: string, orderedIds: string[]) =>
  apiRequest<void>(`/daily-execution/${date}/order`, { method: 'PUT', body: JSON.stringify({ orderedIds }) }),
removeDailyExecution: (id: string) => apiRequest<void>(`/daily-execution-items/${id}`, { method: 'DELETE' }),
resolveDailyRollover: (id: string, action: 'keep_today' | 'return_inbox' | 'complete', targetDate: string) =>
  apiRequest<TodayEntry | void>(`/daily-execution-items/${id}/rollover`, { method: 'POST', body: JSON.stringify({ action, targetDate }) })
```

Atualizar `getInbox` para aceitar `{ filter, view, date }` sem quebrar chamadas atuais.

- [ ] **Step 5: Rodar testes e typecheck**

```bash
npm --workspace @execution-os/web test -- src/api.test.ts
npm run typecheck --workspace @execution-os/web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/api.test.ts apps/web/src/features/today/types.ts
git commit -m "feat: add daily execution web client"
```

## Task 7: Criar store da tela Hoje com rollback

**Files:**
- Create: `apps/web/src/features/today/use-today-workspace.ts`
- Create: `apps/web/src/features/today/use-today-workspace.test.tsx`

- [ ] **Step 1: Escrever testes de estado que falham**

Usar `renderHook`, mockar `api` e provar:

- carregamento inicial;
- falha de compromissos não apaga nem bloqueia a lista diária;
- falha do Inbox não apaga nem bloqueia a lista diária;
- sol adiciona item e remove da bandeja;
- falha restaura bandeja e lista;
- conclusão otimista reverte em erro;
- reordenação mista persiste ids;
- rollover atualiza somente após sucesso.

```ts
const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));
await act(() => result.current.addInboxToToday(inboxItem));
expect(result.current.entries.map((item) => item.sourceId)).toContain(inboxItem.id);
expect(result.current.inboxItems.map((item) => item.id)).not.toContain(inboxItem.id);
```

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/web test -- src/features/today/use-today-workspace.test.tsx
```

Expected: FAIL porque o hook não existe.

- [ ] **Step 3: Implementar estado e API pública**

```ts
export type TodayWorkspaceState = {
  entries: TodayEntry[];
  rollover: TodayEntry[];
  inboxItems: InboxItem[];
  inboxCount: number;
  commitments: Commitment[];
  loading: boolean;
  error: string | null;
  inboxError: string | null;
  agendaError: string | null;
  reload(): Promise<void>;
  addInboxToToday(item: InboxItem): Promise<void>;
  addTaskToToday(task: Task): Promise<void>;
  toggleCompleted(item: TodayEntry): Promise<void>;
  removeFromToday(item: TodayEntry): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;
  resolveRollover(item: TodayEntry, action: RolloverAction): Promise<void>;
};
```

`reload()` busca execução diária, compromissos e Inbox como recursos independentes com `Promise.allSettled`; falha da agenda ou da bandeja preenche apenas seu erro local e preserva a lista que carregou. Cada mutação salva o snapshot anterior, aplica o estado otimista, chama API e restaura snapshot no `catch`, exibindo `toast.error`. Adição bem-sucedida oferece `toast` com ação **Desfazer** que chama `removeFromToday`; conclusão bem-sucedida oferece **Desfazer** chamando `setDailyExecutionCompleted(id, false)` e restaurando a origem atomicamente.

- [ ] **Step 4: Rodar testes**

```bash
npm --workspace @execution-os/web test -- src/features/today/use-today-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/today/use-today-workspace.ts apps/web/src/features/today/use-today-workspace.test.tsx
git commit -m "feat: add today workspace state"
```

## Task 8: Implementar lista e linha unificadas

**Files:**
- Create: `apps/web/src/features/today/today-execution-row.tsx`
- Create: `apps/web/src/features/today/today-execution-list.tsx`
- Create: `apps/web/src/features/today/today-execution-list.test.tsx`

- [ ] **Step 1: Escrever teste visual-semântico que falha**

```tsx
render(<TodayExecutionList entries={[quickEntry, taskEntry]} onToggle={onToggle} onRemove={onRemove} onReorder={onReorder} />);
expect(screen.getByText('Postar stories')).toBeInTheDocument();
expect(screen.getByText('Construir proposta')).toBeInTheDocument();
expect(screen.getByText('60 min')).toBeInTheDocument();
expect(screen.queryByText(/rápida/i)).not.toBeInTheDocument();
expect(screen.getAllByRole('button', { name: /concluir/i })).toHaveLength(2);
```

Também testar ordem, item concluído, menu acessível e comandos mover acima/abaixo.

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/web test -- src/features/today/today-execution-list.test.tsx
```

Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Implementar `TodayExecutionRow`**

A linha deve renderizar checkbox, título, metadados somente quando existentes e menu contextual. Classes:

```text
today-execution-row
today-execution-row__check
today-execution-row__content
today-execution-row__title
today-execution-row__meta
today-execution-row__actions
```

Não renderizar card, badge “rápida” ou seis botões permanentes.

- [ ] **Step 4: Implementar lista com dnd-kit e alternativa de teclado**

Usar `DndContext`, `SortableContext` e `verticalListSortingStrategy`. No `onDragEnd`, gerar ids com `arrayMove` e chamar `onReorder`. O menu mantém `Mover acima` e `Mover abaixo` para acessibilidade.

- [ ] **Step 5: Rodar testes e typecheck**

```bash
npm --workspace @execution-os/web test -- src/features/today/today-execution-list.test.tsx
npm run typecheck --workspace @execution-os/web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/today/today-execution-row.tsx apps/web/src/features/today/today-execution-list.tsx apps/web/src/features/today/today-execution-list.test.tsx
git commit -m "feat: add unified today list"
```

## Task 9: Extrair controller do Inbox e construir a bandeja

**Files:**
- Create: `apps/web/src/features/inbox/use-inbox-controller.ts`
- Create: `apps/web/src/features/inbox/use-inbox-controller.test.tsx`
- Create: `apps/web/src/features/today/inbox-tray.tsx`
- Modify: `apps/web/src/pages/inbox.tsx`

- [ ] **Step 1: Escrever testes de preservação das regras atuais**

O controller deve manter captura, edição, Aguardando, contexto, conversão, conclusão, exclusão e itens de origem WhatsApp. Testar pelo menos captura, Aguardando, item WhatsApp preservado e exclusão com rollback antes de mover código da página.

- [ ] **Step 2: Confirmar os testes falhando**

```bash
npm --workspace @execution-os/web test -- src/features/inbox/use-inbox-controller.test.tsx
```

Expected: FAIL porque o hook não existe.

- [ ] **Step 3: Extrair estado e callbacks sem mudar comportamento**

O hook retorna:

```ts
type InboxControllerOptions = {
  filter?: 'hoje' | 'ontem' | 'semana' | 'tudo';
  view?: 'all' | 'unprocessed';
  date?: string;
};

type InboxController = {
  items: InboxItem[];
  contexts: InboxContext[];
  workspaces: Workspace[];
  loading: boolean;
  create(content: string, workspaceId?: string | null, inboxContextId?: string | null): Promise<void>;
  toggleDone(item: InboxItem): Promise<void>;
  edit(item: InboxItem, content: string): Promise<void>;
  setWaiting(item: InboxItem, date: string, person?: string, note?: string): Promise<void>;
  moveContext(item: InboxItem, workspaceId: string | null, inboxContextId: string | null): Promise<void>;
  remove(item: InboxItem): Promise<void>;
  convert(item: InboxItem, taskId: string): Promise<void>;
};
```

`InboxPage` passa a consumir `useInboxController({ view: 'all' })`, mas continua visualmente igual neste commit.

- [ ] **Step 4: Implementar `InboxTray`**

Props obrigatórias: `open`, `onClose`, `date`, `onAddToToday`. Usar `role="dialog"`, `aria-modal`, foco inicial na captura, Escape para fechar e restauração do foco do gatilho. A lista usa `useInboxController({ view: 'unprocessed', date })` e reutiliza `InboxInput`, `InboxGroup` e `InboxItem`.

- [ ] **Step 5: Rodar testes existentes e novos**

```bash
npm --workspace @execution-os/web test -- src/features/inbox/use-inbox-controller.test.tsx src/components/layout.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/inbox/use-inbox-controller.ts apps/web/src/features/inbox/use-inbox-controller.test.tsx apps/web/src/features/today/inbox-tray.tsx apps/web/src/pages/inbox.tsx
git commit -m "refactor: extract reusable inbox controller"
```

## Task 10: Implementar compromissos compactos e revisão

**Files:**
- Create: `apps/web/src/features/today/compact-agenda.tsx`
- Create: `apps/web/src/features/today/rollover-review.tsx`
- Create: `apps/web/src/features/today/today-workspace.test.tsx`

- [ ] **Step 1: Escrever testes de componentes que falham**

Cobrir:

- agenda vazia ocupa no máximo uma linha;
- compromissos exibem horário, título e duração;
- três ou mais compromissos podem ser expandidos/recolhidos;
- revisão oferece Manter em Hoje, Voltar ao Inbox e Concluir;
- tarefa complexa não exibe Voltar ao Inbox.

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/web test -- src/features/today/today-workspace.test.tsx
```

Expected: FAIL por componentes ausentes.

- [ ] **Step 3: Implementar `CompactAgenda`**

Receber `Commitment[]`, ordenar por `startTime`, mostrar até três linhas e botão `+ n compromissos`. Não importar `SchedulerGrid`.

- [ ] **Step 4: Implementar `RolloverReview`**

Agrupar por data anterior, começar recolhido após a primeira revisão da sessão e chamar `onResolve(item, action)`. O rótulo muda de “Pendente de ontem” para “Pendentes anteriores” quando houver data mais antiga.

- [ ] **Step 5: Rodar testes**

```bash
npm --workspace @execution-os/web test -- src/features/today/today-workspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/today/compact-agenda.tsx apps/web/src/features/today/rollover-review.tsx apps/web/src/features/today/today-workspace.test.tsx
git commit -m "feat: add compact agenda and rollover review"
```

## Task 11: Compor TodayWorkspace e tornar Planejar contextual

**Files:**
- Create: `apps/web/src/features/today/planner-mode.tsx`
- Create: `apps/web/src/features/today/today-workspace.tsx`
- Modify: `apps/web/src/pages/hoje.tsx`
- Modify: `apps/web/src/features/today/today-workspace.test.tsx`

- [ ] **Step 1: Escrever teste integrado da tela padrão**

```tsx
render(<TodayWorkspace date="2026-08-05" />);
expect(await screen.findByRole('heading', { name: /hoje/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /inbox · 17/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /planejar/i })).toBeInTheDocument();
expect(screen.queryByText(/07:00/)).not.toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: /planejar/i }));
expect(await screen.findByRole('dialog', { name: /planejar o dia/i })).toBeInTheDocument();
```

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/web test -- src/features/today/today-workspace.test.tsx
```

Expected: FAIL porque `TodayWorkspace` não existe.

- [ ] **Step 3: Implementar composição padrão**

Ordem fixa:

```tsx
<TodayHeader />
<CompactAgenda commitments={commitments} />
<RolloverReview items={rollover} onResolve={resolveRollover} />
<TodayExecutionList entries={entries} />
<InboxTray open={inboxOpen} />
```

O cabeçalho contém somente data, `Inbox · n` e `Planejar`. Capacidade, prioridades e deep work aparecem como linhas auxiliares abaixo da lista ou dentro do modo Planejar, sem cards próprios. `TodayWorkspace` renderiza skeleton apenas para a carga inicial da lista; erros de Inbox e agenda aparecem dentro das respectivas superfícies, e estado vazio mantém `+ Adicionar item` visível.

- [ ] **Step 4: Encapsular o calendário atual no modo Planejar**

Mover `SchedulerGrid`, filtros, capacidade e drag-and-drop existentes para `PlannerMode`. Renderizá-lo somente quando `plannerOpen` for verdadeiro. Desktop: painel/dialog largo. Celular: dialog full-screen. Fechar não desmonta dados confirmados; apenas fecha a superfície.

- [ ] **Step 5: Fazer `HojePage` delegar para `TodayWorkspace`**

Preservar parsing de data e contexto da rota. Remover da renderização padrão `PremiumCard` de Agenda, `Pool de execução`, navegação Ontem/Hoje/Amanhã redundante e hero de capacidade.

- [ ] **Step 6: Rodar testes e typecheck**

```bash
npm --workspace @execution-os/web test -- src/features/today/today-workspace.test.tsx
npm run typecheck --workspace @execution-os/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/today/planner-mode.tsx apps/web/src/features/today/today-workspace.tsx apps/web/src/features/today/today-workspace.test.tsx apps/web/src/pages/hoje.tsx
git commit -m "feat: make today the daily workspace"
```

## Task 12: Atualizar navegação e remover o Modo Hoje antigo

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/layout.tsx`
- Modify: `apps/web/src/components/layout.test.tsx`
- Modify: `apps/web/src/pages/inbox.tsx`
- Remove: `apps/web/src/components/today-fab.tsx`
- Remove: `apps/web/src/components/today-panel.tsx`
- Remove: `apps/web/src/components/today-item.tsx`

- [ ] **Step 1: Atualizar testes de navegação primeiro**

Expectativas novas:

```ts
expect(getMobilePrimaryLinks().map((link) => link.label)).toEqual(['Hoje', 'Agenda', 'Tarefas']);
expect(getActiveShellRoute('/desconhecida')?.label).toBe('Hoje');
expect(getActiveShellRoute('/inbox')?.label).toBe('Hoje');
```

Adicionar teste de rota comprovando `/inbox` → `/hoje?inbox=open` e `/` → `/hoje`.

- [ ] **Step 2: Confirmar falha**

```bash
npm --workspace @execution-os/web test -- src/components/layout.test.tsx
```

Expected: FAIL com a navegação antiga.

- [ ] **Step 3: Atualizar rotas e atalhos**

- Remover Inbox de `shellLinks`.
- Fazer `GO_ROUTE_MAP.i = '/hoje?inbox=open'`.
- Usar Hoje como fallback de `getActiveShellRoute`.
- Redirecionar index para `/hoje`.
- Redirecionar `/inbox` para `/hoje?inbox=open`.
- Manter captura global criando `InboxItem`.

- [ ] **Step 4: Remover o split e componentes antigos**

Apagar `todayMode`, `TodayFAB`, `TodayPanel`, timers exclusivos do painel e o JSX `inbox-today-split`. Não remover endpoints `/inbox/today` nem tabela `InboxTodayItem` nesta versão.

- [ ] **Step 5: Rodar testes**

```bash
npm --workspace @execution-os/web test -- src/components/layout.test.tsx
npm run typecheck --workspace @execution-os/web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx apps/web/src/pages/inbox.tsx
git rm apps/web/src/components/today-fab.tsx apps/web/src/components/today-panel.tsx apps/web/src/components/today-item.tsx
git commit -m "refactor: unify inbox and today navigation"
```

## Task 13: Aplicar linguagem visual, responsividade e verificar o produto

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/today/today-workspace.test.tsx`
- Modify: `docs/superpowers/specs/2026-08-05-inbox-hoje-unificado-design.md` only if implementation reveals a documented contradiction

- [ ] **Step 1: Adicionar testes de classes e acessibilidade antes do CSS**

Verificar `role=dialog`, `aria-modal`, nomes dos gatilhos, ausência de seis ações permanentes, presença de menus e `aria-live` para erros/undo.

- [ ] **Step 2: Implementar tokens e layout desktop**

Criar bloco de estilos `today-workspace-*`:

```css
.today-workspace { width: min(920px, 100%); margin: 0 auto; }
.today-workspace__header { display: flex; align-items: center; gap: 12px; min-height: 48px; }
.today-execution-row { min-height: 48px; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; }
.today-execution-row + .today-execution-row { border-top: 1px solid var(--border-subtle); }
.today-execution-row__actions { opacity: 0; }
.today-execution-row:hover .today-execution-row__actions,
.today-execution-row:focus-within .today-execution-row__actions { opacity: 1; }
```

Usar laranja apenas em ação principal/estado ativo. Remover bordas e backgrounds do layout antigo somente dentro da nova árvore de classes.

- [ ] **Step 3: Implementar breakpoints mobile**

Em `max-width: 767px`:

- canvas com padding 12–16px;
- linhas com alvo mínimo 44px;
- InboxTray como bottom sheet;
- Planejar como tela cheia;
- agenda compacta rolável;
- ações secundárias por menu, não numa segunda linha permanente;
- respeitar safe areas da navegação inferior.

- [ ] **Step 4: Respeitar movimento reduzido**

```css
@media (prefers-reduced-motion: reduce) {
  .today-workspace *, .inbox-tray * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Rodar verificação automatizada completa**

```bash
npm run test --workspace @execution-os/api
npm run test --workspace @execution-os/web
npm run typecheck
npm run build
```

Expected: zero testes falhando, typecheck com exit 0 e build com exit 0.

- [ ] **Step 6: Executar QA visual no navegador interno**

Validar e capturar:

```text
1440×900  — Hoje, Inbox fechado, Inbox aberto, Planejar aberto
1280×800  — mesmos estados
768×1024  — tablet
390×844   — celular principal
360×800   — celular estreito
```

Em cada tamanho testar: captura → Inbox, sol → Hoje, mistura rápida/complexa, reordenação, concluir/desfazer, rollover, fechar bandeja, fechar Planejar e navegação por teclado. Comparar com as imagens da especificação.

Também validar estados vazio, carregando, erro isolado e lista com pelo menos 50 itens; confirmar ausência de rolagem horizontal e sobreposição com a navegação inferior.

- [ ] **Step 7: Confirmar que dados legados permanecem**

Antes da migration, salvar a saída; depois da migration, executar exatamente a mesma consulta e comparar os quatro valores:

```bash
psql "$DATABASE_URL" -Atc 'SELECT '\''inbox_items='\'' || COUNT(*) FROM inbox_items UNION ALL SELECT '\''tasks='\'' || COUNT(*) FROM tasks UNION ALL SELECT '\''day_plan_items='\'' || COUNT(*) FROM day_plan_items UNION ALL SELECT '\''inbox_today_items='\'' || COUNT(*) FROM inbox_today_items;'
```

A migration deve alterar zero registros nessas quatro tabelas. A única contagem nova permitida é `daily_execution_items`, preenchida depois pelo backfill lazy.

- [ ] **Step 8: Commit final da fase**

```bash
git add apps/web/src/styles.css apps/web/src/features/today/today-workspace.test.tsx
git commit -m "style: polish unified daily workspace"
```

## Gate de entrega

Antes de considerar a fase pronta:

- [ ] `DailyExecutionItem` está aditivo e o backfill é idempotente.
- [ ] Nenhuma tabela legada foi apagada.
- [ ] Inbox rápido entra em Hoje sem virar Task.
- [ ] Inbox processado sai da bandeja e permanece no histórico.
- [ ] Itens rápidos e tarefas complexas compartilham ordem persistente.
- [ ] A lista é a visão padrão e o calendário é contextual.
- [ ] Pendências antigas não são apagadas e podem ser revisadas.
- [ ] Falhas de agenda e Inbox não bloqueiam a lista diária.
- [ ] Capturas vindas do WhatsApp continuam intactas.
- [ ] `/inbox` e atalhos antigos redirecionam corretamente.
- [ ] Desktop, tablet e celular foram verificados visualmente.
- [ ] Testes, typecheck e build passam.
