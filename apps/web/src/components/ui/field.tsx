import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  const generatedId = useId();
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined
      })
    : children;

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="ui-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
