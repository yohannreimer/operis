import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { controller, IDS, weekFixture } from './test-fixtures';
import { WeekTimeline } from './week-timeline';

describe('WeekTimeline', () => {
  it('renders sources, intents and three block kinds without card wrappers', () => {
    render(<WeekTimeline week={weekFixture()} controller={controller()} />);

    expect(screen.getByRole('region', { name: 'Agenda semanal' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Para planejar' })).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Para hoje — quinta-feira' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Compromisso Academia, 09:00 até 10:00' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tarefa Gravar vídeo, 11:00 até 12:30' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Item rápido Responder cliente, 14:00 até 14:15'
      })
    ).toBeInTheDocument();
  });

  it('offers keyboard-equivalent commands for editing a block', () => {
    const agendaController = controller();
    render(<WeekTimeline week={weekFixture()} controller={agendaController} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ações de Gravar vídeo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover 15 minutos depois' }));
    expect(agendaController.moveBlock).toHaveBeenCalledWith(
      IDS.taskBlock,
      expect.objectContaining({
        startTime: '2026-08-06T11:15:00.000Z',
        endTime: '2026-08-06T12:45:00.000Z'
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ações de Gravar vídeo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar 15 minutos' }));
    expect(agendaController.resizeBlock).toHaveBeenCalledWith(
      IDS.taskBlock,
      '2026-08-06T12:45:00.000Z'
    );
  });
});
