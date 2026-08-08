import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateTaskModal } from './create-task-modal';

const apiMock = vi.hoisted(() => ({ createTask: vi.fn(), getProjects: vi.fn() }));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, api: apiMock };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const workspaces = [{ id: 'ws-1', name: 'Negócios', type: 'empresa' as const }];

describe('CreateTaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getProjects.mockResolvedValue([]);
  });

  it('submits the existing structured task payload through the shared dialog', async () => {
    apiMock.createTask.mockResolvedValue({ id: 'task-1', title: 'Enviar proposta' });
    render(<CreateTaskModal open onClose={vi.fn()} workspaces={workspaces} />);
    fireEvent.change(screen.getByPlaceholderText(/verbo \+ objeto/i), { target: { value: 'Enviar proposta' } });
    fireEvent.change(screen.getByRole('combobox', { name: /frente/i }), { target: { value: 'ws-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => expect(apiMock.createTask).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1', title: 'Enviar proposta' })));
  });

  it('keeps the primary action disabled while the request is pending', async () => {
    apiMock.createTask.mockReturnValue(new Promise(() => undefined));
    render(<CreateTaskModal open onClose={vi.fn()} workspaces={workspaces} />);
    fireEvent.change(screen.getByPlaceholderText(/verbo \+ objeto/i), { target: { value: 'Enviar proposta' } });
    fireEvent.change(screen.getByRole('combobox', { name: /frente/i }), { target: { value: 'ws-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    expect(await screen.findByRole('button', { name: 'Criar tarefa' })).toBeDisabled();
  });
});
