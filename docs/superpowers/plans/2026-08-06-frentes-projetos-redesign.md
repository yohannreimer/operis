# Frentes e Projetos Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar Frentes e Projetos num sistema de execução adaptativo com Responsabilidades contínuas, motores isolados, próximos movimentos e recomendações explicáveis em desktop e celular.

**Architecture:** O servidor passa a fornecer read models consolidados para Frentes e cockpit de Projeto. Regras metodológicas ficam em funções puras e normalizadores tolerantes a legado; próximos movimentos e revisões de Responsabilidades ganham persistência relacional. No frontend, páginas monolíticas são substituídas por features pequenas ligadas por um registro de motores comum.

**Tech Stack:** TypeScript, Fastify, Prisma/PostgreSQL, Zod, React 18, React Router, Vitest, Testing Library, Lucide React, CSS responsivo.

---

## Mapa de arquivos

### API e domínio

- `apps/api/prisma/schema.prisma` — enums, próximos movimentos, Responsabilidades e revisões.
- `apps/api/prisma/migrations/20260806120000_fronts_projects_execution/migration.sql` — migração aditiva e índices.
- `apps/api/src/domain/project-engine-domain.ts` — tipos normalizados, progresso/fase e adaptadores de metodologia.
- `apps/api/src/domain/project-engine-domain.test.ts` — normalização e compatibilidade legada.
- `apps/api/src/services/project-recommendation-service.ts` — recomendação determinística por motor.
- `apps/api/src/services/project-recommendation-service.test.ts` — precedência e regras.
- `apps/api/src/services/project-next-move-service.ts` — ciclo de vida e idempotência do movimento.
- `apps/api/src/services/project-next-move-service.test.ts` — troca, resolução e vínculo com tarefa.
- `apps/api/src/services/responsibility-service.ts` — CRUD, pulso de cuidado e cadência.
- `apps/api/src/services/responsibility-service.test.ts` — revisão, histórico, pausa e arquivamento.
- `apps/api/src/services/front-overview-service.ts` — read models de trilho e detalhe da Frente.
- `apps/api/src/services/front-overview-service.test.ts` — seleção de atenção e agregados.
- `apps/api/src/services/project-cockpit-service.ts` — lista agrupável e detalhe operacional.
- `apps/api/src/services/project-cockpit-service.test.ts` — estado derivado, fallback e isolamento.
- `apps/api/src/routes/project-execution.ts` — cockpit e próximos movimentos.
- `apps/api/src/routes/project-execution.test.ts` — contratos HTTP e propriedade.
- `apps/api/src/routes/responsibilities.ts` — endpoints de Responsabilidades.
- `apps/api/src/routes/responsibilities.test.ts` — validação e propriedade.
- `apps/api/src/routes/front-overview.ts` — endpoints de overview.
- `apps/api/src/routes/front-overview.test.ts` — contratos HTTP.
- `apps/api/src/services/task-service.ts` — resolver movimento ao concluir tarefa vinculada.
- `apps/api/src/services/task-service.test.ts` — regressão da integração.
- `apps/api/src/app.ts` — construção e registro dos novos serviços/routers.

### Cliente e interface

- `apps/web/src/api.ts` — contratos e métodos dos novos read models.
- `apps/web/src/api.test.ts` — URLs, métodos e payloads.
- `apps/web/src/features/projects/types.ts` — tipos de UI do cockpit e dos motores.
- `apps/web/src/features/projects/project-feature-flag.ts` — corte configurável durante a migração.
- `apps/web/src/features/projects/engine-registry.tsx` — intenção, método, ícone, wizard e view por motor.
- `apps/web/src/features/projects/engine-registry.test.tsx` — sete tipos, avançados e legado.
- `apps/web/src/features/projects/project-wizard.tsx` — Direção → Método → Primeiro movimento.
- `apps/web/src/features/projects/project-wizard.test.tsx` — validação e submit.
- `apps/web/src/features/projects/project-list.tsx` — lista operacional agrupada por Frente.
- `apps/web/src/features/projects/project-list.test.tsx` — grupos, filtros e estado vazio.
- `apps/web/src/features/projects/project-shell.tsx` — cabeçalho e contenção de falhas do motor.
- `apps/web/src/features/projects/project-shell.test.tsx` — contexto, fallback e ações.
- `apps/web/src/features/projects/project-tasks-panel.tsx` — tarefas laterais/full-height.
- `apps/web/src/features/projects/project-tasks-panel.test.tsx` — criar, Hoje e concluir.
- `apps/web/src/features/projects/engines/metric-engine.tsx` — 4DX.
- `apps/web/src/features/projects/engines/milestone-engine.tsx` — Entrega e Autoridade.
- `apps/web/src/features/projects/engines/pipeline-engine.tsx` — Pipeline, Captação e Sistema de Receita.
- `apps/web/src/features/projects/engines/exploration-engine.tsx` — Exploração e Mentoria.
- `apps/web/src/features/projects/engines/campaign-engine.tsx` — Campanha e Runway.
- `apps/web/src/features/projects/engines/decision-engine.tsx` — Decisão e Cenário.
- `apps/web/src/features/projects/engines/okr-engine.tsx` — OKR.
- `apps/web/src/features/projects/engines/funnel-engine.tsx` — Funil.
- `apps/web/src/features/projects/engines/engine-views.test.tsx` — render seguro e ação principal.
- `apps/web/src/features/projects/projects.css` — layout, densidade e responsividade.
- `apps/web/src/features/fronts/front-rail.tsx` — trilho master-detail.
- `apps/web/src/features/fronts/front-overview.tsx` — cuidado, Projetos e Responsabilidades.
- `apps/web/src/features/fronts/responsibility-editor-panel.tsx` — criar, editar, pausar e arquivar.
- `apps/web/src/features/fronts/responsibility-review-panel.tsx` — pulso de cuidado.
- `apps/web/src/features/fronts/fronts-page.test.tsx` — seleção, navegação e revisão.
- `apps/web/src/features/fronts/fronts.css` — desktop e navegação mobile.
- `apps/web/src/pages/workspaces.tsx` — composição fina da nova feature.
- `apps/web/src/pages/projetos.tsx` — composição fina de lista, wizard e cockpit.
- `apps/web/src/demo/mock-fetch.ts` — fixtures e mutações locais.
- `apps/web/src/demo/mock-fetch.test.ts` — contratos do modo demonstração.

## Task 1: Persistir próximos movimentos e Responsabilidades

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260806120000_fronts_projects_execution/migration.sql`

- [ ] **Step 1: Adicionar os enums e relações ao schema Prisma**

```prisma
enum ProjectNextMoveSource {
  manual
  recommendation
}

enum ProjectNextMoveStatus {
  active
  resolved
}

enum ResponsibilityHealth {
  healthy
  attention
  critical
}

enum ResponsibilityStatus {
  active
  paused
  archived
}

enum ResponsibilityCadence {
  weekly
  biweekly
  monthly
  quarterly
  custom
}
```

Adicionar `creationKey String? @map("creation_key")`, `@@unique([workspaceId, creationKey])` e `nextMoves ProjectNextMove[]` em `Project`; adicionar `projectNextMoves ProjectNextMove[]` em `Task`; adicionar `responsibilities Responsibility[]` em `Workspace`. `creationKey` é preenchida somente pelo endpoint transacional do wizard e permanece nula em Projetos legados.

- [ ] **Step 2: Adicionar os três modelos**

```prisma
model ProjectNextMove {
  id         String                @id @default(uuid())
  projectId  String                @map("project_id")
  taskId     String?               @map("task_id")
  idempotencyKey String?           @unique @map("idempotency_key")
  text       String
  source     ProjectNextMoveSource
  reason     String?
  ruleKey    String?               @map("rule_key")
  status     ProjectNextMoveStatus @default(active)
  createdAt  DateTime              @default(now()) @map("created_at")
  resolvedAt DateTime?             @map("resolved_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task    Task?   @relation(fields: [taskId], references: [id], onDelete: SetNull)

  @@index([projectId, status])
  @@index([taskId])
  @@map("project_next_moves")
}

model Responsibility {
  id                   String                 @id @default(uuid())
  workspaceId          String                 @map("workspace_id")
  title                String
  expectedStandard     String                 @map("expected_standard")
  cadence              ResponsibilityCadence
  cadenceIntervalDays  Int?                   @map("cadence_interval_days")
  health               ResponsibilityHealth   @default(healthy)
  nextCare             String                 @map("next_care")
  nextReviewAt         DateTime               @map("next_review_at")
  lastReviewedAt       DateTime?              @map("last_reviewed_at")
  status               ResponsibilityStatus   @default(active)
  createdAt            DateTime               @default(now()) @map("created_at")
  updatedAt            DateTime               @updatedAt @map("updated_at")
  archivedAt           DateTime?              @map("archived_at")

  workspace Workspace              @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  reviews   ResponsibilityReview[]

  @@index([workspaceId, status, nextReviewAt])
  @@map("responsibilities")
}

model ResponsibilityReview {
  id               String               @id @default(uuid())
  responsibilityId String               @map("responsibility_id")
  createdTaskId    String?              @map("created_task_id")
  health           ResponsibilityHealth
  note             String?
  nextCare         String               @map("next_care")
  nextReviewAt     DateTime             @map("next_review_at")
  reviewedAt       DateTime             @default(now()) @map("reviewed_at")

  responsibility Responsibility @relation(fields: [responsibilityId], references: [id], onDelete: Cascade)

  @@index([responsibilityId, reviewedAt])
  @@map("responsibility_reviews")
}
```

Depois da geração, acrescentar à migração o índice parcial que garante um único movimento ativo mesmo sob concorrência:

```sql
CREATE UNIQUE INDEX "project_next_moves_one_active_per_project"
ON "project_next_moves" ("project_id")
WHERE "status" = 'active';
```

- [ ] **Step 3: Gerar a migração SQL aditiva**

Run: `npm run prisma:migrate --workspace @execution-os/api -- --name fronts_projects_execution`

Expected: nova migração cria enums, tabelas, chaves estrangeiras e índices sem alterar ou apagar linhas de `projects`.

- [ ] **Step 4: Gerar cliente e validar schema**

Run: `npm run prisma:generate --workspace @execution-os/api && npm run typecheck --workspace @execution-os/api`

Expected: Prisma Client gerado e typecheck PASS; a alteração é apenas aditiva nesta etapa.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260806120000_fronts_projects_execution/migration.sql
git commit -m "feat(api): add project movements and responsibilities schema"
```

## Task 2: Normalizar motores e legado no servidor

**Files:**
- Create: `apps/api/src/domain/project-engine-domain.ts`
- Create: `apps/api/src/domain/project-engine-domain.test.ts`

- [ ] **Step 1: Escrever testes que falham para normalização**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeProjectEngine } from './project-engine-domain.js';

describe('normalizeProjectEngine', () => {
  it('maps legacy delivery to milestone without losing data', () => {
    const result = normalizeProjectEngine('delivery', {
      milestones: [{ id: 'm1', title: 'Publicar', done: false }]
    });
    expect(result.engine).toBe('milestone');
    expect(result.methodology).toBe('entrega');
    expect(result.data.milestones).toHaveLength(1);
  });

  it('returns safe defaults for malformed pipeline JSON', () => {
    const result = normalizeProjectEngine('pipeline', { stages: 'invalid', deals: null });
    expect(result.data).toMatchObject({ stages: [], deals: [], currency: 'BRL' });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

Run: `npm test --workspace @execution-os/api -- project-engine-domain.test.ts`

Expected: FAIL porque `project-engine-domain.js` ainda não existe.

- [ ] **Step 3: Implementar contrato, schemas e adaptadores**

```ts
import { z } from 'zod';

export type ProjectEngineKey = 'metric' | 'milestone' | 'pipeline' | 'exploration' | 'campaign' | 'decision' | 'okr' | 'funnel';

const milestoneSchema = z.object({
  milestones: z.array(z.object({
    id: z.string(), title: z.string(), done: z.boolean(), critical: z.boolean().optional(),
    doneAt: z.string().nullable().optional(), order: z.number().optional()
  })).default([]),
  blockers: z.array(z.object({ id: z.string(), title: z.string(), resolvedAt: z.string().nullable().optional() })).default([])
}).passthrough();

const pipelineSchema = z.object({
  stages: z.array(z.object({ id: z.string(), label: z.string(), order: z.number() })).default([]),
  deals: z.array(z.object({
    id: z.string(), name: z.string(), stageId: z.string(), amount: z.number().nullable().optional(),
    probability: z.number().nullable().optional(), createdAt: z.string(), stageEnteredAt: z.string().nullable().optional()
  })).default([]),
  currency: z.string().default('BRL'),
  totalGoal: z.number().optional()
}).passthrough();

const legacyMethodology = { delivery: 'entrega', launch: 'campanha', discovery: 'exploracao', growth: 'exploracao' } as const;

export function normalizeProjectEngine(methodology: string, rawData: unknown) {
  const canonical = legacyMethodology[methodology as keyof typeof legacyMethodology] ?? methodology;
  const engine: ProjectEngineKey = canonical === 'fourdx' ? 'metric'
    : canonical === 'entrega' || canonical === 'autoridade' ? 'milestone'
    : canonical === 'pipeline' || canonical === 'captacao' || canonical === 'sistema_receita' ? 'pipeline'
    : canonical === 'exploracao' || canonical === 'mentoria' ? 'exploration'
    : canonical === 'campanha' || canonical === 'runway' ? 'campaign'
    : canonical === 'decisao' || canonical === 'cenario' ? 'decision'
    : canonical === 'okr' ? 'okr' : canonical === 'funil' ? 'funnel' : 'metric';
  const schema = {
    metric: metricSchema, milestone: milestoneSchema, pipeline: pipelineSchema, exploration: explorationSchema,
    campaign: campaignSchema, decision: decisionSchema, okr: okrSchema, funnel: funnelSchema
  }[engine];
  const parsed = schema.safeParse(rawData ?? {});
  return { methodology: canonical, engine, data: parsed.success ? parsed.data : schema.parse({}), recovered: !parsed.success };
}
```

Adicionar os schemas restantes ao mesmo mapa:

```ts
const metricSchema = z.object({
  leadOne: z.string().optional(), leadTwo: z.string().optional(), primaryMetric: z.string().optional()
}).passthrough();
const explorationSchema = z.object({
  hypothesis: z.string().optional(), hypothesisCriteria: z.string().optional(),
  discoveries: z.array(z.object({ id: z.string(), text: z.string(), type: z.enum(['confirms', 'refutes', 'inconclusive']), week: z.string(), createdAt: z.string() })).default([]),
  decision: z.object({ choice: z.enum(['follow', 'pivot', 'discard']), justification: z.string(), decidedAt: z.string() }).nullable().optional(),
  sessions: z.array(z.object({ id: z.string(), date: z.string(), learned: z.string(), commitments: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean(), doneAt: z.string().nullable().optional() })).default([]) })).default([])
}).passthrough();
const campaignSchema = z.object({
  launchDate: z.string().nullable().optional(), campaignGoal: z.number().nullable().optional(), campaignResult: z.number().nullable().optional(),
  dailyTasks: z.array(z.object({ id: z.string(), date: z.string(), text: z.string(), done: z.boolean() })).default([]),
  availableCash: z.number().nullable().optional(), burnRateMonthly: z.number().nullable().optional(),
  runwayEvents: z.array(z.object({ id: z.string(), label: z.string(), amount: z.number(), date: z.string(), confirmed: z.boolean() })).default([])
}).passthrough();
const decisionSchema = z.object({
  options: z.array(z.object({ id: z.string(), label: z.string(), scores: z.record(z.number()).optional() })).default([]),
  criteria: z.array(z.object({ id: z.string(), label: z.string(), weight: z.number() })).default([]),
  decisionChoice: z.string().nullable().optional(), scenarios: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  scenarioActions: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean(), scenarioIds: z.array(z.string()) })).default([])
}).passthrough();
const okrSchema = z.object({
  krs: z.array(z.object({ id: z.string(), description: z.string(), currentValue: z.number(), targetValue: z.number(), unit: z.string().nullable().optional(), confidence: z.enum(['alta', 'media', 'baixa']), order: z.number() })).default([]),
  okrPeriod: z.string().optional()
}).passthrough();
const funnelSchema = z.object({
  funilStages: z.array(z.object({ id: z.string(), label: z.string(), value: z.number().nullable(), order: z.number() })).default([])
}).passthrough();
```

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npm test --workspace @execution-os/api -- project-engine-domain.test.ts && npm run typecheck --workspace @execution-os/api`

Expected: PASS; dados inválidos retornam defaults e `recovered: true`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/project-engine-domain.ts apps/api/src/domain/project-engine-domain.test.ts
git commit -m "feat(api): normalize project engines and legacy data"
```

## Task 3: Calcular progresso, estado e recomendação explicável

**Files:**
- Modify: `apps/api/src/domain/project-engine-domain.ts`
- Modify: `apps/api/src/domain/project-engine-domain.test.ts`
- Create: `apps/api/src/services/project-recommendation-service.ts`
- Create: `apps/api/src/services/project-recommendation-service.test.ts`

- [ ] **Step 1: Escrever testes de precedência e motor**

```ts
import { describe, expect, it } from 'vitest';
import { getProjectRecommendation } from './project-recommendation-service.js';

describe('getProjectRecommendation', () => {
  it('prefers a critical blocker over a stalled deal', () => {
    const recommendation = getProjectRecommendation({
      now: new Date('2026-08-06T12:00:00Z'),
      project: { id: 'p1', methodology: 'pipeline', status: 'ativo', timeHorizonEnd: null },
      data: {
        blockers: [{ id: 'b1', title: 'Preço não validado', resolvedAt: null }],
        stages: [{ id: 's1', label: 'Proposta', order: 1 }],
        deals: [{ id: 'd1', name: 'Empresa Alfa', stageId: 's1', amount: 8500, createdAt: '2026-07-20', stageEnteredAt: '2026-07-20' }]
      },
      activeMove: null,
      tasks: []
    });
    expect(recommendation).toMatchObject({ ruleKey: 'global.critical-blocker', text: 'Resolver: Preço não validado' });
  });

  it('recommends the oldest stalled pipeline deal with an explanation', () => {
    const recommendation = getProjectRecommendation({
      now: new Date('2026-08-06T12:00:00Z'),
      project: { id: 'p1', methodology: 'pipeline', status: 'ativo', timeHorizonEnd: null },
      data: { blockers: [], stages: [], deals: [{ id: 'd1', name: 'Empresa Alfa', stageId: 's1', amount: 8500, createdAt: '2026-07-20', stageEnteredAt: '2026-07-20' }] },
      activeMove: null,
      tasks: []
    });
    expect(recommendation?.reason).toContain('17 dias');
  });
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/api -- project-recommendation-service.test.ts`

Expected: FAIL porque o serviço ainda não existe.

- [ ] **Step 3: Implementar tipos puros e precedência**

```ts
export type ProjectRecommendation = {
  ruleKey: string;
  text: string;
  reason: string;
  severity: 'normal' | 'attention' | 'critical';
  sourceId?: string;
};

export function getProjectRecommendation(context: RecommendationContext): ProjectRecommendation | null {
  const blocker = context.data.blockers?.find((item) => !item.resolvedAt);
  if (blocker) return { ruleKey: 'global.critical-blocker', text: `Resolver: ${blocker.title}`, reason: 'Este bloqueio impede o avanço do projeto.', severity: 'critical', sourceId: blocker.id };
  if (context.activeMove) return null;
  const overdue = findOverdueItem(context);
  if (overdue) return overdue;
  const stale = findStalledItem(context);
  if (stale) return stale;
  const deadlineRisk = findDeadlineRisk(context);
  if (deadlineRisk) return deadlineRisk;
  return recommendationByEngine(context);
}
```

O dispatch deve ser explícito e exaustivo:

```ts
function recommendationByEngine(context: RecommendationContext) {
  switch (context.project.methodology) {
    case 'fourdx': return recommendFourDx(context);
    case 'delivery': case 'entrega': case 'autoridade': return recommendMilestone(context);
    case 'pipeline': case 'captacao': case 'sistema_receita': return recommendPipeline(context);
    case 'discovery': case 'growth': case 'exploracao': case 'mentoria': return recommendExploration(context);
    case 'launch': case 'campanha': case 'runway': return recommendCampaign(context);
    case 'decisao': case 'cenario': return recommendDecision(context);
    case 'okr': return recommendOkr(context);
    case 'funil': return recommendFunnel(context);
    case 'processo': return recommendRecurringLegacy(context);
  }
}
```

Os testes tabelados devem exigir estes `ruleKey`: `fourdx.checkin-due`, `milestone.next-critical`, `pipeline.stalled-deal`, `exploration.next-evidence`, `campaign.next-critical`, `decision.incomplete-option`, `okr.low-confidence`, `fundraising.weighted-forecast`, `funnel.conversion-drop`, `runway.refresh-inputs`, `revenue.next-stage-criterion`, `mentoring.pending-commitment`, `authority.next-proof`, `scenario.no-regret-action` e `recurring.next-cycle-item`.

- [ ] **Step 4: Implementar progresso/fase e estado operacional**

Adicionar em `project-engine-domain.ts`:

```ts
export type ProjectProgress = { kind: 'percent'; value: number; label: string } | { kind: 'phase'; value: string; label: string };
export type OperationalState = 'blocked' | 'at_risk' | 'moving' | 'stalled' | 'paused' | 'completed' | 'archived';

export function deriveOperationalState(input: { persistedStatus: string; hasCriticalBlocker: boolean; overdue: boolean; stalled: boolean }): OperationalState {
  if (input.persistedStatus === 'concluido' || input.persistedStatus === 'encerrado') return 'completed';
  if (input.persistedStatus === 'arquivado') return 'archived';
  if (input.persistedStatus === 'pausado' || input.persistedStatus === 'latente') return 'paused';
  if (input.hasCriticalBlocker) return 'blocked';
  if (input.overdue) return 'at_risk';
  return input.stalled ? 'stalled' : 'moving';
}
```

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/api -- project-engine-domain.test.ts project-recommendation-service.test.ts`

Expected: PASS para precedência, sete motores principais, avançados, legado e ausência de evidência.

```bash
git add apps/api/src/domain apps/api/src/services/project-recommendation-service.ts apps/api/src/services/project-recommendation-service.test.ts
git commit -m "feat(api): derive project progress and recommendations"
```

## Task 4: Implementar ciclo de vida do próximo movimento

**Files:**
- Create: `apps/api/src/services/project-next-move-service.ts`
- Create: `apps/api/src/services/project-next-move-service.test.ts`
- Create: `apps/api/src/routes/project-execution.ts`
- Create: `apps/api/src/routes/project-execution.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever testes de troca atômica e idempotência**

```ts
it('resolves the active move before creating the replacement', async () => {
  prisma.project.findFirst.mockResolvedValue({ id: 'p1', workspaceId: 'w1' });
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  prisma.projectNextMove.findFirst.mockResolvedValue({ id: 'old' });
  prisma.projectNextMove.create.mockResolvedValue({ id: 'new', text: 'Validar preço', status: 'active' });
  await service.replaceActive('p1', { text: 'Validar preço', source: 'manual' }, 'user_1');
  expect(prisma.projectNextMove.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'old' } }));
});

it('reuses the task when the same idempotency key sends a move to today', async () => {
  prisma.projectNextMove.findFirst.mockResolvedValue({ id: 'm1', taskId: 't1', project: { workspaceId: 'w1' } });
  await service.sendToToday('m1', 'key-1', 'user_1');
  expect(prisma.task.create).not.toHaveBeenCalled();
  expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' }, data: { status: 'hoje' } }));
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/api -- project-next-move-service.test.ts`

Expected: FAIL porque o serviço ainda não existe.

- [ ] **Step 3: Implementar serviço**

```ts
export class ProjectNextMoveService {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceActive(projectId: string, input: { text: string; source: ProjectNextMoveSource; reason?: string; ruleKey?: string }, clerkUserId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspace: { clerkUserId } }, select: { id: true } });
    if (!project) throw Object.assign(new Error('Projeto não encontrado.'), { statusCode: 404 });
    return this.prisma.$transaction(async (tx) => {
      await tx.projectNextMove.updateMany({ where: { projectId, status: 'active' }, data: { status: 'resolved', resolvedAt: new Date() } });
      return tx.projectNextMove.create({ data: { projectId, text: input.text.trim(), source: input.source, reason: input.reason?.trim(), ruleKey: input.ruleKey } });
    });
  }
}
```

Adicionar `resolve` e `sendToToday`. `sendToToday` executa transação serializável: carrega o movimento com ownership; se `idempotencyKey` coincide e `taskId` existe, retorna a tarefa; se já existe outra tarefa vinculada, move-a para `hoje`; caso contrário cria tarefa com `workspaceId`, `projectId`, `title`, `status: hoje`, `taskType: b`, `energyLevel: media`, `executionKind: operacao`, `priority: 3` e atualiza `taskId` + `idempotencyKey`. Repetir a transação uma vez quando Prisma retornar conflito de serialização.

- [ ] **Step 4: Implementar e testar rotas**

Rotas:

```ts
POST /projects/:projectId/next-moves
POST /projects/:projectId/next-moves/:nextMoveId/to-today
POST /projects/:projectId/next-moves/:nextMoveId/resolve
```

Validar texto entre 2 e 240 caracteres, `source`, `reason`, `ruleKey` e ownership. Exportar `registerProjectNextMoveRoutes(app, projectNextMoveService)` e registrá-lo em `app.ts`. A Task 8 adicionará um segundo export, `registerProjectCockpitRoutes`, sem tornar dependência alguma opcional.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/api -- project-next-move-service.test.ts project-execution.test.ts`

Expected: PASS; segundo envio com a mesma chave não cria outra tarefa.

```bash
git add apps/api/src/services/project-next-move-service* apps/api/src/routes/project-execution* apps/api/src/app.ts
git commit -m "feat(api): add project next move lifecycle"
```

## Task 5: Resolver movimento ao concluir a tarefa vinculada

**Files:**
- Modify: `apps/api/src/services/task-service.ts`
- Create or Modify: `apps/api/src/services/task-service.test.ts`

- [ ] **Step 1: Escrever teste de regressão**

```ts
it('resolves active project movements linked to a completed task', async () => {
  prisma.task.findFirst.mockResolvedValue(taskFixture);
  prisma.task.update.mockResolvedValue({ ...taskFixture, status: 'feito', completedAt: new Date() });
  await service.complete('task_1', { clerkUserId: 'user_1', completionMode: 'no_note' });
  expect(prisma.projectNextMove.updateMany).toHaveBeenCalledWith({
    where: { taskId: 'task_1', status: 'active' },
    data: { status: 'resolved', resolvedAt: expect.any(Date) }
  });
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/api -- task-service.test.ts -t "resolves active project movements"`

Expected: FAIL porque `complete` ainda não atualiza `projectNextMove`.

- [ ] **Step 3: Adicionar a atualização na mesma transação de conclusão**

```ts
await tx.projectNextMove.updateMany({
  where: { taskId, status: 'active' },
  data: { status: 'resolved', resolvedAt: completedAt }
});
```

Se `complete` ainda não usa uma única transação para a escrita principal, envolver update da tarefa, movimento e eventos dependentes em `this.prisma.$transaction` sem mover publicações externas para dentro da transação.

- [ ] **Step 4: Rodar regressão completa de tarefas**

Run: `npm test --workspace @execution-os/api -- task-service.test.ts routes/tasks`

Expected: PASS; conclusão sem movimento mantém comportamento anterior.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/task-service.ts apps/api/src/services/task-service.test.ts
git commit -m "feat(api): resolve project movement with task completion"
```

## Task 6: Implementar Responsabilidades e pulso de cuidado

**Files:**
- Create: `apps/api/src/services/responsibility-service.ts`
- Create: `apps/api/src/services/responsibility-service.test.ts`
- Create: `apps/api/src/routes/responsibilities.ts`
- Create: `apps/api/src/routes/responsibilities.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever testes de cadência e revisão atômica**

```ts
it.each([
  ['weekly', null, '2026-08-13'],
  ['biweekly', null, '2026-08-20'],
  ['monthly', null, '2026-09-06'],
  ['quarterly', null, '2026-11-06'],
  ['custom', 10, '2026-08-16']
])('calculates %s cadence', (cadence, interval, expected) => {
  expect(nextReviewDate(new Date('2026-08-06T12:00:00Z'), cadence, interval).toISOString().slice(0, 10)).toBe(expected);
});

it('stores a review and its optional task in one transaction', async () => {
  await service.review('r1', { health: 'attention', nextCare: 'Revisar inadimplência', createTask: 'today' }, 'user_1');
  expect(prisma.responsibilityReview.create).toHaveBeenCalled();
  expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'hoje', workspaceId: 'w1' }) }));
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/api -- responsibility-service.test.ts`

Expected: FAIL porque os exports ainda não existem.

- [ ] **Step 3: Implementar domínio**

```ts
export function nextReviewDate(base: Date, cadence: ResponsibilityCadence, customDays?: number | null) {
  const next = new Date(base);
  if (cadence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  else if (cadence === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3);
  else next.setUTCDate(next.getUTCDate() + (cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : customDays ?? 7));
  return next;
}
```

Implementar `list`, `create`, `update`, `review`, `pause`, `archive` com ownership pelo relacionamento `workspace.clerkUserId`. `review` cria tarefa somente quando `createTask` é `backlog` ou `today`.

- [ ] **Step 4: Implementar rotas e testes HTTP**

Validar e registrar:

```text
GET  /workspaces/:workspaceId/responsibilities
POST /workspaces/:workspaceId/responsibilities
PATCH /responsibilities/:responsibilityId
POST /responsibilities/:responsibilityId/reviews
GET  /responsibilities/:responsibilityId/reviews
POST /responsibilities/:responsibilityId/pause
POST /responsibilities/:responsibilityId/archive
```

Esperar 404 para item de outro usuário e 400 para `cadence: custom` sem `cadenceIntervalDays` entre 1 e 365.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/api -- responsibility-service.test.ts responsibilities.test.ts`

Expected: PASS.

```bash
git add apps/api/src/services/responsibility-service* apps/api/src/routes/responsibilities* apps/api/src/app.ts
git commit -m "feat(api): add continuous responsibilities"
```

## Task 7: Criar read models de Frentes

**Files:**
- Create: `apps/api/src/services/front-overview-service.ts`
- Create: `apps/api/src/services/front-overview-service.test.ts`
- Create: `apps/api/src/routes/front-overview.ts`
- Create: `apps/api/src/routes/front-overview.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever testes do sinal principal**

```ts
it('chooses a critical responsibility before an at-risk project', async () => {
  prisma.workspace.findMany.mockResolvedValue([frontFixture]);
  const result = await service.list('user_1', new Date('2026-08-06T12:00:00Z'));
  expect(result[0].attention).toMatchObject({ kind: 'responsibility', severity: 'critical', sourceId: 'r1' });
});

it('reports observable capacity without an overload score', async () => {
  const result = await service.detail('w1', 'user_1', now);
  expect(result.capacity).toEqual({ activeProjects: 3, todayTasks: 7 });
  expect(result.capacity).not.toHaveProperty('score');
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/api -- front-overview-service.test.ts`

Expected: FAIL porque o serviço não existe.

- [ ] **Step 3: Implementar o serviço**

```ts
export type FrontAttention = {
  kind: 'project' | 'responsibility';
  sourceId: string;
  severity: 'attention' | 'critical';
  title: string;
  reason: string;
};

const severityWeight = { attention: 1, critical: 2 } as const;

export function selectPrimaryAttention(items: FrontAttention[]) {
  return [...items].sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity] || a.title.localeCompare(b.title))[0] ?? null;
}
```

`list` retorna trilho leve. `detail` inclui Projetos ativos com movimento/recomendação, Responsabilidades ativas, `{ activeProjects, todayTasks }`, saúde derivada e itens pausados resumidos.

- [ ] **Step 4: Implementar rotas**

```text
GET /workspaces/overview
GET /workspaces/:workspaceId/overview
```

Registrar rotas estáticas antes de qualquer parâmetro conflitante em `app.ts`. Testar ownership e 404.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/api -- front-overview-service.test.ts front-overview.test.ts`

Expected: PASS.

```bash
git add apps/api/src/services/front-overview-service* apps/api/src/routes/front-overview* apps/api/src/app.ts
git commit -m "feat(api): add front overview read models"
```

## Task 8: Criar read models do cockpit e lista de Projetos

**Files:**
- Create: `apps/api/src/services/project-cockpit-service.ts`
- Create: `apps/api/src/services/project-cockpit-service.test.ts`
- Modify: `apps/api/src/routes/project-execution.ts`
- Modify: `apps/api/src/routes/project-execution.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Escrever testes de detalhe seguro**

```ts
it('returns a recovered engine instead of throwing for malformed methodology data', async () => {
  prisma.project.findFirst.mockResolvedValue({ ...projectFixture, methodology: 'pipeline', methodologyData: { stages: 'bad' }, tasks: [], nextMoves: [] });
  const result = await service.detail('p1', 'user_1', now);
  expect(result.engine).toMatchObject({ key: 'pipeline', recovered: true, data: { stages: [], deals: [] } });
});

it('returns persisted and operational states separately', async () => {
  const result = await service.detail('p1', 'user_1', now);
  expect(result).toMatchObject({ persistedStatus: 'ativo', operationalState: 'at_risk' });
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/api -- project-cockpit-service.test.ts`

Expected: FAIL porque o serviço não existe.

- [ ] **Step 3: Implementar listagem e detalhe**

```ts
export class ProjectCockpitService {
  constructor(private readonly prisma: PrismaClient) {}

  async detail(projectId: string, clerkUserId: string, now = new Date()) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspace: { clerkUserId }, archivedAt: null },
      include: { workspace: true, tasks: { where: { archivedAt: null } }, nextMoves: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    if (!project) throw Object.assign(new Error('Projeto não encontrado.'), { statusCode: 404 });
    const engine = normalizeProjectEngine(project.methodology, project.methodologyData);
    const activeMove = project.nextMoves[0] ?? null;
    const recommendation = getProjectRecommendation({ now, project, data: engine.data, activeMove, tasks: project.tasks });
    return buildCockpitReadModel(project, engine, activeMove, recommendation, now);
  }
}
```

`list` aceita `workspaceId`, `status` e `search`, retorna linhas com workspace, intenção/método, estado operacional, prazo, movimento e recomendação.

Adicionar `create` para o wizard. A operação valida a Frente, cria Projeto, próximo movimento e tarefa opcional numa única transação:

```ts
type CreateExecutionProjectInput = {
  creationKey: string;
  workspaceId: string;
  methodology: ProjectMethodology;
  title: string;
  objective: string;
  timeHorizonEnd?: string | null;
  methodologyData: Prisma.InputJsonValue;
  nextMove: string;
  nextMoveDestination: 'project' | 'backlog' | 'today';
};

async create(input: CreateExecutionProjectInput, clerkUserId: string) {
  const workspace = await this.prisma.workspace.findFirst({ where: { id: input.workspaceId, clerkUserId }, select: { id: true } });
  if (!workspace) throw Object.assign(new Error('Frente não encontrada.'), { statusCode: 404 });
  return this.prisma.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({ where: { workspaceId: input.workspaceId, creationKey: input.creationKey, workspace: { clerkUserId } }, include: { nextMoves: { where: { status: 'active' }, take: 1 } } });
    if (existing) return { project: existing, activeMove: existing.nextMoves[0], task: null };
    const project = await tx.project.create({ data: {
      creationKey: input.creationKey, workspaceId: input.workspaceId, title: input.title.trim(), objective: input.objective.trim(),
      methodology: input.methodology, methodologyData: input.methodologyData,
      timeHorizonEnd: input.timeHorizonEnd ? new Date(input.timeHorizonEnd) : null,
      status: 'ativo', type: 'construcao'
    }});
    const task = input.nextMoveDestination === 'project' ? null : await tx.task.create({ data: {
      workspaceId: input.workspaceId, projectId: project.id, title: input.nextMove,
      status: input.nextMoveDestination === 'today' ? 'hoje' : 'backlog', taskType: 'b', energyLevel: 'media', executionKind: 'operacao', priority: 3
    }});
    const activeMove = await tx.projectNextMove.create({ data: {
      projectId: project.id, taskId: task?.id, text: input.nextMove, source: 'manual'
    }});
    return { project, activeMove, task };
  });
}
```

- [ ] **Step 4: Expor contratos HTTP**

```text
GET /project-execution?workspaceId=&status=&search=
GET /project-execution/:projectId
POST /project-execution
```

O POST exige `Idempotency-Key` e devolve o mesmo Projeto quando a chave já foi concluída. Persistir a chave no Projeto via `creationKey` e a restrição composta `(workspaceId, creationKey)` adicionada na Task 1. Usar prefixo separado para não alterar a resposta de `/projects` usada por telas antigas durante a migração.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/api -- project-cockpit-service.test.ts project-execution.test.ts`

Expected: PASS; JSON inválido não causa 500.

```bash
git add apps/api/src/services/project-cockpit-service* apps/api/src/routes/project-execution* apps/api/src/app.ts
git commit -m "feat(api): add project cockpit read models"
```

## Task 9: Adicionar contratos ao cliente web

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/api.test.ts`
- Create: `apps/web/src/features/projects/types.ts`

- [ ] **Step 1: Escrever testes das chamadas**

```ts
it('loads a project cockpit and sends a recommendation to today idempotently', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(cockpitFixture)).mockResolvedValueOnce(jsonResponse(nextMoveFixture));
  await api.getProjectCockpit('p1');
  await api.sendProjectMoveToToday('p1', 'm1', 'key-1');
  expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/project-execution/p1'), expect.anything());
  expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/projects/p1/next-moves/m1/to-today'), expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': 'key-1' }) }));
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- api.test.ts -t "project cockpit"`

Expected: FAIL porque os métodos não existem.

- [ ] **Step 3: Definir tipos de read model**

```ts
export type ProjectRecommendation = { ruleKey: string; text: string; reason: string; severity: 'normal' | 'attention' | 'critical'; sourceId?: string };
export type ProjectProgress = { kind: 'percent'; value: number; label: string } | { kind: 'phase'; value: string; label: string };
export type ProjectCockpit = {
  id: string; title: string; objective: string | null; workspace: Workspace;
  intentLabel: string; methodLabel: string; persistedStatus: ProjectStatus;
  operationalState: 'blocked' | 'at_risk' | 'moving' | 'stalled' | 'paused' | 'completed' | 'archived';
  timeHorizonEnd: string | null; progress: ProjectProgress; primaryBlocker: string | null;
  activeMove: ProjectNextMove | null; recommendation: ProjectRecommendation | null;
  engine: { key: string; methodology: ProjectMethodology; data: MethodologyData; recovered: boolean };
  tasks: Task[];
};
```

Adicionar tipos de `FrontOverview`, `Responsibility` e `ResponsibilityReview`.

- [ ] **Step 4: Implementar métodos de API**

Adicionar `getFrontsOverview`, `getFrontOverview`, `getProjectExecutionList`, `getProjectCockpit`, `createExecutionProject`, `createProjectNextMove`, `sendProjectMoveToToday`, `resolveProjectNextMove`, CRUD/review de Responsabilidade. `createExecutionProject` envia `Idempotency-Key` e recebe `{ project, activeMove, task }`.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- api.test.ts && npm run typecheck --workspace @execution-os/web`

Expected: PASS.

```bash
git add apps/web/src/api.ts apps/web/src/api.test.ts apps/web/src/features/projects/types.ts
git commit -m "feat(web): add fronts and project execution contracts"
```

## Task 10: Criar registro de motores e assistente de Projeto

**Files:**
- Create: `apps/web/src/features/projects/engine-registry.tsx`
- Create: `apps/web/src/features/projects/project-feature-flag.ts`
- Create: `apps/web/src/features/projects/engine-registry.test.tsx`
- Create: `apps/web/src/features/projects/project-wizard.tsx`
- Create: `apps/web/src/features/projects/project-wizard.test.tsx`
- Create: `apps/web/src/features/projects/projects.css`

- [ ] **Step 1: Escrever testes do catálogo e legado**

```tsx
it('shows seven primary intents and keeps advanced engines behind Ver todos', () => {
  render(<ProjectMethodologyPicker value={null} onChange={vi.fn()} />);
  expect(screen.getAllByRole('button', { name: /escolher/i })).toHaveLength(7);
  expect(screen.queryByText('Runway')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /ver todos/i }));
  expect(screen.getByText('Runway')).toBeVisible();
});

it.each([['delivery', 'entrega'], ['launch', 'campanha'], ['discovery', 'exploracao'], ['growth', 'exploracao']])('maps %s to %s', (legacy, canonical) => {
  expect(getEngineDefinition(legacy as ProjectMethodology).canonicalMethodology).toBe(canonical);
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- engine-registry.test.tsx project-wizard.test.tsx`

Expected: FAIL porque os componentes não existem.

- [ ] **Step 3: Implementar registro**

```tsx
export type EngineDefinition = {
  methodology: ProjectMethodology;
  canonicalMethodology: ProjectMethodology;
  intentLabel: string;
  methodLabel: string;
  icon: LucideIcon;
  primary: boolean;
  validateSetup(values: ProjectWizardValues): Record<string, string>;
  View: ComponentType<ProjectEngineViewProps>;
};

export const primaryMethodologies: ProjectMethodology[] = ['fourdx', 'entrega', 'pipeline', 'exploracao', 'campanha', 'decisao', 'okr'];
```

Usar ícones Lucide: `TrendingUp`, `PackageCheck`, `Kanban`, `FlaskConical`, `CalendarClock`, `Scale`, `Goal`.

Adicionar a flag de migração:

```ts
export function isFrontsProjectsV2Enabled() {
  return import.meta.env.VITE_FRONTS_PROJECTS_V2 === 'true';
}
```

Nos testes da nova feature, definir `vi.stubEnv('VITE_FRONTS_PROJECTS_V2', 'true')` e restaurar com `vi.unstubAllEnvs()`.

- [ ] **Step 4: Implementar wizard de três etapas**

O estado é:

```ts
type ProjectWizardValues = {
  methodology: ProjectMethodology | null;
  title: string;
  workspaceId: string;
  objective: string;
  timeHorizonEnd: string;
  methodologyData: MethodologyData;
  nextMove: string;
  nextMoveDestination: 'project' | 'backlog' | 'today';
};
```

Ao abrir um rascunho novo, gerar `creationKey` uma única vez com `crypto.randomUUID()`. No submit, chamar `api.createExecutionProject` e navegar para `/projetos/:id`. Persistir valores e `creationKey` em `sessionStorage` sob `operis:project-wizard-draft`; limpar somente após a resposta conter Projeto e movimento. Reenvio após timeout reutiliza a mesma chave e não cria cópia.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- engine-registry.test.tsx project-wizard.test.tsx`

Expected: PASS para validação por etapa, rascunho e falha sem perda de dados.

```bash
git add apps/web/src/features/projects
git commit -m "feat(web): add project engine registry and wizard"
```

## Task 11: Implementar Frentes master-detail e Responsabilidades

**Files:**
- Create: `apps/web/src/features/fronts/front-rail.tsx`
- Create: `apps/web/src/features/fronts/front-overview.tsx`
- Create: `apps/web/src/features/fronts/responsibility-editor-panel.tsx`
- Create: `apps/web/src/features/fronts/responsibility-review-panel.tsx`
- Create: `apps/web/src/features/fronts/fronts-page.test.tsx`
- Create: `apps/web/src/features/fronts/fronts.css`
- Replace: `apps/web/src/pages/workspaces.tsx`

- [ ] **Step 1: Escrever testes de navegação e revisão**

```tsx
it('selects the highest-attention front and updates the URL', async () => {
  apiMock.getFrontsOverview.mockResolvedValue(frontRailFixture);
  render(<MemoryRouter initialEntries={['/frentes']}><Routes><Route path="/frentes" element={<WorkspacesPage />} /><Route path="/frentes/:workspaceId" element={<WorkspacesPage />} /></Routes></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Prymeira Digital' })).toBeVisible();
  expect(screen.getByText('Revisar dois clientes em risco')).toBeVisible();
});

it('reviews a responsibility and offers a Today task', async () => {
  fireEvent.click(await screen.findByRole('button', { name: /cuidar agora/i }));
  fireEvent.change(screen.getByLabelText(/próximo cuidado/i), { target: { value: 'Revisar inadimplência' } });
  fireEvent.click(screen.getByLabelText(/mandar para hoje/i));
  fireEvent.click(screen.getByRole('button', { name: /salvar revisão/i }));
  await waitFor(() => expect(apiMock.reviewResponsibility).toHaveBeenCalledWith('r1', expect.objectContaining({ createTask: 'today' })));
});

it('creates a responsibility with a valid cadence', async () => {
  fireEvent.click(await screen.findByRole('button', { name: /nova responsabilidade/i }));
  fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Saúde financeira' } });
  fireEvent.change(screen.getByLabelText(/padrão esperado/i), { target: { value: 'Manter seis meses de caixa' } });
  fireEvent.change(screen.getByLabelText(/próximo cuidado/i), { target: { value: 'Revisar fluxo de caixa' } });
  fireEvent.click(screen.getByRole('button', { name: /criar responsabilidade/i }));
  await waitFor(() => expect(apiMock.createResponsibility).toHaveBeenCalledWith('w1', expect.objectContaining({ cadence: 'weekly' })));
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- fronts-page.test.tsx`

Expected: FAIL porque a feature não existe.

- [ ] **Step 3: Implementar componentes**

`FrontRail` usa links para `/frentes/:workspaceId`, `aria-current`, contagem e ícone `AlertCircle` somente quando houver atenção. Ao selecionar, salvar o id em `localStorage` sob `operis:last-front-id`. Em `/frentes`, escolher nesta ordem: id persistido ainda existente, primeira Frente com atenção, primeira Frente da resposta. `FrontOverview` renderiza nesta ordem: cabeçalho com modo e ações da Frente, atenção, Projetos, Responsabilidades, capacidade observável, pausados recolhidos. Preservar criação, edição e exclusão de Frente com as rotas existentes; exclusão continua respeitando a proteção de Frente geral e dependências. Até a Task 17, `WorkspacesPage` conserva o componente atual como `LegacyWorkspacesPage` e seleciona `FrontsExecutionPage` por `isFrontsProjectsV2Enabled()`.

```tsx
export function FrontOverview({ front, onReview }: { front: FrontOverviewModel; onReview: (responsibility: Responsibility) => void }) {
  return <section className="front-overview" aria-labelledby="front-title">
    <header className="front-overview__header"><div><span className="eyebrow">Frente</span><h1 id="front-title">{front.name}</h1></div></header>
    {front.attention && <FrontAttentionCard attention={front.attention} />}
    <FrontProjects projects={front.projects} />
    <ResponsibilitiesList items={front.responsibilities} onReview={onReview} />
    <p className="front-capacity">{front.capacity.activeProjects} projetos ativos · {front.capacity.todayTasks} tarefas em Hoje</p>
  </section>;
}
```

`ResponsibilityEditorPanel` valida título, padrão, cadência, próximo cuidado e próxima revisão; o menu permite editar, pausar/retomar e arquivar. `ResponsibilityReviewPanel` mostra as revisões mais recentes antes do formulário, sem permitir edição destrutiva do histórico.

- [ ] **Step 4: Implementar responsividade**

Desktop usa grid `210px minmax(0, 1fr)`. Abaixo de `720px`, `/frentes` mostra somente trilho como lista e `/frentes/:workspaceId` mostra detalhe com botão Voltar. Não usar chips horizontais.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- fronts-page.test.tsx && npm run typecheck --workspace @execution-os/web`

Expected: PASS.

```bash
git add apps/web/src/features/fronts apps/web/src/pages/workspaces.tsx
git commit -m "feat(web): redesign fronts and responsibilities"
```

## Task 12: Implementar lista operacional de Projetos

**Files:**
- Create: `apps/web/src/features/projects/project-list.tsx`
- Create: `apps/web/src/features/projects/project-list.test.tsx`
- Modify: `apps/web/src/pages/projetos.tsx`
- Modify: `apps/web/src/features/projects/projects.css`

- [ ] **Step 1: Escrever testes de agrupamento e filtros**

```tsx
it('groups active projects by front and exposes the next movement', () => {
  render(<ProjectList projects={projectRows} filters={{ search: '', workspaceId: '', state: 'active' }} onFiltersChange={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Prymeira Digital' })).toBeVisible();
  expect(screen.getByText('Validar oferta e preço com 5 clientes')).toBeVisible();
  expect(screen.getByText('Vender · Pipeline')).toBeVisible();
});

it('shows a useful empty state for the selected front', () => {
  render(<ProjectList projects={[]} filters={{ search: '', workspaceId: 'w1', state: 'active' }} onFiltersChange={vi.fn()} />);
  expect(screen.getByRole('button', { name: /novo projeto/i })).toBeVisible();
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- project-list.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implementar lista sem cards**

Cada `ProjectRow` é um link para `/projetos/:id`, com título, `intentLabel · methodLabel`, movimento/recomendação, estado, prazo/indicador e `ChevronRight`. Agrupar com `Map<workspaceId, ProjectExecutionRow[]>` preservando a ordem retornada pela API.

- [ ] **Step 4: Integrar rota de índice e wizard**

Quando não existe `projectId`, o caminho V2 carrega `getProjectExecutionList`, renderiza filtros e abre `ProjectWizard` pela ação principal. Busca usa debounce de 250 ms; filtros de estado e Frente são imediatos. Até a Task 17, `ProjetosPage` mantém o componente atual como `LegacyProjetosPage` e escolhe `ProjectsExecutionPage` somente quando `isFrontsProjectsV2Enabled()` retorna `true`.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- project-list.test.tsx && npm run typecheck --workspace @execution-os/web`

Expected: PASS.

```bash
git add apps/web/src/features/projects/project-list* apps/web/src/features/projects/projects.css apps/web/src/pages/projetos.tsx
git commit -m "feat(web): add operational projects list"
```

## Task 13: Implementar shell do Projeto e painel de tarefas

**Files:**
- Create: `apps/web/src/features/projects/project-shell.tsx`
- Create: `apps/web/src/features/projects/project-shell.test.tsx`
- Create: `apps/web/src/features/projects/project-tasks-panel.tsx`
- Create: `apps/web/src/features/projects/project-tasks-panel.test.tsx`
- Modify: `apps/web/src/pages/projetos.tsx`
- Modify: `apps/web/src/features/projects/projects.css`

- [ ] **Step 1: Escrever testes do cabeçalho e contenção de falha**

```tsx
it('keeps the next move visible and renders the selected engine', () => {
  render(<ProjectShell project={cockpitFixture} onReload={vi.fn()} />);
  expect(screen.getByText('Retomar Empresa Alfa')).toBeVisible();
  expect(screen.getByText('Empresa Alfa está há 5 dias sem avançar.')).toBeVisible();
  expect(screen.getByRole('button', { name: /tarefas · 4/i })).toBeVisible();
});

it('contains an engine render failure without blanking the shell', () => {
  vi.spyOn(registry, 'getEngineDefinition').mockReturnValue({ ...engineDefinition, View: () => { throw new Error('bad data'); } });
  render(<ProjectShell project={cockpitFixture} onReload={vi.fn()} />);
  expect(screen.getByRole('heading', { name: cockpitFixture.title })).toBeVisible();
  expect(screen.getByText(/não foi possível abrir este motor/i)).toBeVisible();
});

it('offers an explicit repair for recovered methodology data', async () => {
  render(<ProjectShell project={{ ...cockpitFixture, engine: { ...cockpitFixture.engine, recovered: true } }} onReload={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /reparar dados do motor/i }));
  await waitFor(() => expect(apiMock.updateProject).toHaveBeenCalledWith('p1', { methodologyData: cockpitFixture.engine.data }));
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- project-shell.test.tsx project-tasks-panel.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implementar shell e error boundary**

```tsx
export function ProjectShell({ project, onReload }: ProjectShellProps) {
  const definition = getEngineDefinition(project.engine.methodology);
  return <article className="project-shell">
    <ProjectHeader project={project} />
    <EngineErrorBoundary projectId={project.id} onReset={onReload}>
      <definition.View project={project} data={project.engine.data} onReload={onReload} />
    </EngineErrorBoundary>
    <ProjectTasksPanel project={project} />
  </article>;
}
```

O cabeçalho mostra recomendação somente quando não há movimento ativo; botões `Adotar`, `Criar tarefa` e `Mandar para Hoje` chamam APIs correspondentes e recarregam o cockpit após sucesso. O menu de manutenção preserva editar direção, pausar/retomar, concluir e arquivar usando `api.updateProject`; excluir continua usando `api.deleteProject` e confirmação explícita. Quando `engine.recovered` é verdadeiro, mostrar aviso local e botão **Reparar dados do motor**; somente esse botão persiste o objeto normalizado devolvido pelo servidor.

- [ ] **Step 4: Implementar painel de tarefas**

Desktop: drawer direito com foco preso e retorno ao botão. Mobile abaixo de 720 px: dialog full-height. Permitir criar vinculada, mover para Hoje, concluir e abrir `/tarefas?projectId=...`; não duplicar filtros avançados.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- project-shell.test.tsx project-tasks-panel.test.tsx`

Expected: PASS para foco, Escape, idempotência visual e reload.

```bash
git add apps/web/src/features/projects/project-shell* apps/web/src/features/projects/project-tasks-panel* apps/web/src/features/projects/projects.css apps/web/src/pages/projetos.tsx
git commit -m "feat(web): add project shell and tasks panel"
```

## Task 14: Extrair motores 4DX e Entrega

**Files:**
- Create: `apps/web/src/features/projects/engines/metric-engine.tsx`
- Create: `apps/web/src/features/projects/engines/milestone-engine.tsx`
- Create: `apps/web/src/features/projects/engines/engine-views.test.tsx`
- Modify: `apps/web/src/features/projects/engine-registry.tsx`
- Modify: `apps/web/src/features/projects/projects.css`

- [ ] **Step 1: Escrever testes das ações essenciais**

```tsx
it('renders 4DX pace and records a scorecard check-in', async () => {
  render(<MetricEngine project={fourDxCockpit} data={fourDxData} onReload={onReload} />);
  expect(screen.getByText(/ritmo esperado/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /registrar check-in/i }));
  expect(await screen.findByLabelText(/valor atual/i)).toBeVisible();
});

it('renders milestones and toggles one without replacing the full JSON object', async () => {
  render(<MilestoneEngine project={deliveryCockpit} data={deliveryData} onReload={onReload} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Backend concluído' }));
  await waitFor(() => expect(apiMock.updateMethodologyItem).toHaveBeenCalledWith('p1', 'm1', { arrayKey: 'milestones', item: { done: true } }));
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- engine-views.test.tsx -t "4DX|milestones"`

Expected: FAIL.

- [ ] **Step 3: Extrair o motor métrico**

Mover do componente atual somente placar, check-in e métricas para `MetricEngine`. Receber todos os dados por props; não carregar Projeto dentro do motor. Usar `api.getProjectScorecard`, `api.createProjectMetricCheckin`, `api.createProjectFrameworkCheckin` e `api.updateProject` já existentes.

```tsx
export function MetricEngine({ project, onReload }: ProjectEngineViewProps) {
  const [scorecard, setScorecard] = useState<ProjectScorecard | null>(null);
  useEffect(() => { void api.getProjectScorecard(project.id).then(setScorecard); }, [project.id]);
  if (!scorecard) return <EngineSkeleton rows={4} />;
  return <section aria-labelledby="metric-engine-title">
    <EngineSectionHeader id="metric-engine-title" title="Ritmo da meta" actionLabel="Registrar check-in" onAction={() => setCheckinOpen(true)} />
    <MetricPace progress={project.progress} scorecard={scorecard} />
    <LeadMeasures metrics={scorecard.metrics.filter((metric) => metric.kind === 'lead')} />
    <MetricCheckinDialog open={checkinOpen} project={project} scorecard={scorecard} onSaved={onReload} />
  </section>;
}
```

- [ ] **Step 4: Extrair motor de marcos**

Mover lista de marcos, bloqueios e provas de Autoridade para `MilestoneEngine`. Variar por `project.engine.methodology === 'autoridade'`. Toda mutação de item usa rotas de `methodology-items` existentes.

```tsx
export function MilestoneEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const milestones = data.milestones ?? [];
  return <section aria-labelledby="milestone-engine-title">
    <EngineSectionHeader id="milestone-engine-title" title={project.engine.methodology === 'autoridade' ? 'Provas no campo' : 'Marcos da entrega'} actionLabel="Adicionar marco" onAction={() => setEditorOpen(true)} />
    <MilestoneList items={milestones} blockers={data.blockers ?? []} onToggle={async (item) => {
      await api.updateMethodologyItem(project.id, item.id, { arrayKey: 'milestones', item: { done: !item.done } });
      onReload();
    }} />
  </section>;
}
```

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- engine-views.test.tsx && npm run typecheck --workspace @execution-os/web`

Expected: PASS.

```bash
git add apps/web/src/features/projects/engines apps/web/src/features/projects/engine-registry.tsx apps/web/src/features/projects/projects.css
git commit -m "refactor(web): extract metric and milestone engines"
```

## Task 15: Extrair Pipeline, Exploração e Funil

**Files:**
- Create: `apps/web/src/features/projects/engines/pipeline-engine.tsx`
- Create: `apps/web/src/features/projects/engines/exploration-engine.tsx`
- Create: `apps/web/src/features/projects/engines/funnel-engine.tsx`
- Modify: `apps/web/src/features/projects/engines/engine-views.test.tsx`
- Modify: `apps/web/src/features/projects/engine-registry.tsx`

- [ ] **Step 1: Escrever testes de operação**

```tsx
it('moves a deal between pipeline stages', async () => {
  render(<PipelineEngine project={pipelineCockpit} data={pipelineData} onReload={onReload} />);
  fireEvent.click(screen.getByRole('button', { name: /mover Empresa Alfa/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Fechado' }));
  await waitFor(() => expect(apiMock.updateMethodologyItem).toHaveBeenCalledWith('p1', 'd1', { arrayKey: 'deals', item: { stageId: 'closed' } }));
});

it('records evidence and a discovery decision', async () => {
  render(<ExplorationEngine project={explorationCockpit} data={explorationData} onReload={onReload} />);
  fireEvent.click(screen.getByRole('button', { name: /registrar evidência/i }));
  expect(await screen.findByRole('dialog', { name: /nova evidência/i })).toBeVisible();
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- engine-views.test.tsx -t "pipeline|evidence|funnel"`

Expected: FAIL.

- [ ] **Step 3: Extrair Pipeline**

Usar colunas horizontais no desktop e lista por estágio no mobile. Suportar `pipeline`, `captacao` e `sistema_receita` com os campos já presentes em `MethodologyData`; drag-and-drop possui menu alternativo “Mover para”.

```tsx
export function PipelineEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const stages = [...(data.stages ?? [])].sort((a, b) => a.order - b.order);
  async function moveDeal(dealId: string, stageId: string) {
    await api.updateMethodologyItem(project.id, dealId, { arrayKey: 'deals', item: { stageId, stageEnteredAt: new Date().toISOString() } });
    onReload();
  }
  return <PipelineBoard stages={stages} deals={data.deals ?? []} currency={data.currency ?? 'BRL'} onMoveDeal={moveDeal} />;
}
```

- [ ] **Step 4: Extrair Exploração e Funil**

Exploração preserva descobertas, decisão e sessões de Mentoria. Funil preserva etapas, valores e conversões; atualizações usam item CRUD ou `updateProject` sem apagar chaves desconhecidas.

```tsx
export function FunnelEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const stages = [...(data.funilStages ?? [])].sort((a, b) => a.order - b.order);
  return <FunnelStageList stages={stages} onChange={async (stage, value) => {
    await api.updateMethodologyItem(project.id, stage.id, { arrayKey: 'funilStages', item: { value } });
    onReload();
  }} />;
}
```

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- engine-views.test.tsx && npm run typecheck --workspace @execution-os/web`

Expected: PASS.

```bash
git add apps/web/src/features/projects/engines apps/web/src/features/projects/engine-registry.tsx
git commit -m "refactor(web): extract pipeline exploration and funnel engines"
```

## Task 16: Extrair Campanha, Decisão e OKR

**Files:**
- Create: `apps/web/src/features/projects/engines/campaign-engine.tsx`
- Create: `apps/web/src/features/projects/engines/decision-engine.tsx`
- Create: `apps/web/src/features/projects/engines/okr-engine.tsx`
- Modify: `apps/web/src/features/projects/engines/engine-views.test.tsx`
- Modify: `apps/web/src/features/projects/engine-registry.tsx`

- [ ] **Step 1: Escrever testes de operação**

```tsx
it('shows campaign countdown and toggles a critical daily item', async () => {
  render(<CampaignEngine project={campaignCockpit} data={campaignData} onReload={onReload} />);
  expect(screen.getByText(/12 dias para o lançamento/i)).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Revisar checkout' }));
  await waitFor(() => expect(apiMock.updateMethodologyItem).toHaveBeenCalled());
});

it('edits decision scores and KR confidence', async () => {
  const { rerender } = render(<DecisionEngine project={decisionCockpit} data={decisionData} onReload={onReload} />);
  fireEvent.change(screen.getByLabelText(/pontuação agência em velocidade/i), { target: { value: '4' } });
  rerender(<OkrEngine project={okrCockpit} data={okrData} onReload={onReload} />);
  fireEvent.change(screen.getByLabelText(/confiança seguidores/i), { target: { value: 'baixa' } });
  expect(apiMock.updateMethodologyItem).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- engine-views.test.tsx -t "campaign|decision|KR"`

Expected: FAIL.

- [ ] **Step 3: Extrair Campanha e Runway**

Campanha mostra countdown, janela, meta e atividades por dia. Runway usa o mesmo arquivo com variante financeira, mostrando caixa, burn rate e eventos confirmados sem fingir progresso linear.

```tsx
export function CampaignEngine({ project, data, onReload }: ProjectEngineViewProps) {
  if (project.engine.methodology === 'runway') return <RunwayView project={project} data={data} onReload={onReload} />;
  return <CampaignTimeline launchDate={data.launchDate ?? project.timeHorizonEnd} tasks={data.dailyTasks ?? []} onToggle={async (item) => {
    await api.updateMethodologyItem(project.id, item.id, { arrayKey: 'dailyTasks', item: { done: !item.done } });
    onReload();
  }} />;
}
```

- [ ] **Step 4: Extrair Decisão, Cenário e OKR**

Decisão oferece matriz acessível por tabela; Cenário oferece ações comuns e variáveis. OKR lista KRs, confiança, valor atual/alvo e progresso agregado. Preservar APIs existentes.

```tsx
export function DecisionEngine({ project, data, onReload }: ProjectEngineViewProps) {
  if (project.engine.methodology === 'cenario') return <ScenarioActions project={project} data={data} onReload={onReload} />;
  return <DecisionMatrix options={data.options ?? []} criteria={data.criteria ?? []} onChange={async (option) => {
    await api.updateMethodologyItem(project.id, option.id, { arrayKey: 'options', item: option });
    onReload();
  }} />;
}

export function OkrEngine({ project, data, onReload }: ProjectEngineViewProps) {
  return <KeyResultList items={data.krs ?? []} onChange={async (kr) => {
    await api.updateMethodologyItem(project.id, kr.id, { arrayKey: 'krs', item: kr });
    onReload();
  }} />;
}
```

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- engine-views.test.tsx && npm run typecheck --workspace @execution-os/web`

Expected: PASS para métodos principais, variantes e dados vazios.

```bash
git add apps/web/src/features/projects/engines apps/web/src/features/projects/engine-registry.tsx
git commit -m "refactor(web): extract campaign decision and okr engines"
```

## Task 17: Cobrir legado e remover dependência da página monolítica

**Files:**
- Modify: `apps/web/src/features/projects/engine-registry.tsx`
- Modify: `apps/web/src/features/projects/engine-registry.test.tsx`
- Modify: `apps/web/src/pages/projetos.tsx`
- Delete after parity: `apps/web/src/project-engines.ts`

- [ ] **Step 1: Escrever teste de compatibilidade de rota**

```tsx
it.each(['delivery', 'launch', 'discovery', 'growth', 'processo'])('opens legacy methodology %s without a blank page', async (methodology) => {
  apiMock.getProjectCockpit.mockResolvedValue({ ...cockpitFixture, engine: { ...cockpitFixture.engine, methodology, recovered: true } });
  renderProjectRoute('/projetos/legacy-1');
  expect(await screen.findByRole('heading', { name: cockpitFixture.title })).toBeVisible();
  expect(screen.queryByText(/erro interno/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Confirmar que `processo` continua abrindo e não aparece no seletor**

Run: `npm test --workspace @execution-os/web -- engine-registry.test.tsx project-shell.test.tsx -t "legacy|processo"`

Expected: o teste falha até o adapter `processo` ser registrado.

- [ ] **Step 3: Adicionar adapter read-only de Processo**

Registrar `processo` como motor recorrente legado dentro de `engine-registry.tsx`, com o checklist/ciclo existente e aviso discreto “Novos processos são criados como Responsabilidades”. Não oferecer conversão automática.

- [ ] **Step 4: Reduzir `pages/projetos.tsx` a composição**

Definir `VITE_FRONTS_PROJECTS_V2=true` no ambiente de QA, executar a paridade e então remover `LegacyProjetosPage`, `LegacyWorkspacesPage` e o branch condicional. O arquivo final deve conter apenas carregamento da rota, query state, abertura do wizard e escolha entre `<ProjectList>` e `<ProjectShell>`. Remover helpers e JSX migrados. Excluir `project-engines.ts` somente quando `rg "from './project-engines'" apps/web/src` não retornar usos. Manter `project-feature-flag.ts` por uma release com retorno constante `true`; rollback ocorre revertendo o commit de corte.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- engine-registry.test.tsx project-shell.test.tsx project-list.test.tsx && npm run typecheck --workspace @execution-os/web`

Expected: PASS e `wc -l apps/web/src/pages/projetos.tsx` abaixo de 300 linhas.

```bash
git add apps/web/src/features/projects apps/web/src/pages/projetos.tsx apps/web/src/project-engines.ts
git commit -m "refactor(web): complete project engine cutover"
```

## Task 18: Atualizar modo demo e estados de recuperação

**Files:**
- Modify: `apps/web/src/demo/mock-fetch.ts`
- Create: `apps/web/src/demo/mock-fetch.test.ts`
- Modify: `apps/web/src/features/projects/project-shell.test.tsx`
- Modify: `apps/web/src/features/fronts/fronts-page.test.tsx`

- [ ] **Step 1: Escrever testes dos novos endpoints mockados**

```ts
it.each([
  ['/api/workspaces/overview', 'GET'],
  ['/api/workspaces/ws-1/overview', 'GET'],
  ['/api/project-execution/proj-1', 'GET'],
  ['/api/workspaces/ws-1/responsibilities', 'GET']
])('serves %s %s in demo mode', async (url, method) => {
  const response = await window.fetch(url, { method });
  expect(response.ok).toBe(true);
  expect(await response.json()).toBeTruthy();
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @execution-os/web -- mock-fetch.test.ts`

Expected: FAIL para endpoints ainda não interceptados.

- [ ] **Step 3: Adicionar fixtures coerentes**

Criar três Frentes, três Responsabilidades, movimentos ativos e recomendações. `proj-1` deve conter os campos que hoje causam a falha `weeklyLeadCompliancePercent`; o novo read model não pode depender desse campo ausente. Implementar mutações em memória para revisão, movimento, Hoje e conclusão.

- [ ] **Step 4: Cobrir loading, vazio, erro e recuperação**

Adicionar testes que rejeitam a primeira chamada e resolvem a segunda após “Tentar novamente”; confirmar que wizard mantém valores após falha e que um motor inválido mostra fallback local.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test --workspace @execution-os/web -- mock-fetch.test.ts project-shell.test.tsx fronts-page.test.tsx`

Expected: PASS.

```bash
git add apps/web/src/demo/mock-fetch.ts apps/web/src/demo/mock-fetch.test.ts apps/web/src/features
git commit -m "test(web): support redesigned fronts and projects demo"
```

## Task 19: Responsividade, acessibilidade e verificação final

**Files:**
- Modify: `apps/web/src/features/projects/projects.css`
- Modify: `apps/web/src/features/fronts/fronts.css`
- Modify: `apps/web/src/App.tsx` only if route composition changed
- Modify: `apps/web/src/styles.css` only for shared focus/skeleton tokens
- Modify: `docs/superpowers/specs/2026-08-06-frentes-projetos-redesign.md` only if implementation reveals a documented mismatch approved by the user

- [ ] **Step 1: Rodar suítes completas antes do QA visual**

Run: `npm test --workspace @execution-os/api && npm test --workspace @execution-os/web`

Expected: todas as suítes passam sem `Unhandled Error` ou teste pulado novo.

- [ ] **Step 2: Rodar typecheck e builds**

Run: `npm run typecheck && npm run build`

Expected: todos os workspaces passam; Vite produz bundle sem erro de import circular.

- [ ] **Step 3: Rodar demonstração local**

Run: `VITE_DEMO_MODE=true npm run dev --workspace @execution-os/web -- --host 127.0.0.1 --port 4174`

Expected: servidor Vite disponível em `http://127.0.0.1:4174`.

- [ ] **Step 4: Verificar fluxos no navegador**

Em 1280 px, 390 px e 360 px, verificar:

1. `/frentes` escolhe e abre Frente;
2. voltar no celular preserva lista;
3. criar/revisar Responsabilidade e mandar tarefa para Hoje;
4. `/projetos` agrupa por Frente e filtra;
5. wizard cria Projeto em cada uma das sete intenções;
6. `/projetos/proj-1` abre sem tela branca;
7. recomendação pode ser adotada, virar tarefa e ir para Hoje;
8. concluir tarefa resolve movimento;
9. tarefas abrem como drawer desktop e full-height mobile;
10. teclado, Escape, foco e `prefers-reduced-motion` funcionam.

Capturar screenshots de comparação somente para QA local; não adicionar imagens temporárias ao git.

- [ ] **Step 5: Conferir limites estruturais**

Run: `wc -l apps/web/src/pages/projetos.tsx apps/web/src/pages/workspaces.tsx && rg "[📦🎯⚡🔍📊💰🔁🏆⚖️🎓⭐🌐⏱️🚀🔽]" apps/web/src/features/projects apps/web/src/features/fronts || true && git diff --check`

Expected: páginas de composição abaixo de 300 linhas; nenhum emoji de sistema nas novas features; `git diff --check` sem saída.

- [ ] **Step 6: Commit final**

```bash
git add apps/web/src apps/api/src apps/api/prisma docs/superpowers
git commit -m "feat: complete fronts and projects execution redesign"
```

## Ordem de checkpoints

- Após Task 8: API e regras completas, ainda sem trocar a UI.
- Após Task 13: nova navegação, lista e shell utilizáveis com motores em migração.
- Após Task 17: corte completo da página monolítica com legado preservado.
- Após Task 19: QA final desktop/mobile e entrega.

## Cobertura da especificação

| Seções da especificação | Tasks |
| --- | --- |
| Modelo conceitual, dados e migração | 1, 2, 4, 6 |
| Recomendações, progresso e estado operacional | 2, 3, 8 |
| Read models e propriedade de dados | 4, 6, 7, 8 |
| Catálogo, wizard e idempotência de criação | 8, 9, 10 |
| Frentes, saúde, capacidade e Responsabilidades | 6, 7, 11 |
| Lista de Projetos, shell e tarefas | 12, 13 |
| Sete motores principais e avançados | 14, 15, 16 |
| Legado, Processo e migração protegida | 2, 10, 17 |
| Vazios, loading, erros e dados recuperáveis | 8, 13, 18 |
| Mobile, acessibilidade e critérios de conclusão | 11, 13, 19 |
