import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sheet } from './sheet';

describe('Sheet', () => {
  it('renders a side sheet and returns close through Radix', () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Inbox" onClose={onClose}>
        Capturas
      </Sheet>
    );

    expect(screen.getByRole('dialog', { name: 'Inbox' })).toHaveClass('ui-sheet--side');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Inbox' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('supports the mobile bottom presentation and an optional footer', () => {
    render(
      <Sheet open title="Detalhes" side="bottom" onClose={vi.fn()} footer={<button>Salvar</button>}>
        Conteúdo
      </Sheet>
    );

    expect(screen.getByRole('dialog', { name: 'Detalhes' })).toHaveClass('ui-sheet--bottom');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });
});
