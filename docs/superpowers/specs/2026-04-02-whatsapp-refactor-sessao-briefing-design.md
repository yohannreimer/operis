# WhatsApp Refactor — Sessão, Briefing e Novas Funcionalidades

**Data:** 2026-04-02
**Status:** Aprovado para implementação
**Contexto:** O bot do WhatsApp existe como extensão do Operis mas está com múltiplos bugs críticos e funcionalidades novas pendentes. Este documento cobre a refatoração da máquina de estados, correção de todos os bugs identificados, redesign do briefing matinal e adição do check-in noturno de hábitos.

---

## Visão

O WhatsApp é uma extensão de baixo atrito do Operis. O usuário já usa o app diariamente no celular — o bot permite consultar tarefas, capturar itens, marcar conclusões e acompanhar hábitos sem precisar abrir o computador. A interação funciona por texto livre, áudio ou menus numerados quando necessário.

---

## 1. Bugs Identificados e Correções

### Bug 1 — Parser de humor intercepta mensagens mesmo dentro de fluxos ativos

**Problema:** Em `handleInbound` (linha ~1762 de `whatsapp-conversation-service.ts`), `WhatsappBriefingService.parseHumorReply(text)` é chamado antes de checar o estado da sessão. Embora a sessão seja buscada logo acima, o branch de humor roda sem verificar se o estado atual é compatível. Isso faz com que qualquer mensagem "1", "2" ou "3" — mesmo enviada dentro de `open_tasks_list`, `focus_swap_slot`, `deep_menu` ou qualquer outro fluxo — seja interpretada como resposta de humor.

**Correção:** Remover completamente a chamada global de `parseHumorReply`. O conceito de "humor" some do bot — a pergunta de humor não faz mais parte do briefing redesenhado. A ramificação deve ser eliminada, não movida.

### Bug 2 — Briefing matinal não cria sessão

**Problema:** `WhatsappAutoDispatchService` envia o briefing sem chamar `setSession`. O bot não sabe que está aguardando resposta. Quando o usuário responde, cai no fallback "Não entendi essa mensagem" e exibe o menu.

**Correção:** Após enviar a última mensagem do briefing (foco sugerido), o dispatcher chama diretamente `prisma.whatsappConversationSession.upsert` (ou invoca um método público exposto pelo `WhatsappConversationService`) para criar sessão com state `awaiting_focus_confirmation`, payload `{ top3: TaskSummaryPayload[] }` e TTL de 60 minutos. Ver estrutura de payload na Seção 3.

### Bug 3 — Mensagens muito longas

**Problema:** O briefing concatena 5 blocos em uma única string. Respostas de menu concatenam conteúdo + menu completo. Pode ultrapassar o limite de 4096 caracteres do WhatsApp e é difícil de ler.

**Correção:** O tipo de retorno `CommandResult` em `whatsapp-command-service.ts` é atualizado para `reply: string | string[]`. O tipo `ConversationResult` no conversation service (hoje chamado `CommandResult` na interface pública) herda esse tipo. `webhooks.ts` itera o array e envia cada mensagem com delay de 300ms. O briefing passa a retornar `string[]` (ver Seção 3).

### Bug 4 — Deduplicação bloqueia respostas numéricas curtas

**Problema:** `INBOUND_SEMANTIC_DEDUP_TTL_MS = 10s` (definido em `webhooks.ts`) bloqueia mensagens idênticas. Respostas "1", "2", "3" enviadas em sequência dentro de 10 segundos são descartadas silenciosamente. O código atual já pula semantic dedup quando `externalMessageId` está presente — mas isso depende do provider enviar esse campo, o que não é garantido.

**Correção:** Adicionar segunda condição de bypass: não aplicar semantic dedup para mensagens com 3 caracteres ou menos, independentemente de `externalMessageId`. As duas condições de bypass coexistem.

### Bug 5 — Mensagens proativas não criam sessão

**Problema:** Mensagens proativas (deep work window, prazos, check de progresso) são enviadas por `WhatsappProactivityEngine` sem criar sessão. O usuário não consegue "continuar" o contexto daquela mensagem.

**Correção:** Após cada `publishEvent` de mensagem proativa no `WhatsappProactivityEngine`, chamar `setSessionPublic(phone, 'idle', { lastProactiveContext: triggerKey })` onde `triggerKey` identifica qual trigger disparou (ex: `'deepwork_window'`, `'overdue_alert'`). O LLM usará esse contexto ao processar a resposta seguinte.

`WhatsappConversationService` expõe um método público `setSessionPublic` que wraps o privado `setSession`.

### Bug 6 — Menus concatenados em respostas inflam mensagens

**Problema:** Opção 2 (tarefas) retorna tarefas + menu completo. Opção 4 retorna prazos + followups + menu. Mensagens longas e confusas.

**Correção:** Remover toda concatenação de `menuText()` ao final de respostas de conteúdo. O estado `menu` na sessão já garante que a próxima mensagem será processada como input do menu. O menu só é reenviado explicitamente quando: (a) o usuário digita *menu* ou *início*, ou (b) um fluxo guiado termina e a sessão volta para `menu`.

---

## 2. Redesign da Máquina de Estados

### Princípio central

**Sessão sempre primeiro.** Em `handleInbound`, nenhuma verificação global de padrões roda antes de checar o estado. A ordem de verificação é:

```
1. Texto vazio → retorna menu
2. Saudação (oi, olá, bom dia, menu, início) → setSession(idle) + retorna menu
3. Saída (sair, cancelar, voltar) → setSession(idle) + retorna confirmação
4. Buscar sessão ativa (getSession)
5. Rotear pelo estado da sessão:
   awaiting_focus_confirmation → processFocusConfirmation()
   habit_checkin               → processHabitCheckin()
   inbox_complete_pick         → processInboxCompletePick()
   menu                        → processMenuInput()
   focus_*                     → processFocusInput()
   deep_*                      → processDeepInput()
   open_tasks_*                → processOpenTasksInput()
   notes_*                     → processNotesInput()
   capture_inbox               → processCaptureInbox()
6. Estado idle ou sem sessão ativa:
   a. LLM intent extraction (se OPENAI_API_KEY configurado)
   b. inferNaturalCommand() — regex inference
   c. commandService.handle(text) — tentativa direta
   d. Fallback: "Não entendi" + menu
```

### `ConversationState` — tipo TypeScript atualizado

Adicionar os novos estados à union type:

```typescript
type ConversationState =
  | 'idle'
  | 'menu'
  | 'awaiting_focus_confirmation'  // NOVO
  | 'habit_checkin'                // NOVO
  | 'inbox_complete_pick'          // NOVO
  | 'capture_inbox'
  | 'focus_menu'
  | 'focus_swap_slot'
  | 'focus_swap_task'
  | 'focus_manual_ids'
  | 'deep_menu'
  | 'deep_start_waiting_task'
  | 'notes_menu'
  | 'notes_pick_folder'
  | 'notes_pick_note'
  | 'notes_create_quick'
  | 'open_tasks_list'
  | 'open_tasks_actions';
```

### Estados novos — sumário

| Estado | Criado quando | Espera | TTL |
|--------|--------------|--------|-----|
| `awaiting_focus_confirmation` | Após enviar briefing matinal | Resposta livre (texto ou áudio) sobre o foco | 60 min |
| `habit_checkin` | Após enviar check-in noturno ou comando manual | Números dos hábitos feitos (ex: "1 3") | 120 min |
| `inbox_complete_pick` | Após comando "fiz inbox" | Número do item inbox a completar | 45 min |

### Remoção

O parser global de humor (`WhatsappBriefingService.parseHumorReply`) é removido de `handleInbound`. A pergunta de humor não faz parte do briefing redesenhado.

### Conflito com Trigger 8 do ProactivityEngine

`WhatsappProactivityEngine` tem um Trigger 8 (`triggerHabitNightReminder`) que dispara às 21:00 e envia um resumo de hábitos. Este trigger **deve ser removido ou desativado** — o check-in noturno passa a ser responsabilidade exclusiva do `WhatsappAutoDispatchService` via `WHATSAPP_EVENING_TIME`, que cria a sessão `habit_checkin` corretamente.

---

## 3. Redesign do Briefing Matinal

### Estrutura de mensagens

`WhatsappBriefingService.buildIntelligentBriefing()` passa a retornar `string[]` em vez de `string`. O array tem 2 a 4 elementos dependendo dos dados do dia.

**Mensagem 1 — Leitura situacional** *(sempre enviada)*
- 2–3 linhas geradas por LLM (`gpt-4o-mini`) ou fallback estruturado
- Contexto: streak, taxa de execução 7d, compromissos do dia, janela de foco
- Exemplo: `"🔥 4 dias de streak. Hoje tem 3 compromissos — janela real: 3h. Vamos ser cirúrgicos."`

**Mensagem 2 — Compromissos do dia** *(somente se `ctx.todayCommitments.length > 0`)*
- Lista de compromissos com horário e duração
- Janelas livres calculadas por `computeFreeWindows()`
- Exemplo:
  ```
  📅 *Hoje:*
  • 09h00 — Reunião equipe (60min)
  • 14h00 — Call cliente (30min)

  ⏱ Janelas: 07h–09h (2h) · 10h–14h (4h)
  ```

**Mensagem 3 — Alerta informativo** *(somente se `ctx.overdueTasks.length > 0`)*
- Apenas 1 alerta (a tarefa mais atrasada), informativo sem pergunta
- Exemplo: `"⚠️ "Proposta B2B" atrasada 3 dias — lembre-se disso."`

**Mensagem 4 — Foco sugerido + 1 pergunta** *(sempre enviada)*
- Top 3 candidatos rankeados (filtrados conforme lógica existente de `buildTop3Block`)
- Uma única pergunta aberta ao final
- Esta mensagem dispara `setSession(phone, 'awaiting_focus_confirmation', payload, 60)` no dispatcher
- Exemplo:
  ```
  🎯 *Foco sugerido:*
  1. Proposta comercial B2B
  2. Revisar contrato fornecedor
  3. Responder emails pendentes

  Confirmar? Responda sim, troque ou mande áudio.
  ```

**Caso sem tarefas top3:** Se `ctx.top3Candidates` estiver vazio, a Mensagem 4 ainda é enviada com texto `"🎯 Nenhuma tarefa prioritária encontrada. O que você quer focar hoje?"` e sessão `awaiting_focus_confirmation` com `{ top3: [] }`. O handler processará a resposta via LLM sem contexto de tarefas pré-selecionadas, ou abrirá a lista completa se o usuário pedir.

### Payload da sessão `awaiting_focus_confirmation`

```typescript
type TaskSummaryPayload = {
  id: string;
  title: string;
  index: number; // 1, 2, 3
};

// Salvo em session.payload:
{ top3: TaskSummaryPayload[] }
```

### Handler `processFocusConfirmation(phoneNumber, session, text)`

Este é um novo método privado em `WhatsappConversationService`.

**Fluxo:**
1. Se `text` for áudio transcrito (detectado antes de chegar aqui — ver Seção 5 sobre áudio), usa o texto transcrito.
2. Envia ao LLM (`gpt-4o-mini`) o texto do usuário + o top3 do payload da sessão como contexto.
3. O LLM retorna uma das intenções:
   - `confirm_all` → confirma todas as tarefas do top3 como foco do dia (chama `commandService.handle('foco confirmar')`)
   - `confirm_subset: number[]` → confirma apenas os índices indicados como foco; as demais tarefas do top3 são ignoradas (não removidas do backlog, apenas não definidas como foco do dia). Ex: índices `[1,2]` → define as tarefas 1 e 2 como foco, tarefa 3 permanece no backlog sem alteração.
   - `replace_with_text: string` → o usuário mencionou uma tarefa diferente por nome. Handler busca via `prisma.task.findMany({ where: { title: { contains: text }, status: { in: ['hoje','andamento','backlog'] } } })`. Se retornar 0 resultados: responde `"Não encontrei nenhuma tarefa com esse nome. Aqui estão as sugestões originais:"` e reenvia o top3 sem mudar o estado. Se retornar 1 resultado: define essa tarefa como foco e confirma. Se retornar 2+: lista as opções numeradas e transita para `open_tasks_list` com as candidatas no payload.
   - `show_all_tasks` → usuário quer ver a lista completa; transita para `open_tasks_list` com todas as tarefas abertas
4. Após executar (exceto no caso de `replace_with_text` com resultado ambíguo, onde o estado muda para `open_tasks_list`), sessão volta para `idle`.
5. Resposta de confirmação: `"✅ Foco definido:\n1. [título]\n2. [título]"` reutilizando saída do `commandService.handle('foco confirmar')`.

**Prompt LLM para extração de intenção:**
```
Você é o assistente do Operis. O usuário recebeu estas sugestões de foco:
{top3 formatado como "1. Título\n2. Título..."}

O usuário respondeu: "{text}"

Classifique a intenção em JSON:
{ "action": "confirm_all" | "confirm_subset" | "replace_with_text" | "show_all_tasks",
  "indices": [1,2,3],   // para confirm_subset
  "text": "..." }       // para replace_with_text
```

---

## 4. Check-in Noturno de Hábitos

### Conflito resolvido

O Trigger 8 do `WhatsappProactivityEngine` (`triggerHabitNightReminder`) é **removido**. O check-in noturno passa a ser gerenciado inteiramente pelo `WhatsappAutoDispatchService`.

### Disparo automático

`WhatsappAutoDispatchService` ganha um segundo trigger diário disparado em `WHATSAPP_EVENING_TIME` (padrão `21:00`, usa o mesmo timezone de `WHATSAPP_TIMEZONE`).

Ao disparar:
1. Busca todos os hábitos ativos: `prisma.habit.findMany({ where: { status: 'ativo' } })`
2. Verifica quais já têm log de hoje: `prisma.habitLog.findMany({ where: { date: todayKey } })`
3. Monta lista numerada com status (☐ / ✅)
4. Publica a mensagem via `publishEvent`
5. Cria sessão `habit_checkin` com payload `{ habits: HabitCheckinPayload[], date: string }` e TTL 120 min

**Tipo do payload:**
```typescript
type HabitCheckinPayload = {
  index: number;    // 1-based
  id: string;
  title: string;
  alreadyDone: boolean;
};
```

**Formato da mensagem:**
```
🌙 *Fim de dia. Quais hábitos você fez hoje?*

1. ☐ Exercício
2. ✅ Meditação
3. ☐ Leitura
4. ☐ Sem açúcar

Responda com os números. Ex: *1 3*
Ou *todos* para marcar todos, *nenhum* para pular.
```

Se não há hábitos configurados, não dispara nada.

### Comando manual

Detecção em `inferNaturalCommand()` — adicionar condição:

```typescript
if (/(habitos?|check.habitos?|registrar.habitos?|fiz.habitos?)/.test(normalized)) {
  return '__open_habit_checkin__';
}
```

O sentinel `__open_habit_checkin__` em `handleInbound` busca hábitos, monta payload idêntico ao automático, e cria sessão `habit_checkin`.

### Handler `processHabitCheckin(phoneNumber, session, text)`

Novo método privado em `WhatsappConversationService`.

1. Lê `payload.habits` e `payload.date` da sessão.
2. Interpreta o texto:
   - `"todos"` → marca todos os hábitos onde `alreadyDone: false` no payload. Hábitos com `alreadyDone: true` são ignorados (não re-logados). O upsert em hábitos já feitos é tecnicamente um no-op (`update: { value: 1 }` quando já está 1), mas a lógica deve filtrar por `alreadyDone: false` para evitar queries desnecessárias.
   - `"nenhum"` ou `"0"` → encerra sem registrar, retorna `"Ok, até amanhã!"`
   - Números (ex: `"1 3"`) → extrai via `extractChoiceNumbers(text, 1, habits.length)`, marca apenas índices válidos; índices inválidos são silenciosamente ignorados
3. Para cada hábito marcado: `prisma.habitLog.upsert({ where: { habitId_date }, create: { habitId, date, value: 1 }, update: { value: 1 } })`
4. Calcula streak de cada hábito marcado via `HabitService.calculateStreak()`
5. Resposta: lista os hábitos marcados com streak. Ex:
   ```
   ✅ Registrado!
   • Exercício — 3 dias seguidos 🔥
   • Leitura — 1º dia, continue!
   ```
6. Sessão vai para `idle`.

**Caso de erro:** Se `payload.habits` estiver ausente ou malformado, responde `"Não consegui carregar seus hábitos. Digite *hábitos* para tentar novamente."` e vai para `idle`.

---

## 5. Novas Funcionalidades

### Marcar tarefa feita

**Dentro do fluxo `open_tasks_list`:**
Quando o usuário envia `"fiz N"` (ex: `"fiz 2"`), o handler `processOpenTasksInput` detecta o padrão antes de transitar para `open_tasks_actions`. A tarefa é completada diretamente, pulando o sub-menu de ações. O padrão `fiz N` tem precedência sobre a seleção de número simples.

**Fora de fluxo (estado `idle`):**
O LLM ou `inferNaturalCommand` detecta `"fiz [nome parcial]"`. Se o match for único, completa direto. Se houver ambiguidade (2+ tarefas candidatas), lista as opções e transita para `open_tasks_list` com as candidatas no payload.

**Feedback com XP:**
Se `prisma.gamificationState.findFirst()` retornar um registro (existência = gamificação ativa), inclui `"+{xp} XP"` na resposta. Se não existir, omite.

### Marcar inbox feito — fluxo `inbox_complete_pick`

Palavras-chave detectadas em `inferNaturalCommand`: `"fiz inbox"`, `"inbox feito"`, `"concluir inbox"` → sentinel `__open_inbox_complete__`.

Handler em `handleInbound`:
1. Busca últimos 5 itens do inbox com status `aberto` ou `em processamento`
2. Lista numerada na resposta
3. Cria sessão `inbox_complete_pick` com payload `{ items: InboxItemPayload[] }` e TTL 45 min

Handler `processInboxCompletePick(phoneNumber, session, text)`:
- Lê número do texto
- Marca item como `feito` via `prisma.inboxItem.update`
- Retorna `"✅ Item marcado como feito."` e vai para `idle`

### Resumo do dia

Palavra-chave: `"resumo"` — detectado em `inferNaturalCommand` (retorna sentinel `'resumo'`), executado via novo método `handleResumo()` em `whatsapp-command-service.ts`.

Retorna `string` (mensagem única). Definições precisas de cada campo:

- **Tarefas A concluídas hoje:** `prisma.task.count({ where: { status: 'feito', taskType: 'a', updatedAt: { gte: todayStart } } })` onde `todayStart` é meia-noite local (usando `WHATSAPP_TIMEZONE` via `formatNowToClock` já existente no `WhatsappAutoDispatchService`)
- **Deep Work:** `prisma.deepWorkSession.aggregate({ _sum: { actualMinutes: true }, where: { startedAt: { gte: todayStart } } })._sum.actualMinutes ?? 0`. Se `actualMinutes` for null no modelo, usar `targetMinutes` como fallback.
- **Hábitos feitos/total:** `const logs = prisma.habitLog.findMany({ where: { date: todayDateKey } })` (count dos logs do dia) vs `prisma.habit.count({ where: { status: 'ativo' } })` (total ativos)
- **Streak:** `prisma.gamificationState.findFirst({ orderBy: { lastUpdate: 'desc' } })?.streakDays ?? 0` — é o streak global de execução do Operis, não por hábito

Formato da resposta:
```
📊 *Resumo de hoje*
✅ Tarefas A concluídas: 2
🧠 Deep Work: 90min
🌱 Hábitos: 3/4
🔥 Streak: 5 dias
```

Campos com valor zero são incluídos (não omitidos) para dar visibilidade mesmo em dias sem execução.

### Áudio em qualquer estado

**Fluxo atual:** transcrição via `WhatsappAudioService.transcribe()` acontece em `webhooks.ts` antes de `handleInbound` ser chamado. O texto transcrito é passado como `message` para `handleInbound`.

**Mudança:** este comportamento já ocorre no webhook. A garantia necessária é que `handleInbound` receba o texto transcrito independentemente do estado da sessão. Verificar se há condição no webhook que pule a transcrição quando há sessão ativa — se existir, removê-la. `handleInbound` não precisa saber se o input veio de áudio ou texto.

---

## 6. Arquitetura Técnica

### Tipo de retorno atualizado

**`whatsapp-command-service.ts`:**
```typescript
type CommandResult = {
  reply: string | string[];  // antes era só string
  relatedTaskId?: string;
};
```

**`whatsapp-conversation-service.ts`:**
`handleInbound` retorna `Promise<CommandResult>` (mesmo tipo, já extendido acima). Não criar um segundo tipo `ConversationResult` — usar `CommandResult` em todo o codebase para consistência.

### Envio multi-mensagem no webhook

```typescript
// Em webhooks.ts, após handleInbound:
const replies = Array.isArray(result.reply) ? result.reply : [result.reply];
for (const msg of replies) {
  await publishEvent(queueNames.sendWhatsappMessage, { to: from, message: msg });
  if (replies.length > 1) await new Promise(r => setTimeout(r, 300));
}
```

### Método público para criar sessão (para uso pelo dispatcher)

```typescript
// Em WhatsappConversationService:
async setSessionPublic(
  phoneNumber: string,
  state: ConversationState,
  payload?: Prisma.JsonObject | null,
  ttlMinutes?: number
): Promise<void> {
  return this.setSession(phoneNumber, state, payload, ttlMinutes);
}
```

### Arquivos afetados

| Arquivo | Mudanças |
|---------|----------|
| `whatsapp-conversation-service.ts` | Ordem de verificação, remoção parser global de humor, 3 novos estados + handlers, `setSessionPublic`, áudio em qualquer estado |
| `whatsapp-briefing-service.ts` | `buildIntelligentBriefing()` retorna `string[]` |
| `whatsapp-auto-dispatch-service.ts` | Trigger noturno `WHATSAPP_EVENING_TIME`, `setSessionPublic` após briefing, `setSessionPublic` após proativas |
| `whatsapp-proactivity-engine.ts` | **Remover** Trigger 8 (`triggerHabitNightReminder`) |
| `webhooks.ts` | Suporte a `string[]` no retorno, fix de dedup ≤ 3 chars |
| `whatsapp-command-service.ts` | `CommandResult.reply: string | string[]`, comandos `resumo`, melhoria do `fiz`, `__open_inbox_complete__` |

### Sem mudanças de banco de dados

Os modelos existentes (`WhatsappConversationSession`, `Habit`, `HabitLog`, `InboxItem`, `Task`, `GamificationState`) suportam todas as funcionalidades descritas sem novas migrations.

---

## 7. Variáveis de Ambiente Novas

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `WHATSAPP_EVENING_TIME` | `21:00` | Horário do check-in noturno de hábitos — usa o timezone de `WHATSAPP_TIMEZONE` |

---

## 8. Fora do Escopo

- Interface web para gerenciar configurações do bot
- Multi-usuário (o bot opera em conta única por instância)
- Histórico de conversa persistente além do TTL de sessão
- Integração com calendário externo (Google Calendar, Outlook, etc.) — o bot lê os `Commitment` cadastrados no Operis, não calendários externos
- Notificações push nativas (apenas WhatsApp)
