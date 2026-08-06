import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IDS, weekFixture } from './test-fixtures';
import { useAgendaWeek } from './use-agenda-week';

const apiMock = vi.hoisted(() => ({
  getAgendaWeek: vi.fn(),
  createDayPlanItem: vi.fn(),
  updateDayPlanItem: vi.fn(),
  deleteDayPlanItem: vi.fn()
}));

vi.mock('../../api', () => ({ api: apiMock }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}));

describe('useAgendaWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getAgendaWeek.mockResolvedValue(weekFixture());
  });

  it('moves a block optimistically and rolls back on failure', async () => {
    apiMock.updateDayPlanItem.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAgendaWeek('2026-08-03'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() =>
      result.current.moveBlock(IDS.block, {
        date: '2026-08-07',
        startTime: '2026-08-07T14:00:00.000Z',
        endTime: '2026-08-07T14:30:00.000Z'
      })
    );

    expect(result.current.week?.days[3].blocks).toContainEqual(
      expect.objectContaining({ id: IDS.block, date: '2026-08-06' })
    );
    expect(result.current.week?.days[4].blocks).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('Não foi possível mover o bloco.');
  });

  it('creates a 15-minute quick block without task conversion', async () => {
    apiMock.createDayPlanItem.mockResolvedValue({
      id: IDS.block,
      dayPlanId: 'plan_1',
      taskId: null,
      inboxItemId: IDS.inbox,
      startTime: '2026-08-06T14:00:00.000Z',
      endTime: '2026-08-06T14:15:00.000Z',
      completedAt: null,
      orderIndex: 0,
      blockType: 'task',
      confirmationState: 'pending',
      task: null,
      inboxItem: null
    });
    const { result } = renderHook(() => useAgendaWeek('2026-08-03'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() =>
      result.current.scheduleSource(
        { kind: 'inbox', sourceId: IDS.inbox },
        '2026-08-06T14:00:00.000Z'
      )
    );

    expect(apiMock.createDayPlanItem).toHaveBeenCalledWith(
      '2026-08-06',
      expect.objectContaining({
        inboxItemId: IDS.inbox,
        taskId: null,
        endTime: '2026-08-06T14:15:00.000Z'
      })
    );
  });

  it('keeps the previous week when a reload fails after initial content', async () => {
    const { result } = renderHook(() => useAgendaWeek('2026-08-03'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    apiMock.getAgendaWeek.mockRejectedValueOnce(new Error('offline'));

    await act(() => result.current.reload());

    expect(result.current.week).toEqual(weekFixture());
    expect(result.current.error).toBe('offline');
  });
});
