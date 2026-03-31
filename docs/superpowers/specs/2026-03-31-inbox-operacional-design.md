# Inbox Operacional — Design Spec

**Data:** 2026-03-31
**Status:** Aprovado

---

## Visão Geral

Criar uma nova aba dedicada **Inbox Operacional** no Operis — o ponto de entrada do sistema, onde o usuário despeja tudo que está na cabeça com zero fricção, resolve coisas rápidas e decide o que vale virar tarefa estruturada.

A Inbox NÃO substitui Tarefas. Ela é a camada leve que alimenta a camada estruturada.

O painel de inbox existente dentro de `/tarefas` será **removido**. A rota `/inbox` deixa de redirecionar para `/tarefas` e passa a ser a página dedicada.

---

## Arquitetura de Dados

### Modelo `InboxItem` (substitui o modelo atual)

```prisma
model InboxItem {
  id          String          @id @default(uuid())
  clerkUserId String          @map("clerk_user_id")
  content     String
  source      InboxSource     @default(app)      // app | whatsapp
  status      InboxItemStatus @default(pendente)

  // Contexto — mutuamente exclusivos (frente existente OU contexto próprio da inbox)
  workspaceId    String?  @map("workspace_id")
  inboxContextId String?  @map("inbox_context_id")

  // Ordem dentro do contexto (drag & drop)
  position    Int      @default(0)

  // Estado: aguardando
  waitingDate   DateTime? @map("waiting_date")
  waitingPerson String?   @map("waiting_person")
  waitingNote   String?   @map("waiting_note")

  // Estado: agenda
  scheduledAt DateTime? @map("scheduled_at")

  // Rastreabilidade
  convertedTaskId String? @map("converted_task_id")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workspace    Workspace?    @relation(fields: [workspaceId], references: [id])
  inboxContext InboxContext?  @relation(fields: [inboxContextId], references: [id])

  @@index([clerkUserId, status])
  @@map("inbox_items")
}

enum InboxItemStatus {
  pendente
  feito
  convertido
  agenda
  aguardando
}

model InboxContext {
  id          String   @id @default(uuid())
  clerkUserId String   @map("clerk_user_id")
  name        String
  position    Int      @default(0)
  createdAt   DateTime @default(now())

  items InboxItem[]

  @@map("inbox_contexts")
}
```

### Migração dos dados existentes

Itens atuais mantêm `source`, recebem `status: pendente`, e ficam com `workspaceId` e `inboxContextId` nulos (aparecem no grupo "Sem contexto").

O campo `processed: Boolean` é removido — substituído por `status`.

---

## Ciclo de Vida de um Item

```
pendente → feito          (checkbox marcado — item riscado, vai para o final da lista)
pendente → convertido     (abriu modal de tarefa e criou — exibe badge "→ Tarefa")
pendente → agenda         (executar hoje → agora ou horário agendado)
pendente → aguardando     (definiu data de lembrete — exibe badge "⏳ data")
aguardando → pendente     (data chegou — item volta automaticamente para pendente)
```

---

## Backend — API

Todos os endpoints abaixo ficam sob o prefixo `/inbox`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/inbox` | Lista itens + InboxContexts. Query params: `filter` (hoje/ontem/semana/tudo), `mode` (agrupado/bruto) |
| POST | `/inbox` | Cria item. Body: `{ content, workspaceId?, inboxContextId? }` |
| PATCH | `/inbox/:id` | Atualiza conteúdo, status, contexto, posição, campos de waiting |
| DELETE | `/inbox/:id` | Remove item |
| POST | `/inbox/:id/convert` | Cria tarefa estruturada a partir do item. Retorna a tarefa criada. |
| POST | `/inbox/:id/schedule` | Aloca na agenda. Body: `{ mode: 'now' \| 'scheduled', scheduledAt?: ISO }` |
| GET | `/inbox/contexts` | Lista InboxContexts do usuário |
| POST | `/inbox/contexts` | Cria InboxContext. Body: `{ name }` |
| PATCH | `/inbox/contexts/:id` | Renomeia ou reordena |
| DELETE | `/inbox/contexts/:id` | Remove contexto. Itens ficam com `inboxContextId: null` |

### Filtro temporal (GET `/inbox?filter=hoje`)

- `hoje` — itens criados hoje (pendentes + resolvidos do dia)
- `ontem` — itens criados ontem
- `semana` — itens criados nos últimos 7 dias
- `tudo` — todos os itens sem restrição de data

### Lembrete de "aguardando"

Um worker/cron verifica diariamente itens com `status: 'aguardando'` cuja `waitingDate <= hoje` e reverte para `status: 'pendente'`, opcionalmente disparando uma notificação.

---

## Frontend — Estrutura

### Navegação

- Nova entrada no sidebar: **Inbox** (ícone: `Inbox` do lucide-react), posicionada entre `Hoje` e `Agenda`
- Rota: `/inbox`
- Redirect `/inbox` em `App.tsx` removido

### Layout da página

```
┌──────────────────────────────────────────────────────┐
│  Inbox Operacional          [Hoje ▾]  [Bruto ⊞]      │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐  │
│  │  Digite qualquer coisa...  @frente      [↵]    │  │
│  └────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│  Holand                                   [+ item]   │
│  ├ [ ] enviar proposta               ··· ações       │
│  └ [✓] ~~falar com cliente~~                         │
│                                                      │
│  Prymeira                                 [+ item]   │
│  └ [ ] ajustar vídeo                 ··· ações       │
│                                                      │
│  Sem contexto                                        │
│  └ [ ] ligar pro João                ··· ações       │
│                                                      │
│  [+ Novo contexto]                                   │
└──────────────────────────────────────────────────────┘
```

### Componentes novos

| Componente | Responsabilidade |
|---|---|
| `pages/inbox.tsx` | Página principal — estado, carregamento, filtros |
| `components/inbox-input.tsx` | Campo de captura com autocomplete `@` |
| `components/inbox-group.tsx` | Grupo de itens por contexto (frente ou InboxContext) |
| `components/inbox-item.tsx` | Item individual — checkbox, edição inline, menu de ações |
| `components/inbox-waiting-form.tsx` | Expand inline para configurar estado "aguardando" |
| `components/inbox-schedule-sheet.tsx` | Bottom sheet "Agora / Agendar hora" |

### Remoções

- Painel de inbox em `tarefas.tsx` (linhas ~2475–2592) — removido integralmente
- Redirect `/inbox → /tarefas` em `App.tsx` — removido
- Funções `processInboxItem`, `loadInboxItems` em `tarefas.tsx` — removidas

---

## UX — Fluxos Detalhados

### Captura rápida

1. Usuário digita no input principal
2. Ao digitar `@`, abre dropdown com frentes existentes + InboxContexts disponíveis (fuzzy search)
3. Seleciona contexto (teclado ou mouse) — contexto aparece como tag no input
4. Pressiona `Enter` → item criado instantaneamente no grupo correspondente
5. Input limpa e mantém foco para próxima captura

Sem `@`: item criado em "Sem contexto".

### Edição inline

- Clicar no texto do item → transforma em `<input>` focado
- `Enter` ou `Blur` → salva
- `Escape` → cancela

### Menu de ações (`···`)

Acessível por mouse (hover) ou teclado. Opções:
- Marcar como feito
- Editar
- Aguardando...
- Executar hoje
- Transformar em tarefa
- Mover para contexto →
- Deletar

### Executar hoje

1. Clica "Executar hoje" → bottom sheet com duas opções: **Agora** e **Agendar hora**
2. **Agora** → navega para deep work com o item como contexto; `status → agenda`, `scheduledAt → now()`
3. **Agendar hora** → time picker aparece → usuário seleciona horário → bloco criado na agenda; `status → agenda`, `scheduledAt → horário escolhido`

### Transformar em tarefa

1. Clica "Transformar em tarefa"
2. Abre o **modal de criação de tarefa existente** (reutilizado de `tarefas.tsx`)
3. Pré-preenchido com:
   - **Título** → `content` do item
   - **Frente** → `workspaceId` do item (se vinculado a uma frente)
4. Usuário completa projeto, prioridade, tipo, etc. e confirma
5. Tarefa criada → `status → convertido`, `convertedTaskId → id da tarefa criada`
6. Item exibe badge "→ Tarefa" com link para a tarefa

### Aguardando

1. Clica "Aguardando..." → expand inline abaixo do item (sem modal)
2. Campos: data de lembrete (obrigatório) · de quem (opcional) · nota (opcional)
3. Salva → `status → aguardando`, exibe badge "⏳ 15/abr"
4. Na data configurada: status reverte para `pendente` automaticamente

### Modo Bruto

- Toggle no header da página
- Remove agrupamentos, exibe todos os itens em ordem cronológica (mais recente primeiro)
- Ações disponíveis normalmente

### Filtro temporal

Dropdown no header: `Hoje` (padrão) · `Ontem` · `Semana` · `Tudo`

Comportamento: mostra itens pendentes + itens com status feito/convertido/agenda criados no período selecionado.

---

## Contextos — Regras

- Um item tem contexto de **frente** (`workspaceId`) **OU** contexto de inbox (`inboxContextId`) — nunca os dois
- Frentes são as Workspaces existentes do sistema — aparecem como opções no `@` mas não são criadas aqui
- InboxContexts são exclusivos da inbox — criados via `+ Novo contexto` ou automaticamente se o usuário digitar um nome não encontrado no `@` autocomplete
- Ao deletar um InboxContext, os itens ficam sem contexto (não são deletados)

---

## Itens do WhatsApp

Capturas vindas do WhatsApp (`source: 'whatsapp'`) aparecem na Inbox Operacional normalmente, com um badge visual `📱 WhatsApp`. O fluxo de ações é idêntico aos itens criados pelo app.

---

## O que NÃO está no escopo desta feature

- Kanban ou board visual
- Campos obrigatórios em qualquer fluxo
- Notificações push (lembrete de aguardando via UI apenas)
- Busca/pesquisa dentro da inbox (pode vir depois)
- Comentários ou anexos em itens
