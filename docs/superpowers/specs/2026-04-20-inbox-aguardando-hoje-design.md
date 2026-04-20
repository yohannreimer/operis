# Inbox: Grupo Aguardando + Modo Hoje

**Data:** 2026-04-20
**Status:** Aprovado para implementação
**Contexto:** Melhorias no Inbox Operacional para reduzir ruído visual e adicionar planejamento diário inline.

---

## 1. Visão Geral

Duas features independentes que resolvem o problema de acúmulo de pendências no Inbox:

1. **Grupo "Aguardando"** — itens com status `aguardando` saem dos seus grupos originais e agrupam num grupo virtual no final da lista, sempre colapsado por padrão.
2. **Modo Hoje** — painel lateral esquerdo ativado por FAB flutuante, onde o usuário arrasta tarefas do inbox pra compor o plano do dia. Persiste até meia-noite e reseta automaticamente.

As features são independentes e podem ser implementadas e deployadas separadamente. Recomenda-se implementar nessa ordem.

---

## 2. Feature 1 — Grupo "Aguardando"

### Comportamento

- Todos os itens com `status === 'aguardando'` são extraídos dos seus grupos originais durante o agrupamento no frontend.
- São colocados num grupo virtual chamado **"Aguardando"** que sempre renderiza por último na lista, após todos os outros grupos.
- O grupo nasce **colapsado** por padrão. O estado de colapso é salvo no localStorage junto com os demais grupos (chave `inbox.groupOrder`).
- Quando o cron existente (`inbox-watcher-service.ts`, hourly) converte o item de volta pra `pendente`, ele desaparece automaticamente do grupo Aguardando e reaparece no grupo original — sem ação adicional, pois `workspaceId`/`inboxContextId` nunca foram alterados.

### Mudanças no codebase

**Sem mudanças no backend.** Apenas frontend:

| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/pages/inbox.tsx` | Filtrar itens `aguardando` antes de agrupar; criar grupo virtual no final |
| `apps/web/src/components/inbox-group.tsx` | Suporte a grupo "Aguardando" com ícone `⏳`, sempre por último, sem opção de reordenar |

### Lógica de agrupamento (pseudocódigo)

```
// Antes de criar os grupos normais:
const aguardandoItems = items.filter(i => i.status === 'aguardando')
const activeItems = items.filter(i => i.status !== 'aguardando')

// Criar grupos normais apenas com activeItems
const groups = buildGroups(activeItems)

// Adicionar grupo virtual Aguardando no final (se não vazio)
if (aguardandoItems.length > 0) {
  groups.push({
    id: '__aguardando__',
    label: 'Aguardando',
    icon: '⏳',
    items: aguardandoItems,
    isVirtual: true,        // não pode ser reordenado
    defaultCollapsed: true,
  })
}
```

### UI/UX

- Header do grupo: ícone `⏳`, label "Aguardando", contador de itens, chevron de colapso.
- Sem botões de reordenar (↑↓) — grupo sempre fica por último.
- Sem botão de adicionar `+` — itens entram via ação nos outros grupos.
- Estilo do header levemente diferenciado (cor neutra/muted) pra não competir com grupos ativos.
- Dentro do grupo, cada item mostra o badge existente `⏳ data · pessoa` e as ações normais.

---

## 3. Feature 2 — Modo Hoje

### Comportamento

- FAB flutuante no canto inferior direito ativa/desativa o modo.
- Quando ativo: o layout do inbox divide em dois painéis lado a lado (esquerda/direita).
  - **Esquerda (40%):** `TodayPanel` — lista de itens do dia atual.
  - **Direita (60%):** Inbox normal existente.
- O usuário arrasta itens do painel direito pra esquerda para compor o plano do dia.
- Pode reordenar itens dentro do `TodayPanel` por drag-and-drop.
- Pode arrastar de volta pro inbox (remove do Hoje).
- Marcar um item como feito dentro do Hoje: risca visualmente, move pra seção "Feitos" colapsável.
- Itens nunca saem do inbox enquanto estão no Hoje — são uma referência, não uma movimentação.
- **Reset a meia-noite** (timezone do usuário, já configurado no app):
  - Itens com `completedAt` preenchido: `InboxItem.status` setado pra `feito`.
  - Itens sem `completedAt`: retornam ao inbox intactos (o `InboxItem` nunca foi alterado).
  - Todos os registros `InboxTodayItem` do dia anterior são deletados.

### Data Model

```prisma
model InboxTodayItem {
  id          String    @id @default(uuid())
  clerkUserId String
  inboxItemId String
  todayDate   String    // "YYYY-MM-DD" no timezone do usuário
  position    Int
  completedAt DateTime? // null = pendente, preenchido = feito no Hoje

  createdAt   DateTime  @default(now())

  inboxItem   InboxItem @relation(fields: [inboxItemId], references: [id], onDelete: Cascade)

  @@unique([clerkUserId, inboxItemId, todayDate])
  @@index([clerkUserId, todayDate])
}
```

`todayDate` como `String YYYY-MM-DD` — evita ambiguidade de timezone. O frontend manda a data local usando o mesmo `utcOffset` já utilizado no filtro do `GET /inbox`.

### API Endpoints

Todos em `/inbox/today`, autenticados via Clerk middleware existente.

| Método | Rota | Params/Body | Retorno |
|--------|------|-------------|---------|
| `GET` | `/inbox/today` | `?todayDate=YYYY-MM-DD` | Array de `InboxTodayItem` com `inboxItem` joinado |
| `POST` | `/inbox/today` | `{inboxItemId, todayDate, position}` | `InboxTodayItem` criado |
| `DELETE` | `/inbox/today/:id` | — | `204 No Content` |
| `PATCH` | `/inbox/today/:id` | `{position?, completedAt?}` | `InboxTodayItem` atualizado |

### Worker — Reset diário

`inbox-watcher-service.ts` ganha uma segunda função `resetTodayItems()`:

```
Horário: 00:01 no timezone do usuário (ou simplificado: job rodando a cada hora que verifica se todayDate < hoje)
Ação:
  1. Buscar todos InboxTodayItem onde todayDate < hoje
  2. Para cada item com completedAt preenchido: PATCH InboxItem.status = 'feito'
  3. Deletar todos os InboxTodayItem encontrados
```

### Componentes Frontend

| Componente | Responsabilidade |
|------------|-----------------|
| `TodayFAB.tsx` | Botão flutuante fixo, animação de ativação, estado ativo/inativo |
| `TodayPanel.tsx` | Painel esquerdo: lista de itens do dia, seção Feitos colapsável, droppable zone |
| `TodayItem.tsx` | Item individual dentro do painel: checkbox, label, drag handle |

**Biblioteca drag-and-drop:** `@dnd-kit/core` + `@dnd-kit/sortable` — mais moderna, melhor suporte a acessibilidade, sem deps pesadas.

### Layout Split

```
// inbox.tsx — quando todayMode === true
<div className="flex h-full gap-4">
  <TodayPanel className="w-[40%]" />
  <div className="w-[60%] overflow-y-auto">
    {/* inbox existente, sem alterações estruturais */}
  </div>
</div>
```

A transição entre single-column e split usa `transition-all` com `duration-300` para suavidade.

### UI/UX — TodayPanel

**Estado vazio:** área de drop com borda tracejada e texto muted "Arraste tarefas aqui para planejar seu dia".

**Item no Hoje:**
- Checkbox à esquerda
- Texto do item
- Drag handle (⠿) à direita, visível só no hover
- Ao marcar: `line-through`, opacidade reduzida, animação pra seção Feitos

**Seção Feitos:**
- Header "✓ Feitos (n)" colapsável
- Items riscados com opacidade 50%
- Clicar no checkbox desmarca (remove `completedAt`)

**TodayFAB:**
- Estado inativo: ícone sol/hoje, `opacity-40`, `scale-100`
- Hover: `opacity-100`, `scale-105`, `shadow-lg`, transição 200ms
- Estado ativo (Modo Hoje ligado): ícone `×`, cor de destaque (primary), sem opacity reduction
- Tooltip "Modo Hoje" no hover

---

## 4. Ordem de Implementação

1. **Prisma migration** — adicionar `InboxTodayItem` ao schema
2. **API** — novos endpoints em `/inbox/today`
3. **Worker** — função `resetTodayItems()` no `inbox-watcher-service.ts`
4. **Frontend — Grupo Aguardando** — modificar lógica de grouping em `inbox.tsx`
5. **Frontend — TodayFAB** — componente isolado, sem deps externas
6. **Frontend — TodayPanel + dnd-kit** — painel + drag-and-drop
7. **Frontend — integração split layout** — wiring em `inbox.tsx`

---

## 5. O que NÃO está no escopo

- Notificações push quando item de Aguardando volta ao pendente
- Modo Hoje no mobile (apenas desktop)
- Arrastar itens entre grupos no inbox (fora do Hoje)
- Histórico de dias anteriores do Modo Hoje
