import { Prisma, PrismaClient, WhatsappConversationSession } from '@prisma/client';

import { CommandResult, WhatsappCommandService } from './whatsapp-command-service.js';

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

const SESSION_TTL_MINUTES = 45;
const LONG_SESSION_TTL_MINUTES = 90;
const TRANSPORT_PREFIX_REGEX = /^(?:(?:=+|--+|[•·]\s*|[–—-]{2,}\s*))+/;

function normalizeUpper(text: string) {
  return text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function normalizeLower(text: string) {
  return text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeOptionToken(text: string) {
  return normalizeUpper(text).replace(/[\u200B-\u200D\uFE0E\uFE0F\u2060]/g, '').trim();
}

function extractNumericChoice(text: string, min: number, max: number) {
  const digits = normalizeOptionToken(text).replace(/[^\d]/g, '');
  if (digits.length !== 1) {
    return null;
  }

  const value = Number(digits);
  if (!Number.isFinite(value) || value < min || value > max) {
    return null;
  }

  return value;
}

function parseTaskTokens(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => /^[\w-]{4,}$/.test(token))
    .slice(0, 3);
}

function parseSwapSlot(text: string) {
  const match = text.match(/[1-3]/);
  return match ? Number(match[0]) : null;
}

function sanitizeTransportPrefix(rawText: string) {
  let normalized = rawText.replace(/[\u200B-\u200D\uFE0E\uFE0F\u2060]/g, '').trim();
  while (TRANSPORT_PREFIX_REGEX.test(normalized)) {
    normalized = normalized.replace(TRANSPORT_PREFIX_REGEX, '').trimStart();
  }
  return normalized;
}

function hasAnyIntent(text: string, intents: string[]) {
  const normalized = normalizeLower(text);
  return intents.some((intent) => normalized === intent || normalized.includes(`${intent},`) || normalized.includes(`${intent} `) || normalized.includes(` ${intent}`));
}

function hasOptionLetter(text: string, letter: 'A' | 'B' | 'C' | 'D') {
  const raw = text.trim();
  const regex = new RegExp(`^${letter}(?:\\b|\\W|$)`, 'i');
  return regex.test(raw);
}

function extractLeadingInteger(text: string) {
  const match = text.trim().match(/^(\d{1,3})(?:\b|\D|$)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractChoiceNumbers(text: string, min: number, max: number) {
  const tokens = (text.match(/\b\d+\b/g) ?? [])
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value) && value >= min && value <= max);
  return Array.from(new Set(tokens));
}

type TaskChoice = {
  index: number;
  id: string;
  title: string;
  workspaceName: string | null;
  status: string;
  priority: number;
};

type FolderChoice = {
  index: number;
  id: string | null;
  name: string;
};

type NoteChoice = {
  index: number;
  id: string;
  title: string;
  updatedAt: string;
};

export class WhatsappConversationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly commandService: WhatsappCommandService
  ) {}

  private stateModule(state: ConversationState) {
    if (state.startsWith('focus_')) {
      return 'focus';
    }

    if (state.startsWith('deep_')) {
      return 'deep';
    }

    if (state === 'capture_inbox') {
      return 'inbox';
    }

    if (state.startsWith('notes_')) {
      return 'notes';
    }

    if (state === 'menu') {
      return 'menu';
    }

    return 'idle';
  }

  private readSessionPayload(session: WhatsappConversationSession | null) {
    if (!session?.payload || typeof session.payload !== 'object' || Array.isArray(session.payload)) {
      return {};
    }

    return session.payload as Record<string, unknown>;
  }

  private inferNaturalCommand(text: string, session: WhatsappConversationSession | null) {
    const normalized = normalizeLower(text);
    const sessionPayload = this.readSessionPayload(session);
    const moduleHint = String(sessionPayload.lastModule ?? this.stateModule((session?.state as ConversationState) ?? 'idle'));

    if (!normalized) {
      return null;
    }

    if (normalized === 'menu' || normalized === 'inicio' || normalized === 'iniciar') {
      return '__open_menu__';
    }

    if (normalized.includes('ajuda') || normalized === '?') {
      return 'ajuda';
    }

    if (normalized.includes('status')) {
      return 'status';
    }

    if (/(tarefas?\s+de\s+hoje|tarefas?$|hoje$)/.test(normalized)) {
      return 'tarefas';
    }

    if (/(abertas|todas\s+as\s+tarefas|tarefas\s+abertas)/.test(normalized)) {
      return 'abertas';
    }

    if (/(backlog|pendencias)/.test(normalized)) {
      return 'backlog';
    }

    if (/(projetos?|entregas)/.test(normalized)) {
      return 'projetos';
    }

    if (/(prazos?|venc|vence|due)/.test(normalized)) {
      return 'prazos';
    }

    if (/(follow|cobrar|restric|dependenc|aguardando)/.test(normalized)) {
      return 'followups';
    }

    if (normalized.startsWith('inbox:') || normalized.startsWith('capturar ')) {
      return text.trim();
    }

    if (/(notas?|segundo\s+cer(e|é)bro)/.test(normalized)) {
      return '__open_notes__';
    }

    if (normalized.includes('foco') || normalized.includes('top 3') || normalized.includes('top3')) {
      if (/(confirm|fechado|travar)/.test(normalized)) {
        const ids = parseTaskTokens(text);
        if (ids.length >= 2) {
          return `foco confirmar ${ids.join(' ')}`;
        }
        return 'foco confirmar';
      }

      const swapSlot = parseSwapSlot(text);
      const tokens = parseTaskTokens(text);
      if (/(troca|trocar|substitu)/.test(normalized) && swapSlot && tokens.length > 0) {
        const candidateId = tokens.find((token) => !/^[1-3]$/.test(token)) ?? tokens[0];
        return `foco trocar ${swapSlot} ${candidateId}`;
      }

      return 'foco';
    }

    if (moduleHint === 'focus') {
      if (/(confirm|fechado|travar)/.test(normalized)) {
        const ids = parseTaskTokens(text);
        if (ids.length >= 2) {
          return `foco confirmar ${ids.join(' ')}`;
        }
        return 'foco confirmar';
      }

      const swapSlot = parseSwapSlot(text);
      const tokens = parseTaskTokens(text);
      if (/(troca|trocar|substitu)/.test(normalized) && swapSlot && tokens.length > 0) {
        const candidateId = tokens.find((token) => !/^[1-3]$/.test(token)) ?? tokens[0];
        return `foco trocar ${swapSlot} ${candidateId}`;
      }
    }

    const deepMentioned = /(deep|foco profundo|pomodoro)/.test(normalized) || moduleHint === 'deep';
    if (deepMentioned) {
      if (/(parar|stop|encerrar)(?!.*tarefa)/.test(normalized)) {
        return 'deep parar';
      }
      if (/(concluir|finalizar|terminei|fechar)/.test(normalized)) {
        return 'deep concluir';
      }
      if (/(iniciar|inicia|comecar|come[çc]a|start)/.test(normalized)) {
        const ids = parseTaskTokens(text);
        if (ids.length > 0) {
          const minMatch = normalized.match(/(\d{1,3})\s*(min|m|minutes)?/);
          const minutesPart = minMatch ? ` ${minMatch[1]}` : '';
          return `deep iniciar ${ids[0]}${minutesPart}`;
        }
        return '__deep_waiting_task__';
      }
    }

    const alocarMatch = normalized.match(/(alocar|agendar|agenda)\s+([a-z0-9-]{4,})\s+(\d{1,2}:\d{2})/i);
    if (alocarMatch) {
      return `alocar ${alocarMatch[2]} ${alocarMatch[3]}`;
    }

    const fizMatch = normalized.match(/(fiz|conclui|concluido)\s+([a-z0-9-]{4,})/i);
    if (fizMatch) {
      return `fiz ${fizMatch[2]}`;
    }

    const adiarMatch = normalized.match(/(adiar|adiado|postergar)\s+([a-z0-9-]{4,})/i);
    if (adiarMatch) {
      return `adiar ${adiarMatch[2]}`;
    }

    const reagendarMatch = normalized.match(/(reagendar|remarcar)\s+([a-z0-9-]{4,})\s+(\d{1,2}:\d{2})/i);
    if (reagendarMatch) {
      return `reagendar ${reagendarMatch[2]} ${reagendarMatch[3]}`;
    }

    return null;
  }

  private menuText() {
    return [
      '🚀 *Execution OS*',
      '',
      '*Menu rápido*',
      '1) 🎯 Foco do dia',
      '2) ✅ Tarefas de hoje',
      '3) 🧠 Deep Work',
      '4) ⏰ Prazos e follow-ups',
      '5) 📥 Capturar inbox',
      '6) ❓ Como usar',
      '7) 📋 Tarefas abertas',
      '8) 🗂️ Notas',
      '',
      'Responda com *1-8* ou digite *sair*.'
    ].join('\n');
  }

  private helpText() {
    return [
      '❓ *Como usar (rápido)*',
      '',
      '• *menu* -> abre o painel',
      '• *foco* -> mostra prioridade do dia',
      '• *tarefas* -> lista tarefas de hoje',
      '• *abertas* -> tarefas abertas (visão geral)',
      '• *deep iniciar <id>* -> inicia deep work',
      '• *deep parar* -> encerra sessão ativa',
      '• *deep concluir* -> encerra e conclui tarefa',
      '• *capturar <texto>* -> manda para inbox',
      '• *notas* -> abre notas no WhatsApp',
      '',
      '💡 Dica: no fluxo guiado você pode escolher por *número*.'
    ].join('\n');
  }

  private focusMenuText() {
    return [
      '🎯 *Ações de foco*',
      'A) ✅ Confirmar foco atual',
      'B) 🔁 Trocar tarefa (posição 1/2/3)',
      'C) ⚙️ Confirmar manual (avançado)',
      'D) ↩️ Voltar ao menu'
    ].join('\n');
  }

  private deepMenuText() {
    return [
      '🧠 *Painel Deep Work*',
      '1) ▶️ Iniciar nova sessão',
      '2) ⏹️ Parar sessão ativa',
      '3) ✅ Concluir sessão + tarefa',
      '4) 📊 Status do dia',
      '5) ↩️ Voltar ao menu'
    ].join('\n');
  }

  private notesMenuText() {
    return [
      '🗂️ *Notas*',
      '1) 🔎 Buscar por pasta',
      '2) ✍️ Nova nota rápida',
      '3) ↩️ Voltar ao menu'
    ].join('\n');
  }

  private toBrDateTime(iso: string | Date) {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(date.getTime())) {
      return typeof iso === 'string' ? iso : date.toISOString();
    }
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private normalizeWhatsappBody(raw: string) {
    const lines = raw.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').split('\n');
    const formatted: string[] = [];

    const toWhatsappBullet = (line: string) => {
      const checklistMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (checklistMatch) {
        return `${checklistMatch[1].toLowerCase() === 'x' ? '✅' : '⬜'} ${checklistMatch[2].trim()}`;
      }

      const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        return `• ${bulletMatch[1].trim()}`;
      }

      return line.trimEnd();
    };

    const isStandaloneHeading = (line: string) => /^\*[^*\n].*[^*\n]\*$/.test(line.trim());

    lines.forEach((line, index) => {
      const current = toWhatsappBullet(line);
      const trimmed = current.trim();
      if (!trimmed) {
        if (formatted.length > 0 && formatted[formatted.length - 1] !== '') {
          formatted.push('');
        }
        return;
      }

      if (isStandaloneHeading(current) && formatted.length > 0 && formatted[formatted.length - 1] !== '') {
        formatted.push('');
      }

      formatted.push(current);

      const nextTrimmed = toWhatsappBullet(lines[index + 1] ?? '').trim();
      if (isStandaloneHeading(current) && nextTrimmed) {
        formatted.push('');
      }
    });

    return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  private noteContentToWhatsapp(content: string | null) {
    if (!content?.trim()) {
      return 'Sem conteúdo.';
    }

    const raw = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|ul|ol|h1|h2|h3|blockquote|section|article)>/gi, '\n')
      .replace(/<(h1|h2|h3)[^>]*>(.*?)<\/\1>/gi, (_match, _tag, inner: string) => `*${inner.trim()}*\n\n`)
      .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, (_match, _tag, inner: string) => `*${inner.trim()}*`)
      .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, (_match, _tag, inner: string) => `_${inner.trim()}_`)
      .replace(/<(s|strike|del)[^>]*>(.*?)<\/\1>/gi, (_match, _tag, inner: string) => `~${inner.trim()}~`)
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#039;/gi, "'")
      .replace(/&quot;/gi, '"')
      .trim();

    return this.normalizeWhatsappBody(raw);
  }

  private async listFolderChoices() {
    const folders = await this.prisma.noteFolder.findMany({
      where: {
        archivedAt: null
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });

    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const buildPath = (folderId: string) => {
      const names: string[] = [];
      let cursor = byId.get(folderId) ?? null;
      const guard = new Set<string>();
      while (cursor && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        names.unshift(cursor.name);
        cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null;
      }
      return names.join(' / ');
    };

    const rows: FolderChoice[] = [{ index: 1, id: null, name: 'Sem pasta' }];
    folders.forEach((folder, index) => {
      rows.push({
        index: index + 2,
        id: folder.id,
        name: buildPath(folder.id) || folder.name
      });
    });
    return rows;
  }

  private async listNoteChoices(folderId: string | null) {
    const notes = await this.prisma.note.findMany({
      where: {
        archivedAt: null,
        folderId
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: 14
    });

    return notes.map((note, index) => ({
      index: index + 1,
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt.toISOString()
    })) satisfies NoteChoice[];
  }

  private renderNoteChoices(folderName: string, choices: NoteChoice[]) {
    if (!choices.length) {
      return `🗂️ *${folderName}*\n\nNenhuma nota nessa pasta.\n\nDigite *voltar* para escolher outra pasta ou *menu* para sair.`;
    }

    const rows = choices.map(
      (choice) => `${choice.index}) ${choice.title} • ${this.toBrDateTime(choice.updatedAt)}`
    );
    return [
      `🗂️ *${folderName}*`,
      ...rows,
      '',
      'Digite o *número* da nota para abrir.',
      'Digite *voltar* para pastas ou *menu* para sair.'
    ].join('\n');
  }

  private prettifyReply(reply: string) {
    const formatIsoToBr = (value: string) => {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return value;
      }
      return `${match[3]}/${match[2]}/${match[1]}`;
    };

    const withoutIds = reply
      .replace(/(^\s*\d+\)\s+)[a-f0-9]{8}\s+-\s+/gim, '$1')
      .replace(/(^\s*-\s+)[a-f0-9]{8}\s+-\s+/gim, '$1')
      .replace(/Sess[ãa]o\s+[a-f0-9]{8}\s+•\s+/gi, '')
      .replace(/Comandos:\n(?:- .+\n?)+/gim, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => formatIsoToBr(date))
      .replace(
        /Bom dia\. Top foco de Deep Work \(([^)]+)\):/i,
        '🌤️ *Bom dia!*\n*Foco do dia* ($1):'
      )
      .replace(/Compromisso do dia: confirmado\./i, '✅ *Compromisso:* confirmado')
      .replace(/Compromisso do dia: ainda nao confirmado\./i, '⚠️ *Compromisso:* ainda não confirmado')
      .replace(/Capacidade ok:\s*/i, '📊 *Capacidade:* ')
      .replace(/Planejamento irreal:\s*/i, '🚨 *Planejamento irreal:* ')
      .replace(/^Foco atualizado:/im, '🔁 *Foco atualizado:*')
      .replace(/^Capturado na inbox:\s*/im, '✅ *Capturado na inbox:*\n')
      .replace(
        /^Deep Work iniciado:\s*(.+)\n(?:Sessao|Sessão)?\s*.*alvo\s*(\d+)\s*min/im,
        '🧠 *Deep Work iniciado*\nTarefa: *$1*\nMeta: *$2 min*'
      )
      .replace(
        /^Deep Work encerrado:\s*(.+)\s+•\s+(\d+)\s*min/im,
        '⏹️ *Deep Work encerrado*\nTarefa: *$1*\nTempo: *$2 min*'
      )
      .replace(
        /^Deep Work encerrado e tarefa concluida:\s*(.+)$/im,
        '✅ *Tarefa concluída com Deep Work*\n$1'
      )
      .trim();

    return withoutIds;
  }

  private statusLabel(status: string) {
    if (status === 'hoje') return 'hoje';
    if (status === 'andamento') return 'em andamento';
    if (status === 'backlog') return 'backlog';
    return status;
  }

  private async listTaskChoices(limit = 8): Promise<TaskChoice[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        archivedAt: null,
        status: {
          in: ['hoje', 'andamento', 'backlog']
        }
      },
      include: {
        workspace: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
      take: Math.max(2, limit)
    });

    return tasks.map((task, index) => ({
      index: index + 1,
      id: task.id,
      title: task.title,
      workspaceName: task.workspace?.name ?? null,
      status: task.status,
      priority: task.priority
    }));
  }

  private renderTaskChoices(choices: TaskChoice[], title: string, suffix?: string) {
    if (!choices.length) {
      return 'Não encontrei tarefas elegíveis agora.';
    }

    const lines = choices.map(
      (choice) =>
        `${choice.index}) ${choice.title} (${choice.workspaceName ?? 'Frente'} • P${choice.priority} • ${this.statusLabel(choice.status)})`
    );

    return [title, ...lines, suffix ?? 'Responda com o *número* da tarefa.'].join('\n');
  }

  private renderOpenTaskList(choices: TaskChoice[]) {
    if (!choices.length) {
      return [
        '📋 *Tarefas abertas*',
        'Nenhuma tarefa aberta agora.',
        '',
        'Digite *menu* para voltar.'
      ].join('\n');
    }

    const rows = choices.map((choice) => {
      const status = this.statusLabel(choice.status);
      return [
        `${choice.index}) ${choice.title}`,
        `   • Frente: ${choice.workspaceName ?? 'Geral'} • P${choice.priority} • ${status}`
      ].join('\n');
    });

    return [
      '📋 *Tarefas abertas*',
      ...rows,
      '',
      'Digite o *número* da tarefa para abrir ações.',
      'Digite *menu* para sair.'
    ].join('\n');
  }

  private openTaskActionsText(taskTitle: string) {
    return [
      `⚡ *Ações da tarefa*`,
      `Tarefa: *${taskTitle}*`,
      '',
      '1) 🧠 Iniciar Deep Work',
      '2) ✅ Concluir tarefa',
      '3) ↩️ Voltar para lista',
      '4) 🏠 Voltar ao menu',
      '',
      'Responda com *1-4*.'
    ].join('\n');
  }

  private resolveChoiceToken(text: string, payload: Record<string, unknown>) {
    const normalized = text.trim();
    const byNumber = Number(normalized);
    const choices = Array.isArray(payload.choices)
      ? (payload.choices as TaskChoice[])
      : [];

    if (Number.isFinite(byNumber) && byNumber >= 1) {
      const choice = choices.find((item) => item.index === byNumber);
      if (choice) {
        return choice.id;
      }
    }

    const token = parseTaskTokens(normalized)[0];
    return token ?? null;
  }

  private isGreeting(text: string) {
    const normalized = normalizeOptionToken(text);
    return ['OI', 'OLA', 'OLAH', 'BOM DIA', 'BOA TARDE', 'BOA NOITE', 'MENU'].includes(normalized);
  }

  private isExit(text: string) {
    const normalized = normalizeOptionToken(text);
    return ['SAIR', 'CANCELAR', 'VOLTAR'].includes(normalized);
  }

  private isDirectCommand(text: string) {
    return /^(ajuda|help|\?|foco|top3|tarefas|abertas|backlog|projetos|notas?|deep\s+(iniciar|start|parar|stop|concluir)|alocar\s+|fiz\s+|adiar\s+|reagendar\s+|prazos$|followups?$|status$|inbox$|inbox:\s*|capturar\s+)/i.test(
      text.trim()
    );
  }

  private async getSession(phoneNumber: string) {
    const session = await this.prisma.whatsappConversationSession.findUnique({
      where: {
        phoneNumber
      }
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await this.setSession(phoneNumber, 'idle');
      return null;
    }

    return session;
  }

  private async setSession(
    phoneNumber: string,
    state: ConversationState,
    payload?: Prisma.JsonObject | null,
    ttlMinutes = SESSION_TTL_MINUTES
  ) {
    const expiresAt =
      state === 'idle'
        ? null
        : new Date(Date.now() + Math.max(5, ttlMinutes) * 60 * 1000);

    const moduleKey = this.stateModule(state);
    const payloadObject = {
      ...(payload ?? {}),
      lastModule: moduleKey,
      state,
      updatedAt: new Date().toISOString()
    } satisfies Prisma.JsonObject;

    await this.prisma.whatsappConversationSession.upsert({
      where: {
        phoneNumber
      },
      create: {
        phoneNumber,
        state,
        payload: payloadObject,
        expiresAt,
        lastInteractionAt: new Date()
      },
      update: {
        state,
        payload: payloadObject,
        expiresAt,
        lastInteractionAt: new Date()
      }
    });
  }

  private async runCommand(text: string): Promise<CommandResult> {
    try {
      return await this.commandService.handle(text);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Não consegui processar esse comando.';
      return {
        reply: `Erro: ${message}`
      };
    }
  }

  private async processMenuInput(phoneNumber: string, text: string): Promise<CommandResult> {
    const normalized = normalizeOptionToken(text);
    const numericChoice = extractNumericChoice(text, 1, 8);

    if (numericChoice === 1 || normalized === 'FOCO') {
      const focus = await this.runCommand('foco');
      await this.setSession(
        phoneNumber,
        'focus_menu',
        {
          lastAction: 'briefing'
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: `${this.prettifyReply(focus.reply)}\n\n${this.focusMenuText()}`,
        relatedTaskId: focus.relatedTaskId
      };
    }

    if (numericChoice === 2 || normalized === 'HOJE' || normalized === 'TAREFAS') {
      const tasks = await this.runCommand('tarefas');
      await this.setSession(phoneNumber, 'menu');
      return {
        reply: `${this.prettifyReply(tasks.reply)}\n\n${this.menuText()}`,
        relatedTaskId: tasks.relatedTaskId
      };
    }

    if (numericChoice === 3 || normalized === 'DEEP' || normalized === 'DEEP WORK') {
      await this.setSession(
        phoneNumber,
        'deep_menu',
        {
          lastAction: 'open_deep_panel'
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: this.deepMenuText()
      };
    }

    if (numericChoice === 4 || normalized === 'PRAZOS' || normalized === 'FOLLOWUP' || normalized === 'FOLLOWUPS') {
      const due = await this.runCommand('prazos');
      const followups = await this.runCommand('followups');
      await this.setSession(phoneNumber, 'menu');
      return {
        reply: `${this.prettifyReply(due.reply)}\n\n${this.prettifyReply(followups.reply)}\n\n${this.menuText()}`
      };
    }

    if (numericChoice === 5 || normalized === 'INBOX' || normalized === 'CAPTURAR') {
      await this.setSession(phoneNumber, 'capture_inbox', null, LONG_SESSION_TTL_MINUTES);
      return {
        reply: '📥 Envie o texto que você quer capturar na inbox.\n\nDigite *sair* para cancelar.'
      };
    }

    if (numericChoice === 6 || normalized === 'AJUDA') {
      await this.setSession(phoneNumber, 'menu');
      return {
        reply: `${this.helpText()}\n\n${this.menuText()}`
      };
    }

    if (numericChoice === 7 || normalized === 'ABERTAS') {
      const choices = await this.listTaskChoices(18);
      await this.setSession(
        phoneNumber,
        'open_tasks_list',
        {
          choices
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: this.renderOpenTaskList(choices)
      };
    }

    if (numericChoice === 8 || normalized === 'NOTAS' || normalized === 'NOTA') {
      await this.setSession(phoneNumber, 'notes_menu', null, LONG_SESSION_TTL_MINUTES);
      return {
        reply: this.notesMenuText()
      };
    }

    return {
      reply: `Opção inválida.\n\n${this.menuText()}`
    };
  }

  private async processFocusInput(
    phoneNumber: string,
    session: WhatsappConversationSession,
    text: string
  ): Promise<CommandResult> {
    const normalized = normalizeOptionToken(text);
    const numericChoice = extractNumericChoice(text, 1, 4);
    const payload =
      session.payload && typeof session.payload === 'object' && !Array.isArray(session.payload)
        ? (session.payload as Record<string, unknown>)
        : {};

    if (session.state === 'focus_menu') {
      if (normalized === 'A' || hasOptionLetter(text, 'A') || numericChoice === 1 || normalized === 'CONFIRMAR') {
        const result = await this.runCommand('foco confirmar');
        await this.setSession(
          phoneNumber,
          'focus_menu',
          {
            lastAction: 'focus_confirmed'
          },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: `${this.prettifyReply(result.reply)}\n\n${this.focusMenuText()}`,
          relatedTaskId: result.relatedTaskId
        };
      }

      if (normalized === 'B' || hasOptionLetter(text, 'B') || numericChoice === 2 || normalized === 'TROCAR') {
        await this.setSession(phoneNumber, 'focus_swap_slot', null, LONG_SESSION_TTL_MINUTES);
        return {
          reply: 'Qual *posição* deseja trocar?\n\nResponda *1*, *2* ou *3*.\nPara voltar: *menu* ou *voltar*.'
        };
      }

      if (normalized === 'C' || hasOptionLetter(text, 'C') || numericChoice === 3 || normalized === 'IDS') {
        const choices = await this.listTaskChoices(8);
        await this.setSession(
          phoneNumber,
          'focus_manual_ids',
          {
            choices
          },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: this.renderTaskChoices(
            choices,
            '⚙️ Ajuste manual do foco: escolha *2 ou 3 tarefas* para confirmar.',
            'Envie as posições (ex.: *1 3*). Também aceita IDs. Para voltar: *menu* ou *voltar*.'
          )
        };
      }

      if (
        normalized === 'D' ||
        hasOptionLetter(text, 'D') ||
        numericChoice === 4 ||
        normalized === 'MENU' ||
        hasAnyIntent(text, ['menu', 'voltar', 'cancelar'])
      ) {
        await this.setSession(phoneNumber, 'menu');
        return {
          reply: this.menuText()
        };
      }

      return {
        reply: `Não entendi essa ação.\n\n${this.focusMenuText()}`
      };
    }

    if (session.state === 'focus_swap_slot') {
      if (
        normalized === 'MENU' ||
        normalized === 'VOLTAR' ||
        normalized === 'D' ||
        hasOptionLetter(text, 'D') ||
        hasAnyIntent(text, ['menu', 'voltar', 'cancelar'])
      ) {
        await this.setSession(phoneNumber, 'focus_menu', null, LONG_SESSION_TTL_MINUTES);
        return {
          reply: this.focusMenuText()
        };
      }

      const slot = parseSwapSlot(text);
      if (!slot) {
        return {
          reply: 'Resposta inválida. Digite *1*, *2* ou *3*.'
        };
      }

      const choices = await this.listTaskChoices(8);

      await this.setSession(
        phoneNumber,
        'focus_swap_task',
        {
          slot,
          choices
        },
        LONG_SESSION_TTL_MINUTES
      );

      return {
        reply: this.renderTaskChoices(
          choices,
          `Slot ${slot} selecionado. Escolha a nova tarefa:`,
          'Responda com o *número* da tarefa (ou envie o ID se preferir).'
        )
      };
    }

    if (session.state === 'focus_swap_task') {
      if (
        normalized === 'MENU' ||
        normalized === 'VOLTAR' ||
        normalized === 'D' ||
        hasOptionLetter(text, 'D') ||
        hasAnyIntent(text, ['menu', 'voltar', 'cancelar'])
      ) {
        await this.setSession(phoneNumber, 'focus_menu', null, LONG_SESSION_TTL_MINUTES);
        return {
          reply: this.focusMenuText()
        };
      }

      const token = this.resolveChoiceToken(text, payload);
      const slot = Number(payload.slot ?? 1);

      if (!token) {
        return {
          reply: 'Resposta inválida. Envie o *número da lista* (ou um ID válido).'
        };
      }

      const result = await this.runCommand(`foco trocar ${slot} ${token}`);
      await this.setSession(
        phoneNumber,
        'focus_menu',
        {
          lastAction: 'focus_swapped',
          slot
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: `${this.prettifyReply(result.reply)}\n\n${this.focusMenuText()}`,
        relatedTaskId: result.relatedTaskId
      };
    }

    if (session.state === 'focus_manual_ids') {
      if (
        normalized === 'MENU' ||
        normalized === 'VOLTAR' ||
        normalized === 'D' ||
        hasOptionLetter(text, 'D') ||
        hasAnyIntent(text, ['menu', 'voltar', 'cancelar'])
      ) {
        await this.setSession(phoneNumber, 'focus_menu', null, LONG_SESSION_TTL_MINUTES);
        return {
          reply: this.focusMenuText()
        };
      }

      const choices = Array.isArray(payload.choices) ? (payload.choices as TaskChoice[]) : [];
      const bySlots = extractChoiceNumbers(text, 1, Math.max(3, choices.length));
      let taskIds: string[] = [];

      if (bySlots.length >= 2) {
        taskIds = bySlots
          .map((slot) => choices.find((choice) => choice.index === slot)?.id ?? null)
          .filter((value): value is string => Boolean(value));
      } else {
        const tokens = parseTaskTokens(text);
        if (tokens.length >= 2) {
          taskIds = tokens;
        }
      }

      taskIds = Array.from(new Set(taskIds)).slice(0, 3);

      if (taskIds.length < 2) {
        return {
          reply:
            'Envie pelo menos *2 posições* (ex.: *1 3*) ou *2 IDs*.\nPara voltar: *menu* ou *voltar*.'
        };
      }

      const result = await this.runCommand(`foco confirmar ${taskIds.join(' ')}`);
      await this.setSession(
        phoneNumber,
        'focus_menu',
        {
          lastAction: 'focus_manual_confirm'
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: `${this.prettifyReply(result.reply)}\n\n${this.focusMenuText()}`,
        relatedTaskId: result.relatedTaskId
      };
    }

    await this.setSession(phoneNumber, 'focus_menu', null, LONG_SESSION_TTL_MINUTES);
    return {
      reply: this.focusMenuText()
    };
  }

  private async processDeepInput(phoneNumber: string, session: WhatsappConversationSession, text: string) {
    const normalized = normalizeOptionToken(text);
    const numericChoice = extractNumericChoice(text, 1, 5);

    if (session.state === 'deep_menu') {
      if (numericChoice === 1 || normalized === 'INICIAR') {
        const choices = await this.listTaskChoices(8);
        await this.setSession(
          phoneNumber,
          'deep_start_waiting_task',
          { choices },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: this.renderTaskChoices(
            choices,
            'Escolha a tarefa para iniciar o *Deep Work*:',
            'Responda com: *<número> [min]*. Exemplo: 1 45\nPara voltar: *menu* ou *cancelar*.'
          )
        };
      }

      if (numericChoice === 2 || normalized === 'PARAR') {
        const result = await this.runCommand('deep parar');
        await this.setSession(
          phoneNumber,
          'deep_menu',
          {
            lastAction: 'deep_stopped'
          },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: `${this.prettifyReply(result.reply)}\n\n${this.deepMenuText()}`,
          relatedTaskId: result.relatedTaskId
        };
      }

      if (numericChoice === 3 || normalized === 'CONCLUIR') {
        const result = await this.runCommand('deep concluir');
        await this.setSession(
          phoneNumber,
          'deep_menu',
          {
            lastAction: 'deep_completed'
          },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: `${this.prettifyReply(result.reply)}\n\n${this.deepMenuText()}`,
          relatedTaskId: result.relatedTaskId
        };
      }

      if (numericChoice === 4 || normalized === 'STATUS') {
        const result = await this.runCommand('status');
        return {
          reply: `${this.prettifyReply(result.reply)}\n\n${this.deepMenuText()}`
        };
      }

      if (numericChoice === 5 || normalized === 'MENU' || normalized === 'VOLTAR') {
        await this.setSession(phoneNumber, 'menu');
        return {
          reply: this.menuText()
        };
      }

      return {
        reply: `Não entendi essa ação.\n\n${this.deepMenuText()}`
      };
    }

    if (session.state === 'deep_start_waiting_task') {
      if (
        normalized === 'MENU' ||
        normalized === 'VOLTAR' ||
        normalized === 'CANCELAR' ||
        normalized === 'SAIR' ||
        hasAnyIntent(text, ['menu', 'voltar', 'cancelar', 'sair'])
      ) {
        await this.setSession(phoneNumber, 'deep_menu', null, LONG_SESSION_TTL_MINUTES);
        return {
          reply: this.deepMenuText()
        };
      }

      const payload =
        session.payload && typeof session.payload === 'object' && !Array.isArray(session.payload)
          ? (session.payload as Record<string, unknown>)
          : {};
      const candidateToken = this.resolveChoiceToken(text.replace(/\s+\d{1,3}$/, ''), payload);
      if (!candidateToken) {
        return {
          reply:
            'Não entendi.\nResponda com o *número da tarefa* (ou ID) e minutos opcionais.\nPara voltar: *menu* ou *cancelar*.'
        };
      }

      const minuteMatch = text.match(/\s(\d{1,3})$/);
      const minutesPart = minuteMatch ? ` ${minuteMatch[1]}` : '';
      const result = await this.runCommand(`deep iniciar ${candidateToken}${minutesPart}`);
      await this.setSession(
        phoneNumber,
        'deep_menu',
        {
          lastAction: 'deep_started',
          taskToken: candidateToken
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: `${this.prettifyReply(result.reply)}\n\n${this.deepMenuText()}`,
        relatedTaskId: result.relatedTaskId
      };
    }

    await this.setSession(phoneNumber, 'deep_menu', null, LONG_SESSION_TTL_MINUTES);
    return {
      reply: this.deepMenuText()
    };
  }

  private async processOpenTasksInput(
    phoneNumber: string,
    session: WhatsappConversationSession,
    text: string
  ): Promise<CommandResult> {
    const normalized = normalizeOptionToken(text);
    const payload =
      session.payload && typeof session.payload === 'object' && !Array.isArray(session.payload)
        ? (session.payload as Record<string, unknown>)
        : {};

    if (session.state === 'open_tasks_list') {
      if (normalized === 'MENU' || normalized === 'SAIR' || hasAnyIntent(text, ['menu', 'sair'])) {
        await this.setSession(phoneNumber, 'menu');
        return { reply: this.menuText() };
      }

      const selectedNumber = extractLeadingInteger(text);
      const choices = Array.isArray(payload.choices) ? (payload.choices as TaskChoice[]) : [];
      const selected = selectedNumber
        ? choices.find((choice) => choice.index === selectedNumber) ?? null
        : null;

      if (!selected) {
        return {
          reply: 'Escolha inválida.\nDigite o *número* da tarefa ou *menu*.'
        };
      }

      await this.setSession(
        phoneNumber,
        'open_tasks_actions',
        {
          choices,
          selectedTaskId: selected.id,
          selectedTaskTitle: selected.title
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: this.openTaskActionsText(selected.title)
      };
    }

    if (session.state === 'open_tasks_actions') {
      if (normalized === 'MENU' || hasAnyIntent(text, ['menu'])) {
        await this.setSession(phoneNumber, 'menu');
        return { reply: this.menuText() };
      }

      const selectedTaskId =
        typeof payload.selectedTaskId === 'string' ? payload.selectedTaskId : null;
      const selectedTaskTitle =
        typeof payload.selectedTaskTitle === 'string' ? payload.selectedTaskTitle : 'tarefa';
      if (!selectedTaskId) {
        const refreshed = await this.listTaskChoices(18);
        await this.setSession(phoneNumber, 'open_tasks_list', { choices: refreshed }, LONG_SESSION_TTL_MINUTES);
        return {
          reply: this.renderOpenTaskList(refreshed)
        };
      }

      const numericChoice = extractNumericChoice(text, 1, 4) ?? extractLeadingInteger(text);
      if (numericChoice === 1 || hasAnyIntent(text, ['deep'])) {
        const result = await this.runCommand(`deep iniciar ${selectedTaskId}`);
        await this.setSession(
          phoneNumber,
          'deep_menu',
          {
            lastAction: 'deep_started',
            taskToken: selectedTaskId
          },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: `${this.prettifyReply(result.reply)}\n\n${this.deepMenuText()}`,
          relatedTaskId: result.relatedTaskId
        };
      }

      if (numericChoice === 2 || hasAnyIntent(text, ['concluir', 'conclui', 'fiz', 'feito'])) {
        const result = await this.runCommand(`fiz ${selectedTaskId}`);
        const refreshed = await this.listTaskChoices(18);
        await this.setSession(phoneNumber, 'open_tasks_list', { choices: refreshed }, LONG_SESSION_TTL_MINUTES);
        return {
          reply: `${this.prettifyReply(result.reply)}\n\n${this.renderOpenTaskList(refreshed)}`
        };
      }

      if (numericChoice === 3 || normalized === 'VOLTAR' || normalized === 'CANCELAR' || hasAnyIntent(text, ['voltar', 'cancelar'])) {
        const refreshed = await this.listTaskChoices(18);
        await this.setSession(phoneNumber, 'open_tasks_list', { choices: refreshed }, LONG_SESSION_TTL_MINUTES);
        return {
          reply: this.renderOpenTaskList(refreshed)
        };
      }

      if (numericChoice === 4 || normalized === 'SAIR' || hasAnyIntent(text, ['sair'])) {
        await this.setSession(phoneNumber, 'menu');
        return { reply: this.menuText() };
      }

      return {
        reply: `Não entendi essa ação.\n\n${this.openTaskActionsText(selectedTaskTitle)}`
      };
    }

    const refreshed = await this.listTaskChoices(18);
    await this.setSession(phoneNumber, 'open_tasks_list', { choices: refreshed }, LONG_SESSION_TTL_MINUTES);
    return {
      reply: this.renderOpenTaskList(refreshed)
    };
  }

  private async processNotesInput(
    phoneNumber: string,
    session: WhatsappConversationSession,
    text: string
  ): Promise<CommandResult> {
    const normalized = normalizeOptionToken(text);
    const payload =
      session.payload && typeof session.payload === 'object' && !Array.isArray(session.payload)
        ? (session.payload as Record<string, unknown>)
        : {};

    if (session.state === 'notes_menu') {
      const numericChoice = extractNumericChoice(text, 1, 3);
      if (numericChoice === 1 || normalized === 'BUSCAR' || normalized === 'PASTAS') {
        const folders = await this.listFolderChoices();
        await this.setSession(
          phoneNumber,
          'notes_pick_folder',
          {
            folders
          },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: [
            '🗂️ *Escolha a pasta*',
            ...folders.map((folder) => `${folder.index}) ${folder.name}`),
            '',
            'Digite o *número da pasta*.',
            'Digite *menu* para sair.'
          ].join('\n')
        };
      }

      if (numericChoice === 2 || normalized === 'NOVA' || normalized === 'CRIAR') {
        await this.setSession(phoneNumber, 'notes_create_quick', null, LONG_SESSION_TTL_MINUTES);
        return {
          reply:
            '✍️ *Nova nota rápida*\nEnvie o conteúdo da nota.\nOpcional: use *Título | conteúdo*.\n\nDigite *cancelar* para voltar.'
        };
      }

      if (numericChoice === 3 || normalized === 'MENU' || normalized === 'VOLTAR' || normalized === 'SAIR') {
        await this.setSession(phoneNumber, 'menu');
        return {
          reply: this.menuText()
        };
      }

      return {
        reply: `Não entendi essa ação.\n\n${this.notesMenuText()}`
      };
    }

    if (session.state === 'notes_pick_folder') {
      if (normalized === 'MENU' || normalized === 'SAIR' || hasAnyIntent(text, ['menu', 'sair'])) {
        await this.setSession(phoneNumber, 'menu');
        return { reply: this.menuText() };
      }
      if (normalized === 'VOLTAR' || normalized === 'CANCELAR' || hasAnyIntent(text, ['voltar', 'cancelar'])) {
        await this.setSession(phoneNumber, 'notes_menu', null, LONG_SESSION_TTL_MINUTES);
        return { reply: this.notesMenuText() };
      }

      const byNumber = Number(text.trim());
      const folderChoices = Array.isArray(payload.folders) ? (payload.folders as FolderChoice[]) : [];
      const selectedFolder = Number.isFinite(byNumber)
        ? folderChoices.find((folder) => folder.index === byNumber) ?? null
        : null;

      if (!selectedFolder) {
        return {
          reply: 'Escolha inválida.\nDigite o *número da pasta*.\nOu *voltar* / *menu*.'
        };
      }

      const notes = await this.listNoteChoices(selectedFolder.id);
      await this.setSession(
        phoneNumber,
        'notes_pick_note',
        {
          folderId: selectedFolder.id,
          folderName: selectedFolder.name,
          notes
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: this.renderNoteChoices(selectedFolder.name, notes)
      };
    }

    if (session.state === 'notes_pick_note') {
      if (normalized === 'MENU' || normalized === 'SAIR' || hasAnyIntent(text, ['menu', 'sair'])) {
        await this.setSession(phoneNumber, 'menu');
        return { reply: this.menuText() };
      }
      if (normalized === 'VOLTAR' || normalized === 'CANCELAR' || hasAnyIntent(text, ['voltar', 'cancelar'])) {
        const folders = await this.listFolderChoices();
        await this.setSession(
          phoneNumber,
          'notes_pick_folder',
          {
            folders
          },
          LONG_SESSION_TTL_MINUTES
        );
        return {
          reply: [
            '🗂️ *Escolha a pasta*',
            ...folders.map((folder) => `${folder.index}) ${folder.name}`),
            '',
            'Digite o *número da pasta*.',
            'Digite *menu* para sair.'
          ].join('\n')
        };
      }

      const byNumber = Number(text.trim());
      const noteChoices = Array.isArray(payload.notes) ? (payload.notes as NoteChoice[]) : [];
      const selected = Number.isFinite(byNumber)
        ? noteChoices.find((note) => note.index === byNumber) ?? null
        : null;

      if (!selected) {
        return {
          reply: 'Escolha inválida.\nDigite o *número da nota*.\nOu *voltar* / *menu*.'
        };
      }

      const note = await this.prisma.note.findUnique({
        where: {
          id: selected.id
        },
        include: {
          folder: {
            select: {
              name: true
            }
          }
        }
      });

      if (!note || note.archivedAt) {
        return {
          reply: 'Nota não encontrada.\nDigite outro número, ou *voltar*.'
        };
      }

      const noteText = this.noteContentToWhatsapp(note.content);
      const folderLabel = note.folder?.name ?? 'Sem pasta';
      return {
        reply: [
          `📝 *${note.title}*`,
          `Pasta: ${folderLabel} • Atualizada: ${this.toBrDateTime(note.updatedAt)}`,
          '',
          noteText,
          '',
          'Digite outro *número* para abrir outra nota, *voltar* para pastas, ou *menu*.'
        ].join('\n')
      };
    }

    if (session.state === 'notes_create_quick') {
      if (normalized === 'CANCELAR' || normalized === 'VOLTAR' || hasAnyIntent(text, ['cancelar', 'voltar'])) {
        await this.setSession(phoneNumber, 'notes_menu', null, LONG_SESSION_TTL_MINUTES);
        return { reply: this.notesMenuText() };
      }

      const safe = text.trim();
      if (!safe) {
        return {
          reply: 'Conteúdo vazio.\nEnvie algo para salvar a nota, ou *cancelar*.'
        };
      }

      const [rawTitle, ...rest] = safe.split('|');
      const hasSeparator = rest.length > 0;
      const title = hasSeparator
        ? rawTitle.trim() || 'Nova nota'
        : safe.slice(0, 80).trim() || 'Nova nota';
      const content = hasSeparator ? rest.join('|').trim() : safe;

      await this.prisma.note.create({
        data: {
          title,
          content,
          type: 'geral',
          tags: [],
          pinned: false
        }
      });

      await this.setSession(phoneNumber, 'notes_menu', null, LONG_SESSION_TTL_MINUTES);
      return {
        reply: `✅ *Nota criada:* ${title}\n\n${this.notesMenuText()}`
      };
    }

    await this.setSession(phoneNumber, 'notes_menu', null, LONG_SESSION_TTL_MINUTES);
    return {
      reply: this.notesMenuText()
    };
  }

  async handleInbound(phoneNumber: string, message: string): Promise<CommandResult> {
    const text = sanitizeTransportPrefix(message);
    if (!text) {
      await this.setSession(phoneNumber, 'menu');
      return {
        reply: this.menuText()
      };
    }

    if (this.isGreeting(text)) {
      await this.setSession(phoneNumber, 'menu');
      return {
        reply: `🤝 Bem-vindo ao assistente do Execution OS.\n\n${this.menuText()}`
      };
    }

    if (this.isExit(text)) {
      await this.setSession(phoneNumber, 'idle');
      return {
        reply: 'Conversa encerrada.\nDigite *menu* para abrir novamente.'
      };
    }

    const session = await this.getSession(phoneNumber);
    const inferredCommand = this.inferNaturalCommand(text, session);

    if (inferredCommand === '__open_menu__') {
      await this.setSession(phoneNumber, 'menu');
      return {
        reply: this.menuText()
      };
    }

    if (inferredCommand === '__open_notes__') {
      await this.setSession(phoneNumber, 'notes_menu', null, LONG_SESSION_TTL_MINUTES);
      return {
        reply: this.notesMenuText()
      };
    }

    if (inferredCommand === '__deep_waiting_task__') {
      const choices = await this.listTaskChoices(8);
      await this.setSession(
        phoneNumber,
        'deep_start_waiting_task',
        { choices },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: this.renderTaskChoices(
          choices,
          'Escolha a tarefa para iniciar o *Deep Work*:',
          'Responda com: *<número> [min]*. Exemplo: 1 45\nPara voltar: *menu* ou *cancelar*.'
        )
      };
    }

    if (inferredCommand === 'foco') {
      const focus = await this.runCommand('foco');
      await this.setSession(
        phoneNumber,
        'focus_menu',
        {
          lastModule: 'focus',
          lastAction: 'open_focus_panel'
        },
        LONG_SESSION_TTL_MINUTES
      );
      return {
        reply: `${this.prettifyReply(focus.reply)}\n\n${this.focusMenuText()}`,
        relatedTaskId: focus.relatedTaskId
      };
    }

    if (this.isDirectCommand(text)) {
      await this.setSession(phoneNumber, 'idle');
      const result = await this.runCommand(text);
      return {
        ...result,
        reply: /^(ajuda|help|\?)$/i.test(text.trim())
          ? this.helpText()
          : this.prettifyReply(result.reply)
      };
    }

    if (inferredCommand) {
      await this.setSession(phoneNumber, 'idle');
      const result = await this.runCommand(inferredCommand);
      return {
        ...result,
        reply: this.prettifyReply(result.reply)
      };
    }

    if (!session || session.state === 'idle') {
      const directAttempt = await this.runCommand(text);
      if (!/^Comando não reconhecido\./i.test(directAttempt.reply)) {
        return {
          ...directAttempt,
          reply: this.prettifyReply(directAttempt.reply)
        };
      }

      await this.setSession(phoneNumber, 'menu');
      return {
        reply: `Não entendi essa mensagem.\n\n${this.menuText()}`
      };
    }

    if (session.state === 'menu') {
      return this.processMenuInput(phoneNumber, text);
    }

    if (session.state.startsWith('focus_')) {
      return this.processFocusInput(phoneNumber, session, text);
    }

    if (session.state.startsWith('deep_')) {
      return this.processDeepInput(phoneNumber, session, text);
    }

    if (session.state.startsWith('open_tasks_')) {
      return this.processOpenTasksInput(phoneNumber, session, text);
    }

    if (session.state.startsWith('notes_')) {
      return this.processNotesInput(phoneNumber, session, text);
    }

    if (session.state === 'capture_inbox') {
      const normalized = normalizeOptionToken(text);
      if (
        normalized === 'MENU' ||
        normalized === 'VOLTAR' ||
        normalized === 'CANCELAR' ||
        normalized === 'SAIR' ||
        hasAnyIntent(text, ['menu', 'voltar', 'cancelar', 'sair'])
      ) {
        await this.setSession(phoneNumber, 'menu');
        return {
          reply: this.menuText()
        };
      }
      const captured = await this.runCommand(`inbox: ${text}`);
      await this.setSession(phoneNumber, 'menu');
      return {
        reply: `${this.prettifyReply(captured.reply)}\n\n${this.menuText()}`,
        relatedTaskId: captured.relatedTaskId
      };
    }

    await this.setSession(phoneNumber, 'menu');
    return {
      reply: this.menuText()
    };
  }
}
