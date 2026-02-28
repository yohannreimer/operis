import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

type PageProps = {
  children: ReactNode;
};

type HeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

type CardProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  delay?: number;
};

type MetricProps = {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning';
  hint?: string;
};

type TabOption<T extends string> = {
  value: T;
  label: string;
};

type TabSwitchProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Array<TabOption<T>>;
};

type EmptyStateProps = {
  text?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type SkeletonBlockProps = {
  lines?: number;
  height?: number;
  className?: string;
};

const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06
    }
  }
};

const fadeInUp = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1] as const
    }
  }
};

export function PremiumPage({ children }: PageProps) {
  return (
    <motion.section
      className="premium-page"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.section>
  );
}

export function PremiumHeader({ eyebrow, title, subtitle, actions }: HeaderProps) {
  return (
    <motion.header className="premium-header" variants={fadeInUp}>
      <div>
        {eyebrow && <p className="premium-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {subtitle && <p className="premium-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="premium-header-actions">{actions}</div>}
    </motion.header>
  );
}

export function PremiumCard({ title, subtitle, actions, className, children, delay = 0 }: CardProps) {
  return (
    <motion.article
      className={clsx('premium-card', className)}
      variants={fadeInUp}
      transition={{ delay }}
    >
      {(title || subtitle || actions) && (
        <div className="premium-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
    </motion.article>
  );
}

export function MetricCard({ label, value, tone = 'default', hint }: MetricProps) {
  return (
    <motion.div className={clsx('premium-metric', `tone-${tone}`)} variants={fadeInUp}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </motion.div>
  );
}

export function TabSwitch<T extends string>({ value, onChange, options }: TabSwitchProps<T>) {
  return (
    <motion.div className="premium-tabs" variants={fadeInUp}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'premium-tab active' : 'premium-tab'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </motion.div>
  );
}

export function EmptyState({ text, title, description, actionLabel, onAction }: EmptyStateProps) {
  const resolvedTitle = title ?? 'Sem itens por aqui';
  const resolvedDescription = description ?? text ?? 'Nada para mostrar no momento.';

  return (
    <motion.div className="premium-empty guided" variants={fadeInUp}>
      <strong>{resolvedTitle}</strong>
      <p>{resolvedDescription}</p>
      {actionLabel && onAction && (
        <button type="button" className="ghost-button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}

export function SkeletonBlock({ lines = 1, height = 12, className }: SkeletonBlockProps) {
  if (lines <= 1) {
    return <div className={clsx('premium-skeleton', className)} style={{ height }} />;
  }

  return (
    <div className={clsx('premium-skeleton-stack', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="premium-skeleton"
          style={{
            height,
            width: index === lines - 1 ? '70%' : '100%'
          }}
        />
      ))}
    </div>
  );
}
