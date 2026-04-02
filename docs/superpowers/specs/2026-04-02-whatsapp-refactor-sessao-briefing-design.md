# WhatsApp Refactor — Sessão, Briefing e Novas Funcionalidades

**Data:** 2026-04-02
**Status:** Aprovado para implementação
**Contexto:** O bot do WhatsApp existe como extensão do Operis mas está com múltiplos bugs críticos e funcionalidades novas pendentes. Este documento cobre a refatoração da máquina de estados, correção de todos os bugs identificados, redesign do briefing matinal e adição do check-in noturno de hábitos.

---

## Visão

O WhatsApp é uma extensão de baixo atrito do Operis. O usuário já usa o app diariamente no celular — o bot permite consultar tarefas, capturar itens, marcar conclusões e acompanhar hábitos sem precisar abrir o computador. A interação funciona por texto livre, áudio ou menus numerados quando necessário.

---

## 1. Bugs Identificados e Correções

### Bug 1 — Parser de humor intercepta todas as mensagens globalmente

**Problema:** `WhatsappBriefingService.parseHumorReply(text)` é chamado em `handleInbound` antes de qualquer verificação de estado de sessão. Qualquer mensagem "1", "2" ou "3" é interpretada como resposta de humor, quebrando navegação de menus, seleção de tarefas, deep work, e todos os fluxos numéricos.

**Correção:** Remover a chamada global de `parseHumorReply`. O processamento de humor (agora renomeado para confirmação de foco) ocorre apenas dentro do handler do estado `awaiting_focus_confirmation`.

### Bug 2 — Briefing matinal não cria sessão

**Problema:** `WhatsappAutoDispatchService` envia o briefing sem chamar `setSession`. O bot não sabe que está aguardando resposta. Quando o usuário responde, cai no fallback "Não entendi essa mensagem" e exibe o menu.

**Correção:** Após enviar a última mensagem do briefing (foco sugerido), chamar `setSession(phone, 'awaiting_focus_confirmation', { top3: [...] }, 60)`.

### Bug 3 — Mensagens muito longas

**Problema:** O briefing concatena 5 blocos em uma única string. Respostas de menu concatenam conteúdo + menu completo. Pode ultrapassar o limite de 4096 caracteres do WhatsApp e é difícil de ler.

**Correção:** `handleInbound` passa a retornar `string | string[]`. O webhook itera o array e envia cada mensagem com delay de 300ms. Briefing vira array de mensagens independentes.

### Bug 4 — Deduplicação bloqueia respostas numéricas curtas

**Problema:** `INBOUND_SEMANTIC_DEDUP_TTL_MS = 10s` bloqueia mensagens idênticas. Respostas "1", "2", "3" enviadas em sequência dentro de 10 segundos são descartadas silenciosamente.

**Correção:** Não aplicar semantic dedup para mensagens com 3 caracteres ou menos.

### Bug 5 — Mensagens proativas não criam sessão

**Problema:** Mensagens proativas (deep work window, prazos, check de progresso, etc.) são enviadas sem criar sessão. O usuário não consegue "continuar" o contexto daquela mensagem.

**Correção:** Cada mensagem proativa do `WhatsappProactivityEngine` chama `setSession` com um estado mínimo (ex: `idle` com payload `{ lastProactiveContext: 'deepwork_window' }`) para que o LLM tenha contexto ao processar a resposta.

### Bug 6 — Menus concatenados em respostas inflam mensagens

**Problema:** Opção 2 (tarefas) retorna conteúdo das tarefas + menu completo. Opção 4 retorna prazos + followups + menu. Isso gera mensagens desnecessariamente longas e confusas.

**Correção:** Não concatenar o menu de volta nas respostas. O estado da sessão garante o contexto. Menu só é reenviado explicitamente quando o fluxo termina ou quando o usuário digita *menu*.

---

## 2. Redesign da Máquina de Estados

### Princípio central

**Sessão sempre primeiro.** Em `handleInbound`, a ordem de verificação é:

1. Saudação ou saída → resposta direta, sem checar sessão
2. Qual é o estado atual da sessão?
3. Rotear para o handler do estado
4. LLM / inferência natural → apenas se estado for `idle` ou `menu`

Nenhuma verificação global de padrões (humor, comandos diretos) roda antes de checar o estado.

### Estados existentes (mantidos)

`idle`, `menu`, `capture_inbox`, `focus_menu`, `focus_swap_slot`, `focus_swap_task`, `focus_manual_ids`, `deep_menu`, `deep_start_waiting_task`, `notes_menu`, `notes_pick_folder`, `notes_pick_note`, `notes_create_quick`, `open_tasks_list`, `open_tasks_actions`

### Estados novos

| Estado | Quando é criado | O que espera |
|--------|----------------|--------------|
| `awaiting_focus_confirmation` | Após enviar briefing matinal | Resposta de confirmação/ajuste do foco sugerido (texto livre ou áudio) |
| `habit_checkin` | Após enviar check-in noturno automático ou comando manual | Números dos hábitos completados (ex: "1 3 5") |

### Remoção

O estado implícito de "humor pendente" (parser global) é removido completamente. A pergunta de humor do dia não faz parte do briefing redesenhado.

---

## 3. Redesign do Briefing Matinal

### Estrutura de mensagens

O briefing passa de 1 mensagem longa para 2 a 4 mensagens curtas, enviadas sequencialmente com 300ms de intervalo:

**Mensagem 1 — Leitura situacional** *(sempre enviada)*
- 2–3 linhas geradas por LLM (gpt-4o-mini) ou fallback estruturado
- Contexto: streak, taxa de execução, janela de foco disponível
- Exemplo: *"🔥 4 dias de streak. Hoje tem 3 compromissos — janela real de foco: 3h. Vamos ser cirúrgicos."*

**Mensagem 2 — Compromissos do dia** *(somente se houver compromissos cadastrados)*
- Lista de compromissos com horário e duração
- Janelas livres calculadas
- Exemplo:
  ```
  📅 *Hoje:*
  • 09h00 — Reunião equipe (60min)
  • 14h00 — Call cliente (30min)

  ⏱ Janelas: 07h–09h (2h) · 10h–14h (4h)
  ```

**Mensagem 3 — Alerta informativo** *(somente se houver tarefa A atrasada)*
- Máximo 1 alerta, informativo apenas, sem pergunta
- Exemplo: *"⚠️ "Proposta B2B" atrasada 3 dias — lembre-se disso."*

**Mensagem 4 — Foco sugerido + 1 pergunta** *(sempre enviada, cria sessão)*
- Top 3 rankeados por prioridade, prazo e atraso
- Uma única pergunta aberta ao final
- Cria sessão `awaiting_focus_confirmation` com TTL de 60 minutos
- Exemplo:
  ```
  🎯 *Foco sugerido:*
  1. Proposta comercial B2B
  2. Revisar contrato fornecedor
  3. Responder emails pendentes

  Confirmar? Responda sim, troque ou mande áudio.
  ```

### Processamento da resposta (estado `awaiting_focus_confirmation`)

A resposta do usuário (texto ou áudio transcrito via Whisper) é enviada ao LLM com o contexto do top 3 atual. O LLM extrai a intenção:

| Resposta do usuário | Comportamento |
|--------------------|---------------|
| *"sim"* / *"confirmar"* / *"pode"* | Confirma as 3 tarefas sugeridas como foco do dia |
| *"só vou fazer a proposta hoje"* | Define foco apenas na tarefa 1 |
| *"1 e 2"* | Confirma apenas as tarefas 1 e 2 |
| *"não, manda as tarefas"* | Abre lista completa de tarefas abertas para o usuário escolher |
| Áudio com instrução livre | Transcreve via Whisper, processa via LLM com mesmo contexto |

Após processar, sessão volta para `idle`.

---

## 4. Check-in Noturno de Hábitos

### Disparo automático

`WhatsappAutoDispatchService` ganha um segundo trigger diário. Configurado via variável de ambiente `WHATSAPP_EVENING_TIME` (padrão: `21:00`).

Ao disparar, o serviço:
1. Busca todos os hábitos ativos do usuário
2. Verifica quais já foram registrados hoje
3. Envia mensagem com lista numerada e status atual
4. Cria sessão `habit_checkin` com payload contendo os hábitos

Exemplo de mensagem:
```
🌙 *Fim de dia. Quais hábitos você fez hoje?*

1. ☐ Exercício
2. ✅ Meditação
3. ☐ Leitura
4. ☐ Sem açúcar

Responda com os números. Ex: *1 3*
Ou *todos* para marcar todos, *nenhum* para pular.
```

### Comando manual

Palavras-chave: *"hábitos"*, *"registrar hábitos"*, *"fiz hábitos"*, *"check hábitos"*

Abre o mesmo fluxo `habit_checkin` a qualquer hora do dia.

### Processamento da resposta (estado `habit_checkin`)

| Resposta | Comportamento |
|----------|---------------|
| *"1 3"* | Marca hábitos 1 e 3 como feitos |
| *"todos"* | Marca todos os hábitos da lista |
| *"nenhum"* / *"0"* | Encerra sem registrar |
| Número inválido | Ignora e confirma apenas os válidos |

Resposta de confirmação inclui streak atual de cada hábito marcado.

---

## 5. Novas Funcionalidades

### Marcar tarefa feita

**Dentro do fluxo `open_tasks_list`:** digitar o número + *"fiz"* conclui a tarefa (ex: *"fiz 2"*).

**Fora de fluxo:** *"fiz [nome parcial]"* — bot busca a tarefa, confirma o título e marca como feita. Se houver ambiguidade, lista as opções.

**Feedback:** inclui XP ganho se gamificação estiver ativa.

### Marcar inbox feito

Palavras-chave: *"fiz inbox"*, *"inbox feito"*, *"concluir inbox"*

Bot lista os últimos 5 itens abertos do inbox numerados. Usuário responde com o número. Marca como `feito`.

### Resumo do dia

Palavra-chave: *"resumo"*

Mensagem única com:
- Tarefas A concluídas hoje
- Minutos de deep work acumulados
- Hábitos feitos vs total
- Streak atual

### Áudio em qualquer fluxo

Hoje o áudio só funciona quando o estado é `idle`. Passa a funcionar em qualquer estado — transcreve via Whisper e processa o texto resultante dentro do handler do estado ativo.

---

## 6. Arquitetura Técnica

### Tipo de retorno multi-mensagem

```typescript
type ConversationResult = {
  reply: string | string[];
  relatedTaskId?: string;
};
```

`webhooks.ts` itera o array e envia cada mensagem com 300ms de delay via `publishEvent` / Evolution API.

### Ordem de verificação em `handleInbound`

```
1. Texto vazio → menu
2. Saudação (oi, olá, bom dia, menu) → menu
3. Saída (sair, cancelar) → idle
4. Buscar sessão ativa
5. Estado da sessão → rotear para handler específico:
   - awaiting_focus_confirmation → processFocusConfirmation()
   - habit_checkin → processHabitCheckin()
   - menu → processMenuInput()
   - focus_* → processFocusInput()
   - deep_* → processDeepInput()
   - open_tasks_* → processOpenTasksInput()
   - notes_* → processNotesInput()
   - capture_inbox → processCaptureInbox()
6. Estado idle ou sem sessão:
   a. LLM intent extraction (se disponível)
   b. Regex inference
   c. Command direct attempt
   d. Fallback: "Não entendi" + menu
```

### Arquivos afetados

| Arquivo | Mudanças |
|---------|----------|
| `whatsapp-conversation-service.ts` | Refatoração da ordem de verificação, remoção do parser global de humor, adição de `awaiting_focus_confirmation` e `habit_checkin`, suporte a áudio em qualquer estado |
| `whatsapp-briefing-service.ts` | `buildIntelligentBriefing()` retorna `string[]` em vez de `string` |
| `whatsapp-auto-dispatch-service.ts` | Trigger noturno para hábitos, `setSession` após envio do briefing, `setSession` mínima após proativas |
| `webhooks.ts` | Suporte a `string[]` no retorno, fix de dedup para mensagens ≤ 3 chars |
| `whatsapp-command-service.ts` | Comando `resumo`, melhoria do `fiz`, comando `inbox feito` |

### Sem mudanças de banco de dados

Os modelos existentes (`WhatsappConversationSession`, `Habit`, `HabitLog`, `InboxItem`, `Task`) suportam todas as funcionalidades descritas sem novas migrations.

---

## 7. Variáveis de Ambiente Novas

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `WHATSAPP_EVENING_TIME` | `21:00` | Horário do check-in noturno de hábitos |

---

## 8. Fora do Escopo

- Interface web para gerenciar configurações do bot
- Multi-usuário (o bot opera em conta única)
- Histórico de conversa persistente além do TTL de sessão
- Integração com calendário externo
