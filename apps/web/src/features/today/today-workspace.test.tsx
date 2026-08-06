import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Commitment } from '../../api';
import type { TodayEntry } from './types';
import { CompactAgenda } from './compact-agenda';
import { RolloverReview } from './rollover-review';

function commitment(id: string, title: string, startTime: string): Commitment {
  return {
    id,
    workspaceId: null,
    projectId: null,
    title,
    description: null,
    type: 'fixo',
    status: 'ativo',
    startTime,
    durationMin: 60,
    recurrenceDays: [],
    date: '2026-08-05',
    recurrenceEnd: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    exceptions: []
  };
}

const oldQuickEntry: TodayEntry = {
  id: 'daily_1', kind: 'inbox', sourceId: 'inbox_1', date: '2026-08-04',
  title: 'Responder mensagem', position: 0, completedAt: null, context: null
};

const oldTaskEntry: TodayEntry = {
  id: 'daily_2', kind: 'task', sourceId: 'task_1', date: '2026-08-03',
  title: 'Finalizar proposta', position: 0, completedAt: null, project: 'Holand',
  estimatedMinutes: 60, deadline: null
};

describe('CompactAgenda', () => {
  it('keeps an empty agenda to one quiet line', () => {
    render(<CompactAgenda commitments={[]} />);
    expect(screen.getByText('Sem compromissos')).toBeInTheDocument();
    expect(screen.getByTestId('compact-agenda')).toHaveAttribute('data-empty', 'true');
  });

  it('orders commitments and expands overflow', () => {
    render(<CompactAgenda commitments={[
      commitment('4', 'Fechamento', '16:00'),
      commitment('1', 'Academia', '09:00'),
      commitment('2', 'Almoço', '12:00'),
      commitment('3', 'Reunião', '14:00')
    ]} />);

    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.queryByText('Fechamento')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1 compromisso/i }));
    expect(screen.getByText('Fechamento')).toBeInTheDocument();
    expect(screen.getAllByText('60 min')).toHaveLength(4);
  });
});

describe('RolloverReview', () => {
  it('offers all destinations to captures and hides Inbox from tasks', () => {
    const onResolve = vi.fn();
    render(
      <RolloverReview
        items={[oldQuickEntry, oldTaskEntry]}
        targetDate="2026-08-05"
        onResolve={onResolve}
      />
    );

    expect(screen.getByText('Pendentes anteriores')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /manter em hoje/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /voltar ao inbox/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /concluir/i })).toHaveLength(2);
  });
});
