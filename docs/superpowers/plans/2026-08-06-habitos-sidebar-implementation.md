# Hábitos e Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar Hábitos num ritual diário rápido com Evolução em segunda camada e substituir a navegação pesada por uma sidebar agrupada, compacta e responsiva.

**Architecture:** O backend passa a expor explicitamente se cada hábito pertence à data, uma operação absoluta para valores quantitativos e um agregado de evolução. No web, configuração de navegação, ritual diário e evolução ficam em módulos focados; `habitos.tsx` coordena dados e modais existentes, enquanto `/habitos/evolucao` concentra análise. Estilos novos ficam isolados dos blocos legados de `styles.css` para evitar outra geração de overrides.

**Tech Stack:** React 18, TypeScript, React Router 6, Lucide React, Radix Dialog, Sonner, Fastify 5, Prisma 5, Vitest, Testing Library, CSS responsivo.

---

## Preflight do worktree

Este worktree está correto na branch `codex/inbox-hoje-unificado`, mas alguns arquivos aparecem com a flag macOS `dataless`. Antes de editar:

- [ ] **Step 1: Materializar somente os arquivos do plano sem substituir conteúdo**

```bash
brctl download \
  .git \
  apps/api/src/routes/habits.ts \
  apps/api/src/services/habit-service.ts \
  apps/web/src/App.tsx \
  apps/web/src/api.ts \
  apps/web/src/api.test.ts \
  apps/web/src/components/layout.tsx \
  apps/web/src/components/layout.test.tsx \
  apps/web/src/demo/mock-fetch.ts \
  apps/web/src/pages/habitos.tsx \
  apps/web/src/styles.css
```

Expected: `ls -lO` deixa de mostrar `dataless` nesses arquivos. Não usar checkout/reset para “corrigir” a hidratação.

- [ ] **Step 2: Confirmar branch e preservar alterações fora do escopo**

```bash
git branch --show-current
git status --short
```

Expected: branch `codex/inbox-hoje-unificado`. Registrar alterações preexistentes e não incluí-las nos commits deste plano.

## Estrutura de arquivos

### Criar

- `apps/api/src/services/habit-schedule.ts` — regras puras de frequência, períodos e classificação da data.
- `apps/api/src/services/habit-schedule.test.ts` — cobertura determinística das regras diária, específica, semanal e mensal.
- `apps/api/src/services/habit-evolution-service.ts` — agregado de ritmo geral e níveis por área.
- `apps/api/src/services/habit-evolution-service.test.ts` — denominadores, limites de período e recaídas.
- `apps/api/src/routes/habits.test.ts` — contratos HTTP novos e autorização por usuário.
- `apps/web/src/components/layout-navigation.ts` — grupos, rotas, helpers desktop/mobile e ícones Lucide.
- `apps/web/src/components/layout-navigation.css` — sidebar expandida/recolhida, mobile nav e sheet Mais.
- `apps/web/src/features/habits/habit-ui.ts` — áreas, labels e helpers de apresentação compartilhados.
- `apps/web/src/features/habits/habit-day-list.tsx` — seções Para hoje/Outros e os três tipos de linha.
- `apps/web/src/features/habits/habit-day-list.test.tsx` — interações diárias e acessibilidade.
- `apps/web/src/features/habits/habit-value-editor.tsx` — popover/sheet para total quantitativo exato.
- `apps/web/src/features/habits/habit-value-editor.test.tsx` — total absoluto, zero e foco.
- `apps/web/src/features/habits/habit-evolution-view.tsx` — visão geral, áreas, períodos e heatmap.
- `apps/web/src/features/habits/habit-evolution-view.test.tsx` — troca de período/hábito e estados vazios.
- `apps/web/src/features/habits/habits.css` — estilos exclusivos de ritual e evolução.
- `apps/web/src/pages/habit-evolution.tsx` — rota e carregamento da segunda camada.

### Modificar

- `apps/api/src/services/habit-service.ts` — incluir hábitos fora da data e usar a classificação pura.
- `apps/api/src/routes/habits.ts` — query `includeUnscheduled`, `PUT` absoluto e rota Evolução.
- `apps/web/src/api.ts` — tipos e clientes novos.
- `apps/web/src/api.test.ts` — URLs, métodos e payloads.
- `apps/web/src/App.tsx` — rota `/habitos/evolucao`.
- `apps/web/src/components/layout.tsx` — consumir configuração agrupada e remover captions/score card.
- `apps/web/src/components/layout.test.tsx` — grupos, Dashboard, cinco destinos mobile e sheet Mais.
- `apps/web/src/pages/habitos.tsx` — orquestração, cabeçalho, lista nova, resumo e modais existentes.
- `apps/web/src/demo/mock-fetch.ts` — novos campos e endpoints de demonstração.
- `apps/web/src/styles.css` — remover seletores de Hábitos e navegação que ficaram obsoletos.

---

### Task 1: Regras determinísticas de frequência

**Files:**
- Create: `apps/api/src/services/habit-schedule.ts`
- Create: `apps/api/src/services/habit-schedule.test.ts`
- Modify: `apps/api/src/services/habit-service.ts:205-302`

- [ ] **Step 1: Escrever testes que expressem a classificação aprovada**

```ts
import { describe, expect, it } from 'vitest';
import { classifyHabitDate, periodBounds, type SchedulableHabit } from './habit-schedule.js';

const base: SchedulableHabit = {
  frequencyType: 'daily' as const,
  frequencyTarget: 1,
  specificDays: []
};

describe('classifyHabitDate', () => {
  it('keeps daily habits scheduled and respects specific weekdays', () => {
    expect(classifyHabitDate(base, '2026-08-06', 0, false)).toBe(true);
    expect(classifyHabitDate(
      { ...base, frequencyType: 'specific_days', specificDays: ['seg', 'qui'] },
      '2026-08-06',
      0,
      false
    )).toBe(true);
    expect(classifyHabitDate(
      { ...base, frequencyType: 'specific_days', specificDays: ['seg'] },
      '2026-08-06',
      0,
      false
    )).toBe(false);
  });

  it('keeps flexible habits due until the period target is reached', () => {
    const weekly = { ...base, frequencyType: 'weekly' as const, frequencyTarget: 2 };
    expect(classifyHabitDate(weekly, '2026-08-06', 1, false)).toBe(true);
    expect(classifyHabitDate(weekly, '2026-08-06', 2, false)).toBe(false);
    expect(classifyHabitDate(weekly, '2026-08-06', 2, true)).toBe(true);
  });
});

describe('periodBounds', () => {
  it('uses Monday for weekly periods and never reads after selected date', () => {
    expect(periodBounds('weekly', '2026-08-06')).toEqual({
      start: '2026-08-03',
      end: '2026-08-06'
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

Run: `npm --workspace @execution-os/api test -- src/services/habit-schedule.test.ts`

Expected: FAIL porque `habit-schedule.ts` ainda não existe.

- [ ] **Step 3: Implementar helpers puros**

```ts
import type { HabitFrequency, RecurrenceDay } from '@prisma/client';

export type SchedulableHabit = {
  frequencyType: HabitFrequency;
  frequencyTarget: number;
  specificDays: readonly RecurrenceDay[];
};

const DAYS: RecurrenceDay[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

export function periodBounds(frequency: HabitFrequency, date: string) {
  const selected = new Date(`${date}T00:00:00Z`);
  if (frequency === 'weekly') {
    const start = new Date(selected);
    start.setUTCDate(start.getUTCDate() - ((selected.getUTCDay() + 6) % 7));
    return { start: start.toISOString().slice(0, 10), end: date };
  }
  if (frequency === 'monthly') {
    return { start: `${date.slice(0, 7)}-01`, end: date };
  }
  return { start: date, end: date };
}

export function classifyHabitDate(
  habit: SchedulableHabit,
  date: string,
  periodDone: number,
  hasLogOnDate: boolean
) {
  if (hasLogOnDate) return true;
  if (habit.frequencyType === 'daily') return true;
  if (habit.frequencyType === 'specific_days') {
    const day = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
    return habit.specificDays.includes(day);
  }
  return periodDone < habit.frequencyTarget;
}
```

- [ ] **Step 4: Adaptar `getTodayStats` sem quebrar o contrato padrão**

Alterar a assinatura para:

```ts
async getTodayStats(
  date: string,
  clerkUserId = 'legacy',
  options: { includeUnscheduled?: boolean } = {}
) {
```

Contar progresso semanal/mensal com `date: { gte: start, lte: date }`, calcular `isScheduledForDate` com `classifyHabitDate`, e somente executar `continue` quando `!options.includeUnscheduled && frequencyType === 'specific_days' && !isScheduledForDate`. Incluir `isScheduledForDate` no resultado.

- [ ] **Step 5: Rodar testes de serviço**

Run: `npm --workspace @execution-os/api test -- src/services/habit-schedule.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/habit-schedule.ts apps/api/src/services/habit-schedule.test.ts apps/api/src/services/habit-service.ts
git commit -m "feat(api): classify habits for selected dates"
```

---

### Task 2: Contratos HTTP de lista e valor quantitativo absoluto

**Files:**
- Create: `apps/api/src/routes/habits.test.ts`
- Modify: `apps/api/src/routes/habits.ts:37-44,157-163,231-292`

- [ ] **Step 1: Escrever testes de rota para query e PUT**

```ts
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHabitRoutes } from './habits.js';
import { HabitService } from '../services/habit-service.js';

vi.mock('../middleware/auth.js', () => ({ getUserId: () => 'user_1' }));

describe('habit routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('sets an absolute quantitative total for the signed-in user', async () => {
    const prisma = {
      habit: { findUnique: vi.fn().mockResolvedValue({ id: 'h1', clerkUserId: 'user_1', type: 'quantitative' }) },
      habitLog: { upsert: vi.fn().mockResolvedValue({ habitId: 'h1', date: '2026-08-06', value: 20 }) },
      habitXPEvent: { findFirst: vi.fn().mockResolvedValue({ id: 'xp1' }) }
    };
    const app = Fastify();
    registerHabitRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({
      method: 'PUT', url: '/habits/h1/log',
      payload: { date: '2026-08-06', value: 20 }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.habitLog.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ value: 20 })
    }));
  });

  it('passes includeUnscheduled to daily stats', async () => {
    const stats = vi.spyOn(HabitService.prototype, 'getTodayStats').mockResolvedValue([]);
    const app = Fastify();
    registerHabitRoutes(app, {} as never);
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/habits/stats/today?date=2026-08-06&includeUnscheduled=true'
    });

    expect(response.statusCode).toBe(200);
    expect(stats).toHaveBeenCalledWith('2026-08-06', 'user_1', { includeUnscheduled: true });
    stats.mockRestore();
  });

  it('rejects absolute totals for binary habits', async () => {
    const prisma = {
      habit: { findUnique: vi.fn().mockResolvedValue({ id: 'h2', clerkUserId: 'user_1', type: 'binary' }) },
      habitLog: { upsert: vi.fn() },
      habitXPEvent: { findFirst: vi.fn() }
    };
    const app = Fastify();
    registerHabitRoutes(app, prisma as never);
    apps.push(app);

    const response = await app.inject({
      method: 'PUT', url: '/habits/h2/log',
      payload: { date: '2026-08-06', value: 1 }
    });

    expect(response.statusCode).toBe(400);
    expect(prisma.habitLog.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm --workspace @execution-os/api test -- src/routes/habits.test.ts`

Expected: FAIL com 404 para o novo `PUT`.

- [ ] **Step 3: Validar query e payload**

Adicionar:

```ts
const absoluteLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().positive(),
  note: z.string().max(500).optional().nullable()
});

const includeUnscheduled = query.includeUnscheduled === 'true';
return service.getTodayStats(date, clerkUserId, { includeUnscheduled });
```

- [ ] **Step 4: Implementar o PUT absoluto**

```ts
app.put('/habits/:id/log', async (request, reply) => {
  const clerkUserId = getUserId(request);
  const { id } = request.params as { id: string };
  const body = absoluteLogSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ error: body.error.message });

  const habit = await prisma.habit.findUnique({ where: { id, clerkUserId } });
  if (!habit) return reply.status(404).send({ error: 'Hábito não encontrado' });
  if (habit.type !== 'quantitative') {
    return reply.status(400).send({ error: 'Valor absoluto exige hábito quantitativo' });
  }

  const { date, value, note } = body.data;
  const log = await prisma.habitLog.upsert({
    where: { habitId_date: { habitId: id, date } },
    create: { habitId: id, date, value, note: note ?? null },
    update: { value, note: note ?? null }
  });
  await service.processXP(id, date);
  return log;
});
```

- [ ] **Step 5: Completar casos de autorização e validação**

```ts
it.each([
  { habit: null, payload: { date: '2026-08-06', value: 20 }, status: 404 },
  { habit: { id: 'h1', clerkUserId: 'user_1', type: 'quantitative' }, payload: { date: '2026-08-06', value: 0 }, status: 400 },
  { habit: { id: 'h1', clerkUserId: 'user_1', type: 'quantitative' }, payload: { date: '06/08/2026', value: 20 }, status: 400 }
])('validates absolute total requests', async ({ habit, payload, status }) => {
  const prisma = {
    habit: { findUnique: vi.fn().mockResolvedValue(habit) },
    habitLog: { upsert: vi.fn() },
    habitXPEvent: { findFirst: vi.fn() }
  };
  const app = Fastify();
  registerHabitRoutes(app, prisma as never);
  apps.push(app);
  const response = await app.inject({ method: 'PUT', url: '/habits/h1/log', payload });
  expect(response.statusCode).toBe(status);
  expect(prisma.habitLog.upsert).not.toHaveBeenCalled();
});
```

O primeiro caso comprova autorização porque a busca usa a chave composta `{ id, clerkUserId }`. O teste feliz já comprova que `update.value` recebe `20` diretamente, sem somar o valor anterior.

- [ ] **Step 6: Rodar rotas e segurança**

Run: `npm --workspace @execution-os/api test -- src/routes/habits.test.ts src/services/security-ownership.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/habits.ts apps/api/src/routes/habits.test.ts
git commit -m "feat(api): support absolute habit totals"
```

---

### Task 3: Agregado de Evolução

**Files:**
- Create: `apps/api/src/services/habit-evolution-service.ts`
- Create: `apps/api/src/services/habit-evolution-service.test.ts`
- Modify: `apps/api/src/routes/habits.ts:165-229`
- Modify: `apps/api/src/routes/habits.test.ts`

- [ ] **Step 1: Escrever testes do denominador**

```ts
import { describe, expect, it, vi } from 'vitest';
import { HabitEvolutionService } from './habit-evolution-service.js';

it('caps weekly completions at the target and excludes days before creation', async () => {
  const prisma = {
    habit: { findMany: vi.fn().mockResolvedValue([{ id: 'h1', type: 'binary', frequencyType: 'weekly', frequencyTarget: 2, specificDays: [], createdAt: new Date('2026-08-03'), lifeArea: 'corpo' }]) },
    habitLog: { findMany: vi.fn().mockResolvedValue([
      { habitId: 'h1', date: '2026-08-03', value: 1 },
      { habitId: 'h1', date: '2026-08-04', value: 1 },
      { habitId: 'h1', date: '2026-08-05', value: 1 }
    ]) },
    habitXPEvent: { aggregate: vi.fn().mockResolvedValue({ _sum: { xp: 840 } }) }
  };
  const result = await new HabitEvolutionService(prisma as never).getEvolution('user_1', 7, '2026-08-06');
  expect(result.expectedOccurrences).toBe(2);
  expect(result.completedOccurrences).toBe(2);
  expect(result.rhythmPct).toBe(100);
});
```

Usar um fixture reutilizável e casos explícitos:

```ts
function evolutionFixture(habit: Record<string, unknown>, logs: Array<Record<string, unknown>>) {
  return {
    habit: { findMany: vi.fn().mockResolvedValue([habit]) },
    habitLog: { findMany: vi.fn().mockResolvedValue(logs) },
    habitXPEvent: { aggregate: vi.fn().mockResolvedValue({ _sum: { xp: 0 } }) }
  };
}

it.each([
  {
    name: 'daily',
    habit: { id: 'd', type: 'binary', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], createdAt: new Date('2026-08-01'), lifeArea: 'corpo' },
    logs: ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'].map((date) => ({ habitId: 'd', date, value: 1 })),
    expected: 7,
    completed: 5
  },
  {
    name: 'specific weekdays',
    habit: { id: 's', type: 'binary', frequencyType: 'specific_days', frequencyTarget: 1, specificDays: ['seg', 'qui'], createdAt: new Date('2026-08-01'), lifeArea: 'mente' },
    logs: [{ habitId: 's', date: '2026-08-03', value: 1 }],
    expected: 2,
    completed: 1
  },
  {
    name: 'partial monthly target',
    habit: { id: 'm', type: 'binary', frequencyType: 'monthly', frequencyTarget: 3, specificDays: [], createdAt: new Date('2026-08-01'), lifeArea: 'trabalho' },
    logs: [{ habitId: 'm', date: '2026-08-02', value: 1 }, { habitId: 'm', date: '2026-08-05', value: 1 }],
    expected: 3,
    completed: 2
  },
  {
    name: 'vice with one relapse',
    habit: { id: 'v', type: 'vice', frequencyType: 'daily', frequencyTarget: 1, specificDays: [], createdAt: new Date('2026-08-01'), lifeArea: 'corpo' },
    logs: [{ habitId: 'v', date: '2026-08-04', value: -1 }],
    expected: 7,
    completed: 6
  }
])('$name', async ({ habit, logs, expected, completed }) => {
  const service = new HabitEvolutionService(evolutionFixture(habit, logs) as never);
  const result = await service.getEvolution('user_1', 7, '2026-08-07');
  expect(result.expectedOccurrences).toBe(expected);
  expect(result.completedOccurrences).toBe(completed);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm --workspace @execution-os/api test -- src/services/habit-evolution-service.test.ts`

Expected: FAIL porque o serviço não existe.

- [ ] **Step 3: Implementar o serviço**

O serviço deve:

```ts
export class HabitEvolutionService {
  constructor(private prisma: PrismaClient) {}

  async getEvolution(clerkUserId: string, days: number, endDate = new Date().toISOString().slice(0, 10)) {
    const startDate = addDays(endDate, -(days - 1));
    const habits = await this.prisma.habit.findMany({
      where: { clerkUserId, status: { not: 'arquivado' } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    const logs = await this.prisma.habitLog.findMany({
      where: { habit: { clerkUserId }, date: { gte: startDate, lte: endDate } }
    });

    const totals = calculateOccurrenceTotals(habits, logs, startDate, endDate);
    const areas = await loadAreaLevels(this.prisma, clerkUserId);
    return {
      startDate, endDate,
      ...totals,
      rhythmPct: totals.expectedOccurrences === 0
        ? 0
        : Math.round((totals.completedOccurrences / totals.expectedOccurrences) * 100),
      areas
    };
  }
}
```

`calculateOccurrenceTotals` agrupa semanal/mensal por período, limita `completed` à meta, usa `min(meta, dias ativos transcorridos)` para períodos parciais e trata vício como mantido quando não existe log `-1` na ocorrência prevista.

Implementação de referência para o cálculo:

```ts
function dateRange(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function periodKey(frequency: 'weekly' | 'monthly', date: string) {
  return frequency === 'weekly' ? periodBounds('weekly', date).start : date.slice(0, 7);
}

export function calculateOccurrenceTotals(
  habits: Array<Habit & { createdAt: Date }>,
  logs: HabitLog[],
  startDate: string,
  endDate: string
) {
  const logsByHabit = new Map<string, HabitLog[]>();
  for (const log of logs) logsByHabit.set(log.habitId, [...(logsByHabit.get(log.habitId) ?? []), log]);
  let expectedOccurrences = 0;
  let completedOccurrences = 0;

  for (const habit of habits) {
    const activeStart = habit.createdAt.toISOString().slice(0, 10) > startDate
      ? habit.createdAt.toISOString().slice(0, 10)
      : startDate;
    const activeDates = dateRange(activeStart, endDate);
    const habitLogs = logsByHabit.get(habit.id) ?? [];
    const logByDate = new Map(habitLogs.map((log) => [log.date, log.value]));

    if (habit.frequencyType === 'daily' || habit.frequencyType === 'specific_days') {
      const scheduledDates = activeDates.filter((date) =>
        habit.frequencyType === 'daily' || classifyHabitDate(habit, date, 0, false)
      );
      expectedOccurrences += scheduledDates.length;
      completedOccurrences += scheduledDates.filter((date) =>
        habit.type === 'vice' ? logByDate.get(date) !== -1 : (logByDate.get(date) ?? 0) > 0
      ).length;
      continue;
    }

    const datesByPeriod = new Map<string, string[]>();
    for (const date of activeDates) {
      const key = periodKey(habit.frequencyType, date);
      datesByPeriod.set(key, [...(datesByPeriod.get(key) ?? []), date]);
    }
    for (const dates of datesByPeriod.values()) {
      const expectedInPeriod = Math.min(habit.frequencyTarget, dates.length);
      const values = dates.map((date) => logByDate.get(date));
      expectedOccurrences += expectedInPeriod;
      completedOccurrences += habit.type === 'vice'
        ? Math.max(0, expectedInPeriod - values.filter((value) => value === -1).length)
        : Math.min(expectedInPeriod, values.filter((value) => (value ?? 0) > 0).length);
    }
  }

  return { expectedOccurrences, completedOccurrences };
}
```

`loadAreaLevels` percorre as seis `HabitLifeArea`, agrega XP com filtro `{ lifeArea, habit: { clerkUserId } }`, chama `getLevelInfo(totalXp)` e devolve `{ lifeArea, ...levelInfo }`.

- [ ] **Step 4: Expor rota validada**

```ts
const evolutionService = new HabitEvolutionService(prisma);

app.get('/habits/stats/evolution', async (request, reply) => {
  const clerkUserId = getUserId(request);
  const parsed = z.coerce.number().pipe(z.union([z.literal(30), z.literal(90), z.literal(365)])).safeParse(
    (request.query as { days?: string }).days ?? '90'
  );
  if (!parsed.success) return reply.status(400).send({ error: 'Período inválido' });
  return evolutionService.getEvolution(clerkUserId, parsed.data);
});
```

Em `habits.test.ts`, espiar `HabitEvolutionService.prototype.getEvolution`, chamar `?days=90` e esperar `('user_1', 90)`; chamar `?days=7` e esperar status 400 sem invocar o serviço.

- [ ] **Step 5: Rodar testes e typecheck da API**

Run: `npm --workspace @execution-os/api test -- src/services/habit-evolution-service.test.ts src/routes/habits.test.ts && npm --workspace @execution-os/api run typecheck`

Expected: PASS e typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/habit-evolution-service.ts apps/api/src/services/habit-evolution-service.test.ts apps/api/src/routes/habits.ts apps/api/src/routes/habits.test.ts
git commit -m "feat(api): expose habit evolution metrics"
```

---

### Task 4: Cliente web, tipos e demo

**Files:**
- Modify: `apps/web/src/api.ts:1237-1266,2286-2306`
- Modify: `apps/web/src/api.test.ts`
- Modify: `apps/web/src/demo/mock-fetch.ts:197-224,420-423`

- [ ] **Step 1: Escrever testes do cliente**

```ts
it('loads all date stats and sets an absolute habit total', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

  await api.getHabitsTodayStats('2026-08-06', { includeUnscheduled: true });
  await api.setHabitTotal('h-1', { date: '2026-08-06', value: 20 });
  await api.getHabitEvolution(90);

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    '/api/habits/stats/today?date=2026-08-06&includeUnscheduled=true',
    expect.any(Object)
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    '/api/habits/h-1/log',
    expect.objectContaining({ method: 'PUT', body: JSON.stringify({ date: '2026-08-06', value: 20 }) })
  );
  expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/habits/stats/evolution?days=90', expect.any(Object));
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm --workspace @execution-os/web test -- src/api.test.ts`

Expected: FAIL porque os clientes novos não existem.

- [ ] **Step 3: Adicionar tipos e métodos**

```ts
export type HabitTodayStat = Habit & {
  currentLog: HabitLog | null;
  streak: number;
  periodProgress: { done: number; target: number } | null;
  isCompletedToday: boolean;
  isScheduledForDate: boolean;
};

export type HabitEvolution = {
  startDate: string;
  endDate: string;
  expectedOccurrences: number;
  completedOccurrences: number;
  rhythmPct: number;
  areas: Array<HabitLevelInfo & { lifeArea: HabitLifeArea }>;
};

getHabitsTodayStats: (date: string, options: { includeUnscheduled?: boolean } = {}) =>
  apiRequest<HabitTodayStat[]>(withQuery('/habits/stats/today', {
    date,
    includeUnscheduled: options.includeUnscheduled || undefined
  })),
setHabitTotal: (id: string, data: { date: string; value: number; note?: string | null }) =>
  apiRequest<HabitLog>(`/habits/${id}/log`, { method: 'PUT', body: JSON.stringify(data) }),
getHabitEvolution: (days: 30 | 90 | 365) =>
  apiRequest<HabitEvolution>(withQuery('/habits/stats/evolution', { days }))
```

- [ ] **Step 4: Atualizar demo**

Adicionar `isScheduledForDate` aos fixtures e um item fora da data. Em `matchRoute`, adicionar apenas os GETs:

```ts
if (path === '/habits/stats/today') return { status: 200, body: HABIT_TODAY_STATS };
if (path === '/habits/stats/evolution') return { status: 200, body: HABIT_EVOLUTION };
```

Dentro de `installMockFetch`, antes do fallback genérico de mutações, usar `method`, `path` e `init` que já existem no interceptor:

```ts
if (/^\/habits\/[^/]+\/log$/.test(path) && method === 'PUT') {
  const payload = JSON.parse(String(init?.body ?? '{}')) as { date: string; value: number };
  return new Response(JSON.stringify({ id: 'demo-absolute-log', habitId: path.split('/')[2], date: payload.date, value: payload.value, note: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
if (/^\/habits\/[^/]+\/log$/.test(path) && method === 'POST') {
  const payload = JSON.parse(String(init?.body ?? '{}')) as { date: string; value?: number };
  return new Response(JSON.stringify({ id: 'demo-increment-log', habitId: path.split('/')[2], date: payload.date, value: payload.value ?? 1, note: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

`HABIT_EVOLUTION` deve usar os mesmos números do mockup aprovado (`rhythmPct: 73`, `completedOccurrences: 66`) e `HABIT_TODAY_STATS` deve conter pelo menos um `isScheduledForDate: false` para validar Outros hábitos.

- [ ] **Step 5: Rodar testes do cliente**

Run: `npm --workspace @execution-os/web test -- src/api.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/api.test.ts apps/web/src/demo/mock-fetch.ts
git commit -m "feat(web): add habit ritual API contracts"
```

---

### Task 5: Configuração agrupada da sidebar

**Files:**
- Create: `apps/web/src/components/layout-navigation.ts`
- Create: `apps/web/src/components/layout-navigation.css`
- Modify: `apps/web/src/components/layout.tsx:1-31,160-197,1036-1140,1267-1298`
- Modify: `apps/web/src/components/layout.test.tsx`

- [ ] **Step 1: Atualizar testes da arquitetura de navegação**

```ts
expect(shellGroups.map((group) => group.label)).toEqual(['Planejar', 'Organizar', 'Evoluir']);
expect(shellGroups[0].links.map((link) => link.label)).toEqual(['Hoje', 'Agenda']);
expect(shellGroups[1].links.map((link) => link.label)).toEqual(['Tarefas', 'Projetos', 'Frentes', 'Notas']);
expect(shellGroups[2].links.map((link) => link.label)).toEqual(['Hábitos', 'Dashboard']);
expect(getMobilePrimaryLinks().map((link) => link.label)).toEqual(['Hoje', 'Agenda', 'Tarefas', 'Hábitos']);
expect(getMobileMoreLinks().map((link) => link.label)).toEqual(['Projetos', 'Frentes', 'Notas', 'Dashboard', 'Configurações']);
expect(getActiveShellRoute('/dashboard')?.label).toBe('Dashboard');
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm --workspace @execution-os/web test -- src/components/layout.test.tsx`

Expected: FAIL porque Hábitos ainda está em Mais, não há grupos e Dashboard aponta para `/`.

- [ ] **Step 3: Criar configuração única com Lucide**

```ts
export const shellGroups = [
  { id: 'plan', label: 'Planejar', links: [
    { to: '/hoje', label: 'Hoje', icon: CalendarCheck2 },
    { to: '/agenda', label: 'Agenda', icon: CalendarClock }
  ]},
  { id: 'organize', label: 'Organizar', links: [
    { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
    { to: '/projetos', label: 'Projetos', icon: BriefcaseBusiness },
    { to: '/frentes', label: 'Frentes', icon: Building2 },
    { to: '/notas', label: 'Notas', icon: NotebookPen }
  ]},
  { id: 'evolve', label: 'Evoluir', links: [
    { to: '/habitos', label: 'Hábitos', icon: Target },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }
  ]}
] as const;

export const settingsLink = { to: '/configuracoes', label: 'Configurações', icon: Settings };
```

Exportar uma lista plana derivada para palette/atalhos; não duplicar rotas.

- [ ] **Step 4: Renderizar grupos, Capturar e rodapé**

No `Layout`, trocar o `shellLinks.map` por:

```tsx
function ShellNavLink({ link, collapsed }: { link: ShellLink; collapsed: boolean }) {
  const Icon = link.icon;
  return (
    <NavLink
      to={link.to}
      end={link.to === '/dashboard'}
      title={collapsed ? link.label : undefined}
      className={({ isActive }) => `main-nav-link${isActive ? ' active' : ''}`}
    >
      <span className="premium-nav-icon"><Icon size={16} strokeWidth={1.8} /></span>
      {!collapsed && <span>{link.label}</span>}
    </NavLink>
  );
}

<button type="button" className="sidebar-capture" onClick={focusCaptureInput}>
  <Plus size={16} /><span>Capturar</span><kbd>Q</kbd>
</button>
<nav className="main-nav" aria-label="Navegação principal">
  {shellGroups.map((group) => (
    <section className="shell-nav-group" key={group.id} aria-label={group.label}>
      <p className="shell-nav-group-label">{group.label}</p>
      {group.links.map((link) => <ShellNavLink key={link.to} link={link} collapsed={sidebarCollapsed} />)}
    </section>
  ))}
</nav>
<div className="sidebar-settings">
  <ShellNavLink link={settingsLink} collapsed={sidebarCollapsed} />
</div>
```

Remover captions e `sidebar-score`, manter `aria-current` do `NavLink`, tooltip no estado recolhido e botões `Plus`, `PanelLeftClose`, `PanelLeftOpen`.

- [ ] **Step 5: Atualizar mobile**

Renderizar quatro links principais + botão Mais. Dentro do sheet, renderizar os links secundários com títulos de grupo e sem captions. Garantir que `/habitos/evolucao` mantém Hábitos ativo por prefixo.

- [ ] **Step 6: Criar estilos isolados**

Implementar em `layout-navigation.css`:

```css
.app-sidebar { width: 210px; border-right: 1px solid var(--border); }
.sidebar-collapsed .app-sidebar { width: 62px; }
.shell-nav-group-label { font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; }
.main-nav-link { min-height: 34px; border: 0; border-radius: 8px; }
.main-nav-link.active { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.main-nav-link.active .premium-nav-icon { color: var(--accent); }
@media (max-width: 720px) {
  .mobile-bottom-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}
```

Importar o CSS em `layout.tsx`.

- [ ] **Step 7: Rodar testes**

Run: `npm --workspace @execution-os/web test -- src/components/layout.test.tsx`

Expected: PASS, inclusive abertura/fechamento do sheet e Capturar.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/layout-navigation.ts apps/web/src/components/layout-navigation.css apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx
git commit -m "feat(web): group and compact app navigation"
```

---

### Task 6: Lista diária e editor quantitativo

**Files:**
- Create: `apps/web/src/features/habits/habit-ui.ts`
- Create: `apps/web/src/features/habits/habit-day-list.tsx`
- Create: `apps/web/src/features/habits/habit-day-list.test.tsx`
- Create: `apps/web/src/features/habits/habit-value-editor.tsx`
- Create: `apps/web/src/features/habits/habit-value-editor.test.tsx`
- Create: `apps/web/src/features/habits/habits.css`

- [ ] **Step 1: Escrever testes das três linhas**

```tsx
const maintenance = { onEdit: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(), onUndoRelapse: vi.fn(), onClear: vi.fn() };
render(<HabitDayList stats={fixtures} busyIds={new Set()} onToggle={onToggle} onIncrement={onIncrement} onSetTotal={onSetTotal} onRelapse={onRelapse} {...maintenance} />);

fireEvent.click(screen.getByRole('button', { name: /marcar dormir/i }));
expect(onToggle).toHaveBeenCalledWith('binary-1', false);

fireEvent.click(screen.getByRole('button', { name: /adicionar 10 páginas/i }));
expect(onIncrement).toHaveBeenCalledWith('quant-1', 10);

fireEvent.click(screen.getByRole('button', { name: /informar valor exato de leitura/i }));
expect(await screen.findByRole('dialog', { name: /valor de leitura/i })).toBeInTheDocument();

fireEvent.click(screen.getByRole('button', { name: /registrar recaída/i }));
expect(onRelapse).toHaveBeenCalledWith('vice-1');
expect(screen.queryByText(/tem certeza/i)).not.toBeInTheDocument();
```

Também testar que Outros hábitos começa recolhido e que o menu contém Editar/Arquivar/Excluir, mas não Marcar/Recaída.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm --workspace @execution-os/web test -- src/features/habits/habit-day-list.test.tsx`

Expected: FAIL porque os componentes não existem.

- [ ] **Step 3: Criar helpers visuais compartilhados**

Mover `LIFE_AREAS`, `AREA_MAP`, dias e labels de frequência para `habit-ui.ts`. Manter `Dumbbell`, `Brain`, `Briefcase`, `Heart`, `TrendingUp` e `Leaf` da Lucide; emoji customizado do hábito permanece conteúdo do usuário.

- [ ] **Step 4: Implementar lista e linhas sem cards por área**

```tsx
const scheduled = stats.filter((habit) => habit.isScheduledForDate);
const other = stats.filter((habit) => !habit.isScheduledForDate);

return (
  <section className="habit-ledger" aria-label="Hábitos da data selecionada">
    <h2 className="habit-ledger-label">Para hoje</h2>
    <div className="habit-ledger-list">{scheduled.map(renderRow)}</div>
    {other.length > 0 && (
      <button className="habit-other-toggle" aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)}>
        <span>Outros hábitos</span><span>{other.length}</span><ChevronDown size={14} />
      </button>
    )}
    {otherOpen && <div className="habit-ledger-list secondary">{other.map(renderRow)}</div>}
  </section>
);
```

Cada linha usa apenas Lucide para ações do sistema (`Check`, `Plus`, `MoreHorizontal`, `RotateCcw`, `Flame`) e mantém um rótulo textual na ação principal.

- [ ] **Step 5: Implementar editor de total exato**

Usar Radix Dialog em mobile e popover visual ancorado em desktop apenas se o projeto já possuir primitiva confiável; para uma implementação única e acessível, Dialog responsivo é aceitável:

```tsx
<Dialog.Content className="habit-value-dialog" aria-describedby="habit-value-help">
  <Dialog.Title>Valor de {habit.title}</Dialog.Title>
  <p id="habit-value-help">Informe o total realizado nesta data.</p>
  <input type="number" min="0" value={value} onChange={(event) => setValue(Number(event.target.value))} autoFocus />
  <button onClick={() => value === 0 ? onClear() : onSave(value)}>Salvar total</button>
</Dialog.Content>
```

Ao salvar `0`, chamar `onClear`; valores positivos chamam `onSetTotal`.

- [ ] **Step 6: Testar foco, Escape e semântica absoluta**

No teste, abrir editor com valor atual `12`, digitar `20`, salvar e esperar `onSetTotal('quant-1', 20)`, nunca `8` nem `32`. Verificar fechamento por Escape e retorno de foco ao botão `12/30`.

- [ ] **Step 7: Rodar testes**

Run: `npm --workspace @execution-os/web test -- src/features/habits/habit-day-list.test.tsx src/features/habits/habit-value-editor.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/habits
git commit -m "feat(web): build daily habit ledger"
```

---

### Task 7: Orquestrar a página Hábitos e feedback reversível

**Files:**
- Modify: `apps/web/src/pages/habitos.tsx`
- Create: `apps/web/src/pages/habitos.test.tsx`

- [ ] **Step 1: Escrever teste de integração da página**

Mockar `api.getHabitsTodayStats` com itens previstos e não previstos, `getHabitsRadar`, `setHabitTotal`, `habitRecaiu` e `deleteHabitLog`. Verificar:

```tsx
expect(apiMock.getHabitsTodayStats).toHaveBeenCalledWith(expect.any(String), { includeUnscheduled: true });
expect(screen.getByRole('heading', { name: /hábitos de hoje/i })).toBeInTheDocument();
expect(screen.getByText('Treino')).toBeVisible();
expect(screen.queryByText('Revisar finanças')).not.toBeVisible();
fireEvent.click(screen.getByRole('button', { name: /outros hábitos/i }));
expect(screen.getByText('Revisar finanças')).toBeVisible();
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm --workspace @execution-os/web test -- src/pages/habitos.test.tsx`

Expected: FAIL na assinatura e hierarquia atuais.

- [ ] **Step 3: Reduzir `habitos.tsx` a orquestração**

Preservar os modais de criar/editar inicialmente, remover `AreaChipsRow`, `HabitAreaSection`, `HabitRow` e `HabitHeatmap` do arquivo, e carregar:

```ts
const [todayStats, radarStats, allHabitsData] = await Promise.all([
  api.getHabitsTodayStats(date, { includeUnscheduled: true }),
  api.getHabitsRadar(),
  api.getHabits()
]);
```

O cabeçalho usa data como overline, título contextual, chevrons Lucide e `Plus` dentro de Novo hábito.

- [ ] **Step 4: Implementar mutações por linha**

Trocar o `busy: boolean` global por `busyIds: Set<string>`. Marcar apenas o hábito alterado como ocupado. `handleSetTotal` chama `api.setHabitTotal`; `handleIncrement` continua em `api.logHabit`.

- [ ] **Step 5: Remover confirmação da recaída e oferecer Desfazer**

```ts
const handleRelapse = async (id: string) => {
  setBusy(id, true);
  try {
    await api.habitRecaiu(id, date);
    await load();
    toast('Recaída registrada', {
      action: { label: 'Desfazer', onClick: () => void handleUndoRelapse(id) }
    });
  } catch {
    toast.error('Não foi possível registrar a recaída');
  } finally {
    setBusy(id, false);
  }
};
```

Manter Desfazer no menu da linha para a data atual após o toast expirar.

- [ ] **Step 6: Adicionar resumo secundário**

Renderizar no máximo três áreas no desktop e uma no mobile, usando `radarStats`, com link React Router para `/habitos/evolucao`. O resumo vem depois de Outros hábitos.

- [ ] **Step 7: Rodar integração e componentes**

Run: `npm --workspace @execution-os/web test -- src/pages/habitos.test.tsx src/features/habits/habit-day-list.test.tsx src/features/habits/habit-value-editor.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/habitos.tsx apps/web/src/pages/habitos.test.tsx
git commit -m "feat(web): turn habits into a daily ritual"
```

---

### Task 8: Página Evolução

**Files:**
- Create: `apps/web/src/features/habits/habit-evolution-view.tsx`
- Create: `apps/web/src/features/habits/habit-evolution-view.test.tsx`
- Create: `apps/web/src/pages/habit-evolution.tsx`
- Modify: `apps/web/src/App.tsx:8-18,52-55`

- [ ] **Step 1: Escrever testes da visão**

```tsx
const fixture = {
  startDate: '2026-05-09', endDate: '2026-08-06',
  expectedOccurrences: 90, completedOccurrences: 66, rhythmPct: 73,
  areas: [{ lifeArea: 'corpo', level: 4, name: 'Focado', totalXp: 840, progressPct: 70, nextLevelXp: 1200 }]
};
const habits = [{ id: 'h1', title: 'Leitura' }, { id: 'h2', title: 'Treino' }];
const heatmap = {
  cells: Array.from({ length: 20 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    value: index % 3 === 0 ? null : 1,
    expected: true,
    completed: index % 3 !== 0,
    relapse: false
  }))
};
const onPeriodChange = vi.fn();
const onHabitChange = vi.fn();

render(<HabitEvolutionView evolution={fixture} habits={habits} heatmap={heatmap} period={90} onPeriodChange={onPeriodChange} selectedHabitId="h1" onHabitChange={onHabitChange} />);

expect(screen.getByText('73%')).toBeInTheDocument();
expect(screen.getByText(/66 dias consistentes/i)).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: /30 dias/i }));
expect(onPeriodChange).toHaveBeenCalledWith(30);
fireEvent.change(screen.getByLabelText(/hábito analisado/i), { target: { value: 'h2' } });
expect(onHabitChange).toHaveBeenCalledWith('h2');
```

```tsx
it('hides trend prose when fewer than fourteen occurrences exist', () => {
  render(<HabitEvolutionView
    evolution={fixture}
    habits={habits}
    heatmap={{ ...heatmap, cells: heatmap.cells.slice(0, 10) }}
    period={90}
    onPeriodChange={onPeriodChange}
    selectedHabitId="h1"
    onHabitChange={onHabitChange}
  />);
  expect(screen.queryByText(/ganhou ritmo|ponto de queda/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm --workspace @execution-os/web test -- src/features/habits/habit-evolution-view.test.tsx`

Expected: FAIL porque a visão não existe.

- [ ] **Step 3: Implementar visão sem cards concorrentes**

Criar cabeçalho, tabs `Visão geral`/`Consistência por hábito`, métrica de ritmo, linhas de área e heatmap. Cada célula recebe `title` e `aria-label` com data/valor; cor não é a única informação. A leitura usa um helper determinístico:

```ts
export function deriveHabitInsight(cells: HabitHeatmapCell[]) {
  const expected = cells.filter((cell) => cell.expected);
  if (expected.length < 14) return null;
  const midpoint = Math.floor(expected.length / 2);
  const rate = (items: HabitHeatmapCell[]) => items.filter((cell) => cell.completed).length / items.length;
  const before = rate(expected.slice(0, midpoint));
  const after = rate(expected.slice(midpoint));
  if (after - before < 0.1) return null;
  return `A consistência subiu de ${Math.round(before * 100)}% para ${Math.round(after * 100)}%.`;
}
```

Definir no mesmo módulo:

```ts
export type HabitHeatmapCell = {
  date: string;
  value: number | null;
  expected: boolean;
  completed: boolean;
  relapse: boolean;
};
```

- [ ] **Step 4: Implementar página e carregamento**

`HabitEvolutionPage` mantém `period`, `selectedHabitId`, `evolution`, `habits`, `heatmap`, `ready` e erros. Troca de período recarrega agregado e heatmap; troca de hábito recarrega apenas heatmap.

- [ ] **Step 5: Registrar rota lazy**

```tsx
const HabitEvolutionPage = lazy(() => import('./pages/habit-evolution').then((module) => ({ default: module.HabitEvolutionPage })));

<Route path="habitos" element={<HabitosPage />} />
<Route path="habitos/evolucao" element={<HabitEvolutionPage />} />
```

- [ ] **Step 6: Rodar testes e typecheck**

Run: `npm --workspace @execution-os/web test -- src/features/habits/habit-evolution-view.test.tsx && npm --workspace @execution-os/web run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/habits/habit-evolution-view.tsx apps/web/src/features/habits/habit-evolution-view.test.tsx apps/web/src/pages/habit-evolution.tsx apps/web/src/App.tsx
git commit -m "feat(web): add dedicated habit evolution view"
```

---

### Task 9: Limpeza de CSS legado e responsividade

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/habits/habits.css`
- Modify: `apps/web/src/components/layout-navigation.css`

- [ ] **Step 1: Localizar todos os seletores antigos antes de remover**

Run:

```bash
rg -n "habitos-area-chips|habitos-area-chip|habit-area-section|habit-area-header|habit-row|habit-btn-|habitos-analysis-btn|premium-nav-copy small|premium-score-card" apps/web/src/styles.css
```

Expected: lista completa dos blocos legados que os componentes novos não usam.

- [ ] **Step 2: Confirmar que nenhum seletor legado permanece no JSX**

Run:

```bash
rg -n "habitos-area-chips|habit-area-section|habit-btn-|habitos-analysis-btn|premium-score-card" apps/web/src --glob '!styles.css'
```

Expected: nenhum resultado. Se houver resultado, migrar aquele elemento antes de apagar CSS.

- [ ] **Step 3: Remover somente blocos órfãos**

Usar `apply_patch` para excluir os blocos exatos encontrados no Step 1. Não executar formatador ou rewrite global em `styles.css`.

- [ ] **Step 4: Fechar breakpoints aprovados**

Em `habits.css` e `layout-navigation.css`, garantir:

```css
@media (max-width: 1024px) { /* conteúdo compacto; sidebar pode recolher */ }
@media (max-width: 720px) { /* bottom nav, FAB, ações em segunda linha */ }
@media (prefers-reduced-motion: reduce) { * { transition-duration: .01ms !important; } }
```

Botões isolados e itens da bottom nav devem ter área de toque mínima equivalente a 44 px. Reservar `padding-bottom` para nav + Capturar.

- [ ] **Step 5: Rodar toda a suíte web**

Run: `npm --workspace @execution-os/web test && npm --workspace @execution-os/web run typecheck && npm --workspace @execution-os/web run build`

Expected: todos os testes PASS, typecheck limpo e build concluído.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles.css apps/web/src/features/habits/habits.css apps/web/src/components/layout-navigation.css
git commit -m "refactor(web): remove legacy habit and sidebar styles"
```

---

### Task 10: Verificação integrada em navegador

**Files:**
- Modify only if verification exposes a defect in a file already listed above.

- [ ] **Step 1: Rodar suíte completa**

Run:

```bash
npm test --workspaces
npm run typecheck
npm run build
```

Expected: API e web PASS; todos os workspaces tipam e constroem.

- [ ] **Step 2: Subir demo local**

Run:

```bash
VITE_DEMO_MODE=true VITE_API_URL=http://localhost:3000 npm --workspace @execution-os/web run dev -- --host 127.0.0.1 --port 4174
```

Expected: URL local servida; se 4174 estiver ocupada pelo processo atual, reutilizar esse processo ou encerrar apenas a sessão conhecida antes de reiniciar.

- [ ] **Step 3: Verificar desktop amplo e estreito**

No navegador interno, validar `/habitos` e `/habitos/evolucao` em 1440, 1280, 1024:

- sidebar 210/62 px, recolhimento persistido e tooltips;
- grupos e Dashboard apontando para `/dashboard`;
- Para hoje/Outros e três tipos de linha;
- valor exato não soma ao existente;
- Evolução abaixo do ritual e rota própria;
- nenhum conteúdo cortado ou scroll horizontal.

- [ ] **Step 4: Verificar mobile**

Em 390 e 360 px:

- cinco destinos visíveis e Hábitos ativo;
- Mais contém Projetos, Frentes, Notas, Dashboard e Configurações;
- Capturar não cobre ações;
- quantitativo quebra de linha sem overflow;
- toast Desfazer acessível;
- heatmap legível/tocável;
- criação/edição continuam utilizáveis.

- [ ] **Step 5: Verificar teclado, foco e console**

Percorrer sidebar, lista, editor, tabs e sheet com Tab/Shift+Tab/Escape. Confirmar `aria-current`, labels de botões apenas com ícone e console sem erros.

- [ ] **Step 6: Corrigir somente defeitos observados e repetir comandos afetados**

Para cada correção, adicionar teste de regressão no arquivo de teste correspondente antes do patch.

- [ ] **Step 7: Commit final de hardening, se necessário**

```bash
git add apps/api/src/routes/habits.ts apps/api/src/routes/habits.test.ts apps/api/src/services/habit-service.ts apps/api/src/services/habit-schedule.ts apps/api/src/services/habit-schedule.test.ts apps/api/src/services/habit-evolution-service.ts apps/api/src/services/habit-evolution-service.test.ts apps/web/src/App.tsx apps/web/src/api.ts apps/web/src/api.test.ts apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx apps/web/src/components/layout-navigation.ts apps/web/src/components/layout-navigation.css apps/web/src/demo/mock-fetch.ts apps/web/src/features/habits apps/web/src/pages/habitos.tsx apps/web/src/pages/habitos.test.tsx apps/web/src/pages/habit-evolution.tsx apps/web/src/styles.css
git commit -m "fix(web): harden habits and navigation responsiveness"
```

Se nenhum defeito for encontrado, não criar commit vazio.

---

## Critério de encerramento

O bloco só está concluído quando:

- todos os critérios da especificação `docs/superpowers/specs/2026-08-06-habitos-sidebar-design.md` estão cobertos por uma tarefa acima;
- API, web, typecheck e build passam;
- desktop 1440/1280/1024 e mobile 390/360 foram inspecionados;
- não há erros no console;
- apenas arquivos do escopo estão nos commits;
- o usuário recebe a URL local para revisão fina depois da implementação completa.
