import { useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown } from 'lucide-react';

import type { TaskBacklogItem } from '../../api';
import { TaskRow } from './task-row';
import { TaskWaitingDialog, type TaskWaitingValues } from './task-waiting-dialog';
import type { TaskGroup, TaskGroupId, TaskMovement } from './types';

type Props = {
  groups: TaskGroup[];
  date: string;
  selectedTaskId: string | null;
  busyTaskIds: Set<string>;
  collapsedGroups: Set<TaskGroupId>;
  onToggleGroup(movement: TaskGroupId): void;
  onOpen(task: TaskBacklogItem): void;
  onComplete(task: TaskBacklogItem): void;
  onMove(task: TaskBacklogItem, movement: TaskMovement, waiting?: TaskWaitingValues): void | Promise<void>;
};

function DraggableRow(props: Omit<React.ComponentProps<typeof TaskRow>, 'dragAttributes' | 'dragListeners'>) {
  const terminal = props.task.status === 'feito' || props.task.status === 'arquivado';
  const draggable = useDraggable({ id: props.task.id, data: { task: props.task }, disabled: terminal });
  return (
    <div ref={draggable.setNodeRef} style={{ transform: CSS.Translate.toString(draggable.transform), opacity: draggable.isDragging ? 0.45 : 1 }}>
      <TaskRow {...props} dragAttributes={draggable.attributes} dragListeners={draggable.listeners} />
    </div>
  );
}

function GroupSection({ group, children, collapsed, onToggle }: { group: TaskGroup; children: React.ReactNode; collapsed: boolean; onToggle(): void }) {
  const droppable = useDroppable({ id: group.id, disabled: group.id === 'done' || group.id === 'archived' });
  return (
    <section ref={droppable.setNodeRef} className="task-movement-group" data-over={droppable.isOver || undefined}>
      <button type="button" className="task-group-heading" aria-expanded={!collapsed} onClick={onToggle}>
        <ChevronDown aria-hidden="true" /><strong>{group.label}</strong><span>{group.tasks.length}</span>
      </button>
      {!collapsed ? <div className="task-group-rows" role="list">{children}</div> : null}
    </section>
  );
}

export function TaskGroupList(props: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const [waitingTask, setWaitingTask] = useState<TaskBacklogItem | null>(null);

  function requestMove(task: TaskBacklogItem, movement: TaskMovement) {
    if (movement === 'waiting') setWaitingTask(task);
    else void props.onMove(task, movement);
  }

  function dragEnd(event: DragEndEvent) {
    const task = event.active.data.current?.task as TaskBacklogItem | undefined;
    const movement = event.over?.id as TaskMovement | undefined;
    if (task && movement && ['in_progress', 'next', 'waiting', 'future'].includes(movement)) requestMove(task, movement);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={dragEnd}>
        <div className="task-group-list">
          {props.groups.map((group) => (
            <GroupSection key={group.id} group={group} collapsed={props.collapsedGroups.has(group.id)} onToggle={() => props.onToggleGroup(group.id)}>
              {group.tasks.map((task) => (
                <DraggableRow
                  key={task.id}
                  task={task}
                  date={props.date}
                  selected={props.selectedTaskId === task.id}
                  busy={props.busyTaskIds.has(task.id)}
                  onOpen={() => props.onOpen(task)}
                  onComplete={() => props.onComplete(task)}
                  onMove={(movement) => requestMove(task, movement)}
                />
              ))}
            </GroupSection>
          ))}
        </div>
      </DndContext>
      <TaskWaitingDialog
        open={Boolean(waitingTask)}
        taskTitle={waitingTask?.title ?? ''}
        onClose={() => setWaitingTask(null)}
        onConfirm={(values) => waitingTask ? props.onMove(waitingTask, 'waiting', values) : undefined}
      />
    </>
  );
}
