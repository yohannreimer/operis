import { useRef } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useModalFocus } from './use-modal-focus';

function ModalHarness({ onClose }: { onClose(): void }) {
  const containerRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  useModalFocus({ active: true, containerRef, initialFocusRef, onClose });

  return (
    <section ref={containerRef} role="dialog" aria-modal="true" aria-label="Teste">
      <button ref={initialFocusRef} type="button">Primeiro</button>
      <button type="button">Último</button>
    </section>
  );
}

describe('useModalFocus', () => {
  it('locks scroll, traps focus and handles Escape', async () => {
    const onClose = vi.fn();
    const view = render(<ModalHarness onClose={onClose} />);
    const first = view.getByRole('button', { name: 'Primeiro' });
    const last = view.getByRole('button', { name: 'Último' });

    await waitFor(() => expect(first).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
