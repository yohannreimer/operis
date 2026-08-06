import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Habit, HabitEvolution } from '../../api';
import { HabitEvolutionView, deriveHabitInsight } from './habit-evolution-view';

const evolution: HabitEvolution = { startDate: '2026-05-09', endDate: '2026-08-06', expectedOccurrences: 90, completedOccurrences: 66, rhythmPct: 73, areas: [{ lifeArea: 'corpo', level: 4, name: 'Atleta', totalXp: 840, progressPct: 70, nextLevelXp: 1200 }] };
const habit = { id: 'h1', title: 'Leitura', lifeArea: 'mente', type: 'binary', icon: null, color: null, frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 10, status: 'ativo', sortOrder: 1, createdAt: '', updatedAt: '' } satisfies Habit;
const cells = Array.from({ length: 20 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, '0')}`, value: index % 3 === 0 ? null : 1, expected: true, completed: index % 3 !== 0, relapse: false }));

describe('HabitEvolutionView', () => {
  it('shows the real rhythm and allows changing period and habit', () => {
    const onPeriodChange = vi.fn(); const onHabitChange = vi.fn();
    render(<MemoryRouter><HabitEvolutionView evolution={evolution} habits={[habit, { ...habit, id: 'h2', title: 'Treino' }]} heatmap={{ cells }} period={90} selectedHabitId="h1" onPeriodChange={onPeriodChange} onHabitChange={onHabitChange} /></MemoryRouter>);
    expect(screen.getByText('73%')).toBeInTheDocument();
    expect(screen.getByText(/66 dias consistentes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /30 dias/i }));
    expect(onPeriodChange).toHaveBeenCalledWith(30);
    fireEvent.click(screen.getByRole('tab', { name: /consistência por hábito/i }));
    fireEvent.change(screen.getByLabelText(/hábito analisado/i), { target: { value: 'h2' } });
    expect(onHabitChange).toHaveBeenCalledWith('h2');
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
  });

  it('does not invent a trend with little evidence', () => {
    expect(deriveHabitInsight(cells.slice(0, 10))).toBeNull();
  });
});
