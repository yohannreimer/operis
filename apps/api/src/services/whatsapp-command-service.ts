import { PrismaClient } from '@prisma/client';

import { TaskService } from './task-service.js';

type CommandResult = {
  reply: string;
  relatedTaskId?: string;
};

export class WhatsappCommandService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly taskService: TaskService
  ) {}

  private shortTaskLabel(task: { id: string; title: string }) {
    return `${task.id.slice(0, 8)} - ${task.title}`;
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

  private async resolveTaskByToken(idToken: string) {
    const task = await this.taskService.resolveTaskByShortId(idToken);

    if (!task) {
      throw new Error('Tarefa não encontrada para esse ID.');
    }

    return task;
  }

  async handle(rawText: string): Promise<CommandResult> {
    const text = rawText.trim();

    if (!text) {
      return { reply: 'Comando vazio.' };
    }

    const captureMatch = text.match(/^capturar\s+(.+)$/i);
    if (captureMatch) {
      const content = captureMatch[1].trim();
      const inbox = await this.prisma.inboxItem.create({
        data: {
          content,
          source: 'whatsapp',
          processed: false
        }
      });

      return {
        reply: `Capturado na inbox: ${inbox.content}`
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
        .map((task) => `${this.shortTaskLabel(task)} (${task.workspace.name})`)
        .join('\n');
      return { reply: `Tarefas de hoje:\n${formatted}` };
    }

    const backlogMatch = text.match(/^backlog(?:\s+(.+))?$/i);
    if (backlogMatch) {
      const workspaceName = backlogMatch[1]?.trim();
      const tasks = await this.tasksByStatus('backlog', workspaceName);

      if (!tasks.length) {
        return { reply: 'Backlog vazio.' };
      }

      const formatted = tasks
        .map((task) => `${this.shortTaskLabel(task)} (${task.workspace.name})`)
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
        .map((project) => `${project.title} (${project.workspace.name})`)
        .join('\n');
      return { reply: `Projetos:\n${formatted}` };
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

    return {
      reply:
        'Comando não reconhecido. Use: tarefas, backlog, projetos, fiz <id>, adiar <id>, reagendar <id> HH:mm, capturar <texto>, inbox.'
    };
  }
}
