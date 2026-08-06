import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Inbox, MoveRight } from 'lucide-react';

import type { RolloverAction, TodayEntry } from './types';

type Props = {
  items: TodayEntry[];
  targetDate: string;
  onResolve(item: TodayEntry, action: RolloverAction): void;
};

const SESSION_KEY = 'operis.rollover-review-collapsed';

function previousDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function initialExpanded() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short'
  });
}

export function RolloverReview({ items, targetDate, onResolve }: Props) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const groups = useMemo(() => {
    const grouped = new Map<string, TodayEntry[]>();
    for (const item of items) {
      const current = grouped.get(item.date) ?? [];
      current.push(item);
      grouped.set(item.date, current);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  const onlyYesterday = groups.length === 1 && groups[0]?.[0] === previousDate(targetDate);
  const heading = onlyYesterday ? 'Pendente de ontem' : 'Pendentes anteriores';

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      try {
        window.sessionStorage.setItem(SESSION_KEY, next ? '0' : '1');
      } catch {
        // Session preference is optional.
      }
      return next;
    });
  }

  return (
    <section className="rollover-review" aria-labelledby="rollover-review-title">
      <button
        type="button"
        className="rollover-review__header"
        aria-expanded={expanded}
        onClick={toggleExpanded}
      >
        {expanded ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}
        <span id="rollover-review-title">{heading}</span>
        <strong>{items.length}</strong>
      </button>

      {expanded ? (
        <div className="rollover-review__groups">
          {groups.map(([date, entries]) => (
            <div className="rollover-review__group" key={date}>
              {!onlyYesterday ? <time>{dateLabel(date)}</time> : null}
              {entries.map((item) => (
                <div className="rollover-review__item" key={item.id}>
                  <span>{item.title}</span>
                  <div className="rollover-review__actions">
                    <button
                      type="button"
                      aria-label={`Manter em Hoje: ${item.title}`}
                      onClick={() => onResolve(item, 'keep_today')}
                    >
                      <MoveRight aria-hidden="true" size={14} /> Manter em Hoje
                    </button>
                    {item.kind === 'inbox' ? (
                      <button
                        type="button"
                        aria-label={`Voltar ao Inbox: ${item.title}`}
                        onClick={() => onResolve(item, 'return_inbox')}
                      >
                        <Inbox aria-hidden="true" size={14} /> Voltar ao Inbox
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Concluir ${item.title}`}
                      onClick={() => onResolve(item, 'complete')}
                    >
                      <Check aria-hidden="true" size={14} /> Concluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
