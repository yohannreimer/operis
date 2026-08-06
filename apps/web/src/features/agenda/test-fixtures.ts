import { vi } from 'vitest';

import type { AgendaWeek } from '../../api';
import { toIsoDateTime } from '../../utils/date';
import type { AgendaWeekController } from './types';

export const IDS = {
  block: '11111111-1111-4111-8111-111111111111',
  taskBlock: '44444444-4444-4444-8444-444444444444',
  inbox: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333'
};

export const quickBlockFixture = {
  id: IDS.block,
  kind: 'inbox' as const,
  sourceId: IDS.inbox,
  date: '2026-08-06',
  title: 'Responder cliente',
  startTime: toIsoDateTime('2026-08-06', '14:00'),
  endTime: toIsoDateTime('2026-08-06', '14:15'),
  completedAt: null,
  workspaceId: null,
  plannedMinutes: 15
};

export function weekFixture(): AgendaWeek {
  const dates = ['03', '04', '05', '06', '07', '08', '09'];
  return {
    weekStart: '2026-08-03',
    resourceErrors: { commitments: null },
    days: dates.map((day) => ({
      date: `2026-08-${day}`,
      intents:
        day === '06'
          ? [
              {
                id: 'daily_1',
                kind: 'inbox' as const,
                sourceId: IDS.inbox,
                date: '2026-08-06',
                title: 'Responder cliente',
                position: 0,
                completedAt: null,
                context: null
              }
            ]
          : [],
      blocks:
        day === '06'
          ? [
              quickBlockFixture,
              {
                id: IDS.taskBlock,
                kind: 'task' as const,
                sourceId: IDS.task,
                date: '2026-08-06',
                title: 'Gravar vídeo',
                startTime: toIsoDateTime('2026-08-06', '11:00'),
                endTime: toIsoDateTime('2026-08-06', '12:30'),
                completedAt: null,
                workspaceId: null,
                plannedMinutes: 90
              }
            ]
          : [],
      commitments:
        day === '06'
          ? [
              {
                id: 'commitment_1:2026-08-06',
                commitmentId: 'commitment_1',
                date: '2026-08-06',
                title: 'Academia',
                startTime: '09:00',
                durationMin: 60,
                workspaceId: null,
                recurring: true,
                rescheduled: false
              }
            ]
          : []
    })),
    unscheduled: {
      tasks: [
        {
          id: IDS.task,
          title: 'Gravar vídeo',
          estimatedMinutes: 90,
          plannedMinutes: 0,
          remainingMinutes: 90,
          workspaceId: null,
          workspaceName: null,
          workspaceColor: null,
          projectName: null
        }
      ],
      inbox: [
        { id: IDS.inbox, title: 'Responder cliente', workspaceId: null, context: null }
      ]
    }
  };
}

export function controller(
  overrides: Partial<AgendaWeekController> = {}
): AgendaWeekController {
  return {
    week: weekFixture(),
    loading: false,
    error: null,
    reload: vi.fn(),
    scheduleSource: vi.fn(),
    moveBlock: vi.fn(),
    resizeBlock: vi.fn(),
    setBlockCompleted: vi.fn(),
    removeBlock: vi.fn(),
    ...overrides
  };
}

export const sources = () => weekFixture().unscheduled;
export const recurringCommitment = () => weekFixture().days[3].commitments[0];
