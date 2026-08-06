import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CalendarDays, CheckSquare2, MoreHorizontal, Zap } from 'lucide-react';

import type { PlannerBlockModel } from './types';

export type BlockCommand =
  | 'earlier'
  | 'later'
  | 'previous-day'
  | 'next-day'
  | 'longer'
  | 'shorter';

const commandLabels: Array<[BlockCommand, string]> = [
  ['earlier', 'Mover 15 minutos antes'],
  ['later', 'Mover 15 minutos depois'],
  ['previous-day', 'Mover para o dia anterior'],
  ['next-day', 'Mover para o próximo dia'],
  ['longer', 'Aumentar 15 minutos'],
  ['shorter', 'Reduzir 15 minutos']
];

function time(value: string) {
  return value.match(/(?:T|^)(\d{2}:\d{2})/)?.[1] ?? value;
}

export function formatBlockRange(block: PlannerBlockModel) {
  return `${time(block.startTime)}–${time(block.endTime)}`;
}

export function blockAccessibleName(block: PlannerBlockModel) {
  const kind =
    block.kind === 'commitment'
      ? 'Compromisso'
      : block.kind === 'task'
        ? 'Tarefa'
        : 'Item rápido';
  return `${kind} ${block.title}, ${time(block.startTime)} até ${time(block.endTime)}`;
}

type Props = {
  block: PlannerBlockModel;
  geometry: { top: number; height: number };
  conflicted: boolean;
  onOpen(block: PlannerBlockModel): void;
  onCommand(block: PlannerBlockModel, command: BlockCommand): void;
};

export function PlannerBlock({ block, geometry, conflicted, onOpen, onCommand }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const draggable = useDraggable({
    id: `block:${block.id}`,
    disabled: block.kind === 'commitment',
    data: { type: 'block', block }
  });
  const Icon = block.kind === 'commitment' ? CalendarDays : block.kind === 'task' ? CheckSquare2 : Zap;

  return (
    <div
      className={`agenda-block-shell agenda-block-shell--${block.kind}`}
      data-conflict={conflicted || undefined}
      style={{ top: geometry.top, height: geometry.height }}
    >
      <button
        ref={draggable.setNodeRef}
        type="button"
        className={`agenda-block agenda-block--${block.kind}`}
        aria-label={blockAccessibleName(block)}
        onClick={() => onOpen(block)}
        style={{ transform: draggable.transform ? `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)` : undefined }}
        {...draggable.attributes}
        {...draggable.listeners}
      >
        <Icon aria-hidden="true" size={13} />
        <span className="agenda-block-copy">
          <strong>{block.title}</strong>
          <small>{formatBlockRange(block)}</small>
        </span>
      </button>
      {block.kind !== 'commitment' ? (
        <div className="agenda-block-actions">
          <button
            type="button"
            aria-label={`Ações de ${block.title}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="agenda-block-menu" role="menu">
              {commandLabels.map(([command, label]) => (
                <button
                  type="button"
                  key={command}
                  onClick={() => {
                    setMenuOpen(false);
                    onCommand(block, command);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
