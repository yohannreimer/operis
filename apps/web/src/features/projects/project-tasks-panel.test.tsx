import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cockpitFixture } from './project-test-fixtures';
import { ProjectTasksPanel } from './project-tasks-panel';

const apiMock = vi.hoisted(() => ({ createTask: vi.fn(), updateTask: vi.fn(), completeTask: vi.fn() }));
vi.mock('../../api', async () => {
  const actual = await vi.importActual('../../api');
  return { ...actual, api: apiMock };
});

describe('ProjectTasksPanel', () => {
  beforeEach(() => Object.values(apiMock).forEach((mock) => mock.mockReset()));

  it('creates a simple task already linked to the project', async () => {
    apiMock.createTask.mockResolvedValue({ id: 'new-task' });
    const onReload = vi.fn();
    render(<MemoryRouter><ProjectTasksPanel project={cockpitFixture} open onClose={vi.fn()} onReload={onReload} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /nova tarefa/i }));
    fireEvent.change(screen.getByLabelText(/título da tarefa/i), { target: { value: 'Enviar proposta' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar tarefa/i }));
    await waitFor(() => expect(apiMock.createTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', workspaceId: 'w1', title: 'Enviar proposta' })));
    expect(onReload).toHaveBeenCalled();
  });

  it('moves an existing task to Today and completes another', async () => {
    apiMock.updateTask.mockResolvedValue({});
    apiMock.completeTask.mockResolvedValue({});
    const onReload = vi.fn();
    render(<MemoryRouter><ProjectTasksPanel project={cockpitFixture} open onClose={vi.fn()} onReload={onReload} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /mandar tarefa 1 para hoje/i }));
    fireEvent.click(screen.getByRole('button', { name: /concluir tarefa 2/i }));
    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith('t1', { status: 'hoje' }));
    expect(apiMock.completeTask).toHaveBeenCalledWith('t2', { completionMode: 'no_note' });
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<MemoryRouter><ProjectTasksPanel project={cockpitFixture} open onClose={onClose} onReload={vi.fn()} /></MemoryRouter>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
