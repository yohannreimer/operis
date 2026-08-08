import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskBacklogPage } from './task-backlog-page';
import { taskFixture } from './task-test-fixtures';

const apiMock = vi.hoisted(() => ({
  getTaskBacklog: vi.fn(), getWorkspaces: vi.fn(), getProjects: vi.fn(),
  getTaskSubtasks: vi.fn(), getTaskRestrictions: vi.fn(), getTaskHistory: vi.fn(), getTaskMultiBlockProgress: vi.fn(),
  createTask: vi.fn(), updateTask: vi.fn(), assignDailyExecution: vi.fn(), removeDailyExecution: vi.fn(),
  createDayPlanItem: vi.fn(), completeTask: vi.fn(), reopenTask: vi.fn(), archiveTask: vi.fn(), deleteTask: vi.fn(),
  createTaskSubtask: vi.fn(), updateTaskSubtask: vi.fn(), reorderTaskSubtasks: vi.fn(), deleteTaskSubtask: vi.fn(),
  createTaskRestriction: vi.fn(), updateTaskRestriction: vi.fn(), deleteTaskRestriction: vi.fn(),
  getWaitingFollowupRadar: vi.fn(), registerWaitingFollowup: vi.fn()
}));

vi.mock('../../api', async () => ({ ...(await vi.importActual('../../api')), api: apiMock }));
vi.mock('../../components/shell-context', () => ({
  useShellContext: () => ({ activeWorkspaceId: 'all', workspaces: [], gamification: null, setActiveWorkspaceId: vi.fn(), refreshGlobal: vi.fn() })
}));

function renderPage(path = '/tarefas') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/tarefas" element={<TaskBacklogPage />} /><Route path="/tarefas/:taskId" element={<TaskBacklogPage />} /></Routes></MemoryRouter>);
}

describe('TaskBacklogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getTaskBacklog.mockResolvedValue({ date: '2026-08-08', items: [taskFixture()] });
    apiMock.getWorkspaces.mockResolvedValue([{ id: 'workspace-1', name: 'Prymeira', type: 'empresa', mode: 'expansao' }]);
    apiMock.getProjects.mockResolvedValue([]);
    apiMock.getTaskSubtasks.mockResolvedValue([]); apiMock.getTaskRestrictions.mockResolvedValue([]);
    apiMock.getTaskHistory.mockResolvedValue([]); apiMock.getTaskMultiBlockProgress.mockResolvedValue(null);
  });

  it('opens a stable task route while keeping the backlog visible', async () => {
    renderPage();
    fireEvent.click((await screen.findByText('Preparar proposta')).closest('button')!);
    expect(await screen.findByLabelText('Detalhe de Preparar proposta')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Backlog de tarefas' })).toBeVisible();
  });

  it('consumes the legacy compose query into the inline composer', async () => {
    renderPage('/tarefas?compose=1&focus=1');
    expect(await screen.findByRole('form', { name: 'Nova tarefa complexa' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tarefas' })).toBeVisible());
  });

  it('renders completed work and reopens it without a completion modal', async () => {
    apiMock.getTaskBacklog.mockResolvedValue({ date: '2026-08-08', items: [taskFixture({ status: 'feito', completedAt: '2026-08-08T12:00:00.000Z' })] });
    apiMock.reopenTask.mockResolvedValue(taskFixture({ status: 'backlog', completedAt: null }));
    renderPage('/tarefas?completion=done');
    expect(await screen.findByRole('button', { name: /Concluídas/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir Preparar proposta' }));
    await waitFor(() => expect(apiMock.reopenTask).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: /concluir/i })).not.toBeInTheDocument();
  });

  it('closes a modal with Escape without leaving the selected task', async () => {
    renderPage('/tarefas/task-1');
    const complete = await screen.findByRole('button', { name: 'Concluir', exact: true });
    fireEvent.click(complete);
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Detalhe de Preparar proposta')).toBeVisible();
  });
});
