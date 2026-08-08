import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TaskCreateComposer } from './task-create-composer';

const workspaces = [{ id: 'ws-1', name: 'Prymeira', type: 'empresa' as const }];

describe('TaskCreateComposer', () => {
  it('creates a task with title only in the resolved front', async () => {
    const onCreate = vi.fn().mockResolvedValue({ id: 'task-1' });
    const onCreated = vi.fn();
    render(<MemoryRouter><TaskCreateComposer open resolvedWorkspaceId="ws-1" workspaces={workspaces} projects={[]} onClose={vi.fn()} onCreated={onCreated} onCreate={onCreate} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Título da tarefa'), { target: { value: 'Preparar proposta' } });
    expect(screen.getByRole('form', { name: 'Nova tarefa complexa' })).not.toHaveClass('task-create-composer--accent');
    expect(screen.getByRole('button', { name: 'Criar' })).toHaveClass('ui-button--primary');
    expect(screen.getByRole('button', { name: 'Cancelar nova tarefa' })).toHaveClass('ui-icon-button');
    fireEvent.keyDown(screen.getByLabelText('Título da tarefa'), { key: 'Enter' });
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Preparar proposta', workspaceId: 'ws-1' })));
    expect(onCreated).toHaveBeenCalledWith('task-1');
  });

  it('preserves the title and explains an API error', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('offline'));
    render(<MemoryRouter><TaskCreateComposer open resolvedWorkspaceId="ws-1" workspaces={workspaces} projects={[]} onClose={vi.fn()} onCreated={vi.fn()} onCreate={onCreate} /></MemoryRouter>);
    const title = screen.getByLabelText('Título da tarefa');
    fireEvent.change(title, { target: { value: 'Preparar proposta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(title).toHaveValue('Preparar proposta');
  });

  it('rejects a title without action and object', async () => {
    const onCreate = vi.fn();
    render(<MemoryRouter><TaskCreateComposer open resolvedWorkspaceId="ws-1" workspaces={workspaces} projects={[]} onClose={vi.fn()} onCreated={vi.fn()} onCreate={onCreate} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Título da tarefa'), { target: { value: 'Proposta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/verbo \+ objeto/i);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
