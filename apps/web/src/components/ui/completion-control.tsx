import { clsx } from 'clsx';
import { Check } from 'lucide-react';

import { confirmHaptic } from './interaction-feedback';

export type CompletionControlProps = {
  checked: boolean;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  onCheckedChange(checked: boolean): void;
};

export function CompletionControl({
  checked,
  label,
  disabled,
  busy,
  className,
  onCheckedChange
}: CompletionControlProps) {
  return (
    <button
      type="button"
      className={clsx('ui-completion-control', className)}
      aria-label={label}
      aria-pressed={checked}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => {
        const next = !checked;
        if (next) confirmHaptic();
        onCheckedChange(next);
      }}
    >
      <span className="ui-completion-control__mark" aria-hidden="true">
        {checked ? <Check /> : null}
      </span>
    </button>
  );
}
