import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode
} from 'react';

export type PopoverProps = {
  label: string;
  trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
  children: ReactNode;
  align?: 'start' | 'end';
};

export function Popover({ label, trigger, children, align = 'end' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      queueMicrotask(() => {
        rootRef.current?.querySelector<HTMLElement>('[data-ui-popover-trigger]')?.focus();
      });
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return (
    <div className="ui-popover" ref={rootRef}>
      {cloneElement(trigger, {
        'data-ui-popover-trigger': true,
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
        onClick: (event) => {
          trigger.props.onClick?.(event);
          if (!event.defaultPrevented) setOpen((current) => !current);
        }
      } as ButtonHTMLAttributes<HTMLButtonElement>)}
      {open ? (
        <div
          id={id}
          className={`ui-popover__content ui-popover__content--${align}`}
          role="menu"
          aria-label={label}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
