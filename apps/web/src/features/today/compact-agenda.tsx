import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';

import type { Commitment } from '../../api';

type Props = {
  commitments: Commitment[];
  error?: string | null;
};

function timeLabel(value: string | null) {
  if (!value) {
    return '—';
  }
  if (/^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function CompactAgenda({ commitments, error }: Props) {
  const [expanded, setExpanded] = useState(false);
  const ordered = useMemo(
    () => [...commitments].sort((left, right) => (left.startTime ?? '99:99').localeCompare(right.startTime ?? '99:99')),
    [commitments]
  );
  const visible = expanded ? ordered : ordered.slice(0, 3);
  const hiddenCount = Math.max(0, ordered.length - 3);

  if (error) {
    return (
      <div className="compact-agenda compact-agenda--empty" data-testid="compact-agenda" data-empty="true">
        <CalendarDays aria-hidden="true" size={15} />
        <span>{error}</span>
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="compact-agenda compact-agenda--empty" data-testid="compact-agenda" data-empty="true">
        <CalendarDays aria-hidden="true" size={15} />
        <span>Sem compromissos</span>
      </div>
    );
  }

  return (
    <section className="compact-agenda" data-testid="compact-agenda" data-empty="false" aria-label="Compromissos de hoje">
      <CalendarDays className="compact-agenda__icon" aria-hidden="true" size={15} />
      <div className="compact-agenda__items">
        {visible.map((commitment) => (
          <div className="compact-agenda__item" key={commitment.id}>
            <time>{timeLabel(commitment.startTime)}</time>
            <span>{commitment.title}</span>
            {commitment.durationMin ? <small>{commitment.durationMin} min</small> : null}
          </div>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="compact-agenda__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronUp aria-hidden="true" size={14} /> : <ChevronDown aria-hidden="true" size={14} />}
          {expanded ? 'Recolher' : `+ ${hiddenCount} compromisso${hiddenCount === 1 ? '' : 's'}`}
        </button>
      ) : null}
    </section>
  );
}
