import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TASK_FILTERS } from './types';
import { taskFixture } from './task-test-fixtures';
import { useTaskBacklog } from './use-task-backlog';

const apiMock = vi.hoisted(() => ({
  getTaskBacklog: vi.fn(),
  getWorkspaces: vi.fn(),
  getProjects: vi.fn(),
  getTaskSubtasks: vi.fn(),
  getTaskRestrictions: vi.fn(),
  getTaskHistory: vi.fn(),
  getTaskMultiBlockProgress: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  assignDailyExecution: vi.fn(),
  removeDailyExecution: vi.fn(),
  createDayPlanItem: vi.fn(),
  completeTask: vi.fn(),
  deleteTask: vi.fn(),
  createTaskSubtask: vi.fn(),
  updateTaskSubtask: vi.fn(),
  reorderTaskSubtasks: vi.fn(),
  deleteTaskSubtask: vi.fn(),
  createTaskRestriction: vi.fn(),
  updateTaskRestriction: vi.fn(),
  deleteTaskRestriction: vi.fn(),
  getWaitingFollowupRadar: vi.fn(),
  registerWaitingFollowup: vi.fn()
}));

vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, api: apiMock };
});

function input(selectedTaskId: string | null = null) {
  return {
    date: '2026-08-08',
    activeWorkspaceId: 'all',
    filters: DEFAULT_TASK_FILTERS,
    selectedTaskId
  };
}

describe('useTaskBacklog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getTaskBacklog.mockResolvedValue({ date: '2026-08-08', items: [taskFixture()] });
    apiMock.getWorkspaces.mockResolvedValue([
      { id: 'workspace-1', name: 'Prymeira', type: 'empresa', mode: 'expansao' }
    ]);
    apiMock.getProjects.mockResolvedValue([]);
    apiMock.getTaskSubtasks.mockResolvedValue([]);
    apiMock.getTaskRestrictions.mockResolvedValue([]);
    apiMock.getTaskHistory.mockResolvedValue([]);
    apiMock.getTaskMultiBlockProgress.mockResolvedValue(null);
  });

  it('loads the dated projection and shell context independently', async () => {
    const { result } = renderHook(() => useTaskBacklog(input()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.resolvedWorkspaceId).toBe('workspace-1');
    expect(apiMock.getTaskBacklog).toHaveBeenCalledWith({ date: '2026-08-08', workspaceId: undefined });
  });

  it('loads task depth once per session selection', async () => {
    const { result, rerender } = renderHook(
      ({ selected }) => useTaskBacklog(input(selected)),
      { initialProps: { selected: 'task-1' as string | null } }
    );
    await waitFor(() => expect(result.current.detail?.loaded).toBe(true));
    rerender({ selected: null });
    rerender({ selected: 'task-1' });
    await waitFor(() => expect(result.current.detail?.loaded).toBe(true));

    expect(apiMock.getTaskSubtasks).toHaveBeenCalledTimes(1);
    expect(apiMock.getTaskHistory).toHaveBeenCalledTimes(1);
  });

  it('plans for Today without changing operational status', async () => {
    apiMock.assignDailyExecution.mockResolvedValue({ id: 'daily-1' });
    const { result } = renderHook(() => useTaskBacklog(input()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.planForToday(result.current.tasks[0]));

    expect(result.current.tasks[0]).toMatchObject({ status: 'backlog', todayEntryId: 'daily-1' });
    expect(apiMock.updateTask).not.toHaveBeenCalled();
  });

  it('rolls back only the failed task mutation', async () => {
    apiMock.updateTask.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTaskBacklog(input()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.moveTask('task-1', 'in_progress');
      } catch (cause) {
        failure = cause;
      }
    });

    expect(failure).toMatchObject({ message: 'offline' });
    expect(result.current.tasks[0].status).toBe('backlog');
    expect(result.current.announcement).toMatch(/desfeita/i);
  });
});
