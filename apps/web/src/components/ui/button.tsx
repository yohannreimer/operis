import { clsx } from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    className,
    children,
    disabled,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={clsx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="ui-button__content">
        {leadingIcon}
        <span>{children}</span>
      </span>
      {loading ? <LoaderCircle className="ui-button__spinner" aria-hidden="true" /> : null}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonProps, 'children' | 'leadingIcon'> & {
  label: string;
  icon: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'tertiary', className, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      variant={variant}
      className={clsx('ui-icon-button', className)}
      {...props}
    >
      {icon}
    </Button>
  );
});
