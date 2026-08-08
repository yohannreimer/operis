import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InboxInput } from './inbox-input';

const workspaces = [{ id: 'ws-1', name: 'Negócios', type: 'empresa' as const }];

describe('InboxInput', () => {
  it('submits a named neutral capture with Enter', () => {
    const onSubmit = vi.fn();
    render(<InboxInput workspaces={workspaces} contexts={[]} onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox', { name: 'Capturar no Inbox' });
    fireEvent.change(input, { target: { value: 'Comprar cabo USB-C' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('Comprar cabo USB-C', null, null);
  });

  it('uses Lucide icons for submission and context suggestions', () => {
    render(<InboxInput workspaces={workspaces} contexts={[]} onSubmit={vi.fn()} />);

    const input = screen.getByRole('textbox', { name: 'Capturar no Inbox' });
    fireEvent.change(input, { target: { value: '@neg' } });

    expect(screen.getByRole('button', { name: 'Criar item' }).querySelector('.lucide-corner-down-left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Negócios/ }).querySelector('.lucide-building-2')).toBeInTheDocument();
  });
});
