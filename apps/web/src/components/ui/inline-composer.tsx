import { X } from 'lucide-react';
import { useRef, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

import { Button, IconButton } from './button';

export type InlineComposerProps = {
  label: string;
  value: string;
  placeholder: string;
  submitLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  leading?: ReactNode;
  context?: ReactNode;
  onValueChange(value: string): void;
  onSubmit(): void;
  onCancel(): void;
};

export function InlineComposer({
  label,
  value,
  placeholder,
  submitLabel = 'Criar',
  busy,
  disabled,
  error,
  leading,
  context,
  onValueChange,
  onSubmit,
  onCancel
}: InlineComposerProps) {
  const composingRef = useRef(false);
  const hasValue = value.trim().length > 0;
  const canSubmit = hasValue && !busy && !disabled;

  const submit = () => {
    if (canSubmit && !composingRef.current) onSubmit();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!event.nativeEvent.isComposing) submit();
    }
  };

  return (
    <form className="ui-inline-composer" onSubmit={handleSubmit}>
      <div className="ui-inline-composer__main">
        {leading ? <span className="ui-inline-composer__leading">{leading}</span> : null}
        <label className="ui-sr-only" htmlFor={`ui-composer-${label.replace(/\s+/g, '-').toLowerCase()}`}>
          {label}
        </label>
        <input
          id={`ui-composer-${label.replace(/\s+/g, '-').toLowerCase()}`}
          className="ui-inline-composer__input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
        />
        {hasValue ? (
          <Button type="submit" size="sm" loading={busy}>
            {submitLabel}
          </Button>
        ) : null}
        <IconButton
          type="button"
          size="sm"
          label={`Cancelar ${label.toLowerCase()}`}
          icon={<X />}
          onClick={onCancel}
        />
      </div>
      {context ? <div className="ui-inline-composer__context">{context}</div> : null}
      {error ? (
        <p className="ui-inline-composer__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
