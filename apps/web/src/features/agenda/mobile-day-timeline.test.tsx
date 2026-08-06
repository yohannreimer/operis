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

  it('switches to the next day with a horizontal swipe', () => {
    const onSelectedDateChange = vi.fn();
    render(
      <MobileDayTimeline
        week={weekFixture()}
        selectedDate="2026-08-06"
        onSelectedDateChange={onSelectedDateChange}
        controller={controller()}
      />
    );

    const timeline = screen.getByRole('region', {
      name: 'Linha do tempo de quinta-feira, 6 de agosto'
    });
    fireEvent.touchStart(timeline, { touches: [{ clientX: 220 }] });
    fireEvent.touchEnd(timeline, { changedTouches: [{ clientX: 120 }] });

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-08-07');
    expect(screen.getByRole('region', {
      name: 'Linha do tempo de sexta-feira, 7 de agosto'
    })).toBeInTheDocument();
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
