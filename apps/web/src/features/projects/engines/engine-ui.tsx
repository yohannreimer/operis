import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

export function EngineSectionHeader({ id, eyebrow, title, description, actionLabel, onAction }: { id: string; eyebrow?: string; title: string; description?: string; actionLabel?: string; onAction?: () => void }) {
  return <header className="engine-section-header"><div>{eyebrow && <span>{eyebrow}</span>}<h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>{actionLabel && onAction && <button type="button" onClick={onAction}><Plus size={15} /> {actionLabel}</button>}</header>;
}

export function EngineSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="engine-skeleton" aria-label="Carregando motor">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>;
}

export function EngineEmpty({ children }: { children: ReactNode }) {
  return <div className="engine-empty">{children}</div>;
}
