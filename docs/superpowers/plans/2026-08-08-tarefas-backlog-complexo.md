# Tarefas Backlog Complexo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tela administrativa atual de Tarefas por um backlog operacional de trabalho complexo, com criação progressiva, grupos por movimento, visões acionáveis, detalhe master-detail e integração independente com Hoje e Agenda.

**Architecture:** Manter os contratos existentes e adicionar um read model `GET /tasks/backlog` que projeta tarefa, marca Hoje, progresso de etapas e bloqueios em uma carga inicial. No frontend, uma camada pura deriva grupos, visões e ordenação; um único hook controla coleção, cache do detalhe, URL e mutações otimistas; componentes pequenos renderizam compositor, lista, linhas e painel. O desktop usa `/tarefas/:taskId` como seleção estável e o mobile usa a mesma rota em nível de tela cheia.

**Tech Stack:** React 18, TypeScript, React Router 6, Fastify 5, Zod, Prisma/PostgreSQL, Vitest, Testing Library, dnd-kit, Lucide React e CSS responsivo existente do Operis.

---

## Referências obrigatórias

- Especificação aprovada: `docs/superpowers/specs/2026-08-08-tarefas-backlog-complexo-design.md`
- Modelo Hoje/Inbox: `docs/superpowers/specs/2026-08-05-inbox-hoje-unificado-design.md`
- Página legada a substituir: `apps/web/src/pages/tarefas.tsx`
- Tabela legada a remover após o cutover: `apps/web/src/components/task-intelligence-table.tsx`
- Contratos existentes: `apps/web/src/api.ts`, `apps/api/src/routes/tasks.ts`, `apps/api/src/services/task-service.ts`
- Contrato de Hoje: `apps/api/src/routes/daily-execution.ts`, `apps/web/src/features/today/types.ts`
- Contrato de Agenda: `apps/web/src/features/agenda/use-agenda-week.ts`, `apps/web/src/api.ts`
- Tokens e shell globais: `apps/web/src/styles.css`, `apps/web/src/components/layout.tsx`

## Regras de implementação

- Não reintroduzir cards de métricas, gráficos, alternância lista/tabela ou as quatro abas de detalhe.
- Não transformar `Hoje` em grupo ou status novo. A marca deriva de `DailyExecutionItem`.
- Não criar status `aguardando`. A projeção usa os campos `waiting*` e preserva `status`.
- Não reutilizar `description` como próximo passo. Usar o novo campo `nextStep`.
- Não remover endpoints antigos; Projetos, Hoje, WhatsApp e outras telas ainda podem usá-los.
- Não manter dois renderizadores completos da lista depois do cutover.
- Toda mutação otimista deve guardar snapshot, reverter em erro e anunciar o resultado.
- Usar ícones Lucide já presentes; não adicionar outra biblioteca de ícones.

## Task 1: Adicionar os campos persistidos necessários

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260808000000_task_backlog_clarity/migration.sql`
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Escrever as expectativas de tipo antes da geração**

Atualizar temporariamente os tipos públicos do cliente para declarar os novos campos que o restante da implementação consumirá:

```ts
export type Task = {
  // campos atuais
  nextStep?: string | null;
};

export type Subtask = {
  id: string;
  taskId: string;
  title: string;
  status: TaskStatus;
  position: number;
};
```

- [ ] **Step 2: Executar o typecheck e confirmar a falha de contrato incompleto**

Run:

```bash
npm run typecheck --workspace @execution-os/web
```

Expected: ainda pode passar porque os campos são aditivos; registrar que o teste real virá nas rotas e no serviço, sem inventar uma falha artificial.

- [ ] **Step 3: Alterar o schema Prisma**

Adicionar a `Task`:

```prisma
nextStep String? @map("next_step")
```

Adicionar a `Subtask`:

```prisma
position Int @default(0)
```

Adicionar também:

```prisma
@@index([taskId, position])
```

- [ ] **Step 4: Criar a migração somente aditiva**

```sql
ALTER TABLE "tasks" ADD COLUMN "next_step" TEXT;

ALTER TABLE "subtasks"
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "task_id" ORDER BY "id") - 1 AS "position"
  FROM "subtasks"
)
UPDATE "subtasks" AS target
SET "position" = ranked."position"
FROM ranked
WHERE target."id" = ranked."id";

CREATE INDEX "subtasks_task_id_position_idx"
  ON "subtasks"("task_id", "position");
```

- [ ] **Step 5: Gerar o cliente e validar os schemas**

Run:

```bash
npm run prisma:generate --workspace @execution-os/api
npx prisma validate --schema apps/api/prisma/schema.prisma
```

Expected: `Generated Prisma Client` e `The schema ... is valid`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260808000000_task_backlog_clarity/migration.sql apps/web/src/api.ts
git commit -m "feat: add task clarity and step order fields"
```

## Task 2: Liberar criação progressiva e persistir clareza/etapas na API

**Files:**

- Create: `apps/api/src/routes/tasks.test.ts`
- Modify: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/services/task-service.ts`
- Modify: `apps/api/src/services/task-service.test.ts`

- [ ] **Step 1: Escrever testes de rota que falham**

Cobrir criação somente com Frente e título, atualização de `nextStep` e reordenação exata das etapas:

```ts
it('accepts progressive task creation', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/tasks',
    payload: {
      workspaceId: WORKSPACE_ID,
      title: 'Preparar proposta'
    }
  });

  expect(response.statusCode).toBe(201);
  expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
    clerkUserId: 'user_1',
    workspaceId: WORKSPACE_ID,
    title: 'Preparar proposta'
  }));
});

it('updates the independent next step', async () => {
  await app.inject({
    method: 'PATCH',
    url: `/tasks/${TASK_ID}`,
    payload: { nextStep: 'Enviar rascunho para revisão' }
  });

  expect(service.update).toHaveBeenCalledWith(
    TASK_ID,
    { nextStep: 'Enviar rascunho para revisão' },
    { clerkUserId: 'user_1' }
  );
});

it('reorders every step exactly once', async () => {
  const response = await app.inject({
    method: 'PUT',
    url: `/tasks/${TASK_ID}/subtasks/order`,
    payload: { orderedIds: [STEP_TWO_ID, STEP_ONE_ID] }
  });

  expect(response.statusCode).toBe(204);
  expect(service.reorderSubtasks).toHaveBeenCalledWith(
    TASK_ID,
    [STEP_TWO_ID, STEP_ONE_ID],
    { clerkUserId: 'user_1' }
  );
});
```

- [ ] **Step 2: Executar os testes e confirmar RED**

Run:

```bash
npm test --workspace @execution-os/api -- src/routes/tasks.test.ts
```

Expected: falhas porque criação ainda exige DoD/tipo/energia/natureza/estimativa, `nextStep` é removido pelo schema e a rota de ordem não existe.

- [ ] **Step 3: Tornar o schema de criação progressivo**

Manter `workspaceId` e `title` obrigatórios, mas remover o `.extend()` que torna campos de profundidade obrigatórios. Preservar validações condicionais de multibloco e dependência externa:

```ts
const taskBodyBaseSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  title: executableTitleSchema,
  description: z.string().optional().nullable(),
  definitionOfDone: z.string().max(280).optional().nullable(),
  nextStep: z.string().max(500).optional().nullable(),
  // campos atuais opcionais
});

const taskCreateSchema = taskBodyBaseSchema.extend({
  restrictions: z.array(restrictionInputSchema).max(10).optional()
}).superRefine(validateConditionalTaskFields);
```

Extrair `validateConditionalTaskFields` para criação e atualização não divergirem. Continuar exigindo “verbo + objeto” no título e mostrar esse erro no compositor.

- [ ] **Step 4: Persistir `nextStep` no serviço**

Adicionar a `CreateTaskInput`, ao `select` da tarefa atual e aos dados de `create/update`:

```ts
nextStep?: string | null;

nextStep: input.nextStep?.trim() || null,

nextStep:
  input.nextStep === null
    ? null
    : input.nextStep?.trim(),
```

- [ ] **Step 5: Persistir ordem das etapas**

Em `listSubtasks`, ordenar por `position` e `id`. Em `createSubtask`, calcular `max(position) + 1`. Adicionar validação de propriedade e conjunto exato em `reorderSubtasks`:

```ts
async reorderSubtasks(taskId: string, orderedIds: string[], options: OwnershipOptions = {}) {
  await this.assertTaskOwner(taskId, options.clerkUserId);
  const current = await this.prisma.subtask.findMany({
    where: { taskId },
    select: { id: true }
  });
  const expected = new Set(current.map((item) => item.id));
  const received = new Set(orderedIds);
  if (
    current.length !== orderedIds.length ||
    received.size !== orderedIds.length ||
    orderedIds.some((id) => !expected.has(id))
  ) {
    throw serviceError('A ordem deve conter todas as etapas da tarefa.', 400);
  }
  await this.prisma.$transaction(
    orderedIds.map((id, position) =>
      this.prisma.subtask.update({ where: { id }, data: { position } })
    )
  );
}
```

Se `serviceError` ainda não for compartilhável nesse arquivo, criar o mesmo helper tipado usado pelos demais serviços; não lançar erro 500 para payload inválido.

- [ ] **Step 6: Expor `PUT /tasks/:taskId/subtasks/order` antes das rotas dinâmicas de subtarefa**

```ts
app.put('/tasks/:taskId/subtasks/order', async (request, reply) => {
  const clerkUserId = getUserId(request);
  const { taskId } = z.object({ taskId: z.string().uuid() }).parse(request.params);
  const { orderedIds } = z.object({
    orderedIds: z.array(z.string().uuid())
  }).parse(request.body);
  await taskService.reorderSubtasks(taskId, orderedIds, { clerkUserId });
  return reply.code(204).send();
});
```

- [ ] **Step 7: Adicionar testes unitários de defaults e ordem**

No serviço, mockar Prisma e provar:

- título + Frente persistem defaults `b`, `media`, `operacao`, `active`, prioridade `3`;
- `nextStep` é normalizado e pode ser limpo com `null`;
- nova etapa recebe a próxima posição;
- reordenação rejeita ID ausente, duplicado e de outra tarefa.

- [ ] **Step 8: Executar os testes e confirmar GREEN**

Run:

```bash
npm test --workspace @execution-os/api -- src/routes/tasks.test.ts src/services/task-service.test.ts
npm run typecheck --workspace @execution-os/api
```

Expected: todos os testes passam e TypeScript não reporta erro.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/tasks.ts apps/api/src/routes/tasks.test.ts apps/api/src/services/task-service.ts apps/api/src/services/task-service.test.ts
git commit -m "feat: support progressive complex task editing"
```

## Task 3: Criar o read model do backlog sem quebrar `GET /tasks`

**Files:**

- Modify: `apps/api/src/services/task-service.ts`
- Modify: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/routes/tasks.test.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/api.test.ts`

- [ ] **Step 1: Escrever o contrato de rota que falha**

```ts
it('returns the backlog projection for a local date', async () => {
  service.listBacklog.mockResolvedValue({ date: '2026-08-08', items: [] });
  const response = await app.inject({
    method: 'GET',
    url: `/tasks/backlog?date=2026-08-08&workspaceId=${WORKSPACE_ID}`
  });

  expect(response.statusCode).toBe(200);
  expect(service.listBacklog).toHaveBeenCalledWith({
    clerkUserId: 'user_1',
    date: '2026-08-08',
    workspaceId: WORKSPACE_ID
  });
});
```

Também testar data inválida com resposta 400 e garantir que `/tasks/waiting-radar` continua chegando à rota antiga.

- [ ] **Step 2: Rodar o teste e confirmar RED**

```bash
npm test --workspace @execution-os/api -- src/routes/tasks.test.ts
```

Expected: 404 ou método ausente para `/tasks/backlog`.

- [ ] **Step 3: Implementar `TaskService.listBacklog`**

Consultar uma vez tarefas do usuário com:

```ts
include: {
  workspace: true,
  project: true,
  subtasks: { select: { id: true, status: true, position: true }, orderBy: { position: 'asc' } },
  restrictions: { orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] },
  dailyExecutionItems: {
    where: { clerkUserId: filters.clerkUserId, date: startOfDay(filters.date) },
    select: { id: true }
  }
}
```

Normalizar a resposta para não vazar o shape Prisma:

```ts
return {
  date: filters.date,
  items: records.map(({ subtasks, dailyExecutionItems, restrictions, ...task }) => ({
    ...task,
    restrictions,
    todayEntryId: dailyExecutionItems[0]?.id ?? null,
    stepSummary: {
      total: subtasks.length,
      completed: subtasks.filter((step) => step.status === 'feito').length
    },
    openRestrictionCount: restrictions.filter((item) => item.status === 'aberta').length
  }))
};
```

O `where` deve preservar concluídas para o filtro correspondente, mas excluir arquivadas por padrão somente na projeção do frontend. Não alterar `list()` nem a ordenação dos consumidores legados.

- [ ] **Step 4: Registrar a rota estática antes de qualquer `/tasks/:taskId`**

```ts
app.get('/tasks/backlog', async (request) => {
  const clerkUserId = getUserId(request);
  const query = z.object({
    date: dateSchema,
    workspaceId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional()
  }).parse(request.query);
  return taskService.listBacklog({ ...query, clerkUserId });
});
```

- [ ] **Step 5: Adicionar tipos e cliente web**

```ts
export type TaskBacklogItem = Task & {
  todayEntryId: string | null;
  stepSummary: { total: number; completed: number };
  openRestrictionCount: number;
};

export type TaskBacklogResponse = {
  date: string;
  items: TaskBacklogItem[];
};

getTaskBacklog: (query: { date: string; workspaceId?: string; projectId?: string }) =>
  apiRequest<TaskBacklogResponse>(withQuery('/tasks/backlog', query)),
```

Adicionar `nextStep` aos inputs de `createTask/updateTask`, tornar os campos avançados opcionais em `createTask` e adicionar:

```ts
reorderTaskSubtasks: (taskId: string, orderedIds: string[]) =>
  apiRequest<void>(`/tasks/${taskId}/subtasks/order`, {
    method: 'PUT',
    body: JSON.stringify({ orderedIds })
  }),
```

- [ ] **Step 6: Testar os contratos do cliente**

Em `apps/web/src/api.test.ts`, verificar URL, query, payload mínimo, `nextStep` e ordem de etapas.

Run:

```bash
npm test --workspace @execution-os/web -- src/api.test.ts
npm test --workspace @execution-os/api -- src/routes/tasks.test.ts
```

Expected: testes de contrato passam.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/task-service.ts apps/api/src/routes/tasks.ts apps/api/src/routes/tasks.test.ts apps/web/src/api.ts apps/web/src/api.test.ts
git commit -m "feat: expose complex task backlog projection"
```

## Task 4: Implementar o modelo puro de grupos, visões, filtros e ordenação

**Files:**

- Create: `apps/web/src/features/tasks/types.ts`
- Create: `apps/web/src/features/tasks/task-backlog-model.ts`
- Create: `apps/web/src/features/tasks/task-backlog-model.test.ts`
- Create: `apps/web/src/features/tasks/task-test-fixtures.ts`

- [ ] **Step 1: Escrever os testes de precedência e derivação**

```ts
it.each([
  [{ status: 'andamento' }, 'in_progress'],
  [{ status: 'backlog' }, 'next'],
  [{ status: 'hoje' }, 'next'],
  [{ status: 'andamento', horizon: 'future' }, 'future'],
  [{ status: 'andamento', waitingOnPerson: 'Cliente' }, 'waiting']
])('projects task movement with precedence', (patch, expected) => {
  expect(taskMovement(taskFixture(patch))).toBe(expected);
});

it('derives actionable views without creating states', () => {
  const tasks = [
    taskFixture({ id: 'waiting', waitingOnPerson: 'Cliente' }),
    taskFixture({ id: 'blocked', openRestrictionCount: 1 }),
    taskFixture({ id: 'late', dueDate: '2026-08-07T12:00:00.000Z' }),
    taskFixture({ id: 'directionless', nextStep: null })
  ];

  expect(applyTaskView(tasks, 'waiting', '2026-08-08').map((item) => item.id)).toEqual(['waiting']);
  expect(applyTaskView(tasks, 'blocked', '2026-08-08').map((item) => item.id)).toEqual(['blocked']);
  expect(applyTaskView(tasks, 'overdue', '2026-08-08').map((item) => item.id)).toEqual(['late']);
  expect(applyTaskView(tasks, 'no_next_step', '2026-08-08').map((item) => item.id)).toEqual(['directionless']);
});
```

Cobrir também:

- concluída/arquivada fora da visão padrão;
- busca em título, DoD, próximo passo, Frente e Projeto;
- filtros de Frente, Projeto, prioridade, prazo, Hoje, horizonte e concluídas;
- ordem: atenção, prioridade, prazo, atualização;
- tarefa nunca aparece em dois grupos;
- parâmetros desconhecidos retornam defaults seguros.

- [ ] **Step 2: Rodar os testes e confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-backlog-model.test.ts
```

Expected: módulo ainda não existe.

- [ ] **Step 3: Definir tipos de UI sem duplicar tipos de API**

```ts
export type TaskMovement = 'in_progress' | 'next' | 'waiting' | 'future';
export type TaskActionView = 'all' | 'waiting' | 'blocked' | 'overdue' | 'no_next_step';
export type TaskDueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';
export type TaskSort = 'default' | 'due' | 'priority' | 'project' | 'updated';

export type TaskBacklogFilters = {
  query: string;
  view: TaskActionView;
  workspaceId: string | null;
  projectId: string | null;
  priority: number | null;
  due: TaskDueFilter;
  today: boolean | null;
  horizon: TaskHorizon | null;
  completion: 'open' | 'done' | 'archived' | 'all';
  sort: TaskSort;
};
```

- [ ] **Step 4: Implementar funções puras e estáveis**

Exportar pelo menos:

- `taskMovement(task)`;
- `isTaskOverdue(task, date)`;
- `applyTaskView(tasks, view, date)`;
- `filterTasks(tasks, filters, date)`;
- `sortTasks(tasks, sort, date)`;
- `groupTasks(tasks)`;
- `parseTaskSearchParams(searchParams)`;
- `writeTaskSearchParams(filters, current)`.

Usar `localeCompare('pt-BR')` como último desempate por título e depois ID para testes determinísticos.

- [ ] **Step 5: Rodar os testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-backlog-model.test.ts
```

Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/tasks/types.ts apps/web/src/features/tasks/task-backlog-model.ts apps/web/src/features/tasks/task-backlog-model.test.ts apps/web/src/features/tasks/task-test-fixtures.ts
git commit -m "feat: model complex task backlog views"
```

## Task 5: Construir o controlador único com cache e rollback

**Files:**

- Create: `apps/web/src/features/tasks/use-task-backlog.ts`
- Create: `apps/web/src/features/tasks/use-task-backlog.test.tsx`
- Create: `apps/web/src/features/tasks/task-workspace.ts`
- Create: `apps/web/src/features/tasks/task-workspace.test.ts`

- [ ] **Step 1: Escrever testes do resolvedor de Frente**

Provar a ordem aprovada:

1. Frente específica do shell;
2. `operis:last-front-id` se válida e não `standby`;
3. primeira Frente não `geral` e não `standby`;
4. `null` quando não há Frente.

```ts
expect(resolveTaskWorkspaceId({
  activeWorkspaceId: 'all',
  preferredWorkspaceId: 'ws-2',
  workspaces
})).toBe('ws-2');
```

- [ ] **Step 2: Escrever testes do hook que falham**

Mockar `api` e cobrir:

- carga paralela de backlog, Frentes e Projetos;
- detalhe complementar carregado somente após seleção;
- cache evita repetir subtarefas/restrições/histórico/multibloco ao voltar à mesma tarefa;
- radar de acompanhamento externo carregado somente ao abrir dependências e mantido em cache por Frente;
- criação mínima adiciona em Próximas e mantém formulário em erro;
- movimento otimista confirma e faz rollback;
- planejar para Hoje chama `assignDailyExecution` sem chamar `updateTask`;
- retirar de Hoje chama `removeDailyExecution` sem mudar `status`;
- atualização de DoD/nextStep altera o item e o cache;
- exclusão/conclusão remove da visão aberta somente após confirmação;
- falha inicial permite `reload()`.

```ts
await act(() => result.current.planForToday(task));
expect(apiMock.assignDailyExecution).toHaveBeenCalledWith('2026-08-08', {
  sourceType: 'task', sourceId: task.id
});
expect(apiMock.updateTask).not.toHaveBeenCalled();
```

- [ ] **Step 3: Rodar os testes e confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-workspace.test.ts src/features/tasks/use-task-backlog.test.tsx
```

Expected: módulos não existem.

- [ ] **Step 4: Implementar o estado do controlador**

O hook recebe contexto explícito e não lê o Router diretamente:

```ts
type UseTaskBacklogInput = {
  date: string;
  activeWorkspaceId: string;
  filters: TaskBacklogFilters;
  selectedTaskId: string | null;
};
```

Retornar:

```ts
{
  tasks, visibleTasks, groups, workspaces, projects,
  selectedTask, detail, loading, detailLoading, error,
  busyTaskIds, composer, collapsedGroups,
  reload, loadDetail, createTask, updateTask, moveTask,
  planForToday, removeFromToday, scheduleTask,
  completeTask, reopenTask, archiveTask, deleteTask,
  createStep, updateStep, reorderSteps, deleteStep,
  createRestriction, updateRestriction, deleteRestriction,
  registerWaitingFollowup, clearWaiting,
  toggleGroup
}
```

Usar `useRef(new Map())` ou estado equivalente para cache de detalhe. Invalidar somente o fragmento afetado após mutação.

Persistir grupos recolhidos em `localStorage` sob `operis:tasks:collapsed-groups`, validando o JSON e ignorando chaves desconhecidas. A preferência é visual; não entra na URL.

- [ ] **Step 5: Centralizar a mutação otimista**

```ts
async function mutateTaskOptimistically(
  taskId: string,
  optimistic: (task: TaskBacklogItem) => TaskBacklogItem,
  persist: () => Promise<TaskBacklogItem | Task>
) {
  const snapshot = tasksRef.current;
  setTasks((current) => current.map((task) => task.id === taskId ? optimistic(task) : task));
  setBusy(taskId, true);
  try {
    const persisted = await persist();
    mergeTask(persisted);
    announce('Tarefa atualizada.');
  } catch (cause) {
    setTasks(snapshot);
    announce('A alteração foi desfeita porque não pôde ser salva.', 'assertive');
    throw cause;
  } finally {
    setBusy(taskId, false);
  }
}
```

Guardar snapshots por operação para não reverter mutações já confirmadas em outra tarefa.

- [ ] **Step 6: Mapear mudanças de movimento**

- Em andamento: `status: 'andamento', horizon: 'active'` e limpar espera se ela foi resolvida conscientemente;
- Próximas: `status: 'backlog', horizon: 'active'` e limpar espera;
- Futuro: `horizon: 'future'`, preservando `status`;
- Aguardando: somente após receber pessoa/tipo/data, preencher `waiting*` e preservar `status`.

Nunca persistir `status: 'hoje'` nessa tela.

- [ ] **Step 7: Rodar testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-workspace.test.ts src/features/tasks/use-task-backlog.test.tsx
```

Expected: todos passam, inclusive rollback e cache.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/tasks/use-task-backlog.ts apps/web/src/features/tasks/use-task-backlog.test.tsx apps/web/src/features/tasks/task-workspace.ts apps/web/src/features/tasks/task-workspace.test.ts
git commit -m "feat: add task backlog controller"
```

## Task 6: Implementar toolbar e compositor progressivo

**Files:**

- Create: `apps/web/src/features/tasks/task-backlog-toolbar.tsx`
- Create: `apps/web/src/features/tasks/task-create-composer.tsx`
- Create: `apps/web/src/features/tasks/task-create-composer.test.tsx`
- Create: `apps/web/src/features/tasks/task-filters-popover.tsx`

- [ ] **Step 1: Escrever testes de interação que falham**

Cobrir:

- `Nova tarefa` abre compositor inline e foca título;
- `Enter` cria; `Esc` cancela;
- título inválido exibe “Use verbo + objeto” junto ao campo;
- Frente resolvida não vira pedágio visual;
- Frente, Projeto e prazo podem ser expandidos;
- Projeto é limpo quando a Frente muda para uma incompatível;
- erro preserva valores e foco;
- ausência de Frente mostra explicação e link para `/frentes`;
- visões têm nomes e contagens acessíveis;
- filtros ativos podem ser removidos sem abrir o popover.

```ts
fireEvent.change(screen.getByLabelText('Título da tarefa'), {
  target: { value: 'Preparar proposta' }
});
fireEvent.keyDown(screen.getByLabelText('Título da tarefa'), { key: 'Enter' });
await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
  title: 'Preparar proposta', workspaceId: 'ws-1'
})));
```

- [ ] **Step 2: Confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-create-composer.test.tsx
```

- [ ] **Step 3: Construir a toolbar compacta**

Ordem visual:

1. título `Tarefas`;
2. busca com atalho `/`;
3. `Nova tarefa`;
4. filtros;
5. visões acionáveis `Todas`, `Aguardando`, `Bloqueadas`, `Atrasadas`, `Sem próximo passo`.

Em celular, busca e criação ficam na primeira linha; visões usam overflow horizontal com foco visível, sem esconder ações em hover.

- [ ] **Step 4: Construir o compositor inline**

Usar estado controlado pelo hook. O formulário inicial mostra apenas título; botão “Adicionar contexto” revela Frente/Projeto/prazo. Após sucesso, limpar o compositor e delegar seleção/foco à página.

Adicionar região acessível:

```tsx
<p className="task-backlog-announcer" role="status" aria-live="polite">
  {statusMessage}
</p>
```

- [ ] **Step 5: Rodar testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-create-composer.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/tasks/task-backlog-toolbar.tsx apps/web/src/features/tasks/task-create-composer.tsx apps/web/src/features/tasks/task-create-composer.test.tsx apps/web/src/features/tasks/task-filters-popover.tsx
git commit -m "feat: add progressive task backlog capture"
```

## Task 7: Implementar lista densa, linhas e movimentação acessível

**Files:**

- Create: `apps/web/src/features/tasks/task-group-list.tsx`
- Create: `apps/web/src/features/tasks/task-row.tsx`
- Create: `apps/web/src/features/tasks/task-row.test.tsx`
- Create: `apps/web/src/features/tasks/task-move-menu.tsx`
- Create: `apps/web/src/features/tasks/task-waiting-dialog.tsx`

- [ ] **Step 1: Escrever testes de linha e grupo**

Cobrir:

- quatro grupos na ordem aprovada e contagens;
- recolher/abrir grupo com `aria-expanded`;
- linha é selecionável e não é card;
- metadados ausentes não deixam rótulos vazios;
- marca Hoje não muda o grupo;
- progresso das etapas usa texto além de cor;
- atraso, bloqueio e dependência têm nomes acessíveis;
- menu oferece os quatro movimentos, alternativa ao drag;
- mover para Aguardando abre diálogo e exige dependência;
- `J/K/Enter` percorrem/abrem linhas quando foco não está em input;
- `Esc` devolve foco à linha.

- [ ] **Step 2: Confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-row.test.tsx
```

- [ ] **Step 3: Implementar `TaskRow` sem card chrome**

Estrutura semântica recomendada:

```tsx
<li data-task-id={task.id} data-selected={selected || undefined}>
  <button aria-label={`Concluir ${task.title}`} />
  <button className="task-backlog-row-main" onClick={onOpen}>
    <span className="task-backlog-row-title">{task.title}</span>
    <span className="task-backlog-row-context">...</span>
  </button>
  <TaskMoveMenu ... />
</li>
```

Não aninhar botões. O botão de conclusão, alvo principal e menu devem ser irmãos.

- [ ] **Step 4: Implementar grupos e dnd-kit**

Usar `DndContext` somente no desktop/capacidades de ponteiro. Cada grupo é droppable e cada linha draggable. `onDragEnd` chama a mesma função de movimento do menu. Se destino for `waiting`, abrir `TaskWaitingDialog` antes de persistir. Respeitar `prefers-reduced-motion`.

- [ ] **Step 5: Implementar alternativa explícita e rollback visível**

Em falha, recolocar a linha no grupo anterior, preservar seleção e mostrar ação `Tentar novamente` no toast/erro inline. Desabilitar apenas a tarefa ocupada.

- [ ] **Step 6: Rodar testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-row.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/tasks/task-group-list.tsx apps/web/src/features/tasks/task-row.tsx apps/web/src/features/tasks/task-row.test.tsx apps/web/src/features/tasks/task-move-menu.tsx apps/web/src/features/tasks/task-waiting-dialog.tsx
git commit -m "feat: render actionable complex task groups"
```

## Task 8: Construir clareza de execução e etapas no painel

**Files:**

- Create: `apps/web/src/features/tasks/task-detail-panel.tsx`
- Create: `apps/web/src/features/tasks/task-detail-panel.test.tsx`
- Create: `apps/web/src/features/tasks/task-execution-clarity.tsx`
- Create: `apps/web/src/features/tasks/task-steps.tsx`

- [ ] **Step 1: Escrever testes de hierarquia e edição**

Provar que o DOM segue a ordem:

1. estado/Hoje;
2. título;
3. definição de pronto;
4. próximo passo;
5. etapas;
6. restrições;
7. propriedades;
8. histórico.

Cobrir ainda:

- DoD e próximo passo editam separadamente e salvam no blur/atalho explícito;
- ausência de próximo passo mostra convite claro;
- criação, conclusão, reabertura e exclusão de etapa;
- arrastar etapas chama `reorderTaskSubtasks` e há botões mover acima/abaixo;
- todas as etapas concluídas oferecem `Concluir tarefa`, mas não chamam automaticamente;
- skeleton do detalhe não limpa a lista;
- `Esc` chama fechar e foco é restaurado pela página.

- [ ] **Step 2: Confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-detail-panel.test.tsx
```

- [ ] **Step 3: Implementar o documento vertical**

`TaskDetailPanel` recebe dados e callbacks; ele não chama `api` diretamente. Manter título editável, contexto compacto e ações no cabeçalho. Usar seções com headings reais para leitor de tela.

- [ ] **Step 4: Implementar edição resiliente**

Manter rascunho local durante edição. Em erro, restaurar rascunho do usuário e mostrar `Tentar novamente`; não substituir pelo valor anterior silenciosamente.

- [ ] **Step 5: Implementar etapas com posição persistida**

Usar o mesmo padrão de dnd-kit e alternativa de teclado/menu da lista. Atualizar `stepSummary` do item imediatamente após cada mutação.

- [ ] **Step 6: Rodar testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-detail-panel.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/tasks/task-detail-panel.tsx apps/web/src/features/tasks/task-detail-panel.test.tsx apps/web/src/features/tasks/task-execution-clarity.tsx apps/web/src/features/tasks/task-steps.tsx
git commit -m "feat: add execution-first task detail"
```

## Task 9: Preservar restrições, dependências, propriedades e histórico

**Files:**

- Create: `apps/web/src/features/tasks/task-constraints.tsx`
- Create: `apps/web/src/features/tasks/task-constraints.test.tsx`
- Create: `apps/web/src/features/tasks/task-properties.tsx`
- Create: `apps/web/src/features/tasks/task-history.tsx`

- [ ] **Step 1: Escrever testes dos recursos profundos**

Cobrir:

- criar/resolver/remover restrição;
- dependência externa exibe pessoa, tipo, prioridade e próxima data;
- registrar acompanhamento chama endpoint existente;
- abrir dependências carrega `getWaitingFollowupRadar` uma vez por Frente e exibe a próxima decisão sugerida quando houver linha correspondente;
- resolver espera limpa `waiting*` e revela o grupo subjacente;
- propriedades começam recolhidas quando vazias;
- Frente filtra Projetos compatíveis;
- multibloco exige DoD e minutos antes de ativar;
- histórico busca somente ao expandir e usa cache ao reabrir;
- erro de seção não derruba o restante do painel.

- [ ] **Step 2: Confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-constraints.test.tsx
```

- [ ] **Step 3: Implementar `TaskConstraints`**

Separar visualmente:

- “Bloqueios internos” para `TaskRestriction`;
- “Dependência externa” para `waiting*`;
- “Acompanhar” para os endpoints de follow-up atuais.

Não rotular tudo como “restrição”.

- [ ] **Step 4: Implementar propriedades progressivas**

Mostrar chips/resumo fechado apenas para propriedades existentes. Ao abrir, renderizar Frente, Projeto, prazo, prioridade, estimativa, energia, tipo de execução, horizonte e multibloco. Usar controles nativos ou componentes já existentes com labels reais.

- [ ] **Step 5: Implementar histórico sob demanda**

O botão deve ter `aria-expanded`; a lista ordena eventos mais recentes primeiro e usa `<time dateTime>`.

- [ ] **Step 6: Rodar testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-constraints.test.tsx src/features/tasks/task-detail-panel.test.tsx
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/tasks/task-constraints.tsx apps/web/src/features/tasks/task-constraints.test.tsx apps/web/src/features/tasks/task-properties.tsx apps/web/src/features/tasks/task-history.tsx
git commit -m "feat: preserve deep complex task controls"
```

## Task 10: Integrar Hoje, Agenda, conclusão e ações destrutivas

**Files:**

- Create: `apps/web/src/features/tasks/task-schedule-dialog.tsx`
- Create: `apps/web/src/features/tasks/task-actions.test.tsx`
- Modify: `apps/web/src/features/tasks/task-detail-panel.tsx`
- Modify: `apps/web/src/features/tasks/use-task-backlog.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/api.test.ts`
- Modify: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/routes/tasks.test.ts`
- Modify: `apps/api/src/services/task-service.ts`
- Modify: `apps/api/src/services/task-service.test.ts`
- Reuse: `apps/web/src/components/task-completion-modal.tsx`

- [ ] **Step 1: Escrever testes de fronteira entre lentes**

```ts
it('plans for Today without changing operational movement', async () => {
  const before = taskMovement(task);
  fireEvent.click(screen.getByRole('button', { name: 'Planejar para Hoje' }));
  await waitFor(() => expect(apiMock.assignDailyExecution).toHaveBeenCalled());
  expect(taskMovement(updatedTask)).toBe(before);
  expect(apiMock.updateTask).not.toHaveBeenCalledWith(task.id, expect.objectContaining({ status: 'hoje' }));
});
```

Cobrir:

- retirar de Hoje usa `todayEntryId`;
- agendar cria `DayPlanItem` com data/hora/duração e não muda status;
- duração padrão é estimativa restante ou 60 minutos, nunca 15 para tarefa complexa sem dado;
- concluir usa `TaskCompletionModal` existente;
- reabrir usa endpoint explícito, define `status = backlog` e limpa `completedAt/archivedAt`;
- arquivar usa endpoint explícito, define `status = arquivado` e preenche `archivedAt`;
- arquivar e excluir pedem confirmação contextual;
- excluir informa impacto em etapas/restrições/sessões.
- copiar referência usa a URL estável `/tarefas/:taskId`;
- abrir Projeto ou Frente vinculada navega para as rotas existentes sem perder a tarefa.

- [ ] **Step 2: Confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-actions.test.tsx
```

- [ ] **Step 3: Implementar contratos explícitos de reabrir e arquivar**

Adicionar ao serviço:

```ts
async reopen(taskId: string, options: OwnershipOptions = {}) {
  await this.assertTaskOwner(taskId, options.clerkUserId);
  return this.prisma.task.update({
    where: { id: taskId },
    data: { status: 'backlog', completedAt: null, archivedAt: null }
  });
}

async archive(taskId: string, options: OwnershipOptions = {}) {
  await this.assertTaskOwner(taskId, options.clerkUserId);
  return this.prisma.task.update({
    where: { id: taskId },
    data: { status: 'arquivado', archivedAt: new Date() }
  });
}
```

Expor `POST /tasks/:taskId/reopen` e `POST /tasks/:taskId/archive`. Adicionar `api.reopenTask(taskId)` e `api.archiveTask(taskId)`. Testar ownership, campos persistidos, métodos, URLs e respostas. Não simular reabertura com `PATCH status`, porque isso deixaria `completedAt` inconsistente.

- [ ] **Step 4: Implementar diálogo de Agenda**

Campos:

- data local;
- hora;
- duração;
- prévia do término.

Persistir com:

```ts
api.createDayPlanItem(date, {
  taskId: task.id,
  inboxItemId: null,
  startTime: toIsoDateTime(date, time),
  endTime: addMinutes(toIsoDateTime(date, time), duration),
  blockType: 'task'
});
```

Extrair/reutilizar helpers de `apps/web/src/utils/date.ts`; não duplicar cálculo de timezone com `toISOString().slice(0, 10)`.

- [ ] **Step 5: Conectar Hoje e conclusão**

Atualizar somente `todayEntryId` na projeção otimista. Ao concluir, manter modal/reflexão atual e remover da visão aberta depois da confirmação da API.

- [ ] **Step 6: Rodar testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-actions.test.tsx
npm test --workspace @execution-os/api -- src/routes/tasks.test.ts src/services/task-service.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/tasks/task-schedule-dialog.tsx apps/web/src/features/tasks/task-actions.test.tsx apps/web/src/features/tasks/task-detail-panel.tsx apps/web/src/features/tasks/use-task-backlog.ts apps/web/src/api.ts apps/web/src/api.test.ts apps/api/src/routes/tasks.ts apps/api/src/routes/tasks.test.ts apps/api/src/services/task-service.ts apps/api/src/services/task-service.test.ts
git commit -m "feat: connect task backlog to today and agenda"
```

## Task 11: Compor a rota, URL estável e responsividade master-detail

**Files:**

- Create: `apps/web/src/features/tasks/task-backlog-page.tsx`
- Create: `apps/web/src/features/tasks/task-backlog-page.test.tsx`
- Create: `apps/web/src/features/tasks/tasks.css`
- Replace: `apps/web/src/pages/tarefas.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/components/layout.tsx`
- Modify: `apps/web/src/components/layout.test.tsx`

- [ ] **Step 1: Escrever testes de rota e contexto**

Montar Router de teste com `/tarefas` e `/tarefas/:taskId`. Cobrir:

- seleção navega para `/tarefas/:taskId` e preserva query;
- desktop mantém lista e painel simultaneamente;
- fechar remove apenas `taskId` e preserva filtros;
- mobile mostra detalhe como `<main>` único e botão Voltar;
- voltar restaura scroll, busca, visão, filtros e grupo recolhido;
- `?compose=1` abre compositor e remove apenas esse parâmetro após consumo;
- `?focus=1` é ignorado/canonicalizado sem ativar shell especial;
- parâmetro inválido cai em default seguro;
- `/tarefas/:id` mantém Tarefas ativa na sidebar/mobile nav;
- foco retorna à linha selecionada após fechar.
- vazio global explica trabalho complexo e oferece a primeira criação;
- vazio de busca/filtro oferece limpar filtros;
- vazios Aguardando, Bloqueadas e Sem próximo passo usam mensagens acionáveis específicas;
- falha de detalhe mantém lista utilizável e falha inicial mostra `Tentar novamente`.

- [ ] **Step 2: Confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-backlog-page.test.tsx src/components/layout.test.tsx
```

- [ ] **Step 3: Implementar `TaskBacklogPage`**

Responsabilidades exclusivas da página:

- ler `useParams/useSearchParams`;
- obter `useShellContext`;
- passar estado navegável ao hook;
- sincronizar seleção e filtros com URL;
- guardar/restaurar scroll e foco;
- compor toolbar, compositor, grupos e detalhe.

`apps/web/src/pages/tarefas.tsx` vira wrapper fino:

```tsx
import { TaskBacklogPage } from '../features/tasks/task-backlog-page';

export function TarefasPage() {
  return <TaskBacklogPage />;
}
```

- [ ] **Step 4: Adicionar sub-rota estável**

```tsx
<Route path="tarefas" element={<TarefasPage />} />
<Route path="tarefas/:taskId" element={<TarefasPage />} />
```

- [ ] **Step 5: Remover o modo de shell `focus=1`**

Excluir `isTaskTableFocusRoute`, o retorno especial `task-focus-layout` e o atalho `F` que alternava a tabela. Manter `N` apontando para `?compose=1`. Atualizar command palette e textos de atalhos.

- [ ] **Step 6: Implementar CSS da feature**

Desktop:

```css
.task-backlog-workspace {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(22rem, 2fr);
  min-height: calc(100dvh - var(--shell-top-offset));
}

.task-backlog-detail {
  position: sticky;
  top: 0;
  max-height: 100dvh;
  overflow: auto;
  border-left: 1px solid var(--border-subtle);
}
```

Adaptar nomes às variáveis realmente existentes em `styles.css`; não criar tokens paralelos se já houver equivalentes.

Mobile em `max-width: 760px`:

- lista ou detalhe, nunca painel espremido;
- detalhe `position: fixed` dentro da área do app ou fluxo de rota equivalente;
- `min-height: 100dvh` e padding para bottom nav/safe area;
- alvos mínimos 44 px;
- sem overflow horizontal;
- cabeçalho sticky com Voltar;
- respeitar `prefers-reduced-motion`.

- [ ] **Step 7: Rodar testes e confirmar GREEN**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-backlog-page.test.tsx src/components/layout.test.tsx
npm run typecheck --workspace @execution-os/web
```

Expected: testes e typecheck passam.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/tasks/task-backlog-page.tsx apps/web/src/features/tasks/task-backlog-page.test.tsx apps/web/src/features/tasks/tasks.css apps/web/src/pages/tarefas.tsx apps/web/src/app.tsx apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx
git commit -m "feat: replace tasks route with master detail backlog"
```

## Task 12: Atualizar o modo demo e provar o fluxo completo

**Files:**

- Modify: `apps/web/src/demo/mock-fetch.ts`
- Modify: `apps/web/src/demo/mock-fetch.test.ts`
- Create: `apps/web/src/features/tasks/tasks-workspace.integration.test.tsx`

- [ ] **Step 1: Escrever testes de demo que falham**

Cobrir:

- `GET /tasks/backlog?date=...` retorna `todayEntryId`, `stepSummary`, `openRestrictionCount` e `nextStep`;
- `POST /tasks` somente com título/Frente cria tarefa mutável;
- `PATCH /tasks/:id` atualiza movimento e clareza;
- criar/editar/reordenar/excluir subtarefas persiste no mock;
- criar/resolver restrição persiste;
- atribuir/remover Hoje atualiza `todayEntryId` sem mudar status;
- concluir, arquivar e excluir atualizam a lista.

- [ ] **Step 2: Confirmar RED**

```bash
npm test --workspace @execution-os/web -- src/demo/mock-fetch.test.ts
```

- [ ] **Step 3: Tornar os dados de tarefas mutáveis no demo**

Substituir `const TASKS` por estado reinicializável e adicionar mapas de subtarefas/restrições. O matcher de leitura sozinho não basta; as mutações devem ser tratadas na seção que inspeciona método e body.

Importante: colocar `/tasks/backlog` e `/tasks/waiting-radar` antes de matchers genéricos `/tasks/:id`.

- [ ] **Step 4: Escrever o teste integrado da jornada**

Com `installMockFetch()`:

1. abrir `/tarefas`;
2. criar “Preparar proposta” apenas com título;
3. confirmar entrada em Próximas e painel aberto;
4. preencher DoD e próximo passo;
5. criar duas etapas e reordenar;
6. planejar para Hoje e confirmar que grupo não muda;
7. agendar uma sessão;
8. mover para Em andamento;
9. concluir pelo modal existente;
10. abrir visão Concluídas e reabrir.

Não usar sleeps; aguardar roles/textos ou chamadas mockadas.

- [ ] **Step 5: Rodar demo e integração**

```bash
npm test --workspace @execution-os/web -- src/demo/mock-fetch.test.ts src/features/tasks/tasks-workspace.integration.test.tsx
```

Expected: ambos passam.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/demo/mock-fetch.ts apps/web/src/demo/mock-fetch.test.ts apps/web/src/features/tasks/tasks-workspace.integration.test.tsx
git commit -m "test: cover complex task backlog journey"
```

## Task 13: Remover a UI legada e evitar regressões invisíveis

**Files:**

- Delete: `apps/web/src/components/task-intelligence-table.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/pages/dashboard.tsx`
- Modify: `apps/web/src/components/layout.tsx`
- Modify: `apps/web/src/components/layout-navigation.ts`

- [ ] **Step 1: Encontrar consumidores legados antes de apagar**

Run:

```bash
rg -n "TaskIntelligenceTable|task-intelligence-table|focus=1|task-table-focus|task-analytics" apps/web/src
```

Expected: somente arquivos já migrados/legados conhecidos. Se aparecer consumidor funcional, atualizá-lo para `/tarefas` ou `/tarefas?compose=1` antes da remoção.

- [ ] **Step 2: Atualizar links e rótulo de navegação**

- Dashboard: `/tarefas?focus=1` vira `/tarefas` com visão/filtro apropriado quando houver equivalente.
- Sidebar: caption `Backlog e inbox` vira `Trabalho complexo` ou o texto final aprovado no design system.
- Command palette: remover “foco total da tabela”.

- [ ] **Step 3: Remover renderizador e CSS comprovadamente órfãos**

Apagar `task-intelligence-table.tsx`. Remover somente seletores exclusivos da tela antiga após confirmar com `rg`; preservar classes compartilhadas como botões, modal de conclusão e componentes premium usados em outras rotas.

- [ ] **Step 4: Confirmar ausência de referências**

```bash
rg -n "TaskIntelligenceTable|task-intelligence-table|focus=1|task-table-focus|task-analytics" apps/web/src
```

Expected: sem resultados. `rg` retorna exit 1 por não encontrar correspondências.

- [ ] **Step 5: Rodar testes relacionados ao shell e páginas consumidoras**

```bash
npm test --workspace @execution-os/web -- src/components/layout.test.tsx src/features/projects/project-tasks-panel.test.tsx src/features/tasks
npm run typecheck --workspace @execution-os/web
```

Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor: remove legacy task dashboard UI"
```

## Task 14: Verificação funcional, visual e acessível

**Files:**

- Modify: `apps/web/src/features/tasks/tasks.css`
- Modify: `apps/web/src/features/tasks/task-backlog-page.test.tsx`
- Modify: `apps/web/src/features/tasks/tasks-workspace.integration.test.tsx`
- Create: `docs/superpowers/verification/2026-08-08-tarefas-backlog-complexo.md`

- [ ] **Step 1: Executar a suíte focada da API**

```bash
npm test --workspace @execution-os/api -- src/routes/tasks.test.ts src/services/task-service.test.ts src/routes/daily-execution.test.ts
```

Expected: todos passam.

- [ ] **Step 2: Executar a suíte focada web**

```bash
npm test --workspace @execution-os/web -- src/api.test.ts src/demo/mock-fetch.test.ts src/features/tasks src/components/layout.test.tsx
```

Expected: todos passam.

- [ ] **Step 3: Executar verificação completa do monorepo**

```bash
npm run typecheck
npm test --workspaces --if-present
npm run build --workspace @execution-os/api
npm run build --workspace @execution-os/web
git diff --check
```

Expected: exit 0 em todos; Vite pode emitir aviso de tamanho de chunk já conhecido, mas não erro.

- [ ] **Step 4: Iniciar app local com modo demo ou backend funcional**

Usar as portas livres atuais, registrar os comandos e URLs no documento de verificação. Não afirmar comportamento real apenas com teste unitário.

- [ ] **Step 5: Inspecionar no navegador interno — desktop**

Testar pelo menos em 1440×900:

- `/tarefas` cheia;
- sidebar aberta e recolhida;
- seleção mantendo lista visível;
- títulos longos;
- grupos vazios e cheios;
- filtros/visões;
- criação com erro e sucesso;
- movimento por menu e drag;
- Hoje independente;
- Agenda;
- detalhe com muitas etapas/restrições;
- conclusão e reabertura;
- refresh em `/tarefas/:taskId?...`.

Capturar screenshots antes/depois de qualquer correção visual material.

- [ ] **Step 6: Inspecionar no navegador interno — celular**

Testar em 390×844:

- lista sem overflow horizontal;
- bottom nav não cobre conteúdo;
- detalhe em tela cheia;
- voltar restaura rolagem e filtros;
- alvos de toque ≥44 px;
- teclado virtual não cobre compositor/ações essenciais;
- safe areas;
- menu como alternativa ao drag.

- [ ] **Step 7: Inspecionar teclado e acessibilidade**

Validar manualmente:

- Tab/Shift+Tab;
- `/`, `N`, `J`, `K`, `Enter`, `Esc` fora de inputs;
- foco visível e restaurado;
- nomes de botões de ícone;
- `aria-live` em sucesso, erro e rollback;
- estado não comunicado apenas por cor;
- redução de movimento.

- [ ] **Step 8: Registrar evidências**

O documento deve listar:

- commit/branch testado;
- comandos e resultados;
- URLs e viewports;
- screenshots locais com caminho;
- regressões encontradas e correções aplicadas;
- limitações conhecidas explicitamente aprovadas.

- [ ] **Step 9: Reexecutar verificação após ajustes**

Repetir Step 3 e `git diff --check`. Não concluir com teste antigo depois de alterar CSS ou lógica.

- [ ] **Step 10: Commit final**

```bash
git add apps/web/src docs/superpowers/verification/2026-08-08-tarefas-backlog-complexo.md
git commit -m "chore: verify complex task backlog redesign"
```

## Critérios de saída

- `/tarefas` mostra uma única lista densa agrupada por movimento.
- `Hoje` é marca independente baseada em `DailyExecutionItem`.
- criação somente com título funciona e abre o detalhe.
- DoD e próximo passo são campos distintos e prioritários.
- desktop mantém lista e painel; mobile usa detalhe em tela cheia.
- visões Aguardando, Bloqueadas, Atrasadas e Sem próximo passo são derivadas e acionáveis.
- etapas, restrições, dependências, follow-up, multibloco e histórico continuam utilizáveis.
- Agenda cria sessões sem mudar estado operacional.
- erros otimistas revertem e anunciam rollback.
- URL, foco, scroll e grupos preservam contexto.
- UI legada de tabela/gráficos não permanece carregada.
- migração é aditiva e endpoints antigos continuam funcionais.
- testes, typecheck, build, inspeção desktop/mobile e `git diff --check` passam.
