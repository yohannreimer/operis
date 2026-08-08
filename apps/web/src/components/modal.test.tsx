import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './modal';

describe('Modal', () => {
  it('associates its title, description, footer and size with a blocking dialog', () => {
    render(
      <Modal
        open
        title="Nova tarefa"
        subtitle="Criar tarefa estruturada"
        size="lg"
        onClose={vi.fn()}
        footer={<button>Salvar</button>}
      >
        Formulário
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Nova tarefa' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('modal-lg');
    expect(dialog).toHaveAccessibleDescription('Criar tarefa estruturada');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('provides a named close action', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Nova tarefa" onClose={onClose}>
        Formulário
      </Modal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fechar Nova tarefa' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
