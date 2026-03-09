# Project Methodologies (State of Art)

Documento de especificação para expandir `Projetos` além do modelo 4DX.

## Objetivo

Introduzir 4 metodologias premium com placar, cadência e alertas próprios:

- `delivery` (entregas por marcos)
- `launch` (janela fixa com readiness)
- `discovery` (hipóteses e evidências)
- `growth` (funil e ganho incremental)

4DX continua suportado como `fourdx`.

---

## 1) Modelo de dados (proposto)

### 1.1 Novos enums (Prisma)

```prisma
enum ProjectMethodology {
  fourdx
  delivery
  launch
  discovery
  growth
}

enum ProjectHealth {
  verde
  amarelo
  vermelho
}

enum ProjectCadence {
  daily
  weekly
  biweekly
}

enum ProjectMilestoneStatus {
  planned
  active
  done
  blocked
  canceled
}

enum ProjectRiskLevel {
  baixo
  medio
  alto
  critico
}

enum ProjectExperimentStatus {
  backlog
  running
  validated
  invalidated
  inconclusive
}
```

### 1.2 Extensões no `Project`

Adicionar no model `Project`:

```prisma
methodology       ProjectMethodology @default(fourdx)
health            ProjectHealth      @default(amarelo)
cadence           ProjectCadence     @default(weekly)
startDate         DateTime?          @db.Date @map("start_date")
targetDate        DateTime?          @db.Date @map("target_date")
owner             String?            @map("owner")
definitionOfDone  String?            @map("definition_of_done")
methodologyConfig Json?              @map("methodology_config")
scoreSnapshot     Json?              @map("score_snapshot")
lastReviewAt      DateTime?          @map("last_review_at")
```

Notas:

- `type` atual (`construcao/operacao/crescimento`) continua como dimensão estratégica.
- `methodology` passa a definir interface + regras + score + alertas.

### 1.3 Novas tabelas

#### `project_milestones`

```prisma
model ProjectMilestone {
  id          String               @id @default(uuid())
  projectId   String               @map("project_id")
  title       String
  description String?
  dueDate     DateTime?            @db.Date @map("due_date")
  status      ProjectMilestoneStatus @default(planned)
  weight      Int                  @default(1)
  orderIndex  Int                  @default(0) @map("order_index")
  blockedBy   String?              @map("blocked_by")
  doneAt      DateTime?            @map("done_at")
  createdAt   DateTime             @default(now()) @map("created_at")
  updatedAt   DateTime             @updatedAt @map("updated_at")
  archivedAt  DateTime?            @map("archived_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, orderIndex])
  @@index([projectId, status])
  @@index([projectId, dueDate])
  @@map("project_milestones")
}
```

#### `project_risks`

```prisma
model ProjectRisk {
  id          String          @id @default(uuid())
  projectId   String          @map("project_id")
  title       String
  impact      ProjectRiskLevel
  probability ProjectRiskLevel
  mitigation  String?
  owner       String?
  dueDate     DateTime?       @db.Date @map("due_date")
  resolvedAt  DateTime?       @map("resolved_at")
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, dueDate])
  @@index([projectId, resolvedAt])
  @@map("project_risks")
}
```

#### `project_experiments`

```prisma
model ProjectExperiment {
  id             String                 @id @default(uuid())
  projectId      String                 @map("project_id")
  hypothesis     String
  metric         String
  expectedImpact Float?                 @map("expected_impact")
  status         ProjectExperimentStatus @default(backlog)
  startedAt      DateTime?              @map("started_at")
  endedAt        DateTime?              @map("ended_at")
  evidence       String?
  decision       String?
  createdAt      DateTime               @default(now()) @map("created_at")
  updatedAt      DateTime               @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, status])
  @@index([projectId, createdAt])
  @@map("project_experiments")
}
```

#### `project_funnel_stages` (growth)

```prisma
model ProjectFunnelStage {
  id          String   @id @default(uuid())
  projectId   String   @map("project_id")
  stageKey    String   @map("stage_key") // ex: impressions, clicks, leads, calls, deals
  label       String
  orderIndex  Int      @default(0) @map("order_index")
  targetValue Float?   @map("target_value")
  currentValue Float?  @map("current_value")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, stageKey])
  @@index([projectId, orderIndex])
  @@map("project_funnel_stages")
}
```

---

## 2) Fluxo de criação (UX)

## Passo 1: Escolher metodologia

Cards no modal:

- 4DX
- Delivery
- Launch
- Discovery
- Growth

Cada card mostra:

- “melhor para”
- “placar”
- “cadência padrão”

## Passo 2: Campos comuns

- Frente
- Nome do projeto
- Tipo (construcao/operacao/crescimento)
- Dono
- Objetivo
- Definição de pronto
- Início e prazo alvo

## Passo 3: Campos específicos

### Delivery

- Marcos (mínimo 3)
- Dependências críticas
- Riscos iniciais

### Launch

- Data de lançamento (obrigatória)
- Checklist crítico por fase (`T-30`, `T-14`, `T-7`, `T-1`, `D+1`)
- Critérios de Go/No-Go

### Discovery

- Hipótese principal
- Métrica de validação
- Limite de experimentos por ciclo
- Janela de decisão

### Growth

- North Star
- Etapas do funil
- Meta por etapa
- Cadência de revisão

## Passo 4: Bootstrap automático

Na criação, gerar estrutura mínima:

- métricas padrão do tipo
- milestones/checklists (quando aplicável)
- revisão semanal padrão

---

## 3) Placar por metodologia (estado da arte)

## Delivery Score (0-100)

- 40% marcos concluídos no prazo
- 25% marcos críticos sem bloqueio
- 20% risco aberto ponderado
- 15% disciplina de revisão

## Launch Score (0-100)

- 45% checklist crítico concluído por fase
- 20% riscos críticos resolvidos
- 20% readiness técnico/comercial
- 15% pontualidade dos gates

## Discovery Score (0-100)

- 35% hipóteses testadas por ciclo
- 30% qualidade da evidência (campo obrigatório)
- 20% tempo de ciclo (lead time por experimento)
- 15% decisões fechadas (continue/pivot/stop)

## Growth Score (0-100)

- 40% avanço da North Star
- 25% conversão média do funil
- 20% impacto de experimentos
- 15% consistência de execução semanal

---

## 4) Alertas e automações

## Delivery

- marco atrasado sem plano -> alerta vermelho
- dependência vencida -> ação “cobrar / replanejar”

## Launch

- item crítico aberto em T-7 -> `risco de lançamento`
- sem dry-run em T-3 -> bloqueio de Go

## Discovery

- 2 semanas sem experimento -> estagnação
- evidência vazia -> check-in inválido

## Growth

- queda de conversão em 2 ciclos -> diagnóstico obrigatório
- experimento sem hipótese -> não inicia

---

## 5) Endpoints novos (propostos)

Base (além dos já existentes):

- `PATCH /projects/:id/methodology`
- `POST /projects/:id/milestones`
- `PATCH /project-milestones/:id`
- `POST /projects/:id/risks`
- `PATCH /project-risks/:id`
- `POST /projects/:id/experiments`
- `PATCH /project-experiments/:id`
- `POST /projects/:id/funnel-stages`
- `PATCH /project-funnel-stages/:id`
- `GET /projects/:id/dashboard`

`/projects/:id/dashboard` retorna placar consolidado do tipo + alertas + próxima ação recomendada.

---

## 6) Compatibilidade e migração

1. Todos projetos atuais entram como `methodology=fourdx`.
2. Não quebrar rota atual de scorecard.
3. Tela de projeto renderiza por `methodology`.
4. Migração progressiva:
   - Sprint 1: backend + criação de tipo + dashboard básico
   - Sprint 2: UI completa por tipo + alertas
   - Sprint 3: automações e recomendação inteligente de próxima ação

---

## 7) Ordem recomendada de implementação

1. Introduzir `ProjectMethodology` + campos comuns no `Project`.
2. Implementar `Delivery` primeiro (menor risco e alta utilidade).
3. Implementar `Launch` com checklist por fase.
4. Implementar `Discovery` com hipóteses/experimentos.
5. Implementar `Growth` com funil e conversão.
6. Padronizar score + alertas + cards no ranking.

---

## 8) Critérios de pronto (DoD)

- Criação de projeto com metodologia específica funcionando ponta a ponta.
- Dashboard do projeto mostra placar correto para a metodologia.
- Alertas essenciais aparecem com CTA.
- Sem regressão no fluxo atual 4DX.
- Eventos estratégicos registrados no histórico.
