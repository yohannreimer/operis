import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { InboxTodayItem } from '../api';
import { TodayItem, TodayItemTimerState } from './today-item';

function formatTotalTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m > 0 ? `${m}min` : ''}`.trim();
  return `${m}min`;
}

export type TimerHandlers = {
  getItemSeconds: (id: string) => number;
  isRunning: (id: string) => boolean;
  onStart: (id: string) => void;
  onPause: () => void;
  onStop: (id: string) => void;
  totalDaySeconds: number;
};

type Props = {
  items: InboxTodayItem[];
  onComplete: (todayItem: InboxTodayItem) => void;
  onUncomplete: (todayItem: InboxTodayItem) => void;
  onRemove: (todayItem: InboxTodayItem) => void;
  mitItemId: string | null;
  onToggleMIT: (id: string) => void;
  timerHandlers: TimerHandlers;
};

export function TodayPanel({
  items,
  onComplete,
  onUncomplete,
  onRemove,
  mitItemId,
  onToggleMIT,
  timerHandlers,
}: Props) {
  const [showDone, setShowDone] = useState(false);

  const pending = items.filter((i) => i.completedAt === null);
  const done = items.filter((i) => i.completedAt !== null);

  // MIT always first
  const sortedPending = [
    ...pending.filter((i) => i.id === mitItemId),
    ...pending.filter((i) => i.id !== mitItemId),
  ];

  function buildTimerState(itemId: string): TodayItemTimerState {
    return {
      seconds: timerHandlers.getItemSeconds(itemId),
      running: timerHandlers.isRunning(itemId),
      onStart: () => timerHandlers.onStart(itemId),
      onPause: timerHandlers.onPause,
      onStop: () => timerHandlers.onStop(itemId),
    };
  }

  return (
    <div className="today-panel">
      <div className="today-panel-header">
        <span className="today-panel-title">Hoje</span>
        {pending.length > 0 && (
          <span className="today-panel-count">{pending.length}</span>
        )}
        {timerHandlers.totalDaySeconds >= 60 && (
          <span className="today-panel-time">{formatTotalTime(timerHandlers.totalDaySeconds)}</span>
        )}
      </div>

      <div className="today-panel-body">
        {sortedPending.length === 0 ? (
          <div className="today-panel-empty">
            Clique no ☀︎ ao lado de um item para planejar seu dia
          </div>
        ) : (
          sortedPending.map((item) => (
            <TodayItem
              key={item.id}
              todayItem={item}
              onComplete={onComplete}
              onUncomplete={onUncomplete}
              onRemove={onRemove}
              isMIT={item.id === mitItemId}
              onToggleMIT={() => onToggleMIT(item.id)}
              timer={buildTimerState(item.id)}
            />
          ))
        )}

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
                    onRemove={onRemove}
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
