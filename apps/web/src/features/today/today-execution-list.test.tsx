import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TodayEntry } from './types';
import { TodayExecutionList } from './today-execution-list';

const quickEntry: TodayEntry = {
  id: 'daily_1', kind: 'inbox', sourceId: 'inbox_1', date: '2026-08-05',
  title: 'Postar stories', position: 0, completedAt: null, context: 'Conteúdo'
};

const taskEntry: TodayEntry = {
  id: 'daily_2', kind: 'task', sourceId: 'task_1', date: '2026-08-05',
  title: 'Construir proposta', position: 1, completedAt: null, project: 'Holand',
  estimatedMinutes: 60, deadline: null
};

describe('TodayExecutionList', () => {
  it('renders quick and complex work with one visual grammar', () => {
    render(
      <TodayExecutionList
        entries={[quickEntry, taskEntry]}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />
    );

    expect(screen.getByText('Postar stories')).toBeInTheDocument();
    expect(screen.getByText('Construir proposta')).toBeInTheDocument();
    expect(screen.getByText('60 min')).toBeInTheDocument();
    expect(screen.queryByText(/rápida/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /concluir/i })).toHaveLength(2);
  });

  it('offers accessible move and remove commands', () => {
    const onReorder = vi.fn();
    const onRemove = vi.fn();
    render(
      <TodayExecutionList
        entries={[quickEntry, taskEntry]}
        onToggle={vi.fn()}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /mover construir proposta acima/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /voltar postar stories ao inbox/i }));

    expect(onReorder).toHaveBeenCalledWith(['daily_2', 'daily_1']);
    expect(onRemove).toHaveBeenCalledWith(quickEntry);
  });

  it('marks completed work and allows reopening it', () => {
    render(
      <TodayExecutionList
        entries={[{ ...quickEntry, completedAt: '2026-08-05T12:00:00.000Z' }]}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /reabrir postar stories/i })).toHaveAttribute(
      'aria-pressed', 'true'
    );
  });

  it('keeps a long execution list in one accessible collection', () => {
    const entries = Array.from({ length: 50 }, (_, index): TodayEntry => ({
      ...quickEntry,
      id: `daily_${index}`,
      sourceId: `inbox_${index}`,
      title: `Item diário ${index + 1}`,
      position: index
    }));

    render(
      <TodayExecutionList
        entries={entries}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />
    );

    expect(screen.getByRole('list', { name: 'Execução de hoje' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.getByText('Item diário 50')).toBeInTheDocument();
  });
});
