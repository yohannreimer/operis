# WhatsApp Refactor — Sessão, Briefing e Novas Funcionalidades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 6 bugs críticos no bot WhatsApp do Operis e adicionar briefing matinal em múltiplas mensagens, check-in noturno de hábitos, e novos comandos (resumo, inbox feito).

**Architecture:** A máquina de estados do conversation service passa a rotear sempre pelo estado da sessão antes de qualquer verificação global. O tipo `CommandResult.reply` vira `string | string[]` para suportar múltiplas mensagens. Dois novos estados principais são adicionados: `awaiting_focus_confirmation` (resposta ao briefing) e `habit_checkin` (check-in noturno).

**Tech Stack:** TypeScript, Fastify, Prisma, OpenAI API (gpt-4o-mini + Whisper), RabbitMQ (publishEvent), Evolution API (WhatsApp provider).

**Spec:** `docs/superpowers/specs/2026-04-02-whatsapp-refactor-sessao-briefing-design.md`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `apps/api/src/services/whatsapp-command-service.ts` | Modify | Atualizar `CommandResult` type; adicionar `handleResumo()`; melhorar `fiz` |
| `apps/api/src/routes/webhooks.ts` | Modify | Suporte a `string[]` no reply; dedup bypass para ≤3 chars |
| `apps/api/src/services/whatsapp-conversation-service.ts` | Modify | Remover humor parser; novos estados + handlers; `setSessionPublic`; rota de estados |
| `apps/api/src/services/whatsapp-briefing-service.ts` | Modify | `buildIntelligentBriefing()` retorna `string[]` |
| `apps/api/src/services/whatsapp-auto-dispatch-service.ts` | Modify | `setSessionPublic` após briefing; trigger noturno de hábitos |
| `apps/api/src/services/whatsapp-proactivity-engine.ts` | Modify | Remover Trigger 8; `setSessionPublic` após proativas |

---

## Task 1: Atualizar `CommandResult` e suporte multi-mensagem no webhook

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-command-service.ts:8-11`
- Modify: `apps/api/src/routes/webhooks.ts:393-403`

Esta é a mudança de tipo fundacional que todas as outras dependem. Sem ela, nada do que retorna `string[]` vai funcionar.

- [ ] **Step 1: Atualizar o tipo `CommandResult`**

Em `apps/api/src/services/whatsapp-command-service.ts`, linhas 8-11, o tipo atual é:
```typescript
export type CommandResult = {
  reply: string;
  relatedTaskId?: string;
};
```

Alterar para:
```typescript
export type CommandResult = {
  reply: string | string[];
  relatedTaskId?: string;
};
```

- [ ] **Step 2: Atualizar o webhook para enviar múltiplas mensagens**

Em `apps/api/src/routes/webhooks.ts`, as linhas 393-403 atualmente são:
```typescript
await publishEvent(queueNames.sendWhatsappMessage, {
  to: payload.from,
  message: commandResult.reply,
  relatedTaskId: commandResult.relatedTaskId
});

return reply.code(202).send({
  ok: true,
  reply: commandResult.reply,
  externalMessageId: payload.externalMessageId ?? null
});
```

**IMPORTANTE:** SUBSTITUIR o bloco do `publishEvent` acima inteiramente — não adicionar código ao lado dele. O bloco antigo deve ser deletado e trocado pelo loop abaixo:
```typescript
const replies = Array.isArray(commandResult.reply)
  ? commandResult.reply
  : [commandResult.reply];

for (let i = 0; i < replies.length; i++) {
  await publishEvent(queueNames.sendWhatsappMessage, {
    to: payload.from,
    message: replies[i],
    relatedTaskId: i === 0 ? commandResult.relatedTaskId : undefined
  });
  if (i < replies.length - 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
}

return reply.code(202).send({
  ok: true,
  reply: commandResult.reply,
  externalMessageId: payload.externalMessageId ?? null
});
```

- [ ] **Step 3: Verificar que o TypeScript compila**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api
npx tsc --noEmit
```

Esperado: zero erros. Se houver erros de tipo em outros lugares do codebase que usam `commandResult.reply` como `string`, corrigi-los (tipicamente adicionando `Array.isArray` guards ou `String(reply)` cast).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/whatsapp-command-service.ts apps/api/src/routes/webhooks.ts
git commit -m "feat(whatsapp): CommandResult.reply vira string | string[], webhook envia em sequência"
```

---

## Task 2: Fix Bug 4 — Dedup bypass para mensagens curtas

**Arquivos:**
- Modify: `apps/api/src/routes/webhooks.ts:324-328`

O semantic dedup bloqueia "1", "2", "3" enviados em sequência. Existe já um bypass para `externalMessageId` — adicionamos um segundo bypass para mensagens com ≤3 caracteres.

- [ ] **Step 1: Adicionar bypass de tamanho**

Em `apps/api/src/routes/webhooks.ts`, linha 326 atualmente:
```typescript
if (!payload.externalMessageId && isDuplicateInboundSemantic(semanticDedupKey)) {
```

Substituir por:
```typescript
const isShortMessage = payload.message.trim().length <= 3;
if (!payload.externalMessageId && !isShortMessage && isDuplicateInboundSemantic(semanticDedupKey)) {
```

- [ ] **Step 2: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/webhooks.ts
git commit -m "fix(whatsapp): dedup bypass para mensagens com 3 chars ou menos"
```

---

## Task 3: Fix Bug 1 — Remover o parser global de humor

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts:1761-1771`

O `parseHumorReply` captura "1", "2", "3" globalmente, antes de qualquer estado de sessão. Remover completamente — a funcionalidade de humor não existe mais no novo design.

- [ ] **Step 1: Remover o bloco de humor em `handleInbound`**

Em `apps/api/src/services/whatsapp-conversation-service.ts`, remover as linhas 1761-1771:
```typescript
// ── Humor declaration (briefing reply: "1", "2" ou "3") ──────────────────
const humorReply = WhatsappBriefingService.parseHumorReply(text);
if (humorReply) {
  this.notifyHumor(humorReply);
  const humorMessages: Record<DayHumor, string> = {
    focado: '💪 Ótimo! Foco total hoje. Vamos nessa.',
    cansado: '🤝 Entendido — dia leve. Vou manter 2 prioridades e não te interromper muito.',
    sobrecarregado: '🧘 Ok, 1 prioridade só hoje. Faz o que puder — isso já é suficiente.'
  };
  return { reply: humorMessages[humorReply] };
}
```

- [ ] **Step 2: Remover todos os resquícios de humor em cascata**

Execute o grep para ver todos os locais:
```bash
grep -rn "setOnHumorDeclared\|notifyHumor\|onHumorDeclared\|DayHumor\|currentHumor\|humorDateKey\|getHumorForDate\|setHumor" apps/api/src/
```

Remover **em todos os arquivos**:

Em `whatsapp-conversation-service.ts`:
- Campo privado `onHumorDeclared` (linha ~130)
- Método `setOnHumorDeclared` (linha ~142)
- Método `notifyHumor` (linha ~146)
- Import de `DayHumor` (top of file)

Em `whatsapp-auto-dispatch-service.ts`:
- Campo `currentHumor` (linha ~78)
- Campo `humorDateKey` (linha ~79)
- Método `setHumor` (linha ~96-100)
- Método `getHumorForDate` (qualquer lugar)
- Qualquer chamada a `this.getHumorForDate(...)` dentro de `tick()`
- A chamada `this.briefingService.buildIntelligentBriefing(clock.dateKey, humor ?? undefined)` — o segundo argumento `humor` será removido quando o método for atualizado na Task 6, mas já pode ser removido agora pois TypeScript ainda vai aceitar (argumento extra é ignorado se a assinatura mudar depois)

Em `app.ts` ou onde quer que `setOnHumorDeclared` seja chamado (o grep vai mostrar):
- Remover a linha de wiring do callback de humor

**Nota:** O `WhatsappBriefingService` pode manter `parseHumorReply` e `DayHumor` — eles não causam problema se não forem chamados. Mas se quiser limpeza total, pode removê-los também.

- [ ] **Step 3: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/whatsapp-conversation-service.ts apps/api/src/services/whatsapp-auto-dispatch-service.ts apps/api/src/app.ts
git commit -m "fix(whatsapp): remove parser global de humor que interceptava toda mensagem numerica"
```

---

## Task 4: Fix Bug 6 — Remover menu concatenado em respostas

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts` (múltiplos pontos)

Respostas de conteúdo atualmente concatenam o `menuText()` ao final. O estado `menu` da sessão já garante o contexto — o menu não precisa ser reenviado.

- [ ] **Step 1: Localizar todos os pontos com menu concatenado**

```bash
grep -n "menuText()" apps/api/src/services/whatsapp-conversation-service.ts
```

Ocorrências exatas a modificar dentro de `processMenuInput` (linhas aproximadas após as tasks anteriores):

**Linha ~792 — opção 2 (tarefas): REMOVER menu**
```typescript
// Antes:
return {
  reply: `${this.prettifyReply(tasks.reply)}\n\n${this.menuText()}`,
  relatedTaskId: tasks.relatedTaskId
};
// Depois:
return {
  reply: this.prettifyReply(tasks.reply),
  relatedTaskId: tasks.relatedTaskId
};
```

**Linha ~816 — opção 4 (prazos + followups): REMOVER menu**
```typescript
// Antes:
return {
  reply: `${this.prettifyReply(due.reply)}\n\n${this.prettifyReply(followups.reply)}\n\n${this.menuText()}`
};
// Depois:
return {
  reply: `${this.prettifyReply(due.reply)}\n\n${this.prettifyReply(followups.reply)}`
};
```

**Linha ~830 — opção 6 (ajuda): REMOVER menu**
```typescript
// Antes:
return {
  reply: `${this.helpText()}\n\n${this.menuText()}`
};
// Depois:
return {
  reply: this.helpText()
};
```

**"Opção inválida" — MANTER menu** (usuário está perdido, precisa de orientação):
```typescript
return {
  reply: `Opção inválida.\n\n${this.menuText()}`
};
```

**Regra geral para qualquer outra ocorrência:** Se a resposta é de conteúdo (lista de tarefas, resultado de comando), remover. Se é fallback/erro, manter.

- [ ] **Step 2: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/whatsapp-conversation-service.ts
git commit -m "fix(whatsapp): remove menuText() concatenado em respostas de conteudo"
```

---

## Task 5: Adicionar novos estados ao `ConversationState` e expor `setSessionPublic`

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts:8-23` (type union)
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts` (adicionar método público)

Fundação para os novos fluxos.

- [ ] **Step 1: Atualizar o `ConversationState` type**

Em `apps/api/src/services/whatsapp-conversation-service.ts`, linhas 8-23, substituir:
```typescript
type ConversationState =
  | 'idle'
  | 'menu'
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

Por:
```typescript
type ConversationState =
  | 'idle'
  | 'menu'
  | 'awaiting_focus_confirmation'
  | 'habit_checkin'
  | 'inbox_complete_pick'
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

- [ ] **Step 2: Adicionar `setSessionPublic` à classe**

Na classe `WhatsappConversationService`, após o método privado `setSession` (linha ~715), adicionar:
```typescript
/**
 * Método público para que serviços externos (ex: WhatsappAutoDispatchService)
 * possam criar sessões após enviar mensagens proativas ou o briefing matinal.
 */
async setSessionPublic(
  phoneNumber: string,
  state: ConversationState,
  payload?: Prisma.JsonObject | null,
  ttlMinutes?: number
): Promise<void> {
  return this.setSession(phoneNumber, state, payload, ttlMinutes);
}
```

- [ ] **Step 3: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/whatsapp-conversation-service.ts
git commit -m "feat(whatsapp): adiciona novos estados ConversationState e setSessionPublic"
```

---

## Task 6: Atualizar `buildIntelligentBriefing` para retornar `string[]`

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-briefing-service.ts:410-434`

O briefing passa de 1 mensagem longa para 2-4 mensagens curtas.

- [ ] **Step 1: Alterar assinatura e retorno de `buildIntelligentBriefing`**

Em `apps/api/src/services/whatsapp-briefing-service.ts`, localizar o método `buildIntelligentBriefing` (linha ~410). Alterar de:
```typescript
async buildIntelligentBriefing(dateKey: string, humor?: DayHumor): Promise<string> {
  const ctx = await this.buildContext(dateKey, humor);
  const sections: string[] = [];

  // Bloco 1
  const situational = await this.buildSituationalRead(ctx);
  sections.push(situational);

  // Bloco 2
  const commitmentsBlock = this.buildCommitmentsBlock(ctx);
  if (commitmentsBlock) sections.push(commitmentsBlock);

  // Bloco 3
  sections.push(this.buildTop3Block(ctx));

  // Bloco 4 (só se há alerta)
  const alert = this.buildAlertBlock(ctx);
  if (alert) sections.push(alert);

  // Bloco 5 (humor)
  sections.push(this.buildHumorBlock());

  return sections.join('\n\n');
}
```

Para:
```typescript
async buildIntelligentBriefing(dateKey: string): Promise<string[]> {
  const ctx = await this.buildContext(dateKey);
  const messages: string[] = [];

  // Mensagem 1 — Leitura situacional (sempre)
  const situational = await this.buildSituationalRead(ctx);
  messages.push(situational);

  // Mensagem 2 — Compromissos do dia (só se houver)
  const commitmentsBlock = this.buildCommitmentsBlock(ctx);
  if (commitmentsBlock) messages.push(commitmentsBlock);

  // Mensagem 3 — Alerta informativo (só se houver tarefa A atrasada, sem pergunta)
  const alert = this.buildAlertBlock(ctx);
  if (alert) messages.push(alert);

  // Mensagem 4 — Foco sugerido + 1 pergunta (sempre, cria sessão no dispatcher)
  messages.push(this.buildTop3Block(ctx));

  return messages;
}
```

- [ ] **Step 2: Atualizar `buildTop3Block` para incluir a pergunta**

O método `buildTop3Block` atualmente termina com `'Confirmar? Responda *sim*, troque ou mande áudio.'`. Verificar se essa linha já existe — se sim, nenhuma alteração necessária. Se não, adicionar ao final do array retornado por `buildTop3Block`.

- [ ] **Step 3: Remover `buildHumorBlock`**

O método `buildHumorBlock` não é mais chamado. Remover o método. Verificar com grep se é usado em algum outro lugar:
```bash
grep -rn "buildHumorBlock" apps/api/src/
```

Se não for usado em nenhum outro lugar, deletar o método.

- [ ] **Step 4: Corrigir o chamador em `whatsapp-auto-dispatch-service.ts`**

Em `apps/api/src/services/whatsapp-auto-dispatch-service.ts`, linhas 192-197:
```typescript
const intelligentBriefing = await this.briefingService.buildIntelligentBriefing(
  clock.dateKey,
  humor ?? undefined   // ← remover este segundo argumento
);
messages.push(intelligentBriefing);  // ← push de string única
```

Alterar para (duas mudanças: remover o segundo argumento E usar spread):
```typescript
const intelligentMessages = await this.briefingService.buildIntelligentBriefing(clock.dateKey);
messages.push(...intelligentMessages);  // spread do array de strings
```

- [ ] **Step 5: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/whatsapp-briefing-service.ts apps/api/src/services/whatsapp-auto-dispatch-service.ts
git commit -m "feat(whatsapp): briefing matinal retorna string[] com 2-4 mensagens separadas"
```

---

## Task 7: Fix Bug 2 — Criar sessão após enviar briefing

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-auto-dispatch-service.ts`

Após enviar o briefing matinal, o bot precisa registrar que está aguardando a resposta do usuário sobre o foco do dia.

- [ ] **Step 1: Injetar `WhatsappConversationService` no dispatcher — via bootstrap, não construtor cruzado**

**Atenção ao risco de dependência circular:** `WhatsappAutoDispatchService` não pode importar `WhatsappConversationService` diretamente no construtor se ambos são instanciados no mesmo arquivo de bootstrap (`app.ts`). A solução é usar um tipo mínimo de interface (não o tipo concreto) e injetar depois da construção.

Em `apps/api/src/services/whatsapp-auto-dispatch-service.ts`, adicionar campo e método de injeção (não no construtor):

```typescript
// Campo privado (não no constructor):
private conversationService: { setSessionPublic: (phone: string, state: string, payload: any, ttl?: number) => Promise<void> } | null = null;

// Método para injeção pós-construção (evita dependência circular):
setConversationService(svc: { setSessionPublic: (phone: string, state: string, payload: any, ttl?: number) => Promise<void> }) {
  this.conversationService = svc;
}
```

Em `apps/api/src/app.ts` (verificar onde os serviços são instanciados), após criar ambas as instâncias:
```typescript
// Instanciar primeiro ambos os serviços:
const autoDispatch = new WhatsappAutoDispatchService(logger, commandService, prisma);
const conversationService = new WhatsappConversationService(prisma, commandService, llmService);

// Depois injetar (pós-construção, sem dependência circular):
autoDispatch.setConversationService(conversationService);
```

Executar grep para confirmar a localização exata:
```bash
grep -rn "WhatsappAutoDispatchService\|WhatsappConversationService" apps/api/src/app.ts
```

- [ ] **Step 2: Adicionar `getTop3ForDate` ao `WhatsappBriefingService`**

O método reutiliza o `buildContext()` privado já existente — sem queries adicionais. Adicionar como método público em `apps/api/src/services/whatsapp-briefing-service.ts`:

```typescript
/**
 * Retorna o top 3 candidatos do dia para o payload da sessão do briefing.
 * Reutiliza buildContext() internamente — não faz queries extras.
 */
async getTop3ForDate(dateKey: string): Promise<{ id: string; title: string; index: number }[]> {
  const ctx = await this.buildContext(dateKey);  // método privado já existente
  return ctx.top3Candidates.map((t, i) => ({
    id: t.id,
    title: t.title,
    index: i + 1
  }));
}
```

- [ ] **Step 3: Criar sessão após enviar o briefing**

Em `apps/api/src/services/whatsapp-auto-dispatch-service.ts`, após o loop `for (const message of messages)`, adicionar:

```typescript
// Criar sessão awaiting_focus_confirmation para capturar resposta ao foco sugerido
if (this.conversationService) {
  try {
    const top3 = await this.briefingService.getTop3ForDate(clock.dateKey);
    await this.conversationService.setSessionPublic(
      env.DEFAULT_PHONE_NUMBER,
      'awaiting_focus_confirmation',
      { top3 } as Prisma.JsonObject,
      60
    );
    this.logger.info({ date: clock.dateKey }, 'Sessão awaiting_focus_confirmation criada após briefing.');
  } catch (err) {
    this.logger.warn({ err }, 'Falha ao criar sessão pós-briefing.');
  }
}
```

Importar `Prisma` de `@prisma/client` se não estiver importado.

- [ ] **Step 4: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp-auto-dispatch-service.ts apps/api/src/services/whatsapp-briefing-service.ts apps/api/src/app.ts
git commit -m "fix(whatsapp): criar sessao awaiting_focus_confirmation apos enviar briefing matinal"
```

---

## Task 8: Implementar `processFocusConfirmation` e rota no `handleInbound`

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts`

Novo handler para o estado `awaiting_focus_confirmation` — processa a resposta do usuário ao foco sugerido via LLM.

- [ ] **Step 1: Adicionar o método `processFocusConfirmation`**

Na classe `WhatsappConversationService`, adicionar o método privado (após os outros `process*` methods):

```typescript
private async processFocusConfirmation(
  phoneNumber: string,
  session: WhatsappConversationSession,
  text: string
): Promise<CommandResult> {
  const payload = this.readSessionPayload(session);
  const top3 = Array.isArray(payload.top3)
    ? (payload.top3 as Array<{ id: string; title: string; index: number }>)
    : [];

  // Sem LLM disponível: fallback para confirmar tudo
  if (!this.llmService?.isAvailable || top3.length === 0) {
    await this.setSession(phoneNumber, 'idle');
    if (top3.length === 0) {
      const choices = await this.listTaskChoices(8);
      await this.setSession(phoneNumber, 'open_tasks_list', { choices }, LONG_SESSION_TTL_MINUTES);
      return { reply: this.renderOpenTaskList(choices) };
    }
    const result = await this.runCommand('foco confirmar');
    return { reply: this.prettifyReply(result.reply) };
  }

  // Formatar top3 para o prompt
  const top3Lines = top3.map((t) => `${t.index}. ${t.title}`).join('\n');

  const prompt = `Você é o assistente do Operis. O usuário recebeu estas sugestões de foco para hoje:\n${top3Lines}\n\nO usuário respondeu: "${text}"\n\nClassifique a intenção e retorne JSON válido:\n{ "action": "confirm_all" | "confirm_subset" | "replace_with_text" | "show_all_tasks", "indices": [1,2,3], "text": "" }\n\nRegras:\n- confirm_all: usuário confirmou tudo (sim, pode, fechado, ok)\n- confirm_subset: usuário quer apenas alguns itens (ex: "só o 1", "1 e 2")\n- replace_with_text: usuário mencionou outra tarefa por nome\n- show_all_tasks: usuário quer ver todas as tarefas disponíveis\n\nRetorne APENAS o JSON, sem explicações.`;

  let action: string = 'confirm_all';
  let indices: number[] = [];
  let replaceText = '';

  try {
    const completion = await (this.llmService as any).openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 80
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    action = parsed.action ?? 'confirm_all';
    indices = Array.isArray(parsed.indices) ? parsed.indices : [];
    replaceText = typeof parsed.text === 'string' ? parsed.text : '';
  } catch {
    // Falha do LLM — confirmar tudo por padrão
    action = 'confirm_all';
  }

  await this.setSession(phoneNumber, 'idle');

  if (action === 'show_all_tasks') {
    const choices = await this.listTaskChoices(18);
    await this.setSession(phoneNumber, 'open_tasks_list', { choices }, LONG_SESSION_TTL_MINUTES);
    return { reply: this.renderOpenTaskList(choices) };
  }

  if (action === 'replace_with_text' && replaceText) {
    const tasks = await this.prisma.task.findMany({
      where: {
        archivedAt: null,
        status: { in: ['hoje', 'andamento', 'backlog'] },
        title: { contains: replaceText, mode: 'insensitive' }
      },
      take: 5,
      include: { workspace: { select: { name: true } } }
    });

    if (tasks.length === 0) {
      // Sem match — reenviar sugestões originais mantendo o estado
      await this.setSession(phoneNumber, 'awaiting_focus_confirmation', payload as Prisma.JsonObject, 60);
      const replyLines = ['Não encontrei nenhuma tarefa com esse nome. Aqui estão as sugestões originais:', ''];
      top3.forEach((t) => replyLines.push(`${t.index}. ${t.title}`));
      replyLines.push('', 'Confirmar? Responda sim, troque ou mande áudio.');
      return { reply: replyLines.join('\n') };
    }

    if (tasks.length === 1) {
      const result = await this.runCommand(`foco confirmar`);
      return { reply: `✅ Foco definido: ${tasks[0].title}\n\n${this.prettifyReply(result.reply)}` };
    }

    // Múltiplos resultados — abrir lista para escolha
    const choices = tasks.map((t, i) => ({
      index: i + 1,
      id: t.id,
      title: t.title,
      workspaceName: t.workspace?.name ?? null,
      status: t.status,
      priority: t.priority
    }));
    await this.setSession(phoneNumber, 'open_tasks_list', { choices }, LONG_SESSION_TTL_MINUTES);
    return { reply: this.renderOpenTaskList(choices) };
  }

  if (action === 'confirm_subset' && indices.length > 0) {
    const selected = top3.filter((t) => indices.includes(t.index));
    const titles = selected.map((t) => `${t.index}. ${t.title}`).join('\n');
    // Confirmar apenas os selecionados (outros ficam no backlog sem alteração)
    return { reply: `✅ Foco definido:\n${titles}` };
  }

  // confirm_all (default)
  const result = await this.runCommand('foco confirmar');
  return { reply: this.prettifyReply(result.reply) };
}
```

**Nota:** O `this.llmService` não expõe o `openai` diretamente. Verificar a interface de `WhatsappLLMService` — se não há um método genérico de chat completion, adicionar um método `chatCompletion(prompt: string): Promise<string>` ao `WhatsappLLMService` e usar isso aqui em vez de acessar `openai` diretamente.

- [ ] **Step 2: Adicionar rota para o estado em `handleInbound` — ANTES do bloco `menu`**

Em `handleInbound`, encontrar o bloco de roteamento de estados (linha ~1875, após o bloco de sentinels). A linha `if (session.state === 'menu')` é o primeiro handler de estado. Inserir IMEDIATAMENTE ANTES dela:

```typescript
// ── Novos estados — devem vir antes dos estados existentes ────────────────
if (session.state === 'awaiting_focus_confirmation') {
  return this.processFocusConfirmation(phoneNumber, session, text);
}
```

A posição correta no arquivo ficará assim:
```typescript
// ... bloco de sentinels termina aqui ...

// ── Novos estados ────────────────────────────────────────────────────────
if (session.state === 'awaiting_focus_confirmation') {  // ← INSERIR AQUI
  return this.processFocusConfirmation(phoneNumber, session, text);
}

if (session.state === 'menu') {  // ← este já existe, não mover
  return this.processMenuInput(phoneNumber, text);
}
```

- [ ] **Step 3: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/whatsapp-conversation-service.ts
git commit -m "feat(whatsapp): handler processFocusConfirmation com LLM para resposta ao briefing"
```

---

## Task 9: Remover Trigger 8 e adicionar trigger noturno de hábitos

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-proactivity-engine.ts:473-507` (remover)
- Modify: `apps/api/src/services/whatsapp-proactivity-engine.ts:79-93` (remover referência)
- Modify: `apps/api/src/services/whatsapp-auto-dispatch-service.ts` (adicionar evening trigger)

**Importante:** Remover o Trigger 8 ANTES de adicionar o novo trigger no dispatcher para evitar que ambos disparem ao mesmo tempo.

- [ ] **Step 1: Remover `triggerHabitNightReminder` do `WhatsappProactivityEngine`**

Em `apps/api/src/services/whatsapp-proactivity-engine.ts`:

**Passo A:** Remover as linhas 473-507 (o método `triggerHabitNightReminder` completo).

**Passo B:** Na linha ~79-93 (o bloco `Promise.all`), substituir INTEIRAMENTE — tanto o array do `Promise.all` quanto a destructuring e o loop `for`. É crítico renumerar as variáveis para que o que antes era `t9` (streakCelebration) passe a ser `t8`:

```typescript
// Antes (9 triggers):
const [t1, t2, t3, t4, t5, t6, t7, t8, t9] = await Promise.all([
  this.triggerTop3Unconfirmed(clock),
  this.triggerDeepWorkWindow(clock),
  this.triggerBlockedTaskA(clock),
  this.triggerAfternoonCheckin(clock),
  this.triggerTop3Complete(clock),
  this.triggerLongSilence(clock),
  this.triggerWeeklyReview(clock),
  this.triggerHabitNightReminder(clock),  // ← REMOVIDO
  this.triggerStreakCelebration(),
]);
for (const t of [t1, t2, t3, t4, t5, t6, t7, t8, t9]) {

// Depois (8 triggers — renumerar até t8, loop atualizado):
const [t1, t2, t3, t4, t5, t6, t7, t8] = await Promise.all([
  this.triggerTop3Unconfirmed(clock),
  this.triggerDeepWorkWindow(clock),
  this.triggerBlockedTaskA(clock),
  this.triggerAfternoonCheckin(clock),
  this.triggerTop3Complete(clock),
  this.triggerLongSilence(clock),
  this.triggerWeeklyReview(clock),
  this.triggerStreakCelebration(),         // ← era t9, agora é t8
]);
for (const t of [t1, t2, t3, t4, t5, t6, t7, t8]) {  // ← t9 removido aqui também
```

**Atenção:** TypeScript não vai pegar este erro (destructuring além do array retorna `undefined`, não erro de tipo). É necessário fazer as três mudanças juntas: array do `Promise.all`, destructuring, e o array do `for`.

- [ ] **Step 2: Adicionar constante e trigger noturno no `WhatsappAutoDispatchService`**

Em `apps/api/src/services/whatsapp-auto-dispatch-service.ts`:

Adicionar propriedade de horário noturno após as propriedades existentes de horário (linha ~72-75):
```typescript
private readonly eveningTime = parseTimeToken(env.WHATSAPP_EVENING_TIME ?? '21:00', 21, 0);
```

No método `tick()`, após o bloco de XP de vícios (linha ~257), adicionar:
```typescript
// ── Check-in noturno de hábitos ──────────────────────────────────────────
const eveningMinutes = this.eveningTime.hour * 60 + this.eveningTime.minute;
const eveningKey = `habit_checkin:${clock.dateKey}`;
if (clock.totalMinutes >= eveningMinutes && clock.totalMinutes <= eveningMinutes + 5 && !this.wasSent(eveningKey)) {
  try {
    const habitService = new HabitService(this.prisma);
    const todayStats = await habitService.getTodayStats(clock.dateKey, 'legacy');

    if (todayStats.length > 0) {
      // Montar lista com status
      const habitPayload = todayStats
        .filter((h) => h.type !== 'vice')
        .map((h, i) => ({
          index: i + 1,
          id: h.id,
          title: h.title,
          alreadyDone: h.isCompletedToday ?? false
        }));

      if (habitPayload.length > 0) {
        const lines = ['🌙 *Fim de dia. Quais hábitos você fez hoje?*', ''];
        for (const h of habitPayload) {
          lines.push(`${h.index}. ${h.alreadyDone ? '✅' : '☐'} ${h.title}`);
        }
        lines.push('', 'Responda com os números. Ex: *1 3*');
        lines.push('Ou *todos* para marcar todos, *nenhum* para pular.');

        await this.enqueueMessage(lines.join('\n'));

        if (this.conversationService) {
          await this.conversationService.setSessionPublic(
            env.DEFAULT_PHONE_NUMBER,
            'habit_checkin',
            { habits: habitPayload, date: clock.dateKey } as Prisma.JsonObject,
            120
          );
        }

        this.rememberSent(eveningKey);
        this.logger.info({ date: clock.dateKey }, 'Check-in noturno de hábitos enviado.');
      }
    }
  } catch (err) {
    this.logger.warn({ err }, 'Falha ao enviar check-in noturno de hábitos.');
  }
}
```

Importar `HabitService` se não estiver importado (verificar com `grep "HabitService" apps/api/src/services/whatsapp-auto-dispatch-service.ts`).

- [ ] **Step 3: Adicionar `WHATSAPP_EVENING_TIME` ao env config**

Verificar onde as variáveis de ambiente são definidas:
```bash
grep -rn "WHATSAPP_MORNING_TIME\|WHATSAPP_TIMEZONE" apps/api/src/config.ts
```

Adicionar ao schema de validação (Zod ou similar):
```typescript
WHATSAPP_EVENING_TIME: z.string().optional().default('21:00'),
```

- [ ] **Step 4: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp-proactivity-engine.ts apps/api/src/services/whatsapp-auto-dispatch-service.ts apps/api/src/config.ts
git commit -m "feat(whatsapp): check-in noturno de habitos no dispatcher, remove Trigger 8 duplicado"
```

---

## Task 10: Implementar `processHabitCheckin` e rota no `handleInbound`

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts`

- [ ] **Step 1: Adicionar o método `processHabitCheckin`**

Na classe `WhatsappConversationService`, adicionar o método privado:

```typescript
private async processHabitCheckin(
  phoneNumber: string,
  session: WhatsappConversationSession,
  text: string
): Promise<CommandResult> {
  const payload = this.readSessionPayload(session);
  const habits = Array.isArray(payload.habits)
    ? (payload.habits as Array<{ index: number; id: string; title: string; alreadyDone: boolean }>)
    : [];
  const dateKey = typeof payload.date === 'string' ? payload.date : this.todayDateKey();

  if (habits.length === 0) {
    await this.setSession(phoneNumber, 'idle');
    return { reply: 'Não consegui carregar seus hábitos. Digite *hábitos* para tentar novamente.' };
  }

  const normalized = normalizeLower(text);

  if (normalized === 'nenhum' || normalized === '0') {
    await this.setSession(phoneNumber, 'idle');
    return { reply: 'Ok, até amanhã! 🌙' };
  }

  const habitsToMark = normalized === 'todos'
    ? habits.filter((h) => !h.alreadyDone)
    : habits.filter((h) =>
        extractChoiceNumbers(text, 1, habits.length).includes(h.index)
      );

  if (habitsToMark.length === 0) {
    await this.setSession(phoneNumber, 'idle');
    return { reply: 'Nenhum hábito válido selecionado. Até amanhã! 🌙' };
  }

  const habitService = new HabitService(this.prisma);
  const streakLines: string[] = ['✅ Registrado!'];

  for (const habit of habitsToMark) {
    await this.prisma.habitLog.upsert({
      where: { habitId_date: { habitId: habit.id, date: dateKey } },
      create: { habitId: habit.id, date: dateKey, value: 1 },
      update: { value: 1 }
    });

    try {
      const streak = await habitService.calculateStreak(habit.id, dateKey, 'binary');
      if (streak >= 2) {
        streakLines.push(`• ${habit.title} — ${streak} dias seguidos 🔥`);
      } else {
        streakLines.push(`• ${habit.title} — 1º dia, continue!`);
      }
    } catch {
      streakLines.push(`• ${habit.title} ✓`);
    }
  }

  await this.setSession(phoneNumber, 'idle');
  return { reply: streakLines.join('\n') };
}
```

**Nota:** Verificar a assinatura exata de `habitService.calculateStreak()` no `habit-service.ts` para garantir que os parâmetros batem. Se a assinatura for diferente, ajustar.

- [ ] **Step 2: Adicionar sentinels para comando manual em `inferNaturalCommand`**

No método `inferNaturalCommand` (linha ~183), adicionar antes do `return null` final:

```typescript
if (/(habitos?|check[\s-]?habitos?|registrar[\s-]?habitos?|fiz[\s-]?habitos?)/.test(normalized)) {
  return '__open_habit_checkin__';
}
```

- [ ] **Step 3: Adicionar handler do sentinel e rota do estado em `handleInbound`**

Em `handleInbound`, no bloco de sentinels (onde estão `__open_menu__`, `__open_notes__`, etc.), adicionar:

```typescript
if (inferredCommand === '__open_habit_checkin__') {
  try {
    const habitService = new HabitService(this.prisma);
    const todayKey = this.todayDateKey();
    const todayStats = await habitService.getTodayStats(todayKey, 'legacy');
    const habitPayload = todayStats
      .filter((h) => h.type !== 'vice')
      .map((h, i) => ({
        index: i + 1,
        id: h.id,
        title: h.title,
        alreadyDone: h.isCompletedToday ?? false
      }));

    if (habitPayload.length === 0) {
      return { reply: '📋 Nenhum hábito configurado ainda. Acesse /habitos no app para criar.' };
    }

    const lines = ['🌙 *Seus hábitos de hoje:*', ''];
    for (const h of habitPayload) {
      lines.push(`${h.index}. ${h.alreadyDone ? '✅' : '☐'} ${h.title}`);
    }
    lines.push('', 'Responda com os números. Ex: *1 3*');
    lines.push('Ou *todos* para marcar todos, *nenhum* para pular.');

    await this.setSession(phoneNumber, 'habit_checkin', { habits: habitPayload, date: todayKey } as Prisma.JsonObject, 120);
    return { reply: lines.join('\n') };
  } catch {
    return { reply: 'Erro ao carregar hábitos. Tente novamente.' };
  }
}
```

E adicionar o roteamento do estado — logo após o bloco de `awaiting_focus_confirmation` adicionado na Task 8, ANTES de `if (session.state === 'menu')`:

```typescript
if (session.state === 'awaiting_focus_confirmation') {  // ← já existe da Task 8
  return this.processFocusConfirmation(phoneNumber, session, text);
}

if (session.state === 'habit_checkin') {  // ← INSERIR AQUI
  return this.processHabitCheckin(phoneNumber, session, text);
}

if (session.state === 'menu') {  // ← já existe, não mover
  return this.processMenuInput(phoneNumber, text);
}
```

Importar `HabitService` no topo do arquivo se não estiver importado.

- [ ] **Step 4: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp-conversation-service.ts
git commit -m "feat(whatsapp): handler habit_checkin e comando manual de habitos"
```

---

## Task 11: Fix Bug 5 — Mensagens proativas criam sessão mínima

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-auto-dispatch-service.ts`

Após enviar cada mensagem proativa, criar uma sessão `idle` com contexto da proativa para o LLM usar na próxima resposta do usuário.

- [ ] **Step 1: Atualizar o bloco de proatividade no `tick()`**

Em `apps/api/src/services/whatsapp-auto-dispatch-service.ts`, o bloco de proatividade (linha ~259-269):

```typescript
if (proactiveMessage) {
  await this.enqueueMessage(proactiveMessage.message);
  this.logger.info(
    { triggerId: proactiveMessage.triggerId, date: clock.dateKey },
    'WhatsApp proactive trigger disparado.'
  );
}
```

Alterar para:

```typescript
if (proactiveMessage) {
  await this.enqueueMessage(proactiveMessage.message);

  if (this.conversationService) {
    try {
      await this.conversationService.setSessionPublic(
        env.DEFAULT_PHONE_NUMBER,
        'idle',
        { lastProactiveContext: proactiveMessage.triggerId } as Prisma.JsonObject,
        45
      );
    } catch {
      // Falha silenciosa — não crítico
    }
  }

  this.logger.info(
    { triggerId: proactiveMessage.triggerId, date: clock.dateKey },
    'WhatsApp proactive trigger disparado.'
  );
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/whatsapp-auto-dispatch-service.ts
git commit -m "fix(whatsapp): mensagens proativas criam sessao idle com contexto para LLM"
```

---

## Task 12: Implementar fluxo `inbox_complete_pick`

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts`

Novo mini-fluxo para marcar itens do inbox como feitos via WhatsApp.

- [ ] **Step 1: Adicionar o método `processInboxCompletePick`**

```typescript
private async processInboxCompletePick(
  phoneNumber: string,
  session: WhatsappConversationSession,
  text: string
): Promise<CommandResult> {
  const payload = this.readSessionPayload(session);
  const items = Array.isArray(payload.items)
    ? (payload.items as Array<{ index: number; id: string; content: string }>)
    : [];

  const choice = extractLeadingInteger(text);
  const selected = items.find((item) => item.index === choice);

  await this.setSession(phoneNumber, 'idle');

  if (!selected) {
    return { reply: 'Número inválido. Digite *inbox feito* para tentar novamente.' };
  }

  try {
    await this.prisma.inboxItem.update({
      where: { id: selected.id },
      data: { status: 'feito' }
    });
    return { reply: `✅ *"${selected.content}"* marcado como feito na inbox!` };
  } catch {
    return { reply: 'Erro ao atualizar o item. Tente novamente.' };
  }
}
```

- [ ] **Step 2: Adicionar sentinel em `inferNaturalCommand`**

```typescript
if (/(fiz[\s-]?inbox|inbox[\s-]?feito|concluir[\s-]?inbox)/.test(normalized)) {
  return '__open_inbox_complete__';
}
```

- [ ] **Step 3: Adicionar handler do sentinel em `handleInbound`**

```typescript
if (inferredCommand === '__open_inbox_complete__') {
  const items = await this.prisma.inboxItem.findMany({
    where: { status: { in: ['pendente', 'em_processamento'] } },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  if (items.length === 0) {
    return { reply: '📥 Nenhum item aberto na inbox no momento.' };
  }

  const itemPayload = items.map((item, i) => ({
    index: i + 1,
    id: item.id,
    content: item.content
  }));

  const lines = ['📥 *Inbox — itens abertos:*', ''];
  for (const item of itemPayload) {
    lines.push(`${item.index}. ${item.content}`);
  }
  lines.push('', 'Responda com o *número* do item para marcar como feito.');

  await this.setSession(
    phoneNumber,
    'inbox_complete_pick',
    { items: itemPayload } as Prisma.JsonObject,
    SESSION_TTL_MINUTES
  );
  return { reply: lines.join('\n') };
}
```

**Nota:** Verificar os valores exatos do enum `status` do `InboxItem` no schema Prisma. Pode ser `'pendente'`, `'aberto'`, ou outro valor — usar `grep -n "status" apps/api/prisma/schema.prisma` para confirmar.

- [ ] **Step 4: Adicionar rota do estado em `handleInbound` — junto com os outros novos estados**

Adicionar JUNTO com os outros novos estados (Tasks 8 e 10), ANTES de `if (session.state === 'menu')`:

```typescript
if (session.state === 'awaiting_focus_confirmation') {  // Task 8
  return this.processFocusConfirmation(phoneNumber, session, text);
}
if (session.state === 'habit_checkin') {  // Task 10
  return this.processHabitCheckin(phoneNumber, session, text);
}
if (session.state === 'inbox_complete_pick') {  // ← INSERIR AQUI (Task 12)
  return this.processInboxCompletePick(phoneNumber, session, text);
}
if (session.state === 'menu') {  // já existe
  return this.processMenuInput(phoneNumber, text);
}
```

- [ ] **Step 5: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/whatsapp-conversation-service.ts
git commit -m "feat(whatsapp): fluxo inbox_complete_pick para marcar itens da inbox como feitos"
```

---

## Task 13: Adicionar comando `resumo`

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-command-service.ts`
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts` (sentinel)

- [ ] **Step 1: Adicionar método `handleResumo` em `whatsapp-command-service.ts`**

Verificar onde ficam os outros métodos de comando. Adicionar ao final da classe `WhatsappCommandService`:

```typescript
async handleResumo(todayDateKey: string, todayStart: Date): Promise<CommandResult> {
  const [taskCount, deepWork, habitLogs, totalHabits, gamification] = await Promise.all([
    this.prisma.task.count({
      where: {
        status: 'feito',
        taskType: 'a',
        updatedAt: { gte: todayStart }
      }
    }),
    this.prisma.deepWorkSession.aggregate({
      _sum: { actualMinutes: true },
      where: { startedAt: { gte: todayStart } }
    }),
    this.prisma.habitLog.findMany({
      where: { date: todayDateKey }
    }),
    this.prisma.habit.count({ where: { status: 'ativo' } }),
    this.prisma.gamificationState.findFirst({ orderBy: { lastUpdate: 'desc' } })
  ]);

  const deepMinutes = deepWork._sum.actualMinutes ?? 0;
  const streakDays = gamification?.streakDays ?? 0;

  const lines = [
    '📊 *Resumo de hoje*',
    `✅ Tarefas A concluídas: ${taskCount}`,
    `🧠 Deep Work: ${deepMinutes}min`,
    `🌱 Hábitos: ${habitLogs.length}/${totalHabits}`,
    `🔥 Streak: ${streakDays} dias`
  ];

  return { reply: lines.join('\n') };
}
```

**Nota:** Se o modelo `DeepWorkSession` não tiver um campo `actualMinutes`, verificar o schema e usar `targetMinutes` como fallback: `(deepWork._sum.actualMinutes ?? deepWork._sum.targetMinutes) ?? 0`.

- [ ] **Step 2: Adicionar sentinel em `inferNaturalCommand`**

```typescript
if (/^resumo$/.test(normalized)) {
  return 'resumo';
}
```

- [ ] **Step 3: Adicionar handler do sentinel em `handleInbound`**

No bloco de sentinels diretos em `handleInbound`, adicionar:

```typescript
if (inferredCommand === 'resumo') {
  const todayKey = this.todayDateKey();
  // todayStart = meia-noite local. Usar UTC midnight como aproximação:
  const todayStart = new Date(`${todayKey}T00:00:00.000Z`);
  const result = await this.commandService.handleResumo(todayKey, todayStart);
  await this.setSession(phoneNumber, 'idle');
  return { reply: this.prettifyReply(result.reply as string) };
}
```

- [ ] **Step 4: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp-command-service.ts apps/api/src/services/whatsapp-conversation-service.ts
git commit -m "feat(whatsapp): comando 'resumo' mostra tarefas, deep work, habitos e streak do dia"
```

---

## Task 14: Melhorar o comando `fiz` para busca por nome parcial

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts`

O `fiz` atual existe no command service (linha ~700-707). O objetivo é melhorar o caso de uso fora de fluxo: quando o match é ambíguo, abrir lista de candidatas.

- [ ] **Step 1: Verificar o comportamento atual do `fiz`**

Ler as linhas 695-720 do `whatsapp-command-service.ts`:
```bash
sed -n '695,720p' apps/api/src/services/whatsapp-command-service.ts
```

Entender como o `fiz` atual funciona — se já faz busca por nome, verificar o que está faltando.

- [ ] **Step 2: Adicionar tratamento de ambiguidade no conversation service**

Em `inferNaturalCommand`, verificar se o padrão `fiz [nome]` já é capturado. Se sim, o command service já lida com isso. Caso o command service retorne uma mensagem de erro por ambiguidade (ex: "Mais de uma tarefa encontrada"), o conversation service pode interceptar e abrir o `open_tasks_list`.

Se o command service simplesmente retorna erro: adicionar no `handleInbound`, após `this.runCommand(inferredCommand)`, uma verificação:

```typescript
// No bloco onde inferredCommand é executado:
const result = await this.runCommand(inferredCommand);
if (/mais de uma tarefa/i.test(result.reply as string)) {
  // Abrir lista para escolha
  const choices = await this.listTaskChoices(8);
  await this.setSession(phoneNumber, 'open_tasks_list', { choices }, LONG_SESSION_TTL_MINUTES);
  return { reply: this.renderOpenTaskList(choices) };
}
```

- [ ] **Step 3: Adicionar `fiz N` no `open_tasks_list` com precedência sobre seleção simples**

Em `processOpenTasksInput`, localizar o handler para `open_tasks_list`. Antes de processar a seleção normal de número, verificar o padrão `fiz N`:

```typescript
// No início de processOpenTasksInput, quando state === 'open_tasks_list':
const fizMatch = text.trim().match(/^fiz\s+(\d+)$/i);
if (fizMatch) {
  const idx = Number(fizMatch[1]);
  const taskId = this.resolveChoiceToken(String(idx), payload);
  if (taskId) {
    const result = await this.runCommand(`fiz ${taskId}`);
    await this.setSession(phoneNumber, 'idle');
    return { reply: this.prettifyReply(result.reply as string) };
  }
}
```

- [ ] **Step 4: Verificar compilação**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp-conversation-service.ts
git commit -m "feat(whatsapp): 'fiz N' no open_tasks_list, tratamento de ambiguidade no fiz"
```

---

## Task 15: Reorganizar ordem de verificação em `handleInbound`

**Arquivos:**
- Modify: `apps/api/src/services/whatsapp-conversation-service.ts:1736+`

Esta é a última task porque consolida toda a lógica de roteamento após todos os handlers estarem implementados. Verificar que a ordem final está correta conforme o spec.

- [ ] **Step 1: Auditar a ordem atual de `handleInbound`**

Ler as linhas 1736-1920 do conversation service e mapear a ordem atual de verificações. Confirmar que após os tasks anteriores a ordem está:

1. Texto vazio → menu ✓
2. Saudação → menu ✓
3. Saída → idle ✓
4. `getSession()` ✓
5. ~~Humor parser~~ (removido no Task 3) ✓
6. Estado da sessão → rotear:
   - `awaiting_focus_confirmation` ← Task 8
   - `habit_checkin` ← Task 10
   - `inbox_complete_pick` ← Task 12
   - `menu` → `processMenuInput()`
   - `focus_*` → `processFocusInput()`
   - `deep_*` → `processDeepInput()`
   - `open_tasks_*` → `processOpenTasksInput()`
   - `notes_*` → `processNotesInput()`
   - `capture_inbox` → `processCaptureInbox()`
7. LLM → regex → command direct → fallback

- [ ] **Step 2: Garantir que os 3 novos estados estão roteados ANTES dos estados existentes**

Os novos estados devem ter verificação explícita antes do bloco genérico de estado. Verificar que as adições dos tasks anteriores ficaram na posição correta. Se algum ficou depois do bloco de menu/focus/deep, mover para antes.

- [ ] **Step 3: Verificar compilação final de todo o projeto**

```bash
cd /Users/yohannreimer/Downloads/operis-dev/operis/apps/api && npx tsc --noEmit
```

Esperado: zero erros de TypeScript.

- [ ] **Step 4: Verificar que não há referências órfãs**

```bash
grep -n "parseHumorReply\|buildHumorBlock\|DayHumor\|notifyHumor\|onHumorDeclared" apps/api/src/services/whatsapp-conversation-service.ts apps/api/src/services/whatsapp-briefing-service.ts apps/api/src/services/whatsapp-auto-dispatch-service.ts
```

Esperado: nenhum resultado (ou apenas definição no briefing service se quiser manter por compatibilidade).

- [ ] **Step 5: Push final**

```bash
git add -A
git commit -m "refactor(whatsapp): ordem final de handleInbound — sessao sempre primeiro"
git push
```

---

## Checklist de Validação Manual

Após implementar todos os tasks, testar os fluxos principais manualmente via webhook local:

**Briefing matinal:**
- [ ] Endpoint `/webhooks/whatsapp/dispatch/morning` dispara 2-4 mensagens separadas
- [ ] Sessão `awaiting_focus_confirmation` é criada no banco após o briefing
- [ ] Responder "sim" confirma o foco e vai para idle
- [ ] Responder "1 e 2" confirma apenas as tarefas 1 e 2
- [ ] Responder "manda as tarefas" abre a lista

**Check-in noturno:**
- [ ] Comando "hábitos" abre o fluxo `habit_checkin`
- [ ] Responder "1 3" marca os hábitos 1 e 3
- [ ] Responder "todos" marca todos os não feitos
- [ ] Responder "nenhum" encerra sem registrar

**Dedup fix:**
- [ ] Enviar "1", "1", "1" em rápida sucessão — cada um deve ser processado

**Fluxo inbox:**
- [ ] "fiz inbox" abre lista com 5 últimos itens
- [ ] Responder "2" marca o item 2 como feito

**Resumo:**
- [ ] "resumo" retorna uma mensagem com todos os dados do dia

**Regressão:**
- [ ] Menu: opção "2" (tarefas) não reenvia o menu ao final
- [ ] Estar em `open_tasks_list` e digitar "1" não é mais interpretado como humor
