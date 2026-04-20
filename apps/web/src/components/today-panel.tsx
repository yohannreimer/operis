import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { InboxTodayItem } from '../api';
import { TodayItem } from './today-item';

type Props = {
  items: InboxTodayItem[];
  onComplete: (todayItem: InboxTodayItem) => void;
  onUncomplete: (todayItem: InboxTodayItem) => void;
};

export function TodayPanel({ items, onComplete, onUncomplete }: Props) {
  const [showDone, setShowDone] = useState(false);

  const pending = items.filter((i) => i.completedAt === null);
  const done = items.filter((i) => i.completedAt !== null);

  const { setNodeRef, isOver } = useDroppable({ id: 'today-panel-drop' });

  return (
    <div className="today-panel">
      <div className="today-panel-header">
        <span className="today-panel-title">Hoje</span>
        {pending.length > 0 && (
          <span className="today-panel-count">{pending.length}</span>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`today-panel-body${isOver ? ' today-panel-body--over' : ''}`}
      >
        <SortableContext
          items={pending.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {pending.length === 0 ? (
            <div className={`today-panel-empty${isOver ? ' today-panel-empty--over' : ''}`}>
              Arraste tarefas aqui para planejar seu dia
            </div>
          ) : (
            pending.map((item) => (
              <TodayItem
                key={item.id}
                todayItem={item}
                onComplete={onComplete}
                onUncomplete={onUncomplete}
              />
            ))
          )}
        </SortableContext>

        {done.length > 0 && (
          <div className="today-panel-done-section">
            <button
              type="button"
              className="today-panel-done-toggle ghost-button"
              onClick={() => setShowDone((v) => !v)}
            >
              {showDone ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Feitos ({done.length})</span>
            </button>
            {showDone && (
              <div className="today-panel-done-items">
                {done.map((item) => (
                  <TodayItem
                    key={item.id}
                    todayItem={item}
                    onComplete={onComplete}
                    onUncomplete={onUncomplete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
