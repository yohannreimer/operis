# Design: WhatsApp como Secretária Inteligente + Compromissos
**Data:** 2026-03-22
**Status:** Aprovado para implementação
**Produto:** Operis — Execution OS
**Foco inicial:** Público brasileiro

---

## Visão

Transformar o WhatsApp do Operis de uma interface de comandos em uma **secretária pessoal inteligente** — que entende áudio, conhece sua rotina, age de forma proativa e gerencia não só tarefas mas também compromissos do dia a dia.

A visão final do Operis como produto:
```
Operis = Notas + Tarefas + Projetos + Compromissos
                    ↕
         WhatsApp como interface universal
         de tudo isso via voz e texto natural
```

---

## Escopo

Este design cobre **duas grandes frentes**:

1. **Compromissos** — nova entidade no app (web + dados + lógica)
2. **WhatsApp Inteligente** — áudio, briefing com IA, proatividade, fluxo de secretária

---

## PARTE 1 — Compromissos

### 1.1 Conceito (GTD-inspirado)

**Compromisso** é diferente de **Tarefa**:
- **Tarefa** = algo que você *faz* (entregável, tem progresso, vai para o backlog se não feito)
- **Compromisso** = algo que você *tem* (ocupa tempo no calendário, é presença, não entregável)

Dois tipos inspirados no GTD:

| Tipo | Descrição | Exemplos |
|------|-----------|---------|
| **Fixo** | Recorrente, já faz parte da semana | Academia seg/qua/sex 7h, Weekly review sexta 16h, Almoço com sócio toda quinta |
| **Variável** | Surgiu agora, acontece uma ou poucas vezes | Reunião com investidor amanhã 15h, Dentista sexta 10h, Call com cliente X |

### 1.2 Modelo de dados

```typescript
// Novo model: Commitment
model Commitment {
  id          String   @id @default(uuid())
  userId      String
  workspaceId String?  // opcional — pode ser vinculado a uma frente
  projectId   String?  // opcional — reunião vinculada a projeto

  title       String
  description String?
  type        CommitmentType  // 'fixed' | 'variable'

  // Horário
  startTime   String?  // HH:mm — horário de início
  durationMin Int?     // duração em minutos

  // Recorrência (só type=fixed)
  recurrence  Json?    // { days: ['mon','wed','fri'], until?: Date }

  // Data (variável ou ocorrência específica)
  date        DateTime?

  // Status por ocorrência
  status      CommitmentStatus  // 'active' | 'cancelled_today' | 'rescheduled' | 'done'

  // Exceções de recorrência (dias cancelados/remarcados)
  exceptions  CommitmentException[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, date])
}

model CommitmentException {
  id           String   @id @default(uuid())
  commitmentId String
  date         DateTime // qual ocorrência foi afetada
  action       String   // 'cancelled' | 'rescheduled'
  newDate      DateTime? // se remarcado
  newTime      String?   // HH:mm se remarcado
  commitment   Commitment @relation(...)
}
```

### 1.3 Lógica de compromissos fixos

Um compromisso fixo gera **ocorrências** dinamicamente a partir da regra de recorrência. Não armazena cada ocorrência — armazena só as exceções.

```typescript
// getCommitmentsForDate(userId, date) retorna:
// 1. Todos os variable com date === date
// 2. Todos os fixed cuja recorrência inclui o dia da semana de date
//    exceto os que têm CommitmentException de 'cancelled' para date
```

### 1.4 Seção no web app

**Nova página: `/agenda`** (ou seção na sidebar entre Hoje e Tarefas)

Layout:
```
Compromissos
[+ Novo compromisso]  [Fixos | Variáveis | Todos]

── Fixos ──────────────────────────────────────
🏋️ Academia          Seg · Qua · Sex  07h00  45min  [Editar]
📋 Weekly Review      Sexta            16h00  60min  [Editar]
🍽️ Almoço com Paulo  Quinta           13h00  90min  [Editar]

── Esta semana ────────────────────────────────
Seg 23    Qua 25    Qui 26          Sex 27
Academia  Academia  Almoço Paulo    Weekly Review
07h00     07h00     13h00    15h00  Dentista
                    Reunião João    16h00
                    (Projeto X)
```

### 1.5 Integração com Hoje

A página **Hoje** passa a mostrar compromissos na timeline:

```
HOJE — Quinta, 26 mar
Capacidade real: 5h30 (descontando compromissos)

Timeline:
07:00 ──────────────────────────────────────────
08:00  [Bloco livre — 3h disponíveis]
09:00
10:00
11:00
12:00  [Bloco livre — 1h]
13:00  ██ ALMOÇO COM PAULO ██ 1h30
14:30
15:00  ██ REUNIÃO JOÃO — PROJETO X ██ 1h
16:00  [Bloco livre — 2h]
17:00
18:00
```

**Impacto no cálculo de capacidade:**
- Compromissos com horário definido bloqueiam a timeline
- `availableMinutes` = `totalWorkMinutes - sum(commitmentDurations)`
- O Top 3 levará em conta a capacidade real disponível

### 1.6 Integração com Projetos

Ao criar um compromisso variável, opção de vincular a projeto:
- *"Reunião de alinhamento — Projeto Operis B2B"*
- Aparece no interior do projeto (zona C) como registro de evento
- Pode gerar tarefa automática: "Preparar pauta para reunião X"

---

## PARTE 2 — WhatsApp Inteligente

### 2.1 Arquitetura: Camada LLM Universal

**O que muda fundamentalmente:**

Hoje, todo input passa por um parser de texto → máquina de estados. O LLM vai entrar como **camada de entendimento** antes do executor:

```
INPUT (texto ou áudio)
    ↓
[Audio?] → Whisper API → transcrição PT-BR
    ↓
LLM Intent Extraction
  Input: { transcription, conversationState, recentMessages(5), userContext }
  Output: { intent, entities, confidence, needsClarification, clarificationOptions }
    ↓
[confidence < 0.6?] → pede clarificação
    ↓
Executor (sistema atual, adaptado)
    ↓
Resposta ao usuário
```

O executor continua sendo determinístico — o LLM só traduz a intenção, não executa. Isso garante confiabilidade.

### 2.2 Contexto que o LLM recebe sempre

```typescript
interface LLMContext {
  // Conversa
  currentState: string           // estado atual da máquina
  recentMessages: Message[]      // últimas 5 mensagens (user + bot)
  payload: Record<string, any>   // payload do estado atual

  // Usuário hoje
  todayTasks: TaskSummary[]      // tarefas do dia (id, título, prioridade, status)
  top3: TaskSummary[]            // Top 3 atual
  todayCommitments: Commitment[] // compromissos de hoje com horários
  availableMinutes: number       // capacidade real livre

  // Projetos
  activeProjects: ProjectSummary[] // id, nome, tipo, status

  // Humor do dia (se respondido no briefing)
  dayHumor: 'focado' | 'cansado' | 'sobrecarregado' | null

  // Histórico recente (para personalização)
  executionRate7d: number
  streakDays: number
}
```

### 2.3 Prompt principal do LLM

```
Você é a secretária do Operis, sistema de execução pessoal do {userName}.

CONTEXTO ATUAL:
Estado da conversa: {currentState}
Mensagens recentes: {recentMessages}

DADOS DO USUÁRIO HOJE:
Compromissos: {todayCommitments}
Top 3 atual: {top3}
Tarefas do dia: {todayTasks}
Capacidade livre: {availableMinutes}min
Humor declarado: {dayHumor}
Projetos ativos: {activeProjects}

MENSAGEM DO USUÁRIO: "{input}"

Retorne JSON:
{
  "intent": string,          // ver lista de intents abaixo
  "entities": {},            // dados extraídos (título, data, hora, id de tarefa, etc)
  "confidence": number,      // 0.0 a 1.0
  "needsClarification": boolean,
  "clarificationMessage": string | null,  // o que perguntar se needsClarification
  "clarificationOptions": string[] | null // opções numeradas se aplicável
}

LISTA DE INTENTS:
create_task | complete_task | postpone_task | reschedule_task
create_commitment | cancel_commitment | reschedule_commitment
confirm_top3 | modify_top3 | swap_top3 | reduce_top3 | request_task_list
start_deep_work | stop_deep_work
capture_inbox | query_tasks | query_projects | query_commitments
declare_humor | general_conversation | unclear

REGRAS:
- Quando o usuário diz "não quero essas 3, me mostra a lista" → intent: request_task_list
- Quando diz "hoje só vou fazer uma coisa" sem especificar qual → needsClarification: true, mostrar Top 3 para escolher
- Quando diz "cancela academia hoje" → intent: cancel_commitment, entities: { title: "academia", scope: "today_only" }
- Quando diz "remarca reunião do João" sem nova data → needsClarification: true, pedir nova data/hora
- Responder sempre em português brasileiro, tom direto e humano
```

### 2.4 Fluxo de negociação do Top 3 (exemplo completo)

```
Bot (briefing 08h):
"🎯 Sugiro seu foco de hoje:
 1. Finalizar proposta cliente X
 2. Review deck de vendas
 3. Email para o João
 Confirmar? Responda sim, troque ou mande áudio."

───────────────────────────────────
Usuário (áudio): "não quero nenhuma dessas, me mostra
                  o que eu tenho pra fazer hoje"

LLM interpreta:
{ intent: "request_task_list", confidence: 0.95 }

Bot: "Claro! Suas tarefas abertas hoje:
 1. Finalizar proposta cliente X ⚡A
 2. Review deck de vendas ⚡A
 3. Email para o João 🔵B
 4. Atualizar CRM 🔵B
 5. Pesquisa de fornecedores 🟢C

 Qual(is) você quer como foco? Pode me falar os
 números ou mandar um áudio."

───────────────────────────────────
Usuário (texto): "4 e 1"

LLM interpreta:
{ intent: "modify_top3", entities: { selectedIds: [4, 1] }, confidence: 0.98 }

Bot: "✅ Foco atualizado:
 1. Atualizar CRM
 2. Finalizar proposta cliente X
 Boa execução! 🎯"

───────────────────────────────────
Usuário (áudio): "hoje eu só consigo fazer uma coisa,
                  tô com a cabeça muito pesada"

LLM interpreta:
{
  intent: "reduce_top3",
  entities: { quantity: 1 },
  confidence: 0.9,
  needsClarification: true,
  clarificationMessage: "Qual das duas você quer manter?",
  clarificationOptions: ["Atualizar CRM", "Finalizar proposta cliente X"]
}

Bot: "Entendido — dia leve 🤝
 Qual você quer manter como única prioridade?
 1️⃣ Atualizar CRM
 2️⃣ Finalizar proposta cliente X"

Usuário: "2"
Bot: "✅ Um foco só hoje: Finalizar proposta cliente X.
 Vou te deixar em paz — só apareço se for urgente. 💪"
```

### 2.5 Processamento de Áudio

**Pipeline:**
```
Webhook recebe payload com tipo 'audio'
    ↓
WhatsappAudioService.process(audioUrl)
    ↓
Download do arquivo (Evolution API)
    ↓
OpenAI Whisper API (model: whisper-1, language: pt)
    ↓
Transcrição em texto
    ↓
Passa para LLM Intent Extraction com contexto completo
    ↓
Executor processa intent
    ↓
Resposta inclui confirmação do que foi entendido:
"🎙️ Entendi: [transcrição resumida]"
```

**Fallbacks:**
- Arquivo muito grande (>25MB) → "Áudio muito longo, pode resumir?"
- Transcrição vazia ou ininteligível → "Não consegui entender o áudio, pode repetir em texto?"
- Confidence < 0.6 → clarificação antes de executar qualquer ação

**Confirmação em ações irreversíveis:**
Mesmo com alta confiança, ações destrutivas pedem confirmação:
- "Concluir tarefa X — confirmar? (sim/não)"
- "Cancelar compromisso Academia hoje — confirmar?"

### 2.6 Morning Briefing Inteligente

**Dados consumidos (últimos 7 dias):**
```typescript
interface BriefingContext {
  executionRate7d: number        // % tarefas A concluídas
  streakDays: number             // dias consecutivos com Top 3 completo
  averageDeepWorkMinutes: number
  mostPostponedTasks: Task[]     // adiadas 3+ vezes
  todayCommitments: Commitment[] // com horários
  todayAvailableMinutes: number  // real (descontando compromissos)
  top3Candidates: Task[]         // rankeadas por: atraso + prazo + impacto
  overdueTasks: Task[]
  bestProductiveHour: string     // horário mais produtivo historicamente
  failurePattern: string | null  // ex: "Quartas você raramente fecha A"
}
```

**Estrutura do briefing (4 blocos):**

**Bloco 1 — Leitura da situação (LLM, 2-3 linhas)**
Interpreta, não lista. Exemplos:
- *"📊 Streak de 4 dias — você tá em ritmo. Mas 'Proposta B2B' ficou parada 3 dias seguidos."*
- *"⚠️ Hoje tem 3 compromissos — sua janela real de foco é de 2h30. Vamos ser cirúrgicos."*
- *"🔥 Semana excelente. Não deixa a sexta quebrar o streak."*

**Bloco 2 — Compromissos do dia**
```
📅 Hoje:
• 07h00 — Academia (45min)
• 14h00 — Reunião João — Projeto X (1h)
⏱ Janelas livres: 08h-13h30 e 15h-18h (5h de foco possível)
```

**Bloco 3 — Decisão já tomada (Top 3 sugerido)**
```
🎯 Seu foco sugerido:
1. Finalizar proposta B2B (atrasada 2 dias)
2. Preparar pauta reunião João (hoje 14h!)
3. Revisar onboarding

Confirmar? Responda sim, troque ou mande áudio.
```

**Bloco 4 — Alerta cirúrgico (máx 1, só se existir)**
```
🚨 "Reunião com investidor" está no backlog há 12 dias sem data.
Quer agendar ou arquivar?
```

**Bloco 5 — Pergunta de humor (sempre)**
```
Como você chega hoje?
1️⃣ Focado  2️⃣ Cansado  3️⃣ Sobrecarregado
```

**Calibração pelo humor:**
- Focado → proatividade normal, tom direto
- Cansado → reduz Top 3 para 2, 1 mensagem proativa max no dia
- Sobrecarregado → sugere 1 prioridade só, zero proatividade extra, mensagem de suporte

### 2.7 Proatividade Contextual — 7 Triggers

**Regras globais anti-spam:**
- Máx 2 mensagens proativas/dia (exceto briefing)
- Humor "sobrecarregado" → 0 proativas
- Só dentro da `ACTIVE_WINDOW`
- Cada trigger tem cooldown de 24h
- Não interrompe conversa ativa

---

**Trigger 1 — Top 3 não confirmado (10h30)**
*Condição:* >10h30 + Top 3 não confirmado + humor ≠ sobrecarregado
```
⏰ Já são 10h30 e o foco do dia ainda não foi confirmado.
[repete sugestão do briefing]
Confirmar agora? Responda sim ou mande áudio.
```

**Trigger 2 — Janela de deep work detectada**
*Condição:* ≥90min sem compromisso + sem deep work ativo + antes das 15h + max 1x/dia
```
🧠 Você tem ~90 minutos livres agora.
Prioridade A: [tarefa]
Iniciar sessão? Responda sim ou diga outra tarefa.
```

**Trigger 3 — Tarefa A travada (3+ adiamentos)**
*Horário:* 11h, só se Top 3 confirmado
```
🔍 "[Tarefa]" está no seu radar há 3 dias sem avançar.
O que tá travando?
1️⃣ Esperando alguém
2️⃣ Não sei por onde começar
3️⃣ Não é mais prioridade
4️⃣ Vou fazer hoje ainda
```

**Trigger 4 — Check-in fim de tarde (17h)**
*Condição:* ≥1 tarefa A concluída + ≥1 pendente
```
🌆 Atualização rápida:
✅ [tarefa feita]
⏳ [tarefa pendente] — continuar ou mover pra amanhã?
```

**Trigger 5 — Parabéns cirúrgico**
*Condição:* Top 3 100% + antes das 16h + max 1x/semana
```
🏆 Top 3 completo antes das 16h.
1️⃣ Puxar tarefa B do backlog
2️⃣ Weekly review antecipado
3️⃣ Encerrar o dia — você merece
```

**Trigger 6 — Silêncio longo**
*Condição:* Sem interação há 3+ dias úteis
```
👋 Faz 3 dias que você não aparece.
Quando quiser retomar, manda foco ou um áudio.
```

**Trigger 7 — Weekly Review (sexta 16h)**
Fluxo de 5 perguntas interativo. Respostas viram nota automática no Operis.
```
📅 Review da semana — 5 perguntas rápidas
[Estatísticas da semana]
1/5 — Qual foi a maior vitória?
```

### 2.8 Compromissos no WhatsApp

**Criação via conversa:**
- *"Academia toda segunda quarta e sexta às 7h"* → cria compromisso fixo
- *"Reunião com João amanhã às 15h sobre o projeto X"* → cria variável, vincula ao projeto se reconhecido
- *"Dentista sexta dia 28 às 10h30"* → cria variável com data específica

**Cancelamento/remarcação:**
- *"Academia cancelada hoje"* → cria exceção para hoje, mantém recorrência
- *"Cancela reunião do João"* → busca compromisso, confirma antes de cancelar
- *"Remarca dentista pra semana que vem"* → pede nova data/hora

**Consulta:**
- *"O que eu tenho hoje?"* → lista compromissos + tarefas do dia
- *"Tenho algum compromisso essa semana?"* → lista por dia

---

## PARTE 3 — Arquitetura técnica resumida

### Novos arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `apps/api/src/services/whatsapp-audio-service.ts` | Whisper download + transcrição |
| `apps/api/src/services/whatsapp-llm-service.ts` | Intent extraction com contexto |
| `apps/api/src/services/whatsapp-briefing-service.ts` | Context building + geração do briefing |
| `apps/api/src/services/whatsapp-proactivity-engine.ts` | Motor de triggers |
| `apps/api/src/routes/commitments.ts` | CRUD de compromissos |
| `apps/web/src/pages/agenda.tsx` | Página de compromissos no web |
| `apps/api/prisma/migrations/XXXX_commitments/` | Migration da nova tabela |

### Arquivos modificados

| Arquivo | O que muda |
|---------|-----------|
| `apps/api/src/routes/webhooks.ts` | Detectar tipo audio + rotear para audio service |
| `apps/api/src/services/whatsapp-conversation-service.ts` | Integrar LLM layer antes do executor |
| `apps/api/src/services/whatsapp-auto-dispatch-service.ts` | Integrar briefing service + proactivity engine |
| `apps/api/src/services/whatsapp-command-service.ts` | Adicionar handlers para compromissos |
| `apps/web/src/pages/hoje.tsx` | Mostrar compromissos na timeline |
| `apps/web/src/pages/projetos.tsx` | Link de compromisso em projeto |
| `apps/api/prisma/schema.prisma` | Novos models Commitment + CommitmentException |

### Dependências novas

```json
{
  "openai": "^4.x"  // Whisper + GPT (já pode estar instalado)
}
```

Variáveis de ambiente novas:
```
OPENAI_API_KEY        — para Whisper e GPT-4o-mini
LLM_MODEL             — padrão: gpt-4o-mini (custo baixo, velocidade alta)
WHATSAPP_AUDIO_ENABLED — toggle para áudio (default: true)
```

---

## Ordem de implementação sugerida

| Fase | Feature | Impacto |
|------|---------|---------|
| 1 | **Modelo Commitments** — migration + API CRUD | Fundação |
| 2 | **Página Agenda** no web — criar e visualizar | Usuário já usa no web |
| 3 | **Hoje integrado** — compromissos na timeline + capacidade real | WOW imediato no app |
| 4 | **WhatsApp Audio** — Whisper + LLM intent | WOW imediato no WhatsApp |
| 5 | **LLM layer universal** — texto natural em todos os contextos | Secretária de verdade |
| 6 | **Briefing inteligente** — substitui o briefing atual | Ritual matinal diferencial |
| 7 | **Proatividade** — 7 triggers | App que cuida de você |
| 8 | **Compromissos no WhatsApp** — criar/cancelar/remarcar por voz | Círculo completo |

---

## Métricas de sucesso

- Usuário manda áudio e bot executa corretamente em >85% dos casos
- Morning briefing tem taxa de resposta (Top 3 confirmado) >70%
- Compromissos fixos reduzem tempo de planejamento matinal
- Usuário usa o WhatsApp diariamente sem abrir o web em >50% dos dias
- NPS do produto sobe com "o app me conhece" como principal razão
