import { PrismaClient } from '@prisma/client';

import { endOfDay, startOfDay } from '../utils/time.js';
import {
  safeRecordStrategicDecisionEvent,
  signalFromImpact
} from './strategic-decision-service.js';

const DEFAULT_MINIMUM_BLOCK_MINUTES = 45;

export class DeepWorkService {
  constructor(private readonly prisma: PrismaClient) {}

  private minutesBetween(start: Date, end: Date) {
    const delta = Math.round((end.getTime() - start.getTime()) / 60000);
    return Math.max(0, delta);
  }

  async getActive(workspaceId?: string) {
    return this.prisma.deepWorkSession.findFirst({
      where: {
        state: 'active',
        workspaceId
      },
      include: {
        task: true,
        workspace: true,
        project: true
      },
      orderBy: {
        startedAt: 'desc'
      }
    });
  }

  async start(input: {
    taskId: string;
    targetMinutes?: number;
    minimumBlockMinutes?: number;
  }) {
    const minimumBlock = Math.max(15, input.minimumBlockMinutes ?? DEFAULT_MINIMUM_BLOCK_MINUTES);
    const targetMinutes = input.targetMinutes ?? minimumBlock;

    if (targetMinutes < minimumBlock) {
      throw new Error(`Deep Work exige bloco mínimo de ${minimumBlock} minutos.`);
    }

    const task = await this.prisma.task.findUnique({
      where: { id: input.taskId },
      select: {
        id: true,
        title: true,
        taskType: true,
        isMultiBlock: true,
        status: true,
        workspaceId: true,
        projectId: true
      }
    });

    if (!task) {
      throw new Error('Tarefa não encontrada para iniciar Deep Work.');
    }

    if (task.status === 'feito' || task.status === 'arquivado') {
      throw new Error('Não é possível iniciar Deep Work em tarefa concluída/arquivada.');
    }

    if (task.taskType !== 'a' && !task.isMultiBlock) {
      throw new Error('Deep Work só pode ser iniciado em tarefa tipo A ou tarefa multiblock.');
    }

    const activeSession = await this.prisma.deepWorkSession.findFirst({
      where: {
        state: 'active'
      },
      select: {
        id: true,
        task: {
          select: {
            title: true
          }
        }
      }
    });

    if (activeSession) {
      throw new Error(`Já existe Deep Work ativo: ${activeSession.task?.title ?? activeSession.id}`);
    }

    const session = await this.prisma.deepWorkSession.create({
      data: {
        taskId: task.id,
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        targetMinutes
      },
      include: {
        task: true,
        workspace: true,
        project: true
      }
    });

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      source: 'deep_work_service',
      eventCode: 'deep_work_started',
      signal: 'executiva',
      impactScore: 6,
      title: `Deep Work iniciado: ${task.title}`,
      rationale: 'Início de bloco de foco profundo em tarefa A.',
      payload: {
        targetMinutes,
        minimumBlock
      }
    });

    return session;
  }

  async registerInterruption(sessionId: string) {
    const session = await this.prisma.deepWorkSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        state: true
      }
    });

    if (!session) {
      throw new Error('Sessão de Deep Work não encontrada.');
    }

    if (session.state !== 'active') {
      throw new Error('Sessão já finalizada.');
    }

    const updated = await this.prisma.deepWorkSession.update({
      where: {
        id: sessionId
      },
      data: {
        interruptionCount: {
          increment: 1
        }
      },
      include: {
        task: true,
        workspace: true,
        project: true
      }
    });

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: updated.workspaceId,
      projectId: updated.projectId,
      taskId: updated.taskId,
      source: 'deep_work_service',
      eventCode: 'deep_work_interruption',
      signal: 'risco',
      impactScore: -2,
      title: `Interrupção no Deep Work: ${updated.task?.title ?? updated.taskId}`,
      rationale: 'Interrupção registrada para análise de padrão de distração.',
      payload: {
        interruptionCount: updated.interruptionCount
      }
    });

    return updated;
  }

  async registerBreak(sessionId: string) {
    const session = await this.prisma.deepWorkSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        state: true
      }
    });

    if (!session) {
      throw new Error('Sessão de Deep Work não encontrada.');
    }

    if (session.state !== 'active') {
      throw new Error('Sessão já finalizada.');
    }

    return this.prisma.deepWorkSession.update({
      where: {
        id: sessionId
      },
      data: {
        breakCount: {
          increment: 1
        }
      },
      include: {
        task: true,
        workspace: true,
        project: true
      }
    });
  }

  async stop(
    sessionId: string,
    input?: {
      switchedTask?: boolean;
      notes?: string;
    }
  ) {
    const session = await this.prisma.deepWorkSession.findUnique({
      where: {
        id: sessionId
      }
    });

    if (!session) {
      throw new Error('Sessão de Deep Work não encontrada.');
    }

    if (session.state !== 'active') {
      return this.prisma.deepWorkSession.findUnique({
        where: {
          id: sessionId
        },
        include: {
          task: true,
          workspace: true,
          project: true
        }
      });
    }

    const endedAt = new Date();
    const actualMinutes = this.minutesBetween(session.startedAt, endedAt);
    const nextState = input?.switchedTask ? 'broken' : 'completed';

    const stopped = await this.prisma.deepWorkSession.update({
      where: {
        id: sessionId
      },
      data: {
        endedAt,
        actualMinutes,
        notes: input?.notes?.trim() || session.notes,
        breakCount: input?.switchedTask
          ? {
              increment: 1
            }
          : undefined,
        state: nextState
      },
      include: {
        task: true,
        workspace: true,
        project: true
      }
    });

    if (stopped.projectId) {
      await this.prisma.project.update({
        where: {
          id: stopped.projectId
        },
        data: {
          lastStrategicAt: endedAt
        }
      });
    }

    const completionDelta = stopped.actualMinutes - stopped.targetMinutes;
    const stopImpact =
      stopped.state === 'completed'
        ? completionDelta >= 0
          ? 7
          : 4
        : -5;

    await safeRecordStrategicDecisionEvent(this.prisma, {
      workspaceId: stopped.workspaceId,
      projectId: stopped.projectId,
      taskId: stopped.taskId,
      source: 'deep_work_service',
      eventCode: stopped.state === 'broken' ? 'deep_work_broken' : 'deep_work_completed',
      signal: signalFromImpact(stopImpact),
      impactScore: stopImpact,
      title:
        stopped.state === 'broken'
          ? `Deep Work quebrado: ${stopped.task?.title ?? stopped.taskId}`
          : `Deep Work encerrado: ${stopped.task?.title ?? stopped.taskId}`,
      rationale:
        stopped.state === 'broken'
          ? 'Sessão interrompida por troca de tarefa.'
          : 'Sessão concluída com minutos reais computados.',
      payload: {
        targetMinutes: stopped.targetMinutes,
        actualMinutes: stopped.actualMinutes,
        interruptionCount: stopped.interruptionCount,
        breakCount: stopped.breakCount
      }
    });

    return stopped;
  }

  async getSummary(params: { date: string; workspaceId?: string }) {
    const start = startOfDay(params.date);
    const end = endOfDay(params.date);
    const now = new Date();

    const sessions = await this.prisma.deepWorkSession.findMany({
      where: {
        workspaceId: params.workspaceId,
        startedAt: {
          gte: start,
          lte: end
        }
      },
      include: {
        task: true,
        workspace: true,
        project: true
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    const totalMinutes = sessions.reduce((acc, session) => {
      if (session.state === 'active') {
        return acc + this.minutesBetween(session.startedAt, now);
      }

      return acc + session.actualMinutes;
    }, 0);

    const totalTargetMinutes = sessions.reduce((acc, session) => acc + session.targetMinutes, 0);
    const totalInterruptions = sessions.reduce((acc, session) => acc + session.interruptionCount, 0);
    const totalBreaks = sessions.reduce((acc, session) => acc + session.breakCount, 0);

    return {
      date: params.date,
      workspaceId: params.workspaceId ?? null,
      sessions,
      sessionsCount: sessions.length,
      activeCount: sessions.filter((session) => session.state === 'active').length,
      completedCount: sessions.filter((session) => session.state === 'completed').length,
      brokenCount: sessions.filter((session) => session.state === 'broken').length,
      totalMinutes,
      totalTargetMinutes,
      totalInterruptions,
      totalBreaks,
      adherencePercent: totalTargetMinutes ? Math.round((totalMinutes / totalTargetMinutes) * 100) : 0
    };
  }
}
