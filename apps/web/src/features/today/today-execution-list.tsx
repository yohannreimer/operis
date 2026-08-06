import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { TodayEntry } from './types';
import { TodayExecutionRow } from './today-execution-row';

type Props = {
  entries: TodayEntry[];
  onToggle(entry: TodayEntry): void;
  onRemove(entry: TodayEntry): void;
  onReorder(orderedIds: string[]): void;
};

type SortableRowProps = {
  entry: TodayEntry;
  index: number;
  total: number;
  onToggle(entry: TodayEntry): void;
  onRemove(entry: TodayEntry): void;
  onMove(index: number, direction: -1 | 1): void;
};

function SortableRow(props: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.entry.id
  });

  return (
    <TodayExecutionRow
      {...props}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : undefined,
        opacity: isDragging ? 0.72 : undefined
      }}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

export function TodayExecutionList({ entries, onToggle, onRemove, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= entries.length) {
      return;
    }
    onReorder(arrayMove(entries, index, nextIndex).map((entry) => entry.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = entries.findIndex((entry) => entry.id === active.id);
    const newIndex = entries.findIndex((entry) => entry.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onReorder(arrayMove(entries, oldIndex, newIndex).map((entry) => entry.id));
  }

  if (entries.length === 0) {
    return (
      <div className="today-execution-list__empty">
        <p>Seu dia está livre.</p>
        <span>Puxe algo do Inbox ou adicione uma tarefa quando fizer sentido.</span>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
        <ul className="today-execution-list" aria-label="Execução de hoje">
          {entries.map((entry, index) => (
            <SortableRow
              key={entry.id}
              entry={entry}
              index={index}
              total={entries.length}
              onToggle={onToggle}
              onRemove={onRemove}
              onMove={move}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
