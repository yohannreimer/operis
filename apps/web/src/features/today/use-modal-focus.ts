import { type RefObject, useEffect } from 'react';

type Options = {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose(): void;
};

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'summary',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function useModalFocus({ active, containerRef, initialFocusRef, onClose }: Options) {
  useEffect(() => {
    if (!active) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => initialFocusRef.current?.focus());

    function isTopModal() {
      const modals = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
      return modals.length === 0 || modals[modals.length - 1] === containerRef.current;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopModal()) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusable = [...containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !containerRef.current.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !containerRef.current.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [active, containerRef, initialFocusRef, onClose]);
}
