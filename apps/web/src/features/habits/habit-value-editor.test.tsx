import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HabitTodayStat } from '../../api';
import { HabitValueEditor } from './habit-value-editor';

const habit = {
  id: 'q1', title: 'Leitura', lifeArea: 'mente', type: 'quantitative', icon: null, color: null,
  frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: 'páginas', dailyTarget: 30,
  xpPerCompletion: 10, status: 'ativo', sortOrder: 1, createdAt: '', updatedAt: '', currentLog: null,
  streak: 0, periodProgress: null, isCompletedToday: false, isScheduledForDate: true,
} satisfies HabitTodayStat;

describe('HabitValueEditor', () => {
  it('saves the absolute total and returns focus when it closes', async () => {
    const onSave = vi.fn();
    render(<HabitValueEditor habit={habit} currentValue={12} onSave={onSave} onClear={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /informar valor exato/i });
    fireEvent.click(trigger);
    const input = await screen.findByRole('spinbutton');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar total/i }));
    expect(onSave).toHaveBeenCalledWith(20);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('clears a zero value', async () => {
    const onClear = vi.fn();
    render(<HabitValueEditor habit={habit} currentValue={12} onSave={vi.fn()} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: /informar valor exato/i }));
    fireEvent.change(await screen.findByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar total/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
