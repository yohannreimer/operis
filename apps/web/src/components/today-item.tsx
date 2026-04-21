import { Play, Pause, Square, Star, X } from 'lucide-react';
import { InboxTodayItem } from '../api';

function formatTimerSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type TodayItemTimerState = {
  seconds: number;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
};

type Props = {
  todayItem: InboxTodayItem;
  onComplete: (todayItem: InboxTodayItem) => void;
  onUncomplete: (todayItem: InboxTodayItem) => void;
  onRemove: (todayItem: InboxTodayItem) => void;
  isMIT?: boolean;
  onToggleMIT?: () => void;
  timer?: TodayItemTimerState;
};

export function TodayItem({
  todayItem,
  onComplete,
  onUncomplete,
  onRemove,
  isMIT = false,
  onToggleMIT,
  timer,
}: Props) {
  const completed = todayItem.completedAt !== null;
  const timerStarted = timer && (timer.running || timer.seconds > 0);

  return (
    <div
      className={`today-item${completed ? ' today-item--completed' : ''}${isMIT ? ' today-item--mit' : ''}`}
    >
      <button
        type="button"
        className={`today-item-checkbox${completed ? ' today-item-checkbox--checked' : ''}`}
        onClick={() => (completed ? onUncomplete(todayItem) : onComplete(todayItem))}
        aria-label={completed ? 'Desmarcar' : 'Concluir'}
      />

      <span className="today-item-content">{todayItem.inboxItem.content}</span>

      {/* Timer area — only for pending items */}
      {!completed && timer && (
        <div className="today-item-timer">
          {timer.running ? (
            /* Running state */
            <>
              <span className="today-item-timer-dot" />
              <span className="today-item-timer-display">{formatTimerSeconds(timer.seconds)}</span>
              <button
                type="button"
                className="today-item-timer-btn"
                onClick={timer.onPause}
                aria-label="Pausar"
                title="Pausar"
              >
                <Pause size={10} />
              </button>
              <button
                type="button"
                className="today-item-timer-btn"
                onClick={timer.onStop}
                aria-label="Encerrar"
                title="Encerrar"
              >
                <Square size={10} />
              </button>
            </>
          ) : timerStarted ? (
            /* Paused state */
            <>
              <span className="today-item-timer-display today-item-timer-display--paused">
                {formatTimerSeconds(timer.seconds)}
              </span>
              <button
                type="button"
                className="today-item-timer-btn"
                onClick={timer.onStart}
                aria-label="Retomar"
                title="Retomar"
              >
                <Play size={10} />
              </button>
              <button
                type="button"
                className="today-item-timer-btn"
                onClick={timer.onStop}
                aria-label="Encerrar"
                title="Encerrar"
              >
                <Square size={10} />
              </button>
            </>
          ) : (
            /* Idle state — play button on hover */
            <button
              type="button"
              className="today-item-play-btn"
              onClick={timer.onStart}
              aria-label="Iniciar cronômetro"
              title="Iniciar cronômetro"
            >
              <Play size={11} />
            </button>
          )}
        </div>
      )}

      {/* MIT star — only for pending items, hover-revealed */}
      {!completed && onToggleMIT && (
        <button
          type="button"
          className={`today-item-mit-btn${isMIT ? ' today-item-mit-btn--active' : ''}`}
          onClick={onToggleMIT}
          aria-label={isMIT ? 'Remover prioridade' : 'Marcar como prioridade máxima'}
          title={isMIT ? 'Remover MIT' : 'MIT — Most Important Task'}
        >
          <Star size={11} fill={isMIT ? 'currentColor' : 'none'} />
        </button>
      )}

      {/* Remove button — hover-revealed */}
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
