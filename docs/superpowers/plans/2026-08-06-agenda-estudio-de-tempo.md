# Agenda como Estúdio de Tempo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a Agenda do Operis em um planejador semanal unificado de compromissos, tarefas complexas e capturas rápidas, compartilhando o mesmo plano com Hoje no desktop e no celular.

**Architecture:** O backend estende `DayPlanItem` para aceitar `Task` ou `InboxItem`, expõe uma projeção semanal por meio de `AgendaWeekService` e registra execução observada em `ExecutionSession` sem alterar o significado estratégico de `DeepWorkSession`. No frontend, a página monolítica `agenda.tsx` vira um orquestrador fino sobre componentes focados em `features/agenda`; Hoje reutiliza a mesma linha do tempo diária e os mesmos blocos.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, dnd-kit, Fastify, Zod, Prisma 5, PostgreSQL, CSS responsivo.

---

## Escopo e ordem

O trabalho atravessa persistência, API e duas superfícies web, mas não forma subsistemas independentes: o frontend semanal depende do contrato de semana; Hoje depende dos mesmos blocos; sessões reais dependem da origem polimórfica. Por isso, este plano usa uma sequência única de incrementos testáveis.

## Mapa de arquivos

### Persistência e API

- Modify: `apps/api/prisma/schema.prisma` — origens de bloco, conclusão de sessão planejada e execução real.
- Create: `apps/api/prisma/migrations/20260806000000_agenda_time_studio/migration.sql` — migração aditiva, constraints e índice parcial.
- Create: `apps/api/src/services/day-plan-service.test.ts` — regras de múltiplos blocos, Inbox e mudança de dia.
- Modify: `apps/api/src/services/day-plan-service.ts` — origem polimórfica e movimentação sem bloqueio por conflito.
- Modify: `apps/api/src/routes/day-plans.ts` — novos campos e conclusão de bloco.
- Create: `apps/api/src/services/commitment-occurrence-service.ts` — expansão reutilizável de recorrências.
- Create: `apps/api/src/services/commitment-occurrence-service.test.ts` — ocorrência, exceção e remarcação.
- Modify: `apps/api/src/routes/commitments.ts` — delegar expansão ao serviço compartilhado.
- Create: `apps/api/src/services/agenda-week-service.ts` — projeção coerente da semana.
- Create: `apps/api/src/services/agenda-week-service.test.ts` — dias, intenções, blocos e fila não planejada.
- Create: `apps/api/src/routes/agenda-week.ts` — `GET /agenda/week/:weekStart`.
- Create: `apps/api/src/routes/agenda-week.test.ts` — validação e serialização.
- Create: `apps/api/src/services/execution-session-service.ts` — iniciar, encerrar e cancelar execução observada.
- Create: `apps/api/src/services/execution-session-service.test.ts` — propriedade, exclusividade e duração real.
- Create: `apps/api/src/routes/execution-sessions.ts` — API das sessões.
- Create: `apps/api/src/routes/execution-sessions.test.ts` — contrato HTTP.
- Modify: `apps/api/src/app.ts` — registrar serviços e rotas.

### Cliente web e domínio de planejamento

- Modify: `apps/web/src/api.ts` — DTOs e métodos de semana, blocos e sessões.
- Modify: `apps/web/src/api.test.ts` — contratos HTTP do cliente.
- Create: `apps/web/src/features/agenda/types.ts` — tipos de apresentação da Agenda.
- Create: `apps/web/src/features/agenda/time-grid.ts` — matemática pura da grade.
- Create: `apps/web/src/features/agenda/time-grid.test.ts` — slots, posição, duração e conflitos.
- Create: `apps/web/src/features/agenda/test-fixtures.ts` — fixtures tipados compartilhados pelos testes da feature.
- Create: `apps/web/src/features/agenda/use-agenda-week.ts` — estado, atualização otimista e invalidação.
- Create: `apps/web/src/features/agenda/use-agenda-week.test.tsx` — carregamento, rollback e Desfazer.

### Interface

- Create: `apps/web/src/features/agenda/agenda-page.tsx` — composição principal responsiva.
- Create: `apps/web/src/features/agenda/planner-toolbar.tsx` — navegação temporal e ações.
- Create: `apps/web/src/features/agenda/unscheduled-rail.tsx` — fila desktop para planejar.
- Create: `apps/web/src/features/agenda/day-intent-lane.tsx` — itens `Para hoje` sem horário.
- Create: `apps/web/src/features/agenda/planner-block.tsx` — bloco acessível por origem.
- Create: `apps/web/src/features/agenda/week-timeline.tsx` — grade semanal desktop.
- Create: `apps/web/src/features/agenda/week-timeline.test.tsx` — renderização e comandos acessíveis.
- Create: `apps/web/src/features/agenda/block-inspector.tsx` — criação e edição contextual.
- Create: `apps/web/src/features/agenda/routine-manager.tsx` — gestão secundária de recorrências.
- Create: `apps/web/src/features/agenda/mobile-day-timeline.tsx` — linha do tempo móvel.
- Create: `apps/web/src/features/agenda/planning-drawer.tsx` — gaveta móvel de tarefas.
- Create: `apps/web/src/features/agenda/mobile-day-timeline.test.tsx` — troca de dia, planejamento e ações.
- Create: `apps/web/src/features/agenda/agenda-page.test.tsx` — integração responsiva e estados.
- Create: `apps/web/src/features/agenda/agenda.css` — visual da nova superfície.
- Replace: `apps/web/src/pages/agenda.tsx` — export fino de `AgendaPage`.
- Modify: `apps/web/src/features/today/today-workspace.tsx` — linha do tempo compartilhada e estados `Para hoje`/`Agora`.
- Modify: `apps/web/src/features/today/use-today-workspace.ts` — plano diário e sessão ativa.
- Modify: `apps/web/src/features/today/today-workspace.test.tsx` — consistência Hoje/Agenda.
- Modify: `apps/web/src/styles.css` — remover regras antigas de Agenda e ajustar Hoje compartilhado.
- Modify: `apps/web/src/demo/mock-fetch.ts` — novos contratos para demonstração.

## Fase 1 — Fundação de dados e API

### Task 1: Persistir blocos rápidos, sessões divididas e execução observada

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260806000000_agenda_time_studio/migration.sql`

- [ ] **Step 1: Adicionar as relações e o modelo ao schema**

Adicione os seguintes campos de relação nos modelos existentes antes de alterar `DayPlanItem`:

```prisma
model Task {
  // campos existentes permanecem
  dayPlanItems      DayPlanItem[]
  executionSessions ExecutionSession[]
}

model InboxItem {
  // campos existentes permanecem
  dayPlanItems      DayPlanItem[]
  executionSessions ExecutionSession[]
}

model DailyExecutionItem {
  // campos existentes permanecem
  executionSessions ExecutionSession[]
}
```

Use este formato para os modelos novos/alterados:

```prisma
enum ExecutionSessionState {
  active
  completed
  cancelled
}

model DayPlanItem {
  id                String            @id @default(uuid())
  dayPlanId         String            @map("day_plan_id")
  taskId            String?
  inboxItemId       String?           @map("inbox_item_id")
  startTime         DateTime          @map("start_time")
  endTime           DateTime          @map("end_time")
  completedAt       DateTime?         @map("completed_at")
  orderIndex        Int               @default(0) @map("order_index")
  blockType         BlockType         @map("block_type")
  confirmationState ConfirmationState @default(pending) @map("confirmation_state")

  dayPlan   DayPlan    @relation(fields: [dayPlanId], references: [id], onDelete: Cascade)
  task      Task?      @relation(fields: [taskId], references: [id], onDelete: SetNull)
  inboxItem InboxItem? @relation(fields: [inboxItemId], references: [id], onDelete: SetNull)
  sessions  ExecutionSession[]

  @@index([dayPlanId, startTime])
  @@index([taskId])
  @@index([inboxItemId])
  @@map("day_plan_items")
}

model ExecutionSession {
  id                   String                @id @default(uuid())
  clerkUserId          String                @map("clerk_user_id")
  dayPlanItemId        String?               @map("day_plan_item_id")
  dailyExecutionItemId String?               @map("daily_execution_item_id")
  taskId               String?
  inboxItemId          String?               @map("inbox_item_id")
  startedAt            DateTime              @default(now()) @map("started_at")
  endedAt              DateTime?             @map("ended_at")
  state                ExecutionSessionState @default(active)
  createdAt            DateTime              @default(now()) @map("created_at")
  updatedAt            DateTime              @updatedAt @map("updated_at")

  dayPlanItem        DayPlanItem?        @relation(fields: [dayPlanItemId], references: [id], onDelete: SetNull)
  dailyExecutionItem DailyExecutionItem? @relation(fields: [dailyExecutionItemId], references: [id], onDelete: SetNull)
  task               Task?               @relation(fields: [taskId], references: [id], onDelete: SetNull)
  inboxItem          InboxItem?          @relation(fields: [inboxItemId], references: [id], onDelete: SetNull)

  @@index([clerkUserId, startedAt])
  @@index([dayPlanItemId])
  @@index([dailyExecutionItemId])
  @@index([taskId])
  @@index([inboxItemId])
  @@map("execution_sessions")
}
```

- [ ] **Step 2: Escrever a migração SQL aditiva**

```sql
ALTER TABLE "day_plan_items"
  ADD COLUMN "inbox_item_id" UUID,
  ADD COLUMN "completed_at" TIMESTAMP(3);

ALTER TABLE "day_plan_items"
  ADD CONSTRAINT "day_plan_items_inbox_item_id_fkey"
  FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "day_plan_items"
  ADD CONSTRAINT "day_plan_items_source_check"
  CHECK (
    ("block_type" = 'fixed' AND "task_id" IS NULL AND "inbox_item_id" IS NULL)
    OR
    ("block_type" = 'task' AND num_nonnulls("task_id", "inbox_item_id") = 1)
  );

CREATE INDEX "day_plan_items_day_plan_id_start_time_idx"
  ON "day_plan_items"("day_plan_id", "start_time");
CREATE INDEX "day_plan_items_inbox_item_id_idx"
  ON "day_plan_items"("inbox_item_id");

CREATE TYPE "ExecutionSessionState" AS ENUM ('active', 'completed', 'cancelled');

CREATE TABLE "execution_sessions" (
  "id" UUID NOT NULL,
  "clerk_user_id" TEXT NOT NULL,
  "day_plan_item_id" UUID,
  "daily_execution_item_id" UUID,
  "task_id" UUID,
  "inbox_item_id" UUID,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "state" "ExecutionSessionState" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "execution_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "execution_sessions_source_check"
    CHECK (num_nonnulls("task_id", "inbox_item_id") = 1)
);

ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_day_plan_item_id_fkey"
  FOREIGN KEY ("day_plan_item_id") REFERENCES "day_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_daily_execution_item_id_fkey"
  FOREIGN KEY ("daily_execution_item_id") REFERENCES "daily_execution_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "execution_sessions" ADD CONSTRAINT "execution_sessions_inbox_item_id_fkey"
  FOREIGN KEY ("inbox_item_id") REFERENCES "inbox_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "execution_sessions_one_active_per_user_idx"
  ON "execution_sessions"("clerk_user_id") WHERE "state" = 'active';
CREATE INDEX "execution_sessions_clerk_user_id_started_at_idx"
  ON "execution_sessions"("clerk_user_id", "started_at");
CREATE INDEX "execution_sessions_day_plan_item_id_idx" ON "execution_sessions"("day_plan_item_id");
CREATE INDEX "execution_sessions_daily_execution_item_id_idx" ON "execution_sessions"("daily_execution_item_id");
CREATE INDEX "execution_sessions_task_id_idx" ON "execution_sessions"("task_id");
CREATE INDEX "execution_sessions_inbox_item_id_idx" ON "execution_sessions"("inbox_item_id");
```

- [ ] **Step 3: Gerar o Prisma Client e validar o schema**

Run: `npm --workspace @execution-os/api run prisma:generate`

Expected: `Generated Prisma Client` sem erro de relação ausente.

- [ ] **Step 4: Rodar typecheck da API**

Run: `npm --workspace @execution-os/api run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260806000000_agenda_time_studio/migration.sql
git commit -m "feat(api): add polymorphic planner blocks and execution sessions"
```

### Task 2: Permitir Inbox, várias sessões e mudança de dia no DayPlanService

**Files:**
- Create: `apps/api/src/services/day-plan-service.test.ts`
- Modify: `apps/api/src/services/day-plan-service.ts`
- Modify: `apps/api/src/routes/day-plans.ts`

- [ ] **Step 1: Escrever testes que falham para as regras aprovadas**

Defina estes fixtures no topo de `day-plan-service.test.ts`:

```ts
const USER_ID = 'user_1';
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const INBOX_ID = '44444444-4444-4444-8444-444444444444';
const TASK_ID = '55555555-5555-4555-8555-555555555555';
const delegate = () => ({
  findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(),
  update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn()
});
function createPrismaMock() {
  return {
    dayPlan: delegate(), dayPlanItem: delegate(), inboxItem: delegate(), task: delegate(),
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  };
}
const taskService = { completeTask: vi.fn(), updateStatus: vi.fn() };
const service = (prisma: ReturnType<typeof createPrismaMock>) =>
  new DayPlanService(prisma as never, taskService as never);
function configuredTaskPrisma() {
  const prisma = createPrismaMock();
  prisma.dayPlan.findUnique.mockResolvedValue({ id: PLAN_ID, clerkUserId: USER_ID });
  prisma.task.findFirst.mockResolvedValue({
    id: TASK_ID, title: 'Curso', estimatedMinutes: 360, executionKind: 'construcao',
    workspaceId: 'workspace_1', projectId: null,
    workspace: { clerkUserId: USER_ID, name: 'Prymeira', mode: 'ativo' }
  });
  prisma.dayPlanItem.findMany.mockResolvedValue([]);
  prisma.dayPlanItem.create.mockResolvedValue({ id: ITEM_ID, taskId: TASK_ID });
  return prisma;
}
function configuredOwnedItemPrisma() {
  const prisma = configuredTaskPrisma();
  prisma.dayPlanItem.findUnique.mockResolvedValue({
    id: ITEM_ID, dayPlanId: PLAN_ID, taskId: TASK_ID, inboxItemId: null,
    startTime: new Date('2026-08-06T09:00:00.000Z'),
    endTime: new Date('2026-08-06T10:00:00.000Z'), blockType: 'task',
    dayPlan: { id: PLAN_ID, clerkUserId: USER_ID }
  });
  return prisma;
}
const taskBlock = (startTime: string) => ({
  clerkUserId: USER_ID, date: startTime.slice(0, 10), taskId: TASK_ID,
  startTime, endTime: new Date(new Date(startTime).getTime() + 60 * 60_000).toISOString(),
  blockType: 'task' as const
});
```

```ts
it('schedules an owned inbox item without converting it', async () => {
  const prisma = createPrismaMock();
  prisma.inboxItem.findFirst.mockResolvedValue({ id: INBOX_ID, clerkUserId: USER_ID });
  prisma.dayPlan.findUnique.mockResolvedValue({ id: PLAN_ID, clerkUserId: USER_ID });
  prisma.dayPlanItem.findMany.mockResolvedValue([]);
  prisma.dayPlanItem.create.mockResolvedValue({ id: ITEM_ID, inboxItemId: INBOX_ID, taskId: null });

  await service(prisma).addItem({
    clerkUserId: USER_ID,
    date: '2026-08-06',
    inboxItemId: INBOX_ID,
    startTime: '2026-08-06T14:00:00.000Z',
    endTime: '2026-08-06T14:15:00.000Z',
    blockType: 'task'
  });

  expect(prisma.dayPlanItem.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ inboxItemId: INBOX_ID, taskId: null })
  }));
  expect(prisma.task.create).not.toHaveBeenCalled();
});

it('keeps multiple pending blocks for the same task', async () => {
  const prisma = configuredTaskPrisma();
  await service(prisma).addItem(taskBlock('2026-08-06T09:00:00.000Z'));
  await service(prisma).addItem(taskBlock('2026-08-07T09:00:00.000Z'));
  expect(prisma.dayPlanItem.deleteMany).not.toHaveBeenCalled();
  expect(prisma.dayPlanItem.create).toHaveBeenCalledTimes(2);
});

it('moves a block into another day plan without changing its id', async () => {
  const prisma = configuredOwnedItemPrisma();
  prisma.dayPlan.findUnique.mockResolvedValue({ id: TARGET_PLAN_ID });
  prisma.dayPlanItem.update.mockResolvedValue({ id: ITEM_ID, dayPlanId: TARGET_PLAN_ID });
  await service(prisma).updateItem(ITEM_ID, {
    date: '2026-08-07',
    startTime: '2026-08-07T11:00:00.000Z',
    endTime: '2026-08-07T11:30:00.000Z'
  }, USER_ID);
  expect(prisma.dayPlanItem.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: ITEM_ID },
    data: expect.objectContaining({ dayPlanId: TARGET_PLAN_ID })
  }));
});
```

- [ ] **Step 2: Executar os testes e confirmar a falha**

Run: `npm --workspace @execution-os/api test -- src/services/day-plan-service.test.ts`

Expected: FAIL porque `inboxItemId` e `date` ainda não pertencem aos inputs e a limpeza de duplicados ainda ocorre.

- [ ] **Step 3: Implementar origem validada e mudança atômica de dia**

Use inputs explícitos:

```ts
type AddDayPlanItemInput = {
  clerkUserId: string;
  date: string;
  taskId?: string | null;
  inboxItemId?: string | null;
  startTime: string;
  endTime: string;
  orderIndex?: number;
  blockType: BlockType;
};

type UpdateDayPlanItemInput = Partial<{
  date: string;
  taskId: string | null;
  inboxItemId: string | null;
  startTime: string;
  endTime: string;
  orderIndex: number;
  blockType: BlockType;
  completedAt: string | null;
}>;

function assertSource(input: { blockType: BlockType; taskId?: string | null; inboxItemId?: string | null }) {
  const sources = Number(Boolean(input.taskId)) + Number(Boolean(input.inboxItemId));
  if (input.blockType === 'task' && sources !== 1) {
    throw Object.assign(new Error('Bloco de trabalho precisa de uma única origem.'), { statusCode: 400 });
  }
  if (input.blockType === 'fixed' && sources !== 0) {
    throw Object.assign(new Error('Bloco fixo legado não aceita origem.'), { statusCode: 400 });
  }
}
```

Valide `InboxItem` com `findFirst({ where: { id, clerkUserId } })`, inclua `inboxItem: true` nas leituras, remova `cleanupPendingTaskDuplicates()` e não apague blocos anteriores ao adicionar outro da mesma tarefa.

- [ ] **Step 4: Trocar conflito bloqueante por metadado calculável**

Remova `assertNoForbiddenOverlap()` do caminho de criação/edição. Mantenha a função `overlap` somente para projeções e testes de conflito; a API deve salvar o bloco e deixar a interface avisar.

- [ ] **Step 5: Atualizar schemas das rotas**

```ts
const sourceFields = {
  taskId: z.string().uuid().optional().nullable(),
  inboxItemId: z.string().uuid().optional().nullable()
};

const createItemSchema = z.object({
  ...sourceFields,
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  orderIndex: z.number().int().optional(),
  blockType: z.enum(['task', 'fixed'])
}).strict();

const updateItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ...sourceFields,
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  orderIndex: z.number().int().optional(),
  blockType: z.enum(['task', 'fixed']).optional(),
  completedAt: z.string().datetime().nullable().optional()
}).strict();
```

- [ ] **Step 6: Rodar teste focado, API completa e typecheck**

Run: `npm --workspace @execution-os/api test -- src/services/day-plan-service.test.ts`

Expected: PASS.

Run: `npm --workspace @execution-os/api test`

Expected: todos os testes da API passam.

Run: `npm --workspace @execution-os/api run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/day-plan-service.ts apps/api/src/services/day-plan-service.test.ts apps/api/src/routes/day-plans.ts
git commit -m "feat(api): schedule inbox items and split task sessions"
```

### Task 3: Extrair a expansão semanal de compromissos

**Files:**
- Create: `apps/api/src/services/commitment-occurrence-service.ts`
- Create: `apps/api/src/services/commitment-occurrence-service.test.ts`
- Modify: `apps/api/src/routes/commitments.ts`

- [ ] **Step 1: Escrever testes de ocorrência, cancelamento e remarcação**

Use estes fixtures locais no arquivo de teste:

```ts
const baseCommitment = {
  id: '11111111-1111-4111-8111-111111111111', clerkUserId: 'user_1',
  workspaceId: null, projectId: null, title: 'Academia', description: null,
  type: 'fixo', status: 'ativo', startTime: '09:00', durationMin: 60,
  recurrenceDays: ['seg', 'qua'], date: new Date('2026-08-03T00:00:00.000Z'),
  recurrenceEnd: null, exceptions: []
};
function createCommitmentPrisma(_: { recurringDays: string[]; oneOffDate: string }) {
  return {
    commitment: { findMany: vi.fn().mockResolvedValue([
      baseCommitment,
      {
        ...baseCommitment, id: '22222222-2222-4222-8222-222222222222',
        title: 'Consulta', type: 'variavel', recurrenceDays: [],
        date: new Date('2026-08-07T00:00:00.000Z')
      }
    ]) },
    commitmentException: { findMany: vi.fn().mockResolvedValue([]) }
  };
}
function serviceWithExceptions(exceptions: Array<{
  date: string; action: string; newDate?: string; newTime?: string;
}>) {
  const stored = exceptions.map((item, index) => ({
    id: `exception_${index}`,
    commitmentId: baseCommitment.id,
    date: new Date(`${item.date}T00:00:00.000Z`),
    action: item.action,
    newDate: item.newDate ? new Date(`${item.newDate}T00:00:00.000Z`) : null,
    newTime: item.newTime ?? null,
    commitment: baseCommitment
  }));
  const prisma = {
    commitment: { findMany: vi.fn().mockResolvedValue([{ ...baseCommitment, exceptions: stored }]) },
    commitmentException: {
      findMany: vi.fn().mockResolvedValue(stored.filter((item) => item.action === 'rescheduled'))
    }
  };
  return new CommitmentOccurrenceService(prisma as never);
}
```

```ts
it('expands recurring and one-off commitments into seven dates', async () => {
  const prisma = createCommitmentPrisma({
    recurringDays: ['mon', 'wed'],
    oneOffDate: '2026-08-07'
  });
  const result = await new CommitmentOccurrenceService(prisma as never)
    .listWeek(USER_ID, '2026-08-03');
  expect(result.map((item) => [item.date, item.title])).toEqual([
    ['2026-08-03', 'Academia'],
    ['2026-08-05', 'Academia'],
    ['2026-08-07', 'Consulta']
  ]);
});

it('removes cancelled occurrences and uses rescheduled time', async () => {
  const result = await serviceWithExceptions([
    { date: '2026-08-03', action: 'cancelled' },
    { date: '2026-08-05', action: 'rescheduled', newDate: '2026-08-06', newTime: '10:30' }
  ]).listWeek(USER_ID, '2026-08-03');
  expect(result).not.toContainEqual(expect.objectContaining({ date: '2026-08-03' }));
  expect(result).toContainEqual(expect.objectContaining({ date: '2026-08-06', startTime: '10:30' }));
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/api test -- src/services/commitment-occurrence-service.test.ts`

Expected: FAIL porque o serviço não existe.

- [ ] **Step 3: Implementar o serviço com DTO estável**

```ts
export type CommitmentOccurrence = {
  id: string;
  commitmentId: string;
  date: string;
  title: string;
  startTime: string | null;
  durationMin: number | null;
  workspaceId: string | null;
  recurring: boolean;
  rescheduled: boolean;
};

export class CommitmentOccurrenceService {
  constructor(private readonly prisma: PrismaClient) {}
  async listWeek(clerkUserId: string, weekStart: string): Promise<CommitmentOccurrence[]> {
    const start = new Date(`${weekStart}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const commitments = await this.prisma.commitment.findMany({
      where: { clerkUserId, status: { not: 'encerrado' } },
      include: { exceptions: true }
    });
    const movedIntoWeek = await this.prisma.commitmentException.findMany({
      where: {
        action: 'rescheduled',
        newDate: { gte: start, lte: end },
        commitment: { clerkUserId }
      },
      include: { commitment: true }
    });
    const dayKeys: Record<number, RecurrenceDay> = {
      0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab'
    };
    const dateKey = (date: Date) => date.toISOString().slice(0, 10);
    const occurs = (commitment: typeof commitments[number], date: Date) => {
      if (commitment.type === 'variavel') return commitment.date
        ? dateKey(commitment.date) === dateKey(date)
        : false;
      return commitment.recurrenceDays.includes(dayKeys[date.getUTCDay()])
        && (!commitment.date || date >= commitment.date)
        && (!commitment.recurrenceEnd || date <= commitment.recurrenceEnd);
    };
    const result: CommitmentOccurrence[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      const key = dateKey(date);
      for (const commitment of commitments) {
        if (!occurs(commitment, date)) continue;
        const exception = commitment.exceptions.find((item) => dateKey(item.date) === key);
        if (exception?.action === 'cancelled' || exception?.action === 'rescheduled') continue;
        result.push({
          id: `${commitment.id}:${key}`,
          commitmentId: commitment.id,
          date: key,
          title: commitment.title,
          startTime: commitment.startTime,
          durationMin: commitment.durationMin,
          workspaceId: commitment.workspaceId,
          recurring: commitment.type === 'fixo',
          rescheduled: false
        });
      }
    }
    for (const exception of movedIntoWeek) {
      if (!exception.newDate) continue;
      const key = dateKey(exception.newDate);
      result.push({
        id: `${exception.commitmentId}:${key}:rescheduled`,
        commitmentId: exception.commitmentId,
        date: key,
        title: exception.commitment.title,
        startTime: exception.newTime ?? exception.commitment.startTime,
        durationMin: exception.commitment.durationMin,
        workspaceId: exception.commitment.workspaceId,
        recurring: exception.commitment.type === 'fixo',
        rescheduled: true
      });
    }
    return result.sort((left, right) =>
      left.date.localeCompare(right.date)
      || (left.startTime ?? '99:99').localeCompare(right.startTime ?? '99:99')
      || left.title.localeCompare(right.title)
    );
  }
}
```

- [ ] **Step 4: Delegar a rota existente ao serviço**

Instancie `CommitmentOccurrenceService` dentro do plugin de commitments e faça `/commitments/week/:weekStart` retornar as ocorrências agrupadas por data usando `Object.groupBy` compatível ou um `reduce` tipado.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `npm --workspace @execution-os/api test -- src/services/commitment-occurrence-service.test.ts`

Expected: PASS.

Run: `npm --workspace @execution-os/api run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/commitment-occurrence-service.ts apps/api/src/services/commitment-occurrence-service.test.ts apps/api/src/routes/commitments.ts
git commit -m "refactor(api): centralize commitment occurrence expansion"
```

### Task 4: Expor uma projeção semanal coerente

**Files:**
- Create: `apps/api/src/services/agenda-week-service.ts`
- Create: `apps/api/src/services/agenda-week-service.test.ts`
- Create: `apps/api/src/routes/agenda-week.ts`
- Create: `apps/api/src/routes/agenda-week.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever o teste de projeção da semana**

Defina `USER_ID = 'user_1'` e estes fixtures no mesmo arquivo:

```ts
const commitmentOccurrence = () => ({
  id: 'commitment_1:2026-08-06', commitmentId: 'commitment_1', date: '2026-08-06',
  title: 'Academia', startTime: '09:00', durationMin: 60, workspaceId: null,
  recurring: true, rescheduled: false
});
function agendaPrismaFixture() {
  return {
    dayPlan: { findMany: vi.fn().mockResolvedValue([{ id: 'plan_1', date: new Date('2026-08-06'), items: [
      {
        id: 'block_1', taskId: 'task_1', inboxItemId: null,
        startTime: new Date('2026-08-06T11:00:00.000Z'),
        endTime: new Date('2026-08-06T12:30:00.000Z'), completedAt: null,
        task: { id: 'task_1', title: 'Gravar vídeo', estimatedMinutes: 360, workspaceId: 'workspace_1' },
        inboxItem: null
      }
    ] }]) },
    dailyExecutionItem: { findMany: vi.fn().mockResolvedValue([{
      id: 'daily_1', date: new Date('2026-08-06'), sourceType: 'inbox',
      inboxItemId: 'inbox_1', taskId: null, position: 0, completedAt: null,
      inboxItem: { id: 'inbox_1', content: 'Responder mensagem', workspace: null, inboxContext: null },
      task: null
    }]) },
    task: { findMany: vi.fn().mockResolvedValue([{
      id: 'task_1', title: 'Gravar vídeo', estimatedMinutes: 360,
      workspaceId: 'workspace_1', project: null, workspace: { name: 'Prymeira', color: '#f97316' }
    }]) },
    inboxItem: { findMany: vi.fn().mockResolvedValue([]) }
  };
}
```

```ts
it('returns seven days, unscheduled intents and partially planned tasks', async () => {
  const prisma = agendaPrismaFixture();
  const commitments = { listWeek: vi.fn().mockResolvedValue([commitmentOccurrence()]) };
  const result = await new AgendaWeekService(prisma as never, commitments as never)
    .getWeek(USER_ID, '2026-08-03');

  expect(result.days).toHaveLength(7);
  expect(result.days[3].date).toBe('2026-08-06');
  expect(result.days[3].intents).toContainEqual(expect.objectContaining({
    kind: 'inbox', title: 'Responder mensagem'
  }));
  expect(result.days[3].blocks).toContainEqual(expect.objectContaining({
    kind: 'task', plannedMinutes: 90
  }));
  expect(result.unscheduled.tasks).toContainEqual(expect.objectContaining({
    estimatedMinutes: 360, plannedMinutes: 90, remainingMinutes: 270
  }));
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/api test -- src/services/agenda-week-service.test.ts`

Expected: FAIL porque `AgendaWeekService` não existe.

- [ ] **Step 3: Implementar o DTO e a consulta paralela**

```ts
export type AgendaWeekDto = {
  weekStart: string;
  resourceErrors: { commitments: string | null };
  days: Array<{
    date: string;
    intents: DailyExecutionDto[];
    blocks: AgendaBlockDto[];
    commitments: CommitmentOccurrence[];
  }>;
  unscheduled: {
    tasks: AgendaTaskSourceDto[];
    inbox: AgendaInboxSourceDto[];
  };
};
```

Faça uma única `Promise.all` para planos, itens diários, tarefas ativas e Inbox não processado. Carregue ocorrências com `Promise.allSettled`; se somente compromissos falharem, retorne `resourceErrors.commitments = 'Compromissos indisponíveis.'` e mantenha dias, blocos e intenções. Remova da `DayIntentLane` apenas a origem que já possui bloco no mesmo dia. Calcule `plannedMinutes` somando todos os blocos pendentes da tarefa na semana e `remainingMinutes = max(0, estimatedMinutes - plannedMinutes)`.

- [ ] **Step 4: Criar a rota e validar segunda-feira**

```ts
app.get('/agenda/week/:weekStart', async (request) => {
  const clerkUserId = getUserId(request);
  const { weekStart } = z.object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).parse(request.params);
  if (new Date(`${weekStart}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw Object.assign(new Error('weekStart precisa ser uma segunda-feira.'), { statusCode: 400 });
  }
  return service.getWeek(clerkUserId, weekStart);
});
```

A rota rejeita datas que não sejam segunda-feira com status 400 e mensagem `weekStart precisa ser uma segunda-feira.`; o serviço repete a validação para proteger chamadas internas.

- [ ] **Step 5: Testar a rota**

```ts
it('returns 400 for a non-Monday and 200 for a valid week', async () => {
  const app = Fastify();
  registerAgendaWeekRoutes(app, {
    getWeek: vi.fn().mockResolvedValue({
      weekStart: '2026-08-03', resourceErrors: { commitments: null },
      days: [], unscheduled: { tasks: [], inbox: [] }
    })
  } as never);
  expect((await app.inject({ method: 'GET', url: '/agenda/week/2026-08-04' })).statusCode).toBe(400);
  expect((await app.inject({ method: 'GET', url: '/agenda/week/2026-08-03' })).statusCode).toBe(200);
  await app.close();
});
```

Run: `npm --workspace @execution-os/api test -- src/services/agenda-week-service.test.ts src/routes/agenda-week.test.ts`

Expected: PASS.

- [ ] **Step 6: Registrar o serviço em `app.ts` e rodar a API completa**

```ts
const commitmentOccurrenceService = new CommitmentOccurrenceService(prisma);
const agendaWeekService = new AgendaWeekService(prisma, commitmentOccurrenceService);
registerAgendaWeekRoutes(app, agendaWeekService);
```

Run: `npm --workspace @execution-os/api test && npm --workspace @execution-os/api run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/agenda-week-service.ts apps/api/src/services/agenda-week-service.test.ts apps/api/src/routes/agenda-week.ts apps/api/src/routes/agenda-week.test.ts apps/api/src/app.ts
git commit -m "feat(api): expose unified weekly agenda projection"
```

### Task 5: Registrar execução real sem converter capturas rápidas

**Files:**
- Create: `apps/api/src/services/execution-session-service.ts`
- Create: `apps/api/src/services/execution-session-service.test.ts`
- Create: `apps/api/src/routes/execution-sessions.ts`
- Create: `apps/api/src/routes/execution-sessions.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever testes de propriedade e exclusividade**

Defina os fixtures abaixo no arquivo de teste:

```ts
const USER_ID = 'user_1';
const INBOX_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const executionDelegate = () => ({
  findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn()
});
function executionPrisma() {
  return {
    inboxItem: executionDelegate(), task: executionDelegate(),
    executionSession: executionDelegate(), deepWorkSession: executionDelegate()
  };
}
const activeInboxSession = () => ({
  id: SESSION_ID, clerkUserId: USER_ID, taskId: null, inboxItemId: INBOX_ID,
  startedAt: new Date('2026-08-06T14:08:00.000Z'), endedAt: null, state: 'active'
});
const taskSource = () => ({ sourceType: 'task' as const, sourceId: TASK_ID });
function executionPrismaWithOwnedSession(startedAt: string) {
  const prisma = executionPrisma();
  prisma.executionSession.findFirst.mockResolvedValue({
    ...activeInboxSession(), startedAt: new Date(startedAt)
  });
  prisma.executionSession.update.mockResolvedValue({
    ...activeInboxSession(), endedAt: new Date('2026-08-06T14:21:00.000Z'), state: 'completed'
  });
  return prisma;
}
const service = (prisma: ReturnType<typeof executionPrisma>) =>
  new ExecutionSessionService(prisma as never);
```

```ts
it('starts an inbox session without creating a task', async () => {
  const prisma = executionPrisma();
  prisma.inboxItem.findFirst.mockResolvedValue({ id: INBOX_ID, clerkUserId: USER_ID });
  prisma.executionSession.findFirst.mockResolvedValue(null);
  prisma.deepWorkSession.findFirst.mockResolvedValue(null);
  prisma.executionSession.create.mockResolvedValue(activeInboxSession());

  await service(prisma).start(USER_ID, { sourceType: 'inbox', sourceId: INBOX_ID });

  expect(prisma.executionSession.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ inboxItemId: INBOX_ID, taskId: null })
  }));
  expect(prisma.task.create).not.toHaveBeenCalled();
});

it('rejects a second active generic or deep-work session', async () => {
  const prisma = executionPrisma();
  prisma.executionSession.findFirst.mockResolvedValue(activeInboxSession());
  await expect(service(prisma).start(USER_ID, taskSource())).rejects.toThrow('Já existe uma execução ativa.');
});

it('stops with observed timestamps and does not complete the source', async () => {
  vi.setSystemTime('2026-08-06T14:21:00.000Z');
  const prisma = executionPrismaWithOwnedSession('2026-08-06T14:08:00.000Z');
  await service(prisma).stop(USER_ID, SESSION_ID);
  expect(prisma.executionSession.update).toHaveBeenCalledWith(expect.objectContaining({
    data: { endedAt: new Date('2026-08-06T14:21:00.000Z'), state: 'completed' }
  }));
  expect(prisma.task.update).not.toHaveBeenCalled();
  expect(prisma.inboxItem.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/api test -- src/services/execution-session-service.test.ts`

Expected: FAIL porque o serviço não existe.

- [ ] **Step 3: Implementar o serviço**

```ts
export class ExecutionSessionService {
  constructor(private readonly prisma: PrismaClient) {}

  async getActive(clerkUserId: string) {
    return this.prisma.executionSession.findFirst({
      where: { clerkUserId, state: 'active' },
      include: { task: true, inboxItem: true, dayPlanItem: true }
    });
  }

  async start(clerkUserId: string, input: StartExecutionInput) {
    await this.assertNoActiveSession(clerkUserId);
    const source = await this.resolveOwnedSource(clerkUserId, input);
    return this.prisma.executionSession.create({
      data: {
        clerkUserId,
        taskId: input.sourceType === 'task' ? source.id : null,
        inboxItemId: input.sourceType === 'inbox' ? source.id : null,
        dayPlanItemId: input.dayPlanItemId ?? null,
        dailyExecutionItemId: input.dailyExecutionItemId ?? null
      },
      include: { task: true, inboxItem: true, dayPlanItem: true }
    });
  }
}
```

`assertNoActiveSession` verifica `ExecutionSession` e `DeepWorkSession` ativa pertencente ao mesmo usuário. `stop` e `cancel` usam `findFirst({ where: { id, clerkUserId } })`; chamadas repetidas retornam a sessão encerrada sem alterar o horário.

- [ ] **Step 4: Criar as rotas**

```ts
app.get('/execution-sessions/active', async (request) =>
  service.getActive(getUserId(request))
);

app.post('/execution-sessions/start', async (request, reply) => {
  const payload = startSchema.parse(request.body);
  return reply.code(201).send(await service.start(getUserId(request), payload));
});

app.post('/execution-sessions/:id/stop', async (request) =>
  service.stop(getUserId(request), idSchema.parse(request.params).id)
);

app.post('/execution-sessions/:id/cancel', async (request) =>
  service.cancel(getUserId(request), idSchema.parse(request.params).id)
);
```

- [ ] **Step 5: Rodar testes focados e API completa**

Run: `npm --workspace @execution-os/api test -- src/services/execution-session-service.test.ts src/routes/execution-sessions.test.ts`

Expected: PASS.

Run: `npm --workspace @execution-os/api test && npm --workspace @execution-os/api run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/execution-session-service.ts apps/api/src/services/execution-session-service.test.ts apps/api/src/routes/execution-sessions.ts apps/api/src/routes/execution-sessions.test.ts apps/api/src/app.ts
git commit -m "feat(api): track observed execution sessions"
```

## Fase 2 — Contratos web e domínio puro

### Task 6: Adicionar contratos do cliente web

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/api.test.ts`

- [ ] **Step 1: Escrever teste de URL e payload**

```ts
it('loads a week and moves a quick block without conversion', async () => {
  const INBOX_ID = '22222222-2222-4222-8222-222222222222';
  const { api, fetchMock } = await loadApiForRequests();
  fetchMock
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => weekFixture })
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => quickBlockFixture });

  await api.getAgendaWeek('2026-08-03');
  await api.createDayPlanItem('2026-08-06', {
    inboxItemId: INBOX_ID,
    startTime: '2026-08-06T14:00:00.000Z',
    endTime: '2026-08-06T14:15:00.000Z',
    blockType: 'task'
  });

  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/api/agenda/week/2026-08-03',
    '/api/day-plans/2026-08-06/items'
  ]);
  expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
    body: expect.stringContaining('"inboxItemId"')
  }));
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/api.test.ts`

Expected: FAIL porque `getAgendaWeek` e `inboxItemId` não existem.

- [ ] **Step 3: Adicionar tipos discriminados**

```ts
export type AgendaBlock = {
  id: string;
  kind: 'task' | 'inbox';
  sourceId: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  completedAt: string | null;
  workspaceId: string | null;
  plannedMinutes: number;
};

export type AgendaWeek = {
  weekStart: string;
  resourceErrors: { commitments: string | null };
  days: Array<{
    date: string;
    intents: TodayEntryDto[];
    blocks: AgendaBlock[];
    commitments: CommitmentOccurrence[];
  }>;
  unscheduled: {
    tasks: AgendaTaskSource[];
    inbox: AgendaInboxSource[];
  };
};

export type ExecutionSession = {
  id: string;
  kind: 'task' | 'inbox';
  sourceId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  state: 'active' | 'completed' | 'cancelled';
  dayPlanItemId: string | null;
  dailyExecutionItemId: string | null;
};
```

- [ ] **Step 4: Adicionar métodos do cliente**

```ts
getAgendaWeek: (weekStart: string) => apiRequest<AgendaWeek>(`/agenda/week/${weekStart}`),
getActiveExecutionSession: () => apiRequest<ExecutionSession | null>('/execution-sessions/active'),
startExecutionSession: (input: StartExecutionInput) => apiRequest<ExecutionSession>('/execution-sessions/start', {
  method: 'POST', body: JSON.stringify(input)
}),
stopExecutionSession: (id: string) => apiRequest<ExecutionSession>(`/execution-sessions/${id}/stop`, {
  method: 'POST', body: JSON.stringify({})
}),
cancelExecutionSession: (id: string) => apiRequest<ExecutionSession>(`/execution-sessions/${id}/cancel`, {
  method: 'POST', body: JSON.stringify({})
}),
```

Estenda `createDayPlanItem` e `updateDayPlanItem` com `inboxItemId`, `date` e `completedAt`.

- [ ] **Step 5: Rodar teste e typecheck**

Run: `npm --workspace @execution-os/web test -- src/api.test.ts && npm --workspace @execution-os/web run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/api.test.ts
git commit -m "feat(web): add weekly agenda and execution contracts"
```

### Task 7: Implementar matemática pura da grade

**Files:**
- Create: `apps/web/src/features/agenda/types.ts`
- Create: `apps/web/src/features/agenda/time-grid.ts`
- Create: `apps/web/src/features/agenda/time-grid.test.ts`
- Create: `apps/web/src/features/agenda/test-fixtures.ts`

- [ ] **Step 1: Escrever testes de slots, posição, duração e conflito**

```ts
describe('time grid', () => {
  it('maps pointer minutes to 15-minute slots', () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(52)).toBe(45);
  });

  it('keeps a 15-minute block touchable without changing its duration', () => {
    expect(blockGeometry('09:00', '09:15', { startHour: 6, pixelsPerHour: 72 }))
      .toEqual({ top: 216, height: 44, visualOverflow: 26 });
  });

  it('detects overlaps but never rejects them', () => {
    const block = (id: string, startTime: string, endTime: string) => ({ id, startTime, endTime });
    expect(findConflictIds([
      block('a', '09:00', '10:00'),
      block('b', '09:30', '10:15')
    ])).toEqual(new Set(['a', 'b']));
  });
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/time-grid.test.ts`

Expected: FAIL porque os helpers não existem.

- [ ] **Step 3: Implementar helpers sem DOM**

```ts
export const SLOT_MINUTES = 15;
export const MIN_BLOCK_PX = 44;

export function snapMinutes(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

export function blockGeometry(start: string, end: string, grid: GridMetrics) {
  const startMinutes = minutesOfDay(start) - grid.startHour * 60;
  const duration = minutesOfDay(end) - minutesOfDay(start);
  const top = Math.round(startMinutes / 60 * grid.pixelsPerHour);
  const naturalHeight = Math.round(duration / 60 * grid.pixelsPerHour);
  const height = Math.max(MIN_BLOCK_PX, naturalHeight);
  return { top, height, visualOverflow: height - naturalHeight };
}

export function findConflictIds(blocks: Array<Pick<PlannerBlockModel, 'id' | 'startTime' | 'endTime'>>) {
  const conflicts = new Set<string>();
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      if (overlaps(blocks[left], blocks[right])) {
        conflicts.add(blocks[left].id);
        conflicts.add(blocks[right].id);
      }
    }
  }
  return conflicts;
}
```

- [ ] **Step 4: Rodar testes**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/time-grid.test.ts`

Expected: PASS.

- [ ] **Step 5: Criar fixtures tipados usados pelos testes de componentes**

```ts
import { vi } from 'vitest';
import type { AgendaWeekController } from './use-agenda-week';
import type { AgendaWeek } from '../../api';

export const IDS = {
  block: '11111111-1111-4111-8111-111111111111',
  taskBlock: '44444444-4444-4444-8444-444444444444',
  inbox: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333'
};

export const quickBlockFixture = {
  id: IDS.block, kind: 'inbox' as const, sourceId: IDS.inbox, date: '2026-08-06',
  title: 'Responder cliente', startTime: '2026-08-06T14:00:00.000Z',
  endTime: '2026-08-06T14:15:00.000Z', completedAt: null,
  workspaceId: null, plannedMinutes: 15
};

export function weekFixture(): AgendaWeek {
  const dates = ['03', '04', '05', '06', '07', '08', '09'];
  return {
    weekStart: '2026-08-03',
    resourceErrors: { commitments: null },
    days: dates.map((day) => ({
      date: `2026-08-${day}`,
      intents: day === '06' ? [{
        id: 'daily_1', kind: 'inbox', sourceId: IDS.inbox, date: '2026-08-06',
        title: 'Responder cliente', position: 0, completedAt: null, context: null
      }] : [],
      blocks: day === '06' ? [
        quickBlockFixture,
        {
          id: IDS.taskBlock, kind: 'task', sourceId: IDS.task, date: '2026-08-06',
          title: 'Gravar vídeo', startTime: '2026-08-06T11:00:00.000Z',
          endTime: '2026-08-06T12:30:00.000Z', completedAt: null,
          workspaceId: null, plannedMinutes: 90
        }
      ] : [],
      commitments: day === '06' ? [{
        id: 'commitment_1:2026-08-06', commitmentId: 'commitment_1', date: '2026-08-06',
        title: 'Academia', startTime: '09:00', durationMin: 60, workspaceId: null,
        recurring: true, rescheduled: false
      }] : []
    })),
    unscheduled: {
      tasks: [{
        id: IDS.task, title: 'Gravar vídeo', estimatedMinutes: 90,
        plannedMinutes: 0, remainingMinutes: 90, workspaceId: null,
        workspaceName: null, workspaceColor: null, projectName: null
      }],
      inbox: [{ id: IDS.inbox, title: 'Responder cliente', workspaceId: null, context: null }]
    }
  };
}

export function controller(overrides: Partial<AgendaWeekController> = {}): AgendaWeekController {
  return {
    week: weekFixture(), loading: false, error: null,
    reload: vi.fn(), scheduleSource: vi.fn(), moveBlock: vi.fn(), resizeBlock: vi.fn(),
    setBlockCompleted: vi.fn(), removeBlock: vi.fn(), ...overrides
  };
}

export const sources = () => weekFixture().unscheduled;

export const recurringCommitment = () => weekFixture().days[3].commitments[0];
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/types.ts apps/web/src/features/agenda/time-grid.ts apps/web/src/features/agenda/time-grid.test.ts apps/web/src/features/agenda/test-fixtures.ts
git commit -m "feat(web): add agenda time-grid domain"
```

### Task 8: Criar o controlador otimista da semana

**Files:**
- Create: `apps/web/src/features/agenda/use-agenda-week.ts`
- Create: `apps/web/src/features/agenda/use-agenda-week.test.tsx`

- [ ] **Step 1: Escrever testes de carga parcial, movimento e rollback**

```tsx
import { IDS, quickBlockFixture, weekFixture } from './test-fixtures';

it('moves a block optimistically and rolls back on failure', async () => {
  api.getAgendaWeek.mockResolvedValue(weekFixture());
  api.updateDayPlanItem.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useAgendaWeek('2026-08-03'));
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(() => result.current.moveBlock(IDS.block, {
    date: '2026-08-07',
    startTime: '2026-08-07T14:00:00.000Z',
    endTime: '2026-08-07T14:30:00.000Z'
  }));

  expect(result.current.week!.days[3].blocks).toContainEqual(expect.objectContaining({ id: IDS.block }));
  expect(toast.error).toHaveBeenCalledWith('Não foi possível mover o bloco.');
});

it('creates a 15-minute quick block', async () => {
  await act(() => result.current.scheduleSource({ kind: 'inbox', sourceId: IDS.inbox }, '2026-08-06T14:00:00.000Z'));
  expect(api.createDayPlanItem).toHaveBeenCalledWith('2026-08-06', expect.objectContaining({
    inboxItemId: IDS.inbox,
    endTime: '2026-08-06T14:15:00.000Z'
  }));
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/use-agenda-week.test.tsx`

Expected: FAIL porque o hook não existe.

- [ ] **Step 3: Implementar estado e operações**

O hook deve expor:

```ts
export type AgendaWeekController = {
  week: AgendaWeek | null;
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  scheduleSource(source: PlannerSource, startTime: string): Promise<void>;
  moveBlock(id: string, target: MoveBlockInput): Promise<void>;
  resizeBlock(id: string, endTime: string): Promise<void>;
  setBlockCompleted(id: string, completed: boolean): Promise<void>;
  removeBlock(id: string): Promise<void>;
};
```

Use cópia imutável da semana antes de cada mutação, atualize a árvore local, chame a API e restaure a cópia no `catch`. Depois do sucesso, substitua o bloco otimista pelo retorno do servidor e ofereça `Desfazer` com a mutação inversa.

- [ ] **Step 4: Rodar teste e typecheck**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/use-agenda-week.test.tsx && npm --workspace @execution-os/web run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/agenda/use-agenda-week.ts apps/web/src/features/agenda/use-agenda-week.test.tsx
git commit -m "feat(web): add optimistic weekly agenda controller"
```

## Fase 3 — Interface desktop e edição

### Task 9: Montar o estúdio de tempo desktop

**Files:**
- Create: `apps/web/src/features/agenda/planner-toolbar.tsx`
- Create: `apps/web/src/features/agenda/unscheduled-rail.tsx`
- Create: `apps/web/src/features/agenda/day-intent-lane.tsx`
- Create: `apps/web/src/features/agenda/planner-block.tsx`
- Create: `apps/web/src/features/agenda/week-timeline.tsx`
- Create: `apps/web/src/features/agenda/week-timeline.test.tsx`

- [ ] **Step 1: Escrever o teste da estrutura e dos nomes acessíveis**

```tsx
it('renders sources, intents and three block kinds without card wrappers', () => {
  render(<WeekTimeline week={weekFixture()} controller={controller()} />);
  expect(screen.getByRole('region', { name: 'Agenda semanal' })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Para planejar' })).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Para hoje — quinta-feira' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Compromisso Academia, 09:00 até 10:00' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tarefa Gravar vídeo, 11:00 até 12:30' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Item rápido Responder cliente, 14:00 até 14:15' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/week-timeline.test.tsx`

Expected: FAIL porque os componentes não existem.

- [ ] **Step 3: Implementar componentes focados**

`PlannerBlock` recebe um único modelo discriminado e callbacks explícitos:

```tsx
export function PlannerBlock({ block, geometry, conflicted, onOpen, onMoveByKeyboard }: Props) {
  const Icon = block.kind === 'commitment' ? CalendarDays : block.kind === 'task' ? CheckSquare : Zap;
  return (
    <button
      type="button"
      className={`agenda-block agenda-block--${block.kind}`}
      data-conflict={conflicted || undefined}
      style={{ top: geometry.top, height: geometry.height }}
      aria-label={blockAccessibleName(block)}
      onClick={() => onOpen(block)}
      onKeyDown={(event) => handleBlockKeys(event, block, onMoveByKeyboard)}
    >
      <Icon aria-hidden="true" size={13} />
      <strong>{block.title}</strong>
      <span>{formatBlockRange(block)}</span>
    </button>
  );
}
```

`UnscheduledRail` mostra busca, filtro de frente, grupos `Tarefas` e `Inbox`, progresso planejado e botão de recolher. `DayIntentLane` usa uma lista horizontal compacta. `WeekTimeline` renderiza sete cabeçalhos e a grade de 06:00–23:00.

- [ ] **Step 4: Implementar drag-and-drop com dnd-kit**

Use IDs estáveis `source:<kind>:<sourceId>` e `block:<id>`. No `onDragEnd`, converta a posição final para data e slot por `time-grid.ts`; fontes chamam `scheduleSource`, blocos chamam `moveBlock`. O overlay mostra título e duração, sem clonar o card inteiro.

- [ ] **Step 5: Adicionar comandos acessíveis**

Teste e implemente botões de menu `Mover 15 minutos antes`, `Mover 15 minutos depois`, `Mover para o dia anterior`, `Mover para o próximo dia`, `Aumentar 15 minutos` e `Reduzir 15 minutos`. Cada comando chama o mesmo controlador usado pelo drag.

- [ ] **Step 6: Rodar testes**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/week-timeline.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/agenda/planner-toolbar.tsx apps/web/src/features/agenda/unscheduled-rail.tsx apps/web/src/features/agenda/day-intent-lane.tsx apps/web/src/features/agenda/planner-block.tsx apps/web/src/features/agenda/week-timeline.tsx apps/web/src/features/agenda/week-timeline.test.tsx
git commit -m "feat(web): build desktop weekly time studio"
```

### Task 10: Criar edição contextual e Rotinas

**Files:**
- Create: `apps/web/src/features/agenda/block-inspector.tsx`
- Create: `apps/web/src/features/agenda/block-inspector.test.tsx`
- Create: `apps/web/src/features/agenda/routine-manager.tsx`
- Create: `apps/web/src/features/agenda/routine-manager.test.tsx`

- [ ] **Step 1: Escrever testes de edição progressiva e escopo recorrente**

```tsx
it('shows only essential fields before advanced options', () => {
  render(<BlockInspector mode="create" defaultDate="2026-08-06" defaultTime="14:00" />);
  expect(screen.getByLabelText('Título')).toBeInTheDocument();
  expect(screen.getByLabelText('Início')).toHaveValue('14:00');
  expect(screen.getByRole('button', { name: 'Mais opções' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Fim da recorrência')).not.toBeInTheDocument();
});

it('requires occurrence or series before changing a recurring commitment', () => {
  render(<BlockInspector block={recurringCommitment()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  expect(screen.getByRole('dialog', { name: 'Aplicar alteração' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Somente esta ocorrência' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Toda a série' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/block-inspector.test.tsx src/features/agenda/routine-manager.test.tsx`

Expected: FAIL porque os componentes não existem.

- [ ] **Step 3: Implementar painel e folha responsiva**

Use `@radix-ui/react-dialog` com `Dialog.Content` lateral acima de 768 px e classe de folha inferior abaixo desse breakpoint. O formulário inicial contém tipo, título, data, início e duração; descrição, frente e recorrência ficam atrás de `Mais opções`.

- [ ] **Step 4: Implementar Rotinas como superfície secundária**

`RoutineManager` usa a API existente de commitments, lista recorrentes numa tabela/lista compacta, permite pausar, reativar e editar, e nunca substitui a grade como visão persistida da Agenda.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/block-inspector.test.tsx src/features/agenda/routine-manager.test.tsx && npm --workspace @execution-os/web run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/block-inspector.tsx apps/web/src/features/agenda/block-inspector.test.tsx apps/web/src/features/agenda/routine-manager.tsx apps/web/src/features/agenda/routine-manager.test.tsx
git commit -m "feat(web): add contextual block editing and routines"
```

## Fase 4 — Celular, Hoje e integração final

### Task 11: Implementar planejamento móvel completo

**Files:**
- Create: `apps/web/src/features/agenda/mobile-day-timeline.tsx`
- Create: `apps/web/src/features/agenda/planning-drawer.tsx`
- Create: `apps/web/src/features/agenda/mobile-day-timeline.test.tsx`

- [ ] **Step 1: Escrever testes de dia único, faixa semanal e gaveta**

```tsx
import { IDS, controller, sources, weekFixture } from './test-fixtures';

it('shows one day and changes it without rendering seven cards', () => {
  render(<MobileDayTimeline week={weekFixture()} selectedDate="2026-08-06" controller={controller()} />);
  expect(screen.getByRole('region', { name: 'Linha do tempo de quinta-feira, 6 de agosto' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Selecionar .* de agosto/ })).toHaveLength(7);
  expect(screen.queryByText('Nada marcado.')).not.toBeInTheDocument();
});

it('schedules a drawer item with explicit touch controls', async () => {
  const onSchedule = vi.fn();
  render(<PlanningDrawer sources={sources()} onSchedule={onSchedule} />);
  fireEvent.click(screen.getByRole('button', { name: 'Agendar Responder cliente' }));
  fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '14:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar horário' }));
  expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ sourceId: IDS.inbox }), '14:00');
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/mobile-day-timeline.test.tsx`

Expected: FAIL porque os componentes não existem.

- [ ] **Step 3: Implementar a faixa semanal e a linha do tempo**

A faixa usa sete botões, `aria-current="date"` no selecionado e indicador de carga derivado dos minutos planejados. O gesto horizontal muda um dia, mas botões permanecem a alternativa principal.

- [ ] **Step 4: Implementar pressão longa e alternativa explícita**

Pressão longa ativa o modo mover; toque normal abre o inspetor. O menu oferece seletores de data, horário e duração para não depender do gesto. A gaveta usa três alturas (`peek`, `half`, `full`) e não cobre o bloco em edição.

- [ ] **Step 5: Rodar testes**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/mobile-day-timeline.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/mobile-day-timeline.tsx apps/web/src/features/agenda/planning-drawer.tsx apps/web/src/features/agenda/mobile-day-timeline.test.tsx
git commit -m "feat(web): add full mobile agenda planning"
```

### Task 12: Compor a nova Agenda e substituir a página monolítica

**Files:**
- Create: `apps/web/src/features/agenda/agenda-page.tsx`
- Create: `apps/web/src/features/agenda/agenda-page.test.tsx`
- Create: `apps/web/src/features/agenda/agenda.css`
- Replace: `apps/web/src/pages/agenda.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Escrever teste de composição e estados isolados**

```tsx
const agendaControllerState = vi.hoisted(() => ({ current: null as AgendaWeekController | null }));
vi.mock('./use-agenda-week', () => ({
  useAgendaWeek: () => agendaControllerState.current
}));

it('uses desktop studio and mobile day planner from one weekly controller', () => {
  agendaControllerState.current = controller();
  render(<AgendaPage />);
  expect(screen.getByRole('heading', { name: 'Agenda' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Abrir Rotinas' })).toBeInTheDocument();
  expect(screen.getByTestId('agenda-desktop')).toBeInTheDocument();
  expect(screen.getByTestId('agenda-mobile')).toBeInTheDocument();
});

it('keeps a commitment failure local to its lane', () => {
  agendaControllerState.current = controller({
    week: {
      ...weekFixture(),
      resourceErrors: { commitments: 'Agenda externa indisponível' }
    }
  });
  render(<AgendaPage />);
  expect(screen.getByText('Agenda externa indisponível')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('complementary', { name: 'Para planejar' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/features/agenda/agenda-page.test.tsx`

Expected: FAIL porque `features/agenda/agenda-page.tsx` não existe.

- [ ] **Step 3: Implementar composição responsiva**

```tsx
export function AgendaPage() {
  const [weekStart, setWeekStart] = useState(() => mondayKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => todayIsoDate());
  const controller = useAgendaWeek(weekStart);

  return (
    <main className="agenda-studio">
      <PlannerToolbar weekStart={weekStart} onWeekChange={setWeekStart} />
      <section data-testid="agenda-desktop" className="agenda-studio__desktop">
        <UnscheduledRail week={controller.week} controller={controller} />
        <WeekTimeline week={controller.week} controller={controller} />
      </section>
      <section data-testid="agenda-mobile" className="agenda-studio__mobile">
        <MobileDayTimeline
          week={controller.week}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          controller={controller}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Substituir a página antiga por export fino**

```tsx
export { AgendaPage } from '../features/agenda/agenda-page';
```

- [ ] **Step 5: Implementar CSS com breakpoints reais**

Em `agenda.css`, use desktop a partir de 769 px e mobile até 768 px. Garanta toolbar plana, rail de 280 px recolhível, sete colunas com fim de semana estreito, linha do tempo rolável dentro da superfície e alvos de 44 px. Remova de `styles.css` os blocos `.agenda-*` antigos somente depois de `rg` confirmar que não possuem consumidores.

- [ ] **Step 6: Rodar testes e build web**

Run: `npm --workspace @execution-os/web test -- src/features/agenda && npm --workspace @execution-os/web run build`

Expected: PASS; Vite produz `dist` sem erro TypeScript.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/agenda apps/web/src/pages/agenda.tsx apps/web/src/styles.css
git commit -m "feat(web): replace agenda with responsive time studio"
```

### Task 13: Fazer Hoje reutilizar o mesmo plano e registrar Agora

**Files:**
- Modify: `apps/web/src/features/today/use-today-workspace.ts`
- Modify: `apps/web/src/features/today/today-workspace.tsx`
- Modify: `apps/web/src/features/today/today-workspace.test.tsx`
- Modify: `apps/web/src/features/today/today-execution-list.tsx`
- Modify: `apps/web/src/features/today/today-execution-row.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Escrever o teste da conversa Hoje/Agenda**

Estenda o `workspaceState` já hoisted no teste com `dayPlan`, `activeSession`, `startSession`, `stopSession` e `cancelSession`, todos com valores iniciais explícitos. Use estes fixtures:

```ts
const quickEntry: TodayEntry = {
  id: 'daily_1', kind: 'inbox', sourceId: 'inbox_1', date: '2026-08-06',
  title: 'Responder cliente', position: 0, completedAt: null, context: null
};
const dayPlanWithQuickBlock = (): DayPlan => ({
  id: 'plan_1', date: '2026-08-06', items: [{
    id: 'block_1', dayPlanId: 'plan_1', taskId: null, inboxItemId: 'inbox_1',
    startTime: '2026-08-06T14:00:00.000Z', endTime: '2026-08-06T14:15:00.000Z',
    completedAt: null, orderIndex: 0, blockType: 'task', confirmationState: 'pending',
    task: null, inboxItem: { id: 'inbox_1', content: 'Responder cliente' }
  }]
});
```

```tsx
it('keeps unscheduled intent outside the timeline and starts observed execution', async () => {
  workspaceState.entries = [quickEntry];
  workspaceState.dayPlan = { date: '2026-08-06', items: [] };
  workspaceState.activeSession = null;
  render(<TodayWorkspace date="2026-08-06" />);

  expect(screen.getByRole('list', { name: 'Para hoje' })).toHaveTextContent('Responder cliente');
  expect(screen.queryByRole('button', { name: /Item rápido Responder cliente, .* até/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Iniciar Responder cliente' }));
  expect(workspaceState.startSession).toHaveBeenCalledWith(quickEntry);
});

it('shows the same scheduled block returned by the day plan', () => {
  workspaceState.dayPlan = dayPlanWithQuickBlock();
  render(<TodayWorkspace date="2026-08-06" />);
  expect(screen.getByRole('button', { name: 'Item rápido Responder cliente, 14:00 até 14:15' }))
    .toBeInTheDocument();
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm --workspace @execution-os/web test -- src/features/today/today-workspace.test.tsx`

Expected: FAIL porque o hook ainda não carrega `DayPlan` nem sessão genérica.

- [ ] **Step 3: Carregar plano e sessão no hook**

Acrescente `api.getDayPlan(date)` e `api.getActiveExecutionSession()` ao `Promise.allSettled`. Exponha `dayPlan`, `activeSession`, `startSession`, `stopSession` e `cancelSession`. Após qualquer mutação, atualize o estado local e recarregue somente os recursos afetados.

- [ ] **Step 4: Separar visualmente Para hoje, Linha do tempo e Agora**

O workspace usa:

```tsx
<DayIntentLane date={date} entries={unscheduledEntries} />
<MobileDayTimeline mode="single-day" day={dayProjection} controller={dayController} />
<NowPanel session={state.activeSession} onStop={state.stopSession} onCancel={state.cancelSession} />
```

O botão antigo `Planejar` passa a rolar/focar a linha do tempo do mesmo dia, sem abrir o modal `PlannerSurface`. Remova o import lazy de `planner-mode.tsx` apenas depois que nenhum consumidor depender dele.

- [ ] **Step 5: Garantir conclusão sem horário fictício**

`toggleCompleted` continua atualizando apenas `DailyExecutionItem.completedAt` e a origem. A interface move o item para `Concluídas hoje`; não cria `DayPlanItem` nem `ExecutionSession`.

- [ ] **Step 6: Rodar testes de Hoje e Agenda**

Run: `npm --workspace @execution-os/web test -- src/features/today src/features/agenda`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/today apps/web/src/styles.css
git commit -m "feat(web): unify today execution with weekly agenda"
```

### Task 14: Atualizar demo, acessibilidade e regressões

**Files:**
- Modify: `apps/web/src/demo/mock-fetch.ts`
- Modify: `apps/web/src/components/layout.test.tsx`
- Modify: `apps/api/src/services/security-ownership.test.ts`

- [ ] **Step 1: Adicionar fixtures dos novos endpoints**

Em `mock-fetch.ts`, responda:

```ts
if (path.match(/^\/agenda\/week\/\d{4}-\d{2}-\d{2}$/)) {
  return { status: 200, body: buildAgendaWeekFixture(path.slice(-10)) };
}
if (path === '/execution-sessions/active') return { status: 200, body: null };
if (path === '/execution-sessions/start') return { status: 201, body: activeExecutionFixture(body) };
if (path.match(/^\/execution-sessions\/[^/]+\/(stop|cancel)$/)) {
  return { status: 200, body: endedExecutionFixture(path) };
}
```

- [ ] **Step 2: Adicionar testes de isolamento por usuário**

```ts
it('rejects moving a day-plan item owned by another user', async () => {
  prisma.dayPlanItem.findUnique.mockResolvedValue({
    id: ITEM_ID,
    dayPlan: { clerkUserId: 'other_user' }
  });
  await expect(dayPlanService.updateItem(ITEM_ID, { date: '2026-08-07' }, USER_ID))
    .rejects.toThrow('Item de planejamento não encontrado.');
});

it('rejects stopping another user execution session', async () => {
  prisma.executionSession.findFirst.mockResolvedValue(null);
  await expect(executionSessionService.stop(USER_ID, OTHER_SESSION_ID))
    .rejects.toThrow('Sessão de execução não encontrada.');
});
```

- [ ] **Step 3: Adicionar regressão da navegação**

No teste de layout, confirme que `Agenda` continua apontando para `/agenda`, que Hoje não volta a criar uma entrada Inbox separada e que a navegação móvel mantém os cinco destinos aprovados.

- [ ] **Step 4: Rodar todos os testes e typechecks**

Run: `npm test --workspaces`

Expected: todos os testes passam.

Run: `npm run typecheck`

Expected: todos os workspaces passam.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/demo/mock-fetch.ts apps/web/src/components/layout.test.tsx apps/api/src/services/security-ownership.test.ts
git commit -m "test: cover agenda demo and ownership regressions"
```

## Fase 5 — Verificação visual e entrega

### Task 15: Verificar fluxos, breakpoints e qualidade final

**Files:**
- Modify when required by findings: `apps/web/src/features/agenda/agenda.css`
- Modify when required by findings: files already introduced in Tasks 9–13

- [ ] **Step 1: Rodar a suíte e o build completos antes da QA visual**

Run: `npm test --workspaces && npm run typecheck && npm run build`

Expected: todos os testes, typechecks e builds passam. Avisos já conhecidos do Excalidraw podem permanecer; nenhum erro novo é aceito.

- [ ] **Step 2: Iniciar ambiente local sem aplicar migração em produção**

Run: `npm run dev`

Expected: web e API locais sobem; a migração é aplicada somente no banco local autorizado para desenvolvimento.

- [ ] **Step 3: Verificar desktop no navegador**

Validar em 1440×900, 1280×800 e 1024×768:

- semana vazia, normal e densa;
- sete dias e fim de semana alcançáveis;
- rail aberto e recolhido;
- arrastar tarefa e Inbox para slot;
- segunda sessão da mesma tarefa;
- mover e redimensionar com mouse e teclado;
- conflito salvo com aviso;
- ocorrência recorrente versus série;
- concluir bloco sem concluir a tarefa;
- Desfazer após movimento e conclusão.

- [ ] **Step 4: Verificar celular no navegador**

Validar em 390×844 e 360×800:

- um dia por vez, sem cards semanais empilhados;
- troca de dia por botão e gesto;
- gaveta em três alturas;
- agendamento por toque sem drag;
- pressão longa e alternativa explícita;
- bloco de 15 minutos tocável;
- formulário com largura correta;
- ausência de rolagem horizontal;
- navegação inferior e gaveta sem sobreposição.

- [ ] **Step 5: Verificar a conversa com Hoje**

1. Adicionar captura rápida a Hoje sem horário.
2. Confirmar que aparece na faixa sem horário da Agenda.
3. Agendar às 14:00 na Agenda e confirmar bloco no Hoje.
4. Mover no Hoje e confirmar atualização na Agenda.
5. Concluir diretamente outro item e confirmar que não ganha intervalo fictício.
6. Iniciar uma captura, encerrar após alguns minutos e confirmar execução real separada do plano.

- [ ] **Step 6: Corrigir somente achados reproduzidos e rerodar verificações afetadas**

Para cada achado, primeiro adicione teste reproduzível, confirme FAIL, faça a menor correção, confirme PASS e repita o breakpoint afetado.

- [ ] **Step 7: Confirmar diff e worktree**

Run: `git diff --check && git status --short && git log --oneline -15`

Expected: sem whitespace inválido; somente mudanças planejadas; sequência de commits das Tasks 1–14 visível.

- [ ] **Step 8: Commit final de polimento, somente se houver alterações**

```bash
git add apps/web/src/features/agenda apps/web/src/features/today apps/web/src/styles.css
git commit -m "style: polish unified weekly planning experience"
```

## Critérios de aceite finais

- `Fazer hoje` cria intenção sem horário.
- Intenções sem horário aparecem em Hoje e na faixa do dia da Agenda.
- Capturas rápidas são agendadas sem conversão para `Task`.
- Captura rápida recebe 15 minutos somente ao ser colocada num slot.
- Tarefas complexas aceitam várias sessões planejadas.
- Agenda e Hoje usam o mesmo `DayPlanItem`.
- Execução observada não sobrescreve horário planejado.
- Concluir sem iniciar não cria intervalo.
- Desktop usa rail + grade semanal; celular usa faixa semanal + dia único + gaveta.
- Conflitos avisam, mas não bloqueiam.
- Recorrências exigem escolha de ocorrência ou série.
- Toda operação é isolada por `clerkUserId`.
- Testes, typecheck e build passam antes de qualquer merge ou deploy.
