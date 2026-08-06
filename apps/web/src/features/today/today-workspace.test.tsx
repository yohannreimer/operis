import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Commitment, DayPlan } from '../../api';
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
  dayPlanError: null,
  dayPlan: { date: '2026-08-06', items: [] } as DayPlan,
  activeSession: null,
  reload: vi.fn(),
  addInboxToToday: vi.fn(),
  addTaskToToday: vi.fn(),
  toggleCompleted: vi.fn(),
  removeFromToday: vi.fn(),
  reorder: vi.fn(),
  resolveRollover: vi.fn(),
  startSession: vi.fn(),
  stopSession: vi.fn(),
  cancelSession: vi.fn(),
  setPlannedBlockCompleted: vi.fn()
}));

vi.mock('./use-today-workspace', () => ({
  useTodayWorkspace: () => workspaceState
}));
vi.mock('./inbox-tray', () => ({
  InboxTray: ({ open }: { open: boolean }) => open
    ? <div role="dialog" aria-label="Inbox contextual" />
    : null
}));
afterEach(() => {
  (workspaceState as { error: string | null }).error = null;
  workspaceState.loading = false;
  workspaceState.entries = [];
  workspaceState.dayPlan = { date: '2026-08-06', items: [] };
  workspaceState.activeSession = null;
  vi.clearAllMocks();
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

const quickEntry: TodayEntry = {
  id: 'daily_1', kind: 'inbox', sourceId: 'inbox_1', date: '2026-08-06',
  title: 'Responder cliente', position: 0, completedAt: null, context: null
};

const dayPlanWithQuickBlock = (): DayPlan => ({
  id: 'plan_1', date: '2026-08-06', items: [{
    id: 'block_1', dayPlanId: 'plan_1', taskId: null, inboxItemId: 'inbox_1',
    startTime: new Date('2026-08-06T14:00:00').toISOString(), endTime: new Date('2026-08-06T14:15:00').toISOString(),
    completedAt: null, orderIndex: 0, blockType: 'task', confirmationState: 'pending',
    task: null, inboxItem: { id: 'inbox_1', content: 'Responder cliente' }
  }]
});

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
  it('keeps the list as the default and focuses planning contextually', () => {
    render(<TodayWorkspace date="2026-08-05" />);

    expect(screen.getByRole('heading', { level: 1, name: /hoje/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inbox · 17/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /planejar/i })).toBeInTheDocument();
    expect(screen.queryByText(/07:00/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /planejar/i }));
    expect(screen.getByRole('region', { name: /linha do tempo de/i })).toHaveFocus();
  });

  it('keeps unscheduled intent outside the timeline and starts observed execution', () => {
    workspaceState.entries = [quickEntry];
    workspaceState.dayPlan = { date: '2026-08-06', items: [] };
    workspaceState.activeSession = null;
    render(<TodayWorkspace date="2026-08-06" />);

    expect(screen.getByRole('list', { name: 'Para hoje' })).toHaveTextContent('Responder cliente');
    expect(screen.queryByRole('button', { name: /Item rápido Responder cliente, .* até/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Responder cliente' }));
    expect(workspaceState.startSession).toHaveBeenCalledWith(quickEntry);
  });

  it('shows the same scheduled block returned by the day plan', () => {
    workspaceState.entries = [quickEntry];
    workspaceState.dayPlan = dayPlanWithQuickBlock();
    render(<TodayWorkspace date="2026-08-06" />);

    expect(screen.getByRole('button', {
      name: 'Item rápido Responder cliente, 14:00 até 14:15'
    })).toBeInTheDocument();
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
