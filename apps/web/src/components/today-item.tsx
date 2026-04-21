import { X } from 'lucide-react';
import { InboxTodayItem } from '../api';

type Props = {
  todayItem: InboxTodayItem;
  onComplete: (todayItem: InboxTodayItem) => void;
  onUncomplete: (todayItem: InboxTodayItem) => void;
  onRemove: (todayItem: InboxTodayItem) => void;
};

export function TodayItem({ todayItem, onComplete, onUncomplete, onRemove }: Props) {
  const completed = todayItem.completedAt !== null;

  return (
    <div className={`today-item${completed ? ' today-item--completed' : ''}`}>
      <button
        type="button"
        className={`today-item-checkbox${completed ? ' today-item-checkbox--checked' : ''}`}
        onClick={() => (completed ? onUncomplete(todayItem) : onComplete(todayItem))}
        aria-label={completed ? 'Desmarcar' : 'Concluir'}
      />
      <span className="today-item-content">{todayItem.inboxItem.content}</span>
      <button
        type="button"
        className="today-item-remove"
        onClick={() => onRemove(todayItem)}
        aria-label="Remover do Hoje"
        title="Remover do Hoje"
      >
        <X size={11} />
      </button>
    </div>
  );
}
