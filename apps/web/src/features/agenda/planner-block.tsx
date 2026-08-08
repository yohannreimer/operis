import { useDraggable } from '@dnd-kit/core';
import { CalendarDays, CheckSquare2, MoreHorizontal, Zap } from 'lucide-react';

import { Button, IconButton, Popover } from '../../components/ui';
import { agendaTime } from './time-grid';
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

export function formatBlockRange(block: PlannerBlockModel) {
  return `${agendaTime(block.startTime)}–${agendaTime(block.endTime)}`;
}

export function blockAccessibleName(block: PlannerBlockModel) {
  const kind =
    block.kind === 'commitment'
      ? 'Compromisso'
      : block.kind === 'task'
        ? 'Tarefa'
        : 'Item rápido';
  return `${kind} ${block.title}, ${agendaTime(block.startTime)} até ${agendaTime(block.endTime)}`;
}

type Props = {
  block: PlannerBlockModel;
  geometry: { top: number; height: number };
  conflicted: boolean;
  onOpen(block: PlannerBlockModel): void;
  onCommand(block: PlannerBlockModel, command: BlockCommand): void;
};

export function PlannerBlock({ block, geometry, conflicted, onOpen, onCommand }: Props) {
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
        {...(block.kind === 'commitment' ? {} : draggable.attributes)}
        {...(block.kind === 'commitment' ? {} : draggable.listeners)}
      >
        <Icon aria-hidden="true" size={13} />
        <span className="agenda-block-copy">
          <strong>{block.title}</strong>
          <small>{formatBlockRange(block)}</small>
        </span>
      </button>
      {block.kind !== 'commitment' ? (
        <div className="agenda-block-actions">
          <Popover
            label={`Ações de ${block.title}`}
            trigger={<IconButton type="button" label={`Ações de ${block.title}`} icon={<MoreHorizontal size={14} />} />}
          >
            {commandLabels.map(([command, label]) => (
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                key={command}
                onClick={() => {
                  onCommand(block, command);
                }}
              >
                {label}
              </Button>
            ))}
          </Popover>
        </div>
      ) : null}
    </div>
  );
}
