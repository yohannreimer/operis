import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { controller, IDS, sources, weekFixture } from './test-fixtures';
import { MobileDayTimeline } from './mobile-day-timeline';
import { PlanningDrawer } from './planning-drawer';

describe('mobile agenda planning', () => {
  it('shows one day and changes it without rendering seven cards', () => {
    render(
      <MobileDayTimeline
        week={weekFixture()}
        selectedDate="2026-08-06"
        controller={controller()}
      />
    );

    expect(
      screen.getByRole('region', {
        name: 'Linha do tempo de quinta-feira, 6 de agosto'
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Selecionar .* de agosto/ })).toHaveLength(7);
    expect(screen.queryByText('Nada marcado.')).not.toBeInTheDocument();
  });

  it('schedules a drawer item with explicit touch controls', () => {
    const onSchedule = vi.fn();
    render(<PlanningDrawer sources={sources()} onSchedule={onSchedule} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agendar Responder cliente' }));
    fireEvent.change(screen.getByLabelText('Horário'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar horário' }));
    expect(onSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: IDS.inbox }),
      '14:00'
    );
  });
});
