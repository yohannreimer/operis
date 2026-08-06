import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { CalendarRange, Inbox, Plus, X } from 'lucide-react';

import { CompactAgenda } from './compact-agenda';
import { InboxTray } from './inbox-tray';
import { RolloverReview } from './rollover-review';
import { TodayExecutionList } from './today-execution-list';
import { useTodayWorkspace } from './use-today-workspace';
import { useModalFocus } from './use-modal-focus';

const LazyPlannerMode = lazy(() => import('./planner-mode').then((module) => ({
  default: module.PlannerMode
})));

type Props = {
  date: string;
  initialInboxOpen?: boolean;
};

function formatLongDate(date: string) {
  const formatted = new Date(`${date}T12:00:00.000Z`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

type PlannerSurfaceProps = {
  date: string;
  onClose(): void;
};

function PlannerSurface({ date, onClose }: PlannerSurfaceProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const plannerRef = useRef<HTMLElement>(null);
  useModalFocus({ active: true, containerRef: plannerRef, initialFocusRef: closeRef, onClose });

  return (
    <div
      className="planner-surface__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={plannerRef}
        className="planner-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-surface-title"
      >
        <header className="planner-surface__header">
          <div>
            <span>Organizar horários e blocos</span>
            <h2 id="planner-surface-title">Planejar o dia</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="Fechar planejamento" onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="planner-surface__content">
          <Suspense fallback={<div className="today-workspace__loading">Carregando planejador…</div>}>
            <LazyPlannerMode initialDate={date} />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

export function TodayWorkspace({ date, initialInboxOpen = false }: Props) {
  const state = useTodayWorkspace(date);
  const [inboxOpen, setInboxOpen] = useState(initialInboxOpen);
  const [plannerOpen, setPlannerOpen] = useState(false);

  useEffect(() => {
    if (initialInboxOpen) {
      setInboxOpen(true);
    }
  }, [initialInboxOpen]);

  const closeInbox = useCallback(() => setInboxOpen(false), []);
  const closePlanner = useCallback(() => setPlannerOpen(false), []);
  const dateLabel = formatLongDate(date);

  return (
    <main className="today-workspace">
      <header className="today-workspace__header">
        <div className="today-workspace__date">
          <h1 aria-label={`Hoje — ${dateLabel}`}>{dateLabel}</h1>
        </div>
        <div className="today-workspace__header-actions">
          <button
            type="button"
            className="today-workspace__inbox-trigger"
            aria-label={`Inbox · ${state.inboxCount}`}
            onClick={() => setInboxOpen(true)}
          >
            <Inbox aria-hidden="true" size={16} />
            <span>Inbox</span>
            <strong>{state.inboxCount}</strong>
          </button>
          <button
            type="button"
            className="today-workspace__planner-trigger"
            onClick={() => setPlannerOpen(true)}
          >
            <CalendarRange aria-hidden="true" size={16} />
            <span>Planejar</span>
          </button>
        </div>
      </header>

      <CompactAgenda commitments={state.commitments} error={state.agendaError} />

      {state.error ? (
        <div className="today-workspace__error" role="alert" aria-live="polite">
          <span>{state.error}</span>
          <button type="button" onClick={() => void state.reload()}>Tentar novamente</button>
        </div>
      ) : null}

      {state.loading ? (
        <div className="today-workspace__loading" aria-label="Carregando o dia">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <RolloverReview
            items={state.rollover}
            targetDate={date}
            onResolve={(item, action) => void state.resolveRollover(item, action)}
          />
          <TodayExecutionList
            entries={state.entries}
            onToggle={(item) => void state.toggleCompleted(item)}
            onRemove={(item) => void state.removeFromToday(item)}
            onReorder={(orderedIds) => void state.reorder(orderedIds)}
          />
        </>
      )}

      <button
        type="button"
        className="today-workspace__add"
        onClick={() => setInboxOpen(true)}
      >
        <Plus aria-hidden="true" size={16} />
        Adicionar item
      </button>

      {state.inboxError ? (
        <p className="today-workspace__resource-error" aria-live="polite">{state.inboxError}</p>
      ) : null}

      <InboxTray
        open={inboxOpen}
        onClose={closeInbox}
        date={date}
        onAddToToday={state.addInboxToToday}
      />
      {plannerOpen ? <PlannerSurface date={date} onClose={closePlanner} /> : null}
    </main>
  );
}
