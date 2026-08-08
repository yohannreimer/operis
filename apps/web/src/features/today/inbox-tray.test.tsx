import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { InboxItem } from '../../api';
import { InboxTray } from './inbox-tray';

const item = vi.hoisted((): InboxItem => ({
  id: 'inbox-1', content: 'Enviar proposta', source: 'app', status: 'pendente',
  workspaceId: 'ws-1', inboxContextId: null, position: 0, waitingDate: null,
  waitingPerson: null, waitingNote: null, scheduledAt: null, convertedTaskId: null,
  createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-08T10:00:00.000Z',
  workspace: null, inboxContext: null
}));

const controller = vi.hoisted(() => ({
  items: [item],
  contexts: [],
  workspaces: [{ id: 'ws-1', name: 'Negócios', type: 'empresa' as const }],
  loading: false,
  error: null,
  reload: vi.fn(),
  create: vi.fn(),
  toggleDone: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  setWaiting: vi.fn(),
  execute: vi.fn(),
  convert: vi.fn(),
  moveContext: vi.fn()
}));

vi.mock('../inbox/use-inbox-controller', () => ({ useInboxController: () => controller }));
vi.mock('../../components/inbox-group', () => ({
  InboxGroup: ({ onConvert }: { onConvert(item: InboxItem): void }) => (
    <button type="button" onClick={() => onConvert(item)}>Converter Enviar proposta em tarefa</button>
  )
}));

function Harness() {
  const [open, setOpen] = useState(true);
  return <InboxTray open={open} onClose={() => setOpen(false)} date="2026-08-08" onAddToToday={vi.fn()} />;
}

describe('InboxTray', () => {
  it('uses the shared sheet and closes it before task conversion', () => {
    render(<Harness />);

    expect(screen.getByRole('dialog', { name: 'Inbox' })).toHaveClass('ui-sheet--side');
    fireEvent.click(screen.getByRole('button', { name: /converter enviar proposta em tarefa/i }));

    expect(screen.queryByRole('dialog', { name: 'Inbox' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nova tarefa' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
