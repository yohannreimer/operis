/**
 * WhatsApp Briefing Service — Briefing matinal inteligente em 5 blocos
 *
 * Bloco 1 — Leitura situacional (LLM quando disponível, fallback estruturado)
 * Bloco 2 — Compromissos do dia com janelas livres calculadas
 * Bloco 3 — Top 3 sugerido (rankeado por atraso + prazo + impacto)
 * Bloco 4 — Alerta cirúrgico (máx 1)
 * Bloco 5 — Pergunta de humor
 *
 * Calibração por humor (armazenado na sessão):
 *   focado       → proatividade normal, Top 3 completo
 *   cansado      → Top 2 apenas, max 1 proativa no dia
 *   sobrecarregado → Top 1 apenas, zero proativas extras
 */

import OpenAI from 'openai';
import { PrismaClient, RecurrenceDay } from '@prisma/client';
import { env } from '../config.js';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type DayHumor = 'focado' | 'cansado' | 'sobrecarregado';

export type BriefingContext = {
  dateKey: string;
  dayOfWeek: string;              // 'segunda-feira', 'sexta-feira', etc.
  streakDays: number;
  executionRate7d: number;        // % 0-100
  averageDeepWorkMinutes: number;
  todayCommitments: CommitmentSummary[];
  todayAvailableMinutes: number;  // total livre após compromissos
  top3Candidates: TaskSummary[];  // top 3 rankeados
  overdueTasks: TaskSummary[];    // A com atraso
  mostPostponedTasks: TaskSummary[]; // adiadas 3+ vezes
  humor?: DayHumor;
};

type CommitmentSummary = {
  title: string;
  startTime: string | null;
  durationMin: number | null;
};

type TaskSummary = {
  id: string;
  title: string;
  taskType: string;
  priority: number;
  dueDate: string | null;
  rescheduleCount?: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateAtLocalMidnightFromKey(dateKey: string): Date | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dayOfWeekPt(date: Date): string {
  return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][date.getDay()];
}

function recurrenceDayOf(date: Date): RecurrenceDay {
  const days: RecurrenceDay[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  return days[date.getDay()];
}

function formatBrDate(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  return `${m[3]}/${m[2]}`;
}

function parseTotalMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Compute free windows given commitments with start/duration.
 * Work window assumed 07:00–19:00 = 720 min.
 */
function computeFreeWindows(
  commitments: CommitmentSummary[],
  workStart = 7 * 60,
  workEnd = 19 * 60
): { label: string; minutes: number }[] {
  const blocks = commitments
    .filter((c) => c.startTime && c.durationMin)
    .map((c) => {
      const start = parseTotalMinutes(c.startTime)!;
      return { start, end: start + (c.durationMin ?? 0) };
    })
    .sort((a, b) => a.start - b.start);

  const windows: { label: string; minutes: number }[] = [];
  let cursor = workStart;

  for (const block of blocks) {
    if (block.start > cursor) {
      const duration = block.start - cursor;
      if (duration >= 30) {
        const startLabel = `${String(Math.floor(cursor / 60)).padStart(2, '0')}h${cursor % 60 === 0 ? '' : String(cursor % 60).padStart(2, '0')}`;
        const endLabel = `${String(Math.floor(block.start / 60)).padStart(2, '0')}h${block.start % 60 === 0 ? '' : String(block.start % 60).padStart(2, '0')}`;
        windows.push({ label: `${startLabel}–${endLabel}`, minutes: duration });
      }
    }
    cursor = Math.max(cursor, block.end);
  }

  if (cursor < workEnd) {
    const duration = workEnd - cursor;
    if (duration >= 30) {
      const startLabel = `${String(Math.floor(cursor / 60)).padStart(2, '0')}h${cursor % 60 === 0 ? '' : String(cursor % 60).padStart(2, '0')}`;
      windows.push({ label: `${startLabel}–19h`, minutes: duration });
    }
  }

  return windows;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WhatsappBriefingService {
  private readonly openai: OpenAI | null;

  constructor(private readonly prisma: PrismaClient) {
    this.openai = env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
      : null;
  }

  get hasLLM(): boolean {
    return this.openai !== null;
  }

  // ─── Build context ─────────────────────────────────────────────────────────

  async buildContext(dateKey: string, humor?: DayHumor): Promise<BriefingContext> {
    const date = dateAtLocalMidnightFromKey(dateKey);
    if (!date) throw new Error(`Invalid date key: ${dateKey}`);

    const dowPt = recurrenceDayOf(date);
    const filterDate = new Date(`${dateKey}T00:00:00.000Z`);

    // ── Commitments ────────────────────────────────────────────────────────
    const [fixos, variavels] = await Promise.all([
      this.prisma.commitment.findMany({
        where: { type: 'fixo', status: 'ativo', recurrenceDays: { has: dowPt } },
        orderBy: { startTime: 'asc' }
      }),
      this.prisma.commitment.findMany({
        where: { type: 'variavel', status: 'ativo', date: filterDate },
        orderBy: { startTime: 'asc' }
      })
    ]);

    const allCommitmentIds = [...fixos, ...variavels].map((c) => c.id);
    const exceptions = allCommitmentIds.length
      ? await this.prisma.commitmentException.findMany({
          where: { commitmentId: { in: allCommitmentIds }, date: filterDate }
        })
      : [];

    const cancelledIds = new Set(exceptions.filter((e) => e.action === 'cancelled').map((e) => e.commitmentId));
    const activeCommitments = [...fixos, ...variavels]
      .filter((c) => !cancelledIds.has(c.id))
      .map((c) => ({
        title: c.title,
        startTime: c.startTime,
        durationMin: c.durationMin
      }));

    // Available minutes = work day minus commitment blocks
    const totalCommitmentMin = activeCommitments.reduce((acc, c) => acc + (c.durationMin ?? 0), 0);
    const workDayMinutes = 12 * 60; // 07h–19h = 720 min
    const todayAvailableMinutes = Math.max(0, workDayMinutes - totalCommitmentMin);

    // ── Tasks ──────────────────────────────────────────────────────────────
    const tasks = await this.prisma.task.findMany({
      where: {
        archivedAt: null,
        status: { in: ['hoje', 'andamento', 'backlog'] }
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 50
    });

    const overdueTasks: TaskSummary[] = tasks
      .filter((t) => {
        if (!t.dueDate || t.taskType !== 'a') return false;
        return new Date(t.dueDate).getTime() < Date.now();
      })
      .slice(0, 3)
      .map((t) => ({
        id: t.id,
        title: t.title,
        taskType: t.taskType ?? 'b',
        priority: t.priority,
        dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null
      }));

    // Top 3 candidates: priority A first, then by priority desc
    const humorLimit = humor === 'sobrecarregado' ? 1 : humor === 'cansado' ? 2 : 3;
    const top3Candidates: TaskSummary[] = tasks
      .filter((t) => t.taskType === 'a' || t.priority >= 4)
      .slice(0, 8)
      .map((t) => ({
        id: t.id,
        title: t.title,
        taskType: t.taskType ?? 'b',
        priority: t.priority,
        dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null
      }))
      .slice(0, humorLimit);

    // ── Gamification / streak ──────────────────────────────────────────────
    let streakDays = 0;
    let executionRate7d = 0;
    let averageDeepWorkMinutes = 0;
    try {
      const gami = await this.prisma.gamificationState.findFirst({
        orderBy: { lastUpdate: 'desc' }
      });
      streakDays = gami?.streakDays ?? 0;

      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const doneLast7 = await this.prisma.task.count({
        where: {
          status: 'feito',
          taskType: 'a',
          updatedAt: { gte: since7d }
        }
      });
      const totalA = await this.prisma.task.count({ where: { taskType: 'a' } });
      executionRate7d = totalA > 0 ? Math.round((doneLast7 / totalA) * 100) : 0;

      const deepSessions = await this.prisma.deepWorkSession.findMany({
        where: { startedAt: { gte: since7d } },
        select: { targetMinutes: true }
      });
      const totalDW = deepSessions.reduce((acc, s) => acc + (s.targetMinutes ?? 0), 0);
      averageDeepWorkMinutes = deepSessions.length > 0 ? Math.round(totalDW / deepSessions.length) : 0;
    } catch {
      // gamification/deepwork may not exist — ignore
    }

    return {
      dateKey,
      dayOfWeek: dayOfWeekPt(date),
      streakDays,
      executionRate7d,
      averageDeepWorkMinutes,
      todayCommitments: activeCommitments,
      todayAvailableMinutes,
      top3Candidates,
      overdueTasks,
      mostPostponedTasks: [],
      humor
    };
  }

  // ─── Bloco 1: Leitura situacional via LLM ─────────────────────────────────

  private async buildSituationalRead(ctx: BriefingContext): Promise<string> {
    if (!this.openai) {
      return this.fallbackSituationalRead(ctx);
    }

    try {
      const prompt = `
Você é a secretária inteligente do Operis. Escreva 2-3 linhas em português brasileiro,
tom direto e humano, lendo a situação do usuário para o bom-dia matinal.

DADOS:
- Hoje: ${ctx.dayOfWeek}, ${formatBrDate(ctx.dateKey)}
- Streak: ${ctx.streakDays} dias consecutivos
- Taxa execução (7d): ${ctx.executionRate7d}%
- Compromissos hoje: ${ctx.todayCommitments.length}
- Janela real de foco: ${Math.round(ctx.todayAvailableMinutes / 60 * 10) / 10}h
- Tarefas A atrasadas: ${ctx.overdueTasks.length}
- Humor declarado: ${ctx.humor ?? 'não declarado'}

EXEMPLOS do tom:
- "📊 Streak de 4 dias — você tá em ritmo. Mas 'Proposta B2B' ficou parada 3 dias seguidos."
- "⚠️ Hoje tem 3 compromissos — sua janela real de foco é de 2h30. Vamos ser cirúrgicos."
- "🔥 Semana excelente. Não deixa a ${ctx.dayOfWeek} quebrar o streak."

Retorne APENAS as 2-3 linhas. Sem introdução, sem explicação.`.trim();

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 120
      });

      const text = completion.choices[0]?.message.content?.trim();
      return text || this.fallbackSituationalRead(ctx);
    } catch {
      return this.fallbackSituationalRead(ctx);
    }
  }

  private fallbackSituationalRead(ctx: BriefingContext): string {
    const lines: string[] = [];

    if (ctx.streakDays >= 3) {
      lines.push(`🔥 ${ctx.streakDays} dias de streak — ritmo forte.`);
    } else if (ctx.streakDays === 0) {
      lines.push(`🌅 Novo dia, nova chance de construir ritmo.`);
    } else {
      lines.push(`✅ ${ctx.streakDays} dia(s) de streak. Continue.`);
    }

    if (ctx.todayCommitments.length > 0) {
      const h = Math.floor(ctx.todayAvailableMinutes / 60);
      const m = ctx.todayAvailableMinutes % 60;
      const janela = m > 0 ? `${h}h${m}min` : `${h}h`;
      lines.push(`📅 ${ctx.todayCommitments.length} compromisso(s) hoje — janela real: ${janela} de foco.`);
    }

    if (ctx.overdueTasks.length > 0) {
      lines.push(`⚠️ ${ctx.overdueTasks.length} tarefa(s) A atrasada(s) precisam de atenção.`);
    }

    return lines.join('\n');
  }

  // ─── Bloco 2: Compromissos + janelas ──────────────────────────────────────

  private buildCommitmentsBlock(ctx: BriefingContext): string | null {
    if (ctx.todayCommitments.length === 0) return null;

    const lines = ['📅 *Hoje:*'];
    for (const c of ctx.todayCommitments) {
      const time = c.startTime ? `${c.startTime} — ` : '';
      const dur = c.durationMin ? ` (${c.durationMin}min)` : '';
      lines.push(`• ${time}${c.title}${dur}`);
    }

    const windows = computeFreeWindows(ctx.todayCommitments);
    if (windows.length > 0) {
      const windowStr = windows.map((w) => `${w.label} (${Math.round(w.minutes / 60 * 10) / 10}h)`).join(' · ');
      lines.push(`⏱ Janelas livres: ${windowStr}`);
    }

    return lines.join('\n');
  }

  // ─── Bloco 3: Top 3 sugerido ──────────────────────────────────────────────

  private buildTop3Block(ctx: BriefingContext): string {
    if (ctx.top3Candidates.length === 0) {
      return '🎯 *Foco sugerido:*\nNenhuma tarefa A encontrada. Envie "tarefas" para ver abertas.';
    }

    const label = ctx.humor === 'sobrecarregado'
      ? '🎯 *1 prioridade só — dia difícil:*'
      : ctx.humor === 'cansado'
        ? '🎯 *2 prioridades (dia leve):*'
        : '🎯 *Foco sugerido:*';

    const lines = [label];
    ctx.top3Candidates.forEach((t, i) => {
      const due = t.dueDate ? ` ⏰ prazo ${formatBrDate(t.dueDate)}` : '';
      lines.push(`${i + 1}. ${t.title}${due}`);
    });
    lines.push('');
    lines.push('Confirmar? Responda *sim*, troque ou mande áudio.');

    return lines.join('\n');
  }

  // ─── Bloco 4: Alerta cirúrgico ────────────────────────────────────────────

  private buildAlertBlock(ctx: BriefingContext): string | null {
    if (ctx.overdueTasks.length === 0) return null;
    const worst = ctx.overdueTasks[0];
    const daysLate = worst.dueDate
      ? Math.floor((Date.now() - new Date(worst.dueDate).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const detail = daysLate > 0 ? ` — atrasada ${daysLate} dia(s)` : '';
    return `🚨 *"${worst.title}"*${detail}. Quer agendar ou arquivar?`;
  }

  // ─── Bloco 5: Pergunta de humor ────────────────────────────────────────────

  private buildHumorBlock(): string {
    return [
      'Como você chega hoje?',
      '1️⃣ Focado',
      '2️⃣ Cansado',
      '3️⃣ Sobrecarregado'
    ].join('\n');
  }

  // ─── Briefing completo ────────────────────────────────────────────────────

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

  // ─── Parse resposta de humor do usuário ───────────────────────────────────

  static parseHumorReply(text: string): DayHumor | null {
    const normalized = text.trim().toLowerCase();
    if (/^1$|focado/.test(normalized)) return 'focado';
    if (/^2$|cansado/.test(normalized)) return 'cansado';
    if (/^3$|sobrecarregado|pesad|difícil|dificil/.test(normalized)) return 'sobrecarregado';
    return null;
  }
}
