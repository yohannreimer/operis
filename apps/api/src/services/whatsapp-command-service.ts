import { PrismaClient } from '@prisma/client';

import { DayPlanService } from './day-plan-service.js';
import { DeepWorkService } from './deep-work-service.js';
import { ExecutionInsightsService } from './execution-insights-service.js';
import { TaskService } from './task-service.js';

export type CommandResult = {
  reply: string;
  relatedTaskId?: string;
};

type ReminderDigestOptions = {
  date?: string;
  workspaceId?: string;
};

type DueReminderOptions = ReminderDigestOptions & {
  daysBefore?: number[];
};

type UpcomingDigestOptions = ReminderDigestOptions & {
  withinMinutes?: number;
};

const TRANSPORT_PREFIX_REGEX = /^(?:(?:=+|--+|[•·]\s*|[–—-]{2,}\s*))+/;

function clampHour(value: number) {
  return Math.max(0, Math.min(23, value));
}

function clampMinute(value: number) {
  return Math.max(0, Math.min(59, value));
}

function toDateKeyLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateAtLocalMidnightFromKey(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function daysDiffFromReference(isoDate: string, referenceDateKey?: string) {
  const due = new Date(isoDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }

  const reference = referenceDateKey
    ? dateAtLocalMidnightFromKey(referenceDateKey)
    : new Date();
  const base = reference ?? new Date();
  const startToday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.floor((startDue.getTime() - startToday.getTime()) / (24 * 60 * 60 * 1000));
}

function sanitizeTransportPrefix(rawText: string) {
  let normalized = rawText.replace(/[\u200B-\u200D\uFE0E\uFE0F\u2060]/g, '').trim();
  while (TRANSPORT_PREFIX_REGEX.test(normalized)) {
    normalized = normalized.replace(TRANSPORT_PREFIX_REGEX, '').trimStart();
  }
  return normalized;
}

export class WhatsappCommandService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly taskService: TaskService,
    private readonly executionInsightsService: ExecutionInsightsService,
    private readonly deepWorkService: DeepWorkService,
    private readonly dayPlanService: DayPlanService
  ) {}

  private shortTaskLabel(task: { id: string; title: string }, includeId = true) {
    if (!includeId) {
      return task.title;
    }

    return `${task.id.slice(0, 8)} - ${task.title}`;
  }

  private todayDate() {
    return toDateKeyLocal(new Date());
  }

  private async tasksByStatus(status: 'hoje' | 'andamento' | 'backlog', workspaceName?: string) {
    return this.prisma.task.findMany({
      where: {
        status,
        workspace: workspaceName
          ? {
              name: {
                contains: workspaceName,
                mode: 'insensitive'
              }
            }
          : undefined
      },
      include: { workspace: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 12
    });
  }

  private trimLabel(value: string, max: number) {
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }

  private async resolveTaskByToken(idToken: string) {
    const task = await this.taskService.resolveTaskByShortId(idToken);

    if (!task) {
      throw new Error('Tarefa não encontrada para esse ID.');
    }

    return task;
  }

  private formatTopList(
    tasks: Array<{ id: string; title: string; workspace?: { name: string | null } | null }>,
    includeId = true
  ) {
    return tasks
      .map(
        (task, index) =>
          `${index + 1}) ${this.shortTaskLabel(task, includeId)}${task.workspace?.name ? ` (${task.workspace.name})` : ''}`
      )
      .join('\n');
  }

  private formatDateBrFromKey(dateKey: string) {
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return dateKey;
    }

    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  private async resolveTaskTokens(tokens: string[]) {
    const resolvedIds: string[] = [];
    for (const token of tokens) {
      const task = await this.resolveTaskByToken(token);
      resolvedIds.push(task.id);
    }
    return Array.from(new Set(resolvedIds));
  }

  async buildMorningBriefing(options?: ReminderDigestOptions) {
    const date = options?.date ?? this.todayDate();
    const briefing = await this.executionInsightsService.getBriefing({
      date,
      workspaceId: options?.workspaceId
    });
    const top = briefing.top3.slice(0, 3);

    if (!top.length) {
      return `Bom dia. Não há tarefas A elegíveis para foco hoje (${date}).\nEnvie "tarefas" para revisar e organizar o dia.`;
    }

    const topText = this.formatTopList(top, false);
    const commitmentLine = briefing.top3Meta.locked
      ? '✅ *Compromisso:* confirmado'
      : '⚠️ *Compromisso:* ainda não confirmado';
    const capacityLine = briefing.capacity.isUnrealistic
      ? `🚨 *Planejamento irreal:* +${briefing.capacity.overloadMinutes} min acima da capacidade`
      : `📊 *Capacidade:* ${briefing.capacity.plannedTaskMinutes}/${briefing.capacity.availableMinutes} min planejados`;
    const dateLabel = this.formatDateBrFromKey(date);

    return [
      '🌤️ *Bom dia!*',
      `*Foco do dia* (${dateLabel})`,
      topText,
      commitmentLine,
      capacityLine,
      '',
      'Se quiser, responda com *1* para abrir o painel de foco.'
    ].join('\n');
  }

  async buildDueReminderDigest(options?: DueReminderOptions) {
    const referenceDate = options?.date ?? this.todayDate();
    const daysBefore = (options?.daysBefore?.length ? options.daysBefore : [3, 1, 0]).map((value) =>
      Math.max(0, Math.round(value))
    );

    const tasks = await this.prisma.task.findMany({
      where: {
        archivedAt: null,
        status: {
          in: ['backlog', 'hoje', 'andamento']
        },
        dueDate: {
          not: null
        }
      },
      include: {
        workspace: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 80
    });

    const dueRows = tasks
      .map((task) => {
        const diff = task.dueDate
          ? daysDiffFromReference(task.dueDate.toISOString(), referenceDate)
          : null;
        return { task, diff };
      })
      .filter((row) => row.diff !== null && daysBefore.includes(row.diff as number))
      .slice(0, 12);

    if (!dueRows.length) {
      return null;
    }

    const lines = dueRows.map(({ task, diff }) => {
      const urgency =
        diff === 0 ? 'vence hoje' : diff === 1 ? 'vence amanhã' : diff === 3 ? 'vence em 3 dias' : `vence em ${diff} dias`;
      return `• ${this.shortTaskLabel(task, false)} (${task.workspace?.name ?? 'Frente'}) • ${urgency}`;
    });

    return ['⏰ *Alertas de prazo*', ...lines, '', 'Dica: abra o menu e use o painel de tarefas para agir.'].join('\n');
  }

  async buildWaitingFollowupDigest(_options?: ReminderDigestOptions) {
    const radar = await this.taskService.getWaitingRadar();
    const rows = radar.rows.filter((entry) => entry.followupState === 'urgente' || entry.followupState === 'hoje').slice(0, 10);

    if (!rows.length) {
      return null;
    }

    const lines = rows.map((entry) => {
      const urgency = entry.followupState === 'urgente' ? 'urgente' : 'cobrar hoje';
      return `• ${entry.title} • ${entry.waitingOnPerson} (${urgency})`;
    });

    return ['📌 *Follow-ups pendentes*', ...lines, '', 'Responda *4* no menu para revisar prazos e follow-ups.'].join('\n');
  }

  async buildUpcomingBlockDigest(options?: UpcomingDigestOptions) {
    const date = options?.date ?? this.todayDate();
    const withinMinutes = Math.max(5, Math.min(120, Math.round(options?.withinMinutes ?? 20)));
    const plan = await this.dayPlanService.getByDate(date);

    if (!plan) {
      return null;
    }

    const now = new Date();
    const endWindow = new Date(now.getTime() + withinMinutes * 60 * 1000);
    const upcoming = (plan.items ?? [])
      .filter((item) => item.confirmationState === 'pending' && item.startTime >= now && item.startTime <= endWindow)
      .slice(0, 8);

    if (!upcoming.length) {
      return null;
    }

    const lines = upcoming.map((item) => {
      const startLabel = item.startTime.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const title = item.task?.title ?? 'Bloco fixo';
      return `• ${startLabel} ${title}`;
    });

    return [`🕒 *Blocos nos próximos ${withinMinutes} min*`, ...lines, '', 'Dica: responda *3* no menu para abrir o painel Deep Work.'].join('\n');
  }

  async handle(rawText: string): Promise<CommandResult> {
    const text = sanitizeTransportPrefix(rawText);

    if (!text) {
      return { reply: 'Comando vazio.' };
    }

    if (/^(ajuda|help)$/i.test(text)) {
      return {
        reply:
          [
            '❓ *Comandos disponíveis*',
            '• foco',
            '• tarefas',
            '• abertas',
            '• projetos',
            '• deep iniciar <id>',
            '• deep parar',
            '• deep concluir',
            '• capturar <texto>',
            '• prazos',
            '• followups'
          ].join('\n')
      };
    }

    const captureMatch = text.match(/^capturar\s+(.+)$/i) ?? text.match(/^inbox:\s*(.+)$/i);
    if (captureMatch) {
      const content = sanitizeTransportPrefix(captureMatch[1]);
      if (!content) {
        return {
          reply: 'Texto vazio para inbox. Envie algo após *inbox:*.'
        };
      }
      const inbox = await this.prisma.inboxItem.create({
        data: {
          content,
          source: 'whatsapp',
          processed: false
        }
      });

      return {
        reply: `✅ *Capturado na inbox:*\n${inbox.content}`
      };
    }

    if (/^(foco|top3)$/i.test(text)) {
      return {
        reply: await this.buildMorningBriefing({
          date: this.todayDate()
        })
      };
    }

    const focusConfirmMatch = text.match(/^(?:foco|top3)\s+confirmar(?:\s+(.+))?$/i);
    if (focusConfirmMatch) {
      const date = this.todayDate();
      const idsRaw = focusConfirmMatch[1]?.trim();
      const taskIds = idsRaw
        ? await this.resolveTaskTokens(idsRaw.split(/\s+/).filter(Boolean))
        : (await this.executionInsightsService.getBriefing({ date })).top3.map((task) => task.id).slice(0, 3);

      if (!taskIds.length) {
        return {
          reply: 'Não encontrei tarefas elegíveis para confirmar no foco.'
        };
      }

      const committed = await this.executionInsightsService.commitTop3({
        date,
        taskIds,
        note: 'confirmado via whatsapp'
      });

      return {
        reply: `Foco confirmado:\n${this.formatTopList(committed.tasks)}`
      };
    }

    const focusSwapMatch = text.match(/^(?:foco|top3)\s+trocar\s+([1-3])\s+([\w-]+)$/i);
    if (focusSwapMatch) {
      const date = this.todayDate();
      const slotIndex = Number(focusSwapMatch[1]) - 1;
      const replacement = await this.resolveTaskByToken(focusSwapMatch[2]);
      const current = await this.executionInsightsService.getTop3Commitment({ date });
      const baseTaskIds = current.taskIds.length
        ? [...current.taskIds]
        : current.tasks.map((task) => task.id).slice(0, 3);

      while (baseTaskIds.length < 3 && current.tasks[baseTaskIds.length]) {
        baseTaskIds.push(current.tasks[baseTaskIds.length].id);
      }

      if (slotIndex >= baseTaskIds.length) {
        return {
          reply: `Não há slot ${slotIndex + 1} disponível para troca.`
        };
      }

      baseTaskIds[slotIndex] = replacement.id;
      const finalTaskIds = Array.from(new Set(baseTaskIds)).slice(0, 3);
      const committed = await this.executionInsightsService.commitTop3({
        date,
        taskIds: finalTaskIds,
        note: `troca via whatsapp (slot ${slotIndex + 1})`
      });

      return {
        reply: `Foco atualizado:\n${this.formatTopList(committed.tasks)}`
      };
    }

    const deepStartMatch = text.match(/^deep\s+(?:iniciar|start)\s+([\w-]+)(?:\s+(\d{1,3}))?$/i);
    if (deepStartMatch) {
      const task = await this.resolveTaskByToken(deepStartMatch[1]);
      const requestedTarget = deepStartMatch[2] ? Number(deepStartMatch[2]) : null;
      const targetMinutes = requestedTarget && Number.isFinite(requestedTarget)
        ? Math.max(15, Math.min(360, Math.round(requestedTarget)))
        : Math.max(45, task.estimatedMinutes ?? 45);

      const session = await this.deepWorkService.start({
        taskId: task.id,
        targetMinutes
      });

      return {
        reply: `Deep Work iniciado: ${task.title}\nSessão ${session.id.slice(0, 8)} • alvo ${targetMinutes} min`,
        relatedTaskId: task.id
      };
    }

    if (/^deep\s+(?:parar|stop)$/i.test(text)) {
      const active = await this.deepWorkService.getActive();
      if (!active) {
        return {
          reply: 'Não existe Deep Work ativo agora.'
        };
      }

      const stopped = await this.deepWorkService.stop(active.id);
      if (!stopped) {
        return {
          reply: 'Não foi possível encerrar a sessão ativa.'
        };
      }

      return {
        reply: `Deep Work encerrado: ${stopped.task?.title ?? stopped.taskId} • ${stopped.actualMinutes} min`,
        relatedTaskId: stopped.taskId
      };
    }

    if (/^deep\s+concluir$/i.test(text)) {
      const active = await this.deepWorkService.getActive();
      if (!active) {
        return {
          reply: 'Não existe Deep Work ativo para concluir.'
        };
      }

      await this.deepWorkService.stop(active.id);
      await this.taskService.complete(active.taskId, {
        strictMode: false,
        completionMode: 'no_note'
      });

      return {
        reply: `Deep Work encerrado e tarefa concluída: ${active.task?.title ?? active.taskId}`,
        relatedTaskId: active.taskId
      };
    }

    const alocarMatch = text.match(/^alocar\s+([\w-]+)\s+(\d{1,2}):(\d{2})$/i);
    if (alocarMatch) {
      const task = await this.resolveTaskByToken(alocarMatch[1]);
      const hours = clampHour(Number(alocarMatch[2]));
      const minutes = clampMinute(Number(alocarMatch[3]));
      const estimatedMinutes = Math.max(1, task.estimatedMinutes ?? 60);
      const now = new Date();
      const start = new Date(now);
      start.setHours(hours, minutes, 0, 0);
      const end = new Date(start.getTime() + estimatedMinutes * 60 * 1000);
      const date = this.todayDate();

      await this.dayPlanService.addItem({
        date,
        taskId: task.id,
        blockType: 'task',
        startTime: start.toISOString(),
        endTime: end.toISOString()
      });

      return {
        reply: `Alocado para hoje às ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}: ${task.title}`,
        relatedTaskId: task.id
      };
    }

    const tarefasMatch = text.match(/^tarefas(?:\s+(.+))?$/i);
    if (tarefasMatch) {
      const workspaceName = tarefasMatch[1]?.trim();
      const tasks = await this.tasksByStatus('hoje', workspaceName);

      if (!tasks.length) {
        return { reply: 'Nenhuma tarefa em "hoje".' };
      }

      const formatted = tasks
        .map((task) => `${this.shortTaskLabel(task)} (P${task.priority} • ${task.workspace.name})`)
        .join('\n');
      return { reply: `Tarefas de hoje:\n${formatted}` };
    }

    const abertasMatch = text.match(/^(?:abertas|todas\s+as\s+tarefas|tarefas\s+abertas)(?:\s+(.+))?$/i);
    if (abertasMatch) {
      const workspaceName = abertasMatch[1]?.trim();
      const tasks = await this.prisma.task.findMany({
        where: {
          archivedAt: null,
          status: {
            in: ['hoje', 'andamento', 'backlog']
          },
          workspace: workspaceName
            ? {
                name: {
                  contains: workspaceName,
                  mode: 'insensitive'
                }
              }
            : undefined
        },
        include: {
          workspace: {
            select: {
              name: true
            }
          }
        },
        orderBy: [{ status: 'asc' }, { priority: 'asc' }, { updatedAt: 'desc' }],
        take: 24
      });

      if (!tasks.length) {
        return { reply: '✅ Nenhuma tarefa aberta.' };
      }

      const rows = tasks.map((task, index) => {
        const status =
          task.status === 'hoje'
            ? 'hoje'
            : task.status === 'andamento'
              ? 'em andamento'
              : 'backlog';
        return [
          `${index + 1}) ${this.trimLabel(task.title, 64)}`,
          `   • Frente: ${this.trimLabel(task.workspace?.name ?? 'Geral', 28)} • P${task.priority} • ${status} • id ${task.id.slice(0, 8)}`
        ].join('\n');
      });

      return {
        reply: [
          '📋 *Tarefas abertas*',
          ...rows,
          '',
          'Dica: no menu use *7* para abrir ações guiadas por número.'
        ].join('\n')
      };
    }

    const backlogMatch = text.match(/^backlog(?:\s+(.+))?$/i);
    if (backlogMatch) {
      const workspaceName = backlogMatch[1]?.trim();
      const tasks = await this.tasksByStatus('backlog', workspaceName);

      if (!tasks.length) {
        return { reply: 'Backlog vazio.' };
      }

      const formatted = tasks
        .map((task) => `${this.shortTaskLabel(task)} (P${task.priority} • ${task.workspace.name})`)
        .join('\n');
      return { reply: `Backlog:\n${formatted}` };
    }

    if (/^projetos(?:\s+.+)?$/i.test(text)) {
      const workspaceName = text.split(/\s+/).slice(1).join(' ').trim();
      const projects = await this.prisma.project.findMany({
        where: {
          status: {
            in: ['ativo', 'pausado']
          },
          workspace: workspaceName
            ? {
                name: {
                  contains: workspaceName,
                  mode: 'insensitive'
                }
              }
            : undefined
        },
        include: { workspace: true },
        orderBy: { createdAt: 'desc' },
        take: 12
      });

      if (!projects.length) {
        return { reply: 'Nenhum projeto ativo.' };
      }

      const formatted = projects
        .map((project) => `${project.title} (${project.workspace.name}) • ${project.methodology.toUpperCase()}`)
        .join('\n');
      return { reply: `Projetos:\n${formatted}` };
    }

    if (/^prazos$/i.test(text)) {
      const digest = await this.buildDueReminderDigest();
      return {
        reply: digest ?? '✅ *Prazos em dia*\nSem alertas de prazo para hoje.'
      };
    }

    if (/^followups?$/i.test(text)) {
      const digest = await this.buildWaitingFollowupDigest();
      return {
        reply: digest ?? '✅ *Follow-ups em dia*\nNenhum follow-up urgente por agora.'
      };
    }

    const fizMatch = text.match(/^fiz\s+([\w-]+)$/i);
    if (fizMatch) {
      const task = await this.resolveTaskByToken(fizMatch[1]);
      await this.taskService.complete(task.id);

      return {
        reply: `Marcado como concluído: ${task.title}`,
        relatedTaskId: task.id
      };
    }

    const adiarMatch = text.match(/^adiar\s+([\w-]+)$/i);
    if (adiarMatch) {
      const task = await this.resolveTaskByToken(adiarMatch[1]);
      await this.taskService.postpone(task.id);

      return {
        reply: `Tarefa adiada: ${task.title}`,
        relatedTaskId: task.id
      };
    }

    const reagendarMatch = text.match(/^reagendar\s+([\w-]+)\s+(\d{1,2}:\d{2})$/i);
    if (reagendarMatch) {
      const task = await this.resolveTaskByToken(reagendarMatch[1]);
      const [hours, minutes] = reagendarMatch[2].split(':').map(Number);
      const start = new Date();
      start.setHours(hours, minutes, 0, 0);
      const end = new Date(start.getTime() + (task.estimatedMinutes ?? 60) * 60 * 1000);

      await this.taskService.update(task.id, {
        fixedTimeStart: start.toISOString(),
        fixedTimeEnd: end.toISOString(),
        status: 'hoje'
      });

      return {
        reply: `Reagendada para ${reagendarMatch[2]}: ${task.title}`,
        relatedTaskId: task.id
      };
    }

    if (/^inbox$/i.test(text)) {
      const items = await this.prisma.inboxItem.findMany({
        where: { processed: false },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      if (!items.length) {
        return { reply: 'Inbox vazia.' };
      }

      const formatted = items.map((item) => `- ${item.content}`).join('\n');
      return { reply: `Inbox:\n${formatted}` };
    }

    if (/^status$/i.test(text)) {
      const date = this.todayDate();
      const briefing = await this.executionInsightsService.getBriefing({ date });
      return {
        reply: [
          `Status do dia (${date}):`,
          `- Top foco: ${briefing.top3.length} tarefa(s)`,
          `- Planejado: ${briefing.capacity.plannedTaskMinutes}/${briefing.capacity.availableMinutes} min`,
          `- Restrições ativas: ${briefing.actionables.waitingFollowups.length}`,
          `- Fragmentação: ${briefing.alerts.fragmentationRisk ? 'sim' : 'não'}`
        ].join('\n')
      };
    }

    return {
      reply:
        'Comando não reconhecido. Use: ajuda, foco, foco confirmar, foco trocar <slot> <id>, tarefas, abertas, backlog, projetos, deep iniciar <id>, deep parar, deep concluir, alocar <id> HH:mm, fiz <id>, adiar <id>, reagendar <id> HH:mm, prazos, followups, inbox, inbox: <texto>.'
    };
  }
}
