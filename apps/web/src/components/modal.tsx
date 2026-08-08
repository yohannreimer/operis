import * as Dialog from '@radix-ui/react-dialog';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { IconButton } from './ui/button';

type ModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
};

export function Modal({ open, title, subtitle, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" />
        <Dialog.Content
          className={clsx('modal-card', `modal-${size}`)}
          aria-modal="true"
          {...(subtitle ? {} : { 'aria-describedby': undefined })}
        >
          <header className="modal-header">
            <div>
              <Dialog.Title asChild>
                <h3>{title}</h3>
              </Dialog.Title>
              {subtitle ? (
                <Dialog.Description asChild>
                  <p>{subtitle}</p>
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <IconButton label={`Fechar ${title}`} icon={<X />} />
            </Dialog.Close>
          </header>

          <div className="modal-body">{children}</div>

          {footer ? <footer className="modal-footer">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
