import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompletionControl } from './completion-control';

describe('CompletionControl', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() });
  });

  it('separates the 20px visual mark from the interactive button', () => {
    render(<CompletionControl checked={false} label="Concluir proposta" onCheckedChange={vi.fn()} />);

    const control = screen.getByRole('button', { name: 'Concluir proposta' });
    expect(control).toHaveClass('ui-completion-control');
    expect(control.querySelector('.ui-completion-control__mark')).toBeInTheDocument();
    expect(control).toHaveAttribute('aria-pressed', 'false');
  });

  it('requests a short haptic only when completing', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <CompletionControl checked={false} label="Concluir proposta" onCheckedChange={onCheckedChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Concluir proposta' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(navigator.vibrate).toHaveBeenCalledWith(10);

    rerender(<CompletionControl checked label="Reabrir proposta" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir proposta' }));
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
  });
});
