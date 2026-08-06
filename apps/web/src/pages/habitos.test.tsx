import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HabitosPage } from './habitos';

const apiMock = vi.hoisted(() => ({
  getHabitsTodayStats: vi.fn(), getHabitsRadar: vi.fn(), logHabit: vi.fn(), deleteHabitLog: vi.fn(),
  setHabitTotal: vi.fn(), habitRecaiu: vi.fn(), archiveHabit: vi.fn(), createHabit: vi.fn(), updateHabit: vi.fn(),
}));
vi.mock('../api', () => ({ api: apiMock }));

const base = { lifeArea: 'corpo', type: 'binary', icon: null, color: null, frequencyType: 'daily', frequencyTarget: 1, specificDays: [], unit: null, dailyTarget: null, xpPerCompletion: 10, status: 'ativo', sortOrder: 1, createdAt: '', updatedAt: '', currentLog: null, streak: 2, periodProgress: null, isCompletedToday: false };

describe('HabitosPage', () => {
  beforeEach(() => {
    apiMock.getHabitsTodayStats.mockResolvedValue([
      { ...base, id: 'h1', title: 'Treino', isScheduledForDate: true },
      { ...base, id: 'h2', title: 'Revisar finanças', isScheduledForDate: false },
    ]);
    apiMock.getHabitsRadar.mockResolvedValue({ corpo: { level: 4, name: 'Atleta', totalXp: 840, progressPct: 68, nextLevelXp: 1200 } });
  });

  it('loads the full date ledger and keeps unscheduled habits tucked away', async () => {
    render(<MemoryRouter><HabitosPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /hábitos de hoje/i })).toBeInTheDocument();
    expect(apiMock.getHabitsTodayStats).toHaveBeenCalledWith(expect.any(String), { includeUnscheduled: true });
    expect(screen.getByText('Treino')).toBeVisible();
    expect(screen.queryByText('Revisar finanças')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /outros hábitos/i }));
    expect(screen.getByText('Revisar finanças')).toBeVisible();
    expect(screen.getByRole('link', { name: /ver evolução completa/i })).toHaveAttribute('href', '/habitos/evolucao');
  });

  it('registers a relapse without a confirmation dialog', async () => {
    apiMock.getHabitsTodayStats.mockResolvedValue([{ ...base, id: 'v1', title: 'Sem açúcar', type: 'vice', isScheduledForDate: true }]);
    apiMock.habitRecaiu.mockResolvedValue({ ok: true, previousStreak: 8 });
    render(<MemoryRouter><HabitosPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /registrar recaída/i }));
    await waitFor(() => expect(apiMock.habitRecaiu).toHaveBeenCalled());
  });
});
