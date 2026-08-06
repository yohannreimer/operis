import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgendaWeekController } from './types';
import { controller, weekFixture } from './test-fixtures';

const agendaControllerState = vi.hoisted(() => ({
  current: null as AgendaWeekController | null
}));

vi.mock('./use-agenda-week', () => ({
  useAgendaWeek: () => agendaControllerState.current
}));

import { AgendaPage } from './agenda-page';

describe('AgendaPage', () => {
  it('uses desktop studio and mobile day planner from one weekly controller', () => {
    agendaControllerState.current = controller();
    render(<AgendaPage />);

    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir Rotinas' })).toBeInTheDocument();
    expect(screen.getByTestId('agenda-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('agenda-mobile')).toBeInTheDocument();
  });

  it('keeps a commitment failure local to its lane', () => {
    agendaControllerState.current = controller({
      week: {
        ...weekFixture(),
        resourceErrors: { commitments: 'Agenda externa indisponível' }
      }
    });
    render(<AgendaPage />);

    expect(screen.getByText('Agenda externa indisponível')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('complementary', { name: 'Para planejar' })).toBeInTheDocument();
  });
});
