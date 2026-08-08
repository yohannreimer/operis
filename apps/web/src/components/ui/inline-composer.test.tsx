import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InlineComposer } from './inline-composer';

describe('InlineComposer', () => {
  it('submits with Enter and preserves a named cancel action', () => {
    const onSubmit = vi.fn();
    render(
      <InlineComposer
        label="Nova tarefa"
        value="Enviar proposta"
        onValueChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        placeholder="Qual trabalho precisa avançar?"
      />
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nova tarefa' }), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancelar nova tarefa' })).toBeInTheDocument();
  });

  it('does not submit an empty value or an active IME composition', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <InlineComposer
        label="Nova tarefa"
        value=""
        onValueChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        placeholder="Qual trabalho precisa avançar?"
      />
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nova tarefa' }), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(
      <InlineComposer
        label="Nova tarefa"
        value="Enviar proposta"
        onValueChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        placeholder="Qual trabalho precisa avançar?"
      />
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nova tarefa' }), {
      key: 'Enter',
      isComposing: true
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
