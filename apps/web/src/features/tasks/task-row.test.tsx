import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TaskRow } from './task-row';
import { taskFixture } from './task-test-fixtures';

describe('TaskRow', () => {
  it('shows only meaningful progressive metadata', () => {
    render(<TaskRow task={taskFixture({ todayEntryId: 'daily-1', openRestrictionCount: 2 })} date="2026-08-08" selected={false} busy={false} onOpen={vi.fn()} onComplete={vi.fn()} onMove={vi.fn()} />);
    expect(screen.getByText('Preparar proposta')).toBeVisible();
    expect(screen.getByText('Hoje')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.queryByText(/sem projeto/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /concluir preparar proposta/i })).toHaveClass('ui-completion-control');
  });

  it('offers an explicit alternative to dragging', () => {
    const onMove = vi.fn();
    render(<TaskRow task={taskFixture()} date="2026-08-08" selected={false} busy={false} onOpen={vi.fn()} onComplete={vi.fn()} onMove={onMove} />);
    fireEvent.click(screen.getByLabelText('Mover tarefa'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para Em andamento' }));
    expect(onMove).toHaveBeenCalledWith('in_progress');
  });
});
