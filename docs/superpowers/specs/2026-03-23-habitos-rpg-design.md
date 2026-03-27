# Hábitos RPG — Design Spec
**Data:** 2026-03-23
**Status:** Aprovado para implementação (v2 — pós spec review)

---

## Visão geral

Página `/habitos` — sistema de rastreamento de hábitos com progressão RPG por áreas da vida. Completamente separado da gamificação de tarefas existente. O usuário rastreia hábitos bons, metas quantitativas, frequências e vícios, ganhando XP permanente e subindo de nível em 6 áreas da vida.

---

## Decisões de produto

| Decisão | Escolha |
|---------|---------|
| Paradigma visual | RPG radar + check-in diário combinados |
| Score | Sistema RPG separado (XP + níveis permanentes por área) |
| Vícios | Streak automático de dias limpos + botão "Recaí" |
| Frequência | Diário / semanal / mensal / dias específicos |
| Semana começa em | Segunda-feira (alinhado com o restante do app) |
| WhatsApp | Integração completa (logging LLM + lembrete noturno + celebrações) |

---

## Tipos de hábito

| Tipo | Exemplo | Como registra | Como completa |
|------|---------|---------------|---------------|
| `binary` | Exercício, meditação | Botão ✓ | 1 toque → value=1 |
| `quantitative` | 50 páginas/dia, 8 copos | Input numérico, acumula no dia | value acumulado ≥ dailyTarget |
| `vice` | Sem redes após 22h | Assumido limpo; "Recaí" → value=-1 | Cada dia sem value=-1 |

**Semântica de `value` em `HabitLog`:**
- `binary`: 1 = feito (único log por dia, upsert)
- `quantitative`: valor acumulado do dia — cada `POST /log` soma ao valor existente via upsert (`value = existing + new`)
- `vice`: ausência de log = limpo; log com `value = -1` = recaída

---

## Frequências e `frequencyTarget`

| `frequencyType` | `frequencyTarget` | Significado |
|-----------------|-------------------|-------------|
| `daily` | sempre 1 | Uma vez por dia |
| `weekly` | N (ex: 4) | N vezes na semana corrente (seg–dom) |
| `monthly` | N (ex: 5) | N vezes no mês corrente |
| `specific_days` | ignorado | Aparece apenas nos dias da semana configurados em `specificDays` |

Para hábitos com `specific_days`: o hábito aparece na tela somente quando o `date` selecionado corresponde a um dos dias configurados. Ao navegar para um dia sem o hábito, ele simplesmente não é exibido.

---

## Áreas da vida (6)

| Área | Enum | Exemplos |
|------|------|---------|
| 💪 Corpo | `corpo` | Exercício, sono, água, alimentação |
| 🧠 Mente | `mente` | Leitura, meditação, estudo |
| 💼 Trabalho | `trabalho` | Deep work, aprendizado técnico |
| ❤️ Relações | `relacoes` | Família, amigos, presença |
| 💰 Finanças | `financas` | Poupança, gastos, investimento |
| 🌱 Crescimento | `crescimento` | Espiritualidade, criatividade, propósito |

---

## Modelo de dados

### Novos modelos Prisma

```prisma
model Habit {
  id              String         @id @default(uuid())
  title           String
  lifeArea        HabitLifeArea
  type            HabitType
  icon            String?
  color           String?

  // Frequência
  frequencyType   HabitFrequency
  frequencyTarget Int            @default(1)
  specificDays    RecurrenceDay[]

  // Quantitativo
  unit            String?        // "páginas", "copos", "km", "livros"
  dailyTarget     Float?         // meta: só usado quando type=quantitative

  // XP
  xpPerCompletion Int            @default(10)

  status          HabitStatus    @default(ativo)
  sortOrder       Int            @default(0)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  logs            HabitLog[]
  xpEvents        HabitXPEvent[]

  @@map("habits")
}

model HabitLog {
  id        String   @id @default(uuid())
  habitId   String
  date      String   // YYYY-MM-DD timezone local
  value     Float    @default(1)
  // binary: 1=feito | quantitative: acumulado do dia | vice: -1=recaída
  note      String?
  createdAt DateTime @default(now())
  habit     Habit    @relation(fields: [habitId], references: [id], onDelete: Cascade)

  @@unique([habitId, date])
  @@index([habitId, date])
  @@map("habit_logs")
}

model HabitXPEvent {
  id        String        @id @default(uuid())
  habitId   String
  lifeArea  HabitLifeArea
  xp        Int
  reason    String        // "completion" | "streak_7" | "streak_30" | "streak_100" | "vice_clean_day"
  date      String        // YYYY-MM-DD
  notified  Boolean       @default(false) // para o trigger de celebração do WhatsApp
  createdAt DateTime      @default(now())
  habit     Habit         @relation(fields: [habitId], references: [id], onDelete: Cascade)

  @@index([habitId])
  @@index([lifeArea])
  @@index([date])
  @@index([notified])
  @@map("habit_xp_events")
}

enum HabitType      { binary quantitative vice }
enum HabitLifeArea  { corpo mente trabalho relacoes financas crescimento }
enum HabitFrequency { daily weekly monthly specific_days }
enum HabitStatus    { ativo pausado arquivado }
```

**Reutiliza:** enum `RecurrenceDay` existente (seg/ter/qua/qui/sex/sab/dom).

---

## API Routes

Arquivo: `apps/api/src/routes/habits.ts`

### CRUD de hábitos

```
GET    /habits                   lista todos (filtros: lifeArea, status)
POST   /habits                   criar
PATCH  /habits/:id               editar
DELETE /habits/:id               arquivar (soft, status→arquivado) | deletar (?hard=true)
```

**Hard delete:** destrói todos os logs e XP events em cascata (via `onDelete: Cascade`). Responde `400` se o hábito tiver `xpEvents.length > 0` — o frontend deve avisar: "Isso apagará todo o histórico e XP desta área. Confirme." Somente com `?hard=true&confirm=true` o delete é executado.

**Erros padrão:**
- `404` quando hábito/log não existe
- `409` em conflito de unicidade
- `400` em validação de schema

### Logs (check-in)

```
GET    /habits/logs?date=        todos os logs de uma data + estado de cada hábito
POST   /habits/:id/log           { date, value, note? }
DELETE /habits/:id/log/:date     desfazer log do dia
POST   /habits/:id/recaiu        { date } — vice: cria/atualiza log com value=-1, não gera XP
```

**`POST /habits/:id/log` — semântica de upsert:**
- `binary`: upsert com `value=1` (idempotente)
- `quantitative`: upsert somando — `new value = (existing value ?? 0) + body.value`; retorna o valor acumulado atual
- `vice`: retorna `400` ("use POST /recaiu para registrar recaída")

**`POST /habits/:id/recaiu`:**
- Cria ou atualiza `HabitLog` para a data com `value=-1`
- Não cria `HabitXPEvent`
- Retorna o streak anterior (dias limpos perdidos) para exibir no frontend

**`DELETE /habits/:id/log/:date`:**
- Retorna `404` se o log não existe
- Para `vice`: deletar o log significa restaurar o dia como "limpo" (não recaído)

### Stats

```
GET    /habits/stats/today       hábitos do dia + log atual + streak
GET    /habits/stats/radar       XP acumulado + nível por área (alimenta hexágono E lista de XP)
GET    /habits/stats/heatmap/:id 365 dias de logs de 1 hábito
GET    /habits/stats/trends      tendência por área nos últimos N dias (?days=30)
```

> `radar` e `xp` foram unificados em `/stats/radar` — retorna XP total, nível, nome do nível e % de progresso até o próximo nível para cada uma das 6 áreas. É o único endpoint necessário para o hexágono e para o card de XP.

### Lógica de streak (calculada on-the-fly no service)

Para `binary` e `quantitative`: conta dias consecutivos (sem gaps) com `value > 0` voltando a partir de `date`.
Para `vice`: conta dias consecutivos sem log com `value = -1` voltando a partir de `date`.

A streak **não é armazenada** — é calculada a partir dos logs.

### Lógica de XP (service: `HabitService.processXP`)

Chamada após cada `POST /habits/:id/log` bem-sucedido. Sequência:

1. Soma XP base: `+xpPerCompletion` → cria `HabitXPEvent` com `reason="completion"`
2. Calcula streak atual
3. Para cada milestone (7, 30, 100): verifica se já existe `HabitXPEvent` com `reason="streak_N"` para este `habitId` **com a mesma contagem de streak** (usa `date` do evento + contagem de logs como deduplicação). Se não existir, cria o bônus.
4. **Vice:** XP de dias limpos é calculado pelo job noturno (ver abaixo), não no log de recaída.

### Job noturno de XP para vícios

Executado às 23h pelo `WhatsappAutoDispatchService` (já tem cron interno). Para cada hábito `type=vice` com `status=ativo`: se não houver log com `value=-1` para a data de hoje, cria `HabitXPEvent(reason="vice_clean_day", xp=5)`.

---

## Sistema de XP e Níveis

### Tabela de níveis

| Nível | XP total | Nome |
|-------|----------|------|
| 1 | 0 | Iniciante |
| 2 | 100 | Consistente |
| 3 | 300 | Disciplinado |
| 4 | 600 | Focado |
| 5 | 1.000 | Resiliente |
| 6 | 1.500 | Avançado |
| 7 | 2.200 | Expert |
| 8 | 3.000 | Mestre |
| 9 | 4.000 | Elite |
| 10 | 5.500 | Lendário |

### XP por ação

| Ação | XP | Deduplicação |
|------|-----|-------------|
| Completar hábito (binary/quant) | +10 | 1x por dia por hábito |
| Streak 7 dias | +25 bônus | 1x por sequência contínua |
| Streak 30 dias | +100 bônus | 1x por sequência contínua |
| Streak 100 dias | +500 bônus | 1x por sequência contínua |
| Vice: dia limpo | +5 | 1x por dia por hábito (job noturno) |

Níveis são **permanentes** — XP nunca decresce. Hard delete de hábito remove o XP da área permanentemente (usuário é avisado).

---

## Frontend — Estrutura da página

**Rota:** `/habitos`
**Nav item:** ícone `Target` (Lucide), label "Hábitos"
**Arquivo:** `apps/web/src/pages/habitos.tsx`

### Layout

```
PremiumHeader: "Hábitos"              [+ Novo hábito]
Date nav: ← Ontem  Hoje  Amanhã →

──── RADAR RPG ──────────────────────────────────────
HabitRadarCard:
  SVG hexágono (6 eixos, escala 0–10)
  Nível médio do personagem + XP total da semana
  Legenda: cada área com cor e nível atual

──── HOJE ───────────────────────────────────────────
Empty state se nenhum hábito configurado:
  "Nenhum hábito ainda. Crie o primeiro."

Por área (só áreas com hábitos ativos para a data):
  [AreaCard: 💪 Corpo]
    HabitRow binary:  ○/✓  Título  🔥N dias  [Feito]
    HabitRow quant:   barra  valor/meta  [+unit]  [digitar]
    HabitRow vice:    N dias limpos  [Recaí]
  [AreaCard: 🧠 Mente] ...

──── ANÁLISE ▾ ──────────────────────────────────────
Toggle manual, colapsado por padrão
Tabs: Semana | Mês | 90 dias
  HabitHeatmap (hábito selecionado — grid CSS 53×7)
  AreaTrendChart (barras por área — Recharts)
```

### Componentes novos

| Componente | Responsabilidade |
|-----------|-----------------|
| `HabitRadarCard` | SVG hexágono RPG 6 eixos, animado |
| `HabitAreaCard` | Agrupa HabitRows por área com header colorido |
| `HabitRow` | Check-in adaptativo por tipo (binary/quant/vice) |
| `HabitHeatmap` | Grid anual 53×7 estilo GitHub |
| `HabitCreateModal` | Formulário adaptativo: campos mudam por tipo e frequência |
| `AreaTrendChart` | Recharts BarChart — tendência semanal por área |

### Reutiliza componentes existentes

`PremiumCard`, `PremiumHeader`, `EmptyState`, `TabSwitch`, `SkeletonBlock`

---

## WhatsApp — Integração completa

### Novos intents no LLM service

```typescript
| { action: 'log_habit'; titleHint: string; value?: number; unit?: string }
| { action: 'vice_recaiu'; titleHint: string; date?: string }
| { action: 'list_habits'; date?: string }
```

### Matching de `titleHint`

O `WhatsappCommandService.findHabitByHint(titleHint)` usa:
1. Busca case-insensitive por substring exata no título
2. Se zero resultados: normaliza (remove acentos) e tenta novamente
3. Se ainda zero: retorna `null` → bot responde "Não encontrei nenhum hábito com esse nome. Seus hábitos: [lista]"
4. Se múltiplos: retorna o de maior score de similaridade (Levenshtein simples)

### Exemplos de mensagens

```
"fiz exercício hoje"         → log_habit { titleHint: "exercício" }
"li 45 páginas"              → log_habit { titleHint: "leitura", value: 45, unit: "páginas" }
"bebi 6 copos de água"       → log_habit { titleHint: "água", value: 6 }
"terminei mais um livro"     → log_habit { titleHint: "livros", value: 1 }
"recaí no vício de redes"    → vice_recaiu { titleHint: "redes" }
"meus hábitos de hoje"       → list_habits
```

### Trigger 8 — Lembrete noturno (21h)

Só dispara se houver hábitos `status=ativo` com check-in incompleto para o dia.

```
🌙 Hábitos de hoje (3 de 5):
✓ Exercício · ✓ Meditação
○ Leitura (0/50 pág) · ○ Água (3/8) · ○ Sono
Ainda dá tempo de fechar o dia forte!
```

### Trigger 9 — Celebração de streak

O proactivity engine, a cada tick, consulta:
```sql
SELECT * FROM habit_xp_events
WHERE reason IN ('streak_7','streak_30','streak_100')
  AND notified = false
ORDER BY created_at ASC
LIMIT 1
```
Se encontrar, envia celebração e marca `notified=true`. Max 1 celebração por tick. Cooldown global: 6h.

```
🔥 30 dias seguidos de exercício! +100 XP em Corpo.
Você subiu para Nível 4 — Focado! 💪
```

---

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `apps/api/prisma/schema.prisma` | +3 modelos, +4 enums, @@map em todos |
| `apps/api/src/routes/habits.ts` | **novo** — todas as rotas |
| `apps/api/src/services/habit-service.ts` | **novo** — streak, XP, stats, matchByHint |
| `apps/api/src/app.ts` | registrar rotas de hábitos |
| `apps/web/src/api.ts` | tipos Habit, HabitLog, HabitXPEvent + funções |
| `apps/web/src/App.tsx` | rota `/habitos` |
| `apps/web/src/components/layout.tsx` | nav item Hábitos com ícone Target |
| `apps/web/src/pages/habitos.tsx` | **novo** — página completa |
| `apps/web/src/styles.css` | radar SVG, heatmap grid, habit rows |
| `apps/api/src/services/whatsapp-llm-service.ts` | +3 intents, exemplos no system prompt |
| `apps/api/src/services/whatsapp-conversation-service.ts` | handlers log_habit, vice_recaiu, list_habits |
| `apps/api/src/services/whatsapp-command-service.ts` | findHabitByHint(), buildHabitsForLLM() |
| `apps/api/src/services/whatsapp-proactivity-engine.ts` | triggers 8 e 9 |
| `apps/api/src/services/whatsapp-auto-dispatch-service.ts` | job noturno XP vícios (23h) |

---

## Verificação final

1. Criar hábito binary → aparece no check-in, 1 toque marca feito, streak incrementa
2. Criar hábito quantitativo → barra de progresso, logs acumulam no dia, meta detectada
3. Criar vício → streak de dias limpos exibido, "Recaí" zera e cria log value=-1
4. Frequência semanal (4x) → mostra "2 de 4 feitas esta semana"
5. Dias específicos (seg/qua/sex) → hábito não aparece em dias não configurados
6. Completar 7 hábitos seguidos → +25 XP bônus criado UMA vez, radar atualiza
7. Bônus de streak não é duplicado ao deletar/re-logar o mesmo dia
8. Radar RPG → hexágono reflete nível real de cada área via `/stats/radar`
9. Hard delete com XP → retorna 400 sem `?confirm=true`, avisa perda de XP
10. WhatsApp "fiz exercício" → log registrado, confirmação com streak atual enviada
11. WhatsApp hint sem match → lista hábitos disponíveis no retorno
12. 21h com hábitos incompletos → bot envia lembrete (Trigger 8)
13. Streak 30 dias → celebração enviada UMA vez via campo `notified`
14. Job noturno 23h → XP de vice_clean_day criado para vícios sem recaída
15. `npx tsc --noEmit` → zero erros
