import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Commitment } from '../../api';
import type { TodayEntry } from './types';
import { CompactAgenda } from './compact-agenda';
import { RolloverReview } from './rollover-review';
import { TodayWorkspace } from './today-workspace';

const workspaceState = vi.hoisted(() => ({
  entries: [],
  rollover: [],
  inboxItems: [],
  inboxCount: 17,
  commitments: [],
  loading: false,
  error: null,
  inboxError: null,
  agendaError: null,
  reload: vi.fn(),
  addInboxToToday: vi.fn(),
  addTaskToToday: vi.fn(),
  toggleCompleted: vi.fn(),
  removeFromToday: vi.fn(),
  reorder: vi.fn(),
  resolveRollover: vi.fn()
}));

vi.mock('./use-today-workspace', () => ({
  useTodayWorkspace: () => workspaceState
}));
vi.mock('./inbox-tray', () => ({
  InboxTray: ({ open }: { open: boolean }) => open
    ? <div role="dialog" aria-label="Inbox contextual" />
    : null
}));
vi.mock('./planner-mode', () => ({
  PlannerMode: () => <div>Grade do planejador</div>
}));

afterEach(() => {
  (workspaceState as { error: string | null }).error = null;
  workspaceState.loading = false;
});

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

describe('TodayWorkspace', () => {
  it('keeps the list as the default and opens planning contextually', async () => {
    render(<TodayWorkspace date="2026-08-05" />);

    expect(screen.getByRole('heading', { name: /hoje/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inbox · 17/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /planejar/i })).toBeInTheDocument();
    expect(screen.queryByText(/07:00/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /planejar/i }));

    expect(await screen.findByRole('dialog', { name: /planejar o dia/i })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Grade do planejador')).toBeInTheDocument();
  });

  it('announces loading and recoverable failures', () => {
    workspaceState.loading = true;
    const view = render(<TodayWorkspace date="2026-08-05" />);
    expect(screen.getByLabelText('Carregando o dia')).toBeInTheDocument();

    view.unmount();
    workspaceState.loading = false;
    (workspaceState as { error: string | null }).error = 'Não foi possível carregar o dia.';
    render(<TodayWorkspace date="2026-08-05" />);

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
