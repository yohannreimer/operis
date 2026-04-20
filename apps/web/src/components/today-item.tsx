import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { InboxTodayItem } from '../api';

type Props = {
  todayItem: InboxTodayItem;
  onComplete: (todayItem: InboxTodayItem) => void;
  onUncomplete: (todayItem: InboxTodayItem) => void;
};

export function TodayItem({ todayItem, onComplete, onUncomplete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todayItem.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const completed = todayItem.completedAt !== null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`today-item${completed ? ' today-item--completed' : ''}`}
    >
      <button
        type="button"
        className={`today-item-checkbox${completed ? ' today-item-checkbox--checked' : ''}`}
        onClick={() => (completed ? onUncomplete(todayItem) : onComplete(todayItem))}
        aria-label={completed ? 'Desmarcar' : 'Concluir'}
      />
      <span className="today-item-content">{todayItem.inboxItem.content}</span>
      <span
        className="today-item-handle"
        {...attributes}
        {...listeners}
        aria-label="Arrastar para reordenar"
      >
        <GripVertical size={14} />
      </span>
    </div>
  );
}
