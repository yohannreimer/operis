import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TodayEntry } from './types';
import { TodayExecutionRow } from './today-execution-row';

const entry: TodayEntry = {
  id: 'daily_1',
  kind: 'task',
  sourceId: 'task_1',
  date: '2026-08-08',
  title: 'Enviar proposta',
  position: 0,
  completedAt: null,
  project: 'Comercial',
  estimatedMinutes: 45,
  deadline: null
};

describe('TodayExecutionRow', () => {
  it('keeps completion compact and separate from the task content', () => {
    const onToggle = vi.fn();
    render(
      <TodayExecutionRow
        entry={entry}
        index={0}
        total={1}
        onToggle={onToggle}
        onRemove={vi.fn()}
        onStart={vi.fn()}
        onMove={vi.fn()}
      />
    );

    const completion = screen.getByRole('button', { name: 'Concluir Enviar proposta' });
    expect(completion).toHaveClass('ui-completion-control');
    expect(completion).not.toHaveTextContent('Enviar proposta');
    expect(screen.getByText('Enviar proposta')).not.toBe(completion);
    fireEvent.click(completion);
    expect(onToggle).toHaveBeenCalledWith(entry);
  });

  it('keeps secondary actions keyboard reachable', () => {
    render(
      <TodayExecutionRow
        entry={entry}
        index={0}
        total={1}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onStart={vi.fn()}
        onMove={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Iniciar Enviar proposta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mais ações para Enviar proposta')).toBeInTheDocument();
  });
});
