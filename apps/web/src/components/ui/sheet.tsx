import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

import { IconButton } from './button';

export type SheetProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  side?: 'right' | 'bottom';
  initialFocusRef?: RefObject<HTMLElement>;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Sheet({
  open,
  title,
  eyebrow,
  side = 'right',
  initialFocusRef,
  onClose,
  children,
  footer
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-dialog-overlay" />
        <Dialog.Content
          className={`ui-sheet ui-sheet--${side === 'right' ? 'side' : 'bottom'}`}
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (!initialFocusRef?.current) return;
            event.preventDefault();
            initialFocusRef.current.focus();
          }}
        >
          <header className="ui-sheet__header">
            <div>
              {eyebrow ? <span className="ui-sheet__eyebrow">{eyebrow}</span> : null}
              <Dialog.Title className="ui-sheet__title">{title}</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <IconButton label={`Fechar ${title}`} icon={<X />} />
            </Dialog.Close>
          </header>
          <div className="ui-sheet__body">{children}</div>
          {footer ? <footer className="ui-sheet__footer">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
