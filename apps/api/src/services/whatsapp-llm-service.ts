/**
 * WhatsApp LLM Service
 *
 * Universal intent extraction layer: every user message (text or transcribed audio)
 * is routed through GPT-4o-mini, which returns a structured intent.
 *
 * Falls back gracefully to `null` when no OPENAI_API_KEY is configured —
 * the conversation service then uses its existing regex-based inference.
 */

import OpenAI from 'openai';
import { env } from '../config.js';

// ─── Intent types ─────────────────────────────────────────────────────────────

export type LLMIntentAction =
  | 'list_tasks'
  | 'list_commitments'
  | 'create_task'
  | 'create_commitment'
  | 'cancel_commitment'
  | 'reschedule_commitment'
  | 'complete_task'
  | 'start_deep_work'
  | 'morning_briefing'
  | 'top3_update'
  | 'top3_lock'
  | 'capture_inbox'
  | 'list_projects'
  | 'open_menu'
  | 'help'
  | 'status'
  | 'log_habit'
  | 'vice_recaiu'
  | 'list_habits'
  | 'unknown';

export type LLMIntent =
  | { action: 'list_tasks'; date?: string }
  | { action: 'list_commitments'; date?: string }
  | { action: 'create_task'; title: string; taskType?: 'a' | 'b' | 'c'; dueDate?: string; estimatedMinutes?: number }
  | { action: 'create_commitment'; title: string; type: 'fixo' | 'variavel'; recurrenceDays?: string[]; date?: string; startTime?: string; durationMin?: number }
  | { action: 'cancel_commitment'; titleHint: string; date?: string }
  | { action: 'reschedule_commitment'; titleHint: string; newDate?: string; newTime?: string }
  | { action: 'complete_task'; titleHint: string }
  | { action: 'start_deep_work'; titleHint: string }
  | { action: 'morning_briefing' }
  | { action: 'top3_update'; titleHints: string[] }
  | { action: 'top3_lock' }
  | { action: 'capture_inbox'; content: string }
  | { action: 'list_projects' }
  | { action: 'open_menu' }
  | { action: 'help' }
  | { action: 'status' }
  | { action: 'log_habit'; titleHint: string; value?: number; unit?: string; date?: string }
  | { action: 'vice_recaiu'; titleHint: string; date?: string }
  | { action: 'list_habits'; date?: string }
  | { action: 'unknown'; rawText: string };

// ─── Context passed to the LLM ────────────────────────────────────────────────

export type LLMContext = {
  dateKey: string;           // e.g. "2026-03-22"
  dayOfWeek: string;         // e.g. "segunda-feira"
  workspaceName?: string;
  top3Tasks?: string[];      // titles of current Top 3
  todayCommitments?: string[]; // titles + times of today's commitments
};

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o interpretador de intenções do Operis, um OS de execução pessoal.
O usuário se comunica via WhatsApp, às vezes por voz (áudio transcrito) e às vezes por texto.
Sua função é identificar EXATAMENTE o que o usuário quer fazer e retornar um JSON estruturado.

REGRAS:
1. Retorne SOMENTE JSON válido, sem markdown, sem explicações.
2. O campo "action" é obrigatório.
3. Seja tolerante a erros de digitação e sotaque (texto de áudio transcrito pode ter imperfeições).
4. "hoje" = a data atual fornecida no contexto. "amanhã" = data atual + 1 dia.
5. Dias da semana em português: seg=segunda, ter=terça, qua=quarta, qui=quinta, sex=sexta, sab=sábado, dom=domingo.
6. Se o usuário disser "não vou à academia hoje" ou "cancela minha reunião de amanhã", isso é cancel_commitment.
7. Se não conseguir identificar a intenção, use action: "unknown" com o texto original.

AÇÕES DISPONÍVEIS (retorne UMA):
- list_tasks: listar tarefas (opcional: date=YYYY-MM-DD)
- list_commitments: ver compromissos (opcional: date=YYYY-MM-DD)
- create_task: criar tarefa (obrigatório: title; opcional: taskType="a"|"b"|"c", dueDate=YYYY-MM-DD, estimatedMinutes=número)
- create_commitment: criar compromisso (obrigatório: title, type="fixo"|"variavel"; se fixo: recurrenceDays=["seg","ter"...]; se variavel: date=YYYY-MM-DD; opcional: startTime="HH:mm", durationMin=número)
- cancel_commitment: cancelar/não comparecer (obrigatório: titleHint; opcional: date=YYYY-MM-DD)
- reschedule_commitment: remarcar compromisso (obrigatório: titleHint; opcional: newDate=YYYY-MM-DD, newTime="HH:mm")
- complete_task: concluir tarefa (obrigatório: titleHint=parte do título)
- start_deep_work: iniciar sessão deep work em tarefa (obrigatório: titleHint)
- morning_briefing: resumo matinal
- top3_update: atualizar Top 3 do dia (obrigatório: titleHints=[títulos ou partes])
- top3_lock: confirmar/travar o Top 3 atual
- capture_inbox: capturar ideia/pendência (obrigatório: content=texto completo)
- list_projects: ver projetos
- open_menu: abrir menu de opções
- help: pedir ajuda
- status: ver status geral
- log_habit: registrar hábito feito (obrigatório: titleHint=parte do título; opcional: value=número, unit=unidade, date=YYYY-MM-DD)
- vice_recaiu: registrar recaída em vício (obrigatório: titleHint; opcional: date=YYYY-MM-DD)
- list_habits: ver hábitos do dia (opcional: date=YYYY-MM-DD)
- unknown: intenção não reconhecida (obrigatório: rawText)

EXEMPLOS:
Usuário: "hoje não vou à academia"
→ {"action":"cancel_commitment","titleHint":"academia","date":"DATA_ATUAL"}

Usuário: "criar tarefa revisar proposta comercial urgente"
→ {"action":"create_task","title":"Revisar proposta comercial","taskType":"a"}

Usuário: "adiciona compromisso academia toda segunda quarta e sexta às 7 da manhã por 1 hora"
→ {"action":"create_commitment","title":"Academia","type":"fixo","recurrenceDays":["seg","qua","sex"],"startTime":"07:00","durationMin":60}

Usuário: "me passa a lista de tarefas"
→ {"action":"list_tasks"}

Usuário: "vou só fazer uma tarefa hoje"
→ {"action":"top3_update","titleHints":[]}

Usuário: "concluí o relatório"
→ {"action":"complete_task","titleHint":"relatório"}

Usuário: "fiz exercício hoje"
→ {"action":"log_habit","titleHint":"exercício"}

Usuário: "li 45 páginas"
→ {"action":"log_habit","titleHint":"leitura","value":45,"unit":"páginas"}

Usuário: "bebi 6 copos de água"
→ {"action":"log_habit","titleHint":"água","value":6}

Usuário: "recaí no vício de redes sociais"
→ {"action":"vice_recaiu","titleHint":"redes"}

Usuário: "meus hábitos de hoje"
→ {"action":"list_habits"}
`;

// ─── Service ──────────────────────────────────────────────────────────────────

export class WhatsappLLMService {
  private readonly client: OpenAI | null;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    } else {
      this.client = null;
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Extract structured intent from user message using GPT-4o-mini.
   * Returns null if LLM is not configured or if extraction fails.
   */
  async extractIntent(
    userMessage: string,
    context: LLMContext,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<LLMIntent | null> {
    if (!this.client) return null;

    const contextBlock = [
      `Data atual: ${context.dateKey} (${context.dayOfWeek})`,
      context.workspaceName ? `Frente ativa: ${context.workspaceName}` : null,
      context.top3Tasks?.length
        ? `Top 3 hoje: ${context.top3Tasks.map((t, i) => `${i + 1}. ${t}`).join(', ')}`
        : null,
      context.todayCommitments?.length
        ? `Compromissos de hoje: ${context.todayCommitments.join(', ')}`
        : null,
    ].filter(Boolean).join('\n');

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXTO:\n${contextBlock}` },
      // Include last 3 conversation turns for context
      ...(conversationHistory ?? []).slice(-6).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      { role: 'user', content: userMessage }
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 256,
        temperature: 0.1
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (!parsed.action || typeof parsed.action !== 'string') {
        return { action: 'unknown', rawText: userMessage };
      }

      return parsed as LLMIntent;
    } catch {
      return null;
    }
  }
}
