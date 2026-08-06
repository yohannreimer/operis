import { describe, expect, it, vi } from 'vitest';

import { AgendaWeekService } from './agenda-week-service.js';

const USER_ID = 'user_1';

const commitmentOccurrence = () => ({
  id: 'commitment_1:2026-08-06',
  commitmentId: 'commitment_1',
  date: '2026-08-06',
  title: 'Academia',
  startTime: '09:00',
  durationMin: 60,
  workspaceId: null,
  recurring: true,
  rescheduled: false
});

function agendaPrismaFixture() {
  return {
    dayPlan: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'plan_1',
          date: new Date('2026-08-06T00:00:00.000Z'),
          items: [
            {
              id: 'block_1',
              taskId: 'task_1',
              inboxItemId: null,
              startTime: new Date('2026-08-06T11:00:00.000Z'),
              endTime: new Date('2026-08-06T12:30:00.000Z'),
              completedAt: null,
              confirmationState: 'pending',
              task: {
                id: 'task_1',
                title: 'Gravar vídeo',
                estimatedMinutes: 360,
                workspaceId: 'workspace_1'
              },
              inboxItem: null
            }
          ]
        }
      ])
    },
    dailyExecutionItem: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'daily_1',
          date: new Date('2026-08-06T00:00:00.000Z'),
          sourceType: 'inbox',
          inboxItemId: 'inbox_1',
          taskId: null,
          position: 0,
          completedAt: null,
          inboxItem: {
            id: 'inbox_1',
            content: 'Responder mensagem',
            workspaceId: null,
            workspace: null,
            inboxContext: null
          },
          task: null
        }
      ])
    },
    task: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'task_1',
          title: 'Gravar vídeo',
          estimatedMinutes: 360,
          workspaceId: 'workspace_1',
          project: null,
          workspace: { name: 'Prymeira', color: '#f97316' }
        }
      ])
    },
    inboxItem: { findMany: vi.fn().mockResolvedValue([]) }
  };
}

describe('AgendaWeekService', () => {
  it('returns seven days, unscheduled intents and partially planned tasks', async () => {
    const prisma = agendaPrismaFixture();
    const commitments = { listWeek: vi.fn().mockResolvedValue([commitmentOccurrence()]) };

    const result = await new AgendaWeekService(prisma as never, commitments as never).getWeek(
      USER_ID,
      '2026-08-03'
    );

    expect(result.days).toHaveLength(7);
    expect(result.days[3].date).toBe('2026-08-06');
    expect(result.days[3].intents).toContainEqual(
      expect.objectContaining({ kind: 'inbox', title: 'Responder mensagem' })
    );
    expect(result.days[3].blocks).toContainEqual(
      expect.objectContaining({ kind: 'task', plannedMinutes: 90 })
    );
    expect(result.days[3].commitments).toEqual([commitmentOccurrence()]);
    expect(result.unscheduled.tasks).toContainEqual(
      expect.objectContaining({
        estimatedMinutes: 360,
        plannedMinutes: 90,
        remainingMinutes: 270
      })
    );
  });

  it('keeps the core week available when commitments fail', async () => {
    const prisma = agendaPrismaFixture();
    const commitments = { listWeek: vi.fn().mockRejectedValue(new Error('offline')) };

    const result = await new AgendaWeekService(prisma as never, commitments as never).getWeek(
      USER_ID,
      '2026-08-03'
    );

    expect(result.resourceErrors.commitments).toBe('Compromissos indisponíveis.');
    expect(result.days).toHaveLength(7);
    expect(result.days.every((day) => day.commitments.length === 0)).toBe(true);
  });

  it('removes an intent only when the same source has a block on the same day', async () => {
    const prisma = agendaPrismaFixture();
    const taskIntent = (id: string, date: string) => ({
      id,
      date: new Date(`${date}T00:00:00.000Z`),
      sourceType: 'task',
      inboxItemId: null,
      taskId: 'task_1',
      position: 0,
      completedAt: null,
      inboxItem: null,
      task: {
        id: 'task_1',
        title: 'Gravar vídeo',
        estimatedMinutes: 360,
        dueDate: null,
        workspace: { name: 'Prymeira' },
        project: null
      }
    });
    prisma.dailyExecutionItem.findMany.mockResolvedValue([
      taskIntent('daily_same_day', '2026-08-06'),
      taskIntent('daily_other_day', '2026-08-07')
    ]);
    const commitments = { listWeek: vi.fn().mockResolvedValue([]) };

    const result = await new AgendaWeekService(prisma as never, commitments as never).getWeek(
      USER_ID,
      '2026-08-03'
    );

    expect(result.days[3].intents).toEqual([]);
    expect(result.days[4].intents).toContainEqual(
      expect.objectContaining({ id: 'daily_other_day', kind: 'task' })
    );
  });

  it('rejects an internal request whose week does not start on Monday', async () => {
    const prisma = agendaPrismaFixture();
    const commitments = { listWeek: vi.fn() };

    await expect(
      new AgendaWeekService(prisma as never, commitments as never).getWeek(USER_ID, '2026-08-04')
    ).rejects.toMatchObject({
      message: 'weekStart precisa ser uma segunda-feira.',
      statusCode: 400
    });
  });
});
