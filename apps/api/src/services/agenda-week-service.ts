import { PrismaClient } from '@prisma/client';

import type {
  CommitmentOccurrence,
  CommitmentOccurrenceService
} from './commitment-occurrence-service.js';

export type DailyExecutionDto =
  | {
      id: string;
      kind: 'inbox';
      sourceId: string;
      date: string;
      title: string;
      position: number;
      completedAt: string | null;
      context: string | null;
    }
  | {
      id: string;
      kind: 'task';
      sourceId: string;
      date: string;
      title: string;
      position: number;
      completedAt: string | null;
      project: string | null;
      estimatedMinutes: number | null;
      deadline: string | null;
    };

export type AgendaBlockDto = {
  id: string;
  kind: 'task' | 'inbox';
  sourceId: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  completedAt: string | null;
  workspaceId: string | null;
  plannedMinutes: number;
};

export type AgendaTaskSourceDto = {
  id: string;
  title: string;
  estimatedMinutes: number;
  plannedMinutes: number;
  remainingMinutes: number;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceColor: string | null;
  projectName: string | null;
};

export type AgendaInboxSourceDto = {
  id: string;
  title: string;
  workspaceId: string | null;
  context: string | null;
};

export type AgendaWeekDto = {
  weekStart: string;
  resourceErrors: { commitments: string | null };
  days: Array<{
    date: string;
    intents: DailyExecutionDto[];
    blocks: AgendaBlockDto[];
    commitments: CommitmentOccurrence[];
  }>;
  unscheduled: {
    tasks: AgendaTaskSourceDto[];
    inbox: AgendaInboxSourceDto[];
  };
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function badRequest(message: string) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export class AgendaWeekService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly commitments: CommitmentOccurrenceService
  ) {}

  async getWeek(clerkUserId: string, weekStart: string): Promise<AgendaWeekDto> {
    const start = new Date(`${weekStart}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      dateKey(start) !== weekStart ||
      start.getUTCDay() !== 1
    ) {
      throw badRequest('weekStart precisa ser uma segunda-feira.');
    }

    const endExclusive = new Date(start);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 7);

    const corePromise = Promise.all([
      this.prisma.dayPlan.findMany({
        where: {
          clerkUserId,
          date: { gte: start, lt: endExclusive }
        },
        include: {
          items: {
            include: {
              task: true,
              inboxItem: { include: { workspace: true, inboxContext: true } }
            },
            orderBy: { startTime: 'asc' }
          }
        },
        orderBy: { date: 'asc' }
      }),
      this.prisma.dailyExecutionItem.findMany({
        where: {
          clerkUserId,
          date: { gte: start, lt: endExclusive }
        },
        include: {
          inboxItem: { include: { workspace: true, inboxContext: true } },
          task: { include: { workspace: true, project: true } }
        },
        orderBy: [{ date: 'asc' }, { position: 'asc' }]
      }),
      this.prisma.task.findMany({
        where: {
          workspace: { clerkUserId },
          horizon: 'active',
          status: { notIn: ['feito', 'arquivado'] },
          archivedAt: null
        },
        include: { workspace: true, project: true },
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }]
      }),
      this.prisma.inboxItem.findMany({
        where: { clerkUserId, status: 'pendente' },
        include: { workspace: true, inboxContext: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
      })
    ]);
    const commitmentPromise = Promise.allSettled([
      this.commitments.listWeek(clerkUserId, weekStart)
    ]);

    const [[plans, dailyItems, tasks, inboxItems], [commitmentResult]] = await Promise.all([
      corePromise,
      commitmentPromise
    ]);

    const blocksByDate = new Map<string, AgendaBlockDto[]>();
    const plannedMinutesByTask = new Map<string, number>();
    const plannedInboxIds = new Set<string>();
    const sameDayPlannedSources = new Set<string>();

    for (const plan of plans) {
      const planDate = dateKey(plan.date);
      const dayBlocks = blocksByDate.get(planDate) ?? [];

      for (const item of plan.items) {
        const plannedMinutes = minutesBetween(item.startTime, item.endTime);
        let block: AgendaBlockDto | null = null;

        if (item.taskId && item.task) {
          block = {
            id: item.id,
            kind: 'task',
            sourceId: item.taskId,
            date: planDate,
            title: item.task.title,
            startTime: item.startTime.toISOString(),
            endTime: item.endTime.toISOString(),
            completedAt: item.completedAt?.toISOString() ?? null,
            workspaceId: item.task.workspaceId,
            plannedMinutes
          };
          if (item.completedAt === null && item.confirmationState === 'pending') {
            plannedMinutesByTask.set(
              item.taskId,
              (plannedMinutesByTask.get(item.taskId) ?? 0) + plannedMinutes
            );
          }
        } else if (item.inboxItemId && item.inboxItem) {
          block = {
            id: item.id,
            kind: 'inbox',
            sourceId: item.inboxItemId,
            date: planDate,
            title: item.inboxItem.content,
            startTime: item.startTime.toISOString(),
            endTime: item.endTime.toISOString(),
            completedAt: item.completedAt?.toISOString() ?? null,
            workspaceId: item.inboxItem.workspaceId,
            plannedMinutes
          };
          plannedInboxIds.add(item.inboxItemId);
        }

        if (block) {
          dayBlocks.push(block);
          sameDayPlannedSources.add(`${planDate}:${block.kind}:${block.sourceId}`);
        }
      }

      blocksByDate.set(planDate, dayBlocks);
    }

    const intentsByDate = new Map<string, DailyExecutionDto[]>();
    for (const item of dailyItems) {
      const itemDate = dateKey(item.date);
      let intent: DailyExecutionDto | null = null;

      if (item.sourceType === 'inbox' && item.inboxItemId && item.inboxItem) {
        intent = {
          id: item.id,
          kind: 'inbox',
          sourceId: item.inboxItemId,
          date: itemDate,
          title: item.inboxItem.content,
          position: item.position,
          completedAt: item.completedAt?.toISOString() ?? null,
          context: item.inboxItem.inboxContext?.name ?? item.inboxItem.workspace?.name ?? null
        };
      } else if (item.sourceType === 'task' && item.taskId && item.task) {
        intent = {
          id: item.id,
          kind: 'task',
          sourceId: item.taskId,
          date: itemDate,
          title: item.task.title,
          position: item.position,
          completedAt: item.completedAt?.toISOString() ?? null,
          project: item.task.project?.title ?? null,
          estimatedMinutes: item.task.estimatedMinutes,
          deadline: item.task.dueDate?.toISOString() ?? null
        };
      }

      if (
        intent &&
        !sameDayPlannedSources.has(`${itemDate}:${intent.kind}:${intent.sourceId}`)
      ) {
        const dayIntents = intentsByDate.get(itemDate) ?? [];
        dayIntents.push(intent);
        intentsByDate.set(itemDate, dayIntents);
      }
    }

    const occurrences = commitmentResult.status === 'fulfilled' ? commitmentResult.value : [];
    const commitmentsByDate = new Map<string, CommitmentOccurrence[]>();
    for (const occurrence of occurrences) {
      const dayCommitments = commitmentsByDate.get(occurrence.date) ?? [];
      dayCommitments.push(occurrence);
      commitmentsByDate.set(occurrence.date, dayCommitments);
    }

    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      const key = dateKey(date);
      return {
        date: key,
        intents: intentsByDate.get(key) ?? [],
        blocks: blocksByDate.get(key) ?? [],
        commitments: commitmentsByDate.get(key) ?? []
      };
    });

    const unscheduledTasks = tasks
      .map((task) => {
        const plannedMinutes = plannedMinutesByTask.get(task.id) ?? 0;
        const estimatedMinutes = task.estimatedMinutes ?? 0;
        return {
          id: task.id,
          title: task.title,
          estimatedMinutes,
          plannedMinutes,
          remainingMinutes: Math.max(0, estimatedMinutes - plannedMinutes),
          workspaceId: task.workspaceId,
          workspaceName: task.workspace?.name ?? null,
          workspaceColor: task.workspace?.color ?? null,
          projectName: task.project?.title ?? null
        };
      })
      .filter((task) => task.estimatedMinutes === 0 || task.remainingMinutes > 0);

    const unscheduledInbox = inboxItems
      .filter((item) => !plannedInboxIds.has(item.id))
      .map((item) => ({
        id: item.id,
        title: item.content,
        workspaceId: item.workspaceId,
        context: item.inboxContext?.name ?? item.workspace?.name ?? null
      }));

    return {
      weekStart,
      resourceErrors: {
        commitments:
          commitmentResult.status === 'rejected' ? 'Compromissos indisponíveis.' : null
      },
      days,
      unscheduled: {
        tasks: unscheduledTasks,
        inbox: unscheduledInbox
      }
    };
  }
}
