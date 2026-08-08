import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { AlertTriangle, CalendarClock, Clock3, GripVertical, Sun, TriangleAlert } from 'lucide-react';

import type { TaskBacklogItem } from '../../api';
import { CompletionControl } from '../../components/ui';
import { isTaskOverdue, taskMovement } from './task-backlog-model';
import { TaskMoveMenu } from './task-move-menu';
import type { TaskMovement } from './types';

type Props = {
  task: TaskBacklogItem;
  date: string;
  selected: boolean;
  busy: boolean;
  onOpen(): void;
  onComplete(): void;
  onMove(movement: TaskMovement): void;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value));
}

export function TaskRow({ task, date, selected, busy, onOpen, onComplete, onMove, dragListeners, dragAttributes }: Props) {
  const overdue = isTaskOverdue(task, date);
  const progress = task.stepSummary.total
    ? `${task.stepSummary.completed}/${task.stepSummary.total} etapas`
    : null;
  return (
    <div role="listitem" className="task-backlog-row" data-selected={selected || undefined} data-busy={busy || undefined} data-task-id={task.id}>
      <CompletionControl
        checked={task.status === 'feito'}
        label={`${task.status === 'feito' ? 'Reabrir' : 'Concluir'} ${task.title}`}
        onCheckedChange={onComplete}
        disabled={busy || task.status === 'arquivado'}
      />
      <button type="button" className="task-drag-handle" aria-label={`Arrastar ${task.title}`} {...dragAttributes} {...dragListeners}><GripVertical aria-hidden="true" /></button>
      <button type="button" className="task-backlog-row-main" onClick={onOpen} aria-current={selected ? 'true' : undefined}>
        <span className="task-backlog-row-title">{task.title}</span>
        <span className="task-backlog-row-context">
          {task.workspace?.name ? <span>{task.workspace.name}</span> : null}
          {task.project?.title ? <span>{task.project.title}</span> : null}
          {progress ? <span>{progress}</span> : null}
          {task.nextStep ? <span className="task-row-next">↳ {task.nextStep}</span> : null}
        </span>
      </button>
      <div className="task-row-signals">
        {task.todayEntryId ? <span className="task-signal today"><Sun aria-hidden="true" />Hoje</span> : null}
        {task.waitingOnPerson ? <span className="task-signal waiting"><Clock3 aria-hidden="true" />{task.waitingOnPerson}</span> : null}
        {task.openRestrictionCount ? <span className="task-signal blocked"><TriangleAlert aria-hidden="true" />{task.openRestrictionCount}</span> : null}
        {task.dueDate ? <span className={`task-signal ${overdue ? 'overdue' : ''}`}><CalendarClock aria-hidden="true" />{dateLabel(task.dueDate)}{overdue ? <AlertTriangle aria-label="Atrasada" /> : null}</span> : null}
      </div>
      {task.status !== 'feito' && task.status !== 'arquivado' ? <TaskMoveMenu current={taskMovement(task)} onMove={onMove} /> : <span />}
    </div>
  );
}
