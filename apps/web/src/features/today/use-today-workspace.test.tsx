import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InboxItem } from '../../api';
import type { TodayEntry } from './types';
import { useTodayWorkspace } from './use-today-workspace';

const apiMock = vi.hoisted(() => ({
  getDailyExecution: vi.fn(),
  getCommitments: vi.fn(),
  getInbox: vi.fn(),
  assignDailyExecution: vi.fn(),
  setDailyExecutionCompleted: vi.fn(),
  reorderDailyExecution: vi.fn(),
  removeDailyExecution: vi.fn(),
  resolveDailyRollover: vi.fn()
}));

vi.mock('../../api', () => ({ api: apiMock }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}));

const inboxItem: InboxItem = {
  id: 'inbox_1',
  content: 'Postar stories',
  source: 'app',
  status: 'pendente',
  workspaceId: null,
  inboxContextId: null,
  position: 0,
  waitingDate: null,
  waitingPerson: null,
  waitingNote: null,
  scheduledAt: null,
  convertedTaskId: null,
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
  workspace: null,
  inboxContext: null
};

const dailyEntry: TodayEntry = {
  id: 'daily_1',
  kind: 'inbox',
  sourceId: inboxItem.id,
  date: '2026-08-05',
  title: inboxItem.content,
  position: 0,
  completedAt: null,
  context: null
};

function seedSuccessfulLoad() {
  apiMock.getDailyExecution.mockResolvedValue({ entries: [dailyEntry], rollover: [] });
  apiMock.getCommitments.mockResolvedValue([]);
  apiMock.getInbox.mockResolvedValue({ items: [inboxItem], contexts: [] });
}

describe('useTodayWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedSuccessfulLoad();
  });

  it('loads daily execution, inbox and commitments independently', async () => {
    const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([dailyEntry]);
    expect(result.current.inboxItems).toEqual([inboxItem]);
    expect(apiMock.getCommitments).toHaveBeenCalledWith({ date: '2026-08-05' });
  });

  it('keeps the daily list when agenda and inbox fail', async () => {
    apiMock.getCommitments.mockRejectedValue(new Error('agenda offline'));
    apiMock.getInbox.mockRejectedValue(new Error('inbox offline'));
    const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([dailyEntry]);
    expect(result.current.agendaError).toBeTruthy();
    expect(result.current.inboxError).toBeTruthy();
  });

  it('adds an inbox item optimistically and replaces it with the server entry', async () => {
    apiMock.getDailyExecution.mockResolvedValue({ entries: [], rollover: [] });
    apiMock.assignDailyExecution.mockResolvedValue(dailyEntry);
    const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.addInboxToToday(inboxItem));

    expect(result.current.entries).toEqual([dailyEntry]);
    expect(result.current.inboxItems).toEqual([]);
  });

  it('restores list and inbox when assignment fails', async () => {
    apiMock.getDailyExecution.mockResolvedValue({ entries: [], rollover: [] });
    apiMock.assignDailyExecution.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.addInboxToToday(inboxItem));

    expect(result.current.entries).toEqual([]);
    expect(result.current.inboxItems).toEqual([inboxItem]);
  });

  it('rolls completion back when persistence fails', async () => {
    apiMock.setDailyExecutionCompleted.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.toggleCompleted(dailyEntry));

    expect(result.current.entries[0]?.completedAt).toBeNull();
  });

  it('offers an undo action after completion', async () => {
    const completedEntry = { ...dailyEntry, completedAt: '2026-08-05T12:00:00.000Z' };
    apiMock.setDailyExecutionCompleted
      .mockResolvedValueOnce(completedEntry)
      .mockResolvedValueOnce(dailyEntry);
    const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.toggleCompleted(dailyEntry));

    const options = vi.mocked(toast).mock.calls.at(-1)?.[1] as {
      action?: { label: string; onClick(): void };
    };
    expect(options.action?.label).toBe('Desfazer');
    act(() => options.action?.onClick());

    await waitFor(() => expect(apiMock.setDailyExecutionCompleted).toHaveBeenLastCalledWith('daily_1', false));
    expect(result.current.entries[0]?.completedAt).toBeNull();
  });

  it('persists the mixed order and resolves rollover only after success', async () => {
    const taskEntry: TodayEntry = {
      id: 'daily_2', kind: 'task', sourceId: 'task_1', date: '2026-08-05',
      title: 'Construir proposta', position: 1, completedAt: null, project: 'Holand',
      estimatedMinutes: 60, deadline: null
    };
    const oldEntry = { ...dailyEntry, id: 'daily_old', date: '2026-08-04' };
    apiMock.getDailyExecution.mockResolvedValue({
      entries: [dailyEntry, taskEntry], rollover: [oldEntry]
    });
    apiMock.reorderDailyExecution.mockResolvedValue(undefined);
    apiMock.resolveDailyRollover.mockResolvedValue({ ...oldEntry, date: '2026-08-05', position: 2 });
    const { result } = renderHook(() => useTodayWorkspace('2026-08-05'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.reorder(['daily_2', 'daily_1']));
    await act(() => result.current.resolveRollover(oldEntry, 'keep_today'));

    expect(apiMock.reorderDailyExecution).toHaveBeenCalledWith('2026-08-05', ['daily_2', 'daily_1']);
    expect(result.current.entries.map((item) => item.id)).toEqual(['daily_2', 'daily_1', 'daily_old']);
    expect(result.current.rollover).toEqual([]);
  });
});
