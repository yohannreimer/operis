import type { CSSProperties, HTMLAttributes } from 'react';
import { Check, GripVertical, MoreHorizontal, Play } from 'lucide-react';

import type { TodayEntry } from './types';

type Props = {
  entry: TodayEntry;
  index: number;
  total: number;
  onToggle(entry: TodayEntry): void;
  onRemove(entry: TodayEntry): void;
  onStart(entry: TodayEntry): void;
  onMove(index: number, direction: -1 | 1): void;
  setNodeRef?(element: HTMLElement | null): void;
  style?: CSSProperties;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  reorderable?: boolean;
};

function metadata(entry: TodayEntry) {
  if (entry.kind === 'inbox') {
    return entry.context ? [entry.context] : [];
  }

  return [
    entry.project,
    entry.estimatedMinutes ? `${entry.estimatedMinutes} min` : null,
    entry.deadline
      ? `até ${new Date(entry.deadline).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
      : null
  ].filter((value): value is string => Boolean(value));
}

export function TodayExecutionRow({
  entry,
  index,
  total,
  onToggle,
  onRemove,
  onStart,
  onMove,
  setNodeRef,
  style,
  dragHandleProps,
  reorderable = true
}: Props) {
  const completed = Boolean(entry.completedAt);
  const meta = metadata(entry);
  const removeLabel = entry.kind === 'inbox'
    ? `Voltar ${entry.title} ao Inbox`
    : `Remover ${entry.title} de Hoje`;

  return (
    <li
      ref={setNodeRef}
      className={`today-execution-row${completed ? ' today-execution-row--completed' : ''}`}
      style={style}
      data-kind={entry.kind}
    >
      <button
        type="button"
        className="today-execution-row__check"
        aria-label={`${completed ? 'Reabrir' : 'Concluir'} ${entry.title}`}
        aria-pressed={completed}
        onClick={() => onToggle(entry)}
      >
        {completed ? <Check aria-hidden="true" size={15} strokeWidth={2.4} /> : null}
      </button>

      <div className="today-execution-row__content">
        <span className="today-execution-row__title">{entry.title}</span>
        {meta.length > 0 ? (
          <span className="today-execution-row__meta">
            {meta.map((value, metaIndex) => (
              <span key={value}>
                {metaIndex > 0 ? <span aria-hidden="true"> · </span> : null}
                {value}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <div className="today-execution-row__actions">
        {!completed ? (
          <button
            type="button"
            className="today-execution-row__start"
            aria-label={`Iniciar ${entry.title}`}
            onClick={() => onStart(entry)}
          >
            <Play aria-hidden="true" size={15} />
          </button>
        ) : null}
        {reorderable ? (
          <button
            type="button"
            className="today-execution-row__drag"
            aria-label={`Reordenar ${entry.title}`}
            {...dragHandleProps}
          >
            <GripVertical aria-hidden="true" size={16} />
          </button>
        ) : null}
        <details className="today-execution-row__menu">
          <summary aria-label={`Mais ações para ${entry.title}`}>
            <MoreHorizontal aria-hidden="true" size={18} />
          </summary>
          <div role="menu" className="today-execution-row__menu-popover">
            {reorderable ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Mover ${entry.title} acima`}
                  disabled={index === 0}
                  onClick={() => onMove(index, -1)}
                >
                  Mover acima
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`Mover ${entry.title} abaixo`}
                  disabled={index === total - 1}
                  onClick={() => onMove(index, 1)}
                >
                  Mover abaixo
                </button>
              </>
            ) : null}
            <button
              type="button"
              role="menuitem"
              aria-label={removeLabel}
              onClick={() => onRemove(entry)}
            >
              {entry.kind === 'inbox' ? 'Voltar ao Inbox' : 'Remover de Hoje'}
            </button>
          </div>
        </details>
      </div>
    </li>
  );
}
