import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HabitTodayStat } from '../../api';
import { HabitDayList } from './habit-day-list';

const base = {
  lifeArea: 'corpo', icon: null, color: null, frequencyType: 'daily', frequencyTarget: 1,
  specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 10, status: 'ativo',
  sortOrder: 1, createdAt: '2026-08-01', updatedAt: '2026-08-01', currentLog: null,
  streak: 2, periodProgress: null, isCompletedToday: false, isScheduledForDate: true,
} as const;

const fixtures: HabitTodayStat[] = [
  { ...base, id: 'binary-1', title: 'Dormir', type: 'binary' },
  { ...base, id: 'quant-1', title: 'Leitura', type: 'quantitative', unit: 'páginas', dailyTarget: 30, currentLog: { id: 'l1', habitId: 'quant-1', date: '2026-08-06', value: 12, note: null, createdAt: '2026-08-06' } },
  { ...base, id: 'vice-1', title: 'Sem açúcar', type: 'vice' },
  { ...base, id: 'other-1', title: 'Revisar finanças', type: 'binary', isScheduledForDate: false },
];

describe('HabitDayList', () => {
  it('offers the correct primary action for each habit type and keeps other habits collapsed', () => {
    const onToggle = vi.fn(); const onIncrement = vi.fn(); const onRelapse = vi.fn();
    render(<HabitDayList stats={fixtures} busyIds={new Set()} onToggle={onToggle} onIncrement={onIncrement} onSetTotal={vi.fn()} onRelapse={onRelapse} onUndoRelapse={vi.fn()} onClear={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText('Revisar finanças')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /marcar dormir/i }));
    expect(onToggle).toHaveBeenCalledWith('binary-1', false);
    fireEvent.click(screen.getByRole('button', { name: /adicionar 10 páginas/i }));
    expect(onIncrement).toHaveBeenCalledWith('quant-1', 10);
    fireEvent.click(screen.getByRole('button', { name: /registrar recaída/i }));
    expect(onRelapse).toHaveBeenCalledWith('vice-1');
    expect(screen.queryByText(/tem certeza/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /outros hábitos/i }));
    expect(screen.getByText('Revisar finanças')).toBeVisible();
  });

  it('keeps maintenance actions separate from completion', () => {
    render(<HabitDayList stats={[fixtures[0]]} busyIds={new Set()} onToggle={vi.fn()} onIncrement={vi.fn()} onSetTotal={vi.fn()} onRelapse={vi.fn()} onUndoRelapse={vi.fn()} onClear={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /opções de dormir/i }));
    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Editar');
    expect(menu).toHaveTextContent('Arquivar');
    expect(menu).toHaveTextContent('Excluir');
    expect(menu).not.toHaveTextContent('Marcar');
  });
});
