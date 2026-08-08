import { useCallback, useMemo, useRef, useState } from 'react';
import { CalendarRange, Inbox, Plus, Square, X } from 'lucide-react';

import type { AgendaBlock, AgendaWeek, ExecutionSession } from '../../api';
import { Button } from '../../components/ui';
import { MobileDayTimeline } from '../agenda/mobile-day-timeline';
import type { AgendaWeekController } from '../agenda/types';
import { InboxTray } from './inbox-tray';
import { RolloverReview } from './rollover-review';
import { TodayExecutionList } from './today-execution-list';
import { useTodayWorkspace } from './use-today-workspace';
import type { TodayEntry } from './types';
import '../agenda/agenda.css';

type Props = {
  date: string;
  initialInboxOpen?: boolean;
};

function formatLongDate(date: string) {
  const formatted = new Date(`${date}T12:00:00.000Z`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function duration(startTime: string, endTime: string) {
  return Math.max(15, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000));
}

function NowPanel({
  session,
  onStop,
  onCancel
}: {
  session: ExecutionSession | null;
  onStop(): void;
  onCancel(): void;
}) {
  if (!session) return null;
  return (
    <section className="today-now" aria-labelledby="today-now-title">
      <div className="today-now__pulse" aria-hidden="true" />
      <div>
        <span>Agora</span>
        <h2 id="today-now-title">{session.title}</h2>
        <small>Iniciado às {new Date(session.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
      <div className="today-now__actions">
        <button type="button" onClick={onStop}><Square aria-hidden="true" />Encerrar</button>
        <button type="button" aria-label="Cancelar execução atual" onClick={onCancel}><X aria-hidden="true" /></button>
      </div>
    </section>
  );
}

export function TodayWorkspace({ date, initialInboxOpen = false }: Props) {
  const state = useTodayWorkspace(date);
  const [inboxOpen, setInboxOpen] = useState(initialInboxOpen);
  const timelineContainer = useRef<HTMLDivElement>(null);
  const dateLabel = formatLongDate(date);

  const timelineWeek = useMemo<AgendaWeek>(() => {
    const entryBySource = new Map(state.entries.map((entry) => [`${entry.kind}:${entry.sourceId}`, entry]));
    const blocks: AgendaBlock[] = state.dayPlan.items.flatMap((item) => {
      const kind = item.taskId ? 'task' as const : item.inboxItemId ? 'inbox' as const : null;
      const sourceId = item.taskId ?? item.inboxItemId;
      if (!kind || !sourceId) return [];
      const entry = entryBySource.get(`${kind}:${sourceId}`);
      return [{
        id: item.id,
        kind,
        sourceId,
        date,
        title: item.task?.title ?? item.inboxItem?.content ?? entry?.title ?? 'Bloco planejado',
        startTime: item.startTime,
        endTime: item.endTime,
        completedAt: item.completedAt,
        workspaceId: item.task?.workspaceId ?? item.inboxItem?.workspaceId ?? null,
        plannedMinutes: duration(item.startTime, item.endTime)
      }];
    });
    return {
      weekStart: date,
      resourceErrors: { commitments: state.agendaError },
      days: [{
        date,
        intents: [],
        blocks,
        commitments: state.commitments.map((item) => ({
          id: `${item.id}:${date}`,
          commitmentId: item.id,
          date,
          title: item.title,
          startTime: item.startTime,
          durationMin: item.durationMin,
          workspaceId: item.workspaceId,
          recurring: item.recurrenceDays.length > 0,
          rescheduled: false
        }))
      }],
      unscheduled: { tasks: [], inbox: [] }
    };
  }, [date, state.agendaError, state.commitments, state.dayPlan.items, state.entries]);

  const timelineController = useMemo<AgendaWeekController>(() => ({
    week: timelineWeek,
    loading: state.loading,
    error: state.dayPlanError,
    reload: state.reload,
    scheduleSource: async () => undefined,
    moveBlock: async () => undefined,
    resizeBlock: async () => undefined,
    setBlockCompleted: async (id, completed) => {
      const item = state.dayPlan.items.find((candidate) => candidate.id === id);
      if (item) await state.setPlannedBlockCompleted(item, completed);
    },
    removeBlock: async () => undefined
  }), [state, timelineWeek]);

  const plannedSources = useMemo(
    () => new Set(state.dayPlan.items.flatMap((item) => item.taskId
      ? [`task:${item.taskId}`]
      : item.inboxItemId ? [`inbox:${item.inboxItemId}`] : [])),
    [state.dayPlan.items]
  );
  const pending = state.entries.filter((entry) =>
    !entry.completedAt && !plannedSources.has(`${entry.kind}:${entry.sourceId}`)
  );
  const completed = state.entries.filter((entry) => Boolean(entry.completedAt));

  const focusTimeline = useCallback(() => {
    const target = timelineContainer.current?.querySelector<HTMLElement>('[aria-label^="Linha do tempo"]');
    target?.focus();
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  function entryForBlock(block: AgendaBlock): TodayEntry | null {
    return state.entries.find((entry) => entry.kind === block.kind && entry.sourceId === block.sourceId) ?? null;
  }

  return (
    <main className="today-workspace">
      <header className="today-workspace__header">
        <div className="today-workspace__date"><h1 aria-label={`Hoje — ${dateLabel}`}>{dateLabel}</h1></div>
        <div className="today-workspace__header-actions">
          <button type="button" className="today-workspace__inbox-trigger" aria-label={`Inbox · ${state.inboxCount}`} onClick={() => setInboxOpen(true)}>
            <Inbox aria-hidden="true" size={16} /><span>Inbox</span><strong>{state.inboxCount}</strong>
          </button>
          <button type="button" className="today-workspace__planner-trigger" onClick={focusTimeline}>
            <CalendarRange aria-hidden="true" size={16} /><span>Planejar</span>
          </button>
        </div>
      </header>

      <NowPanel session={state.activeSession} onStop={() => void state.stopSession()} onCancel={() => void state.cancelSession()} />

      {state.error ? (
        <div className="today-workspace__error" role="alert" aria-live="polite"><span>{state.error}</span><button type="button" onClick={() => void state.reload()}>Tentar novamente</button></div>
      ) : null}

      {state.loading ? (
        <div className="today-workspace__loading" aria-label="Carregando o dia"><span /><span /><span /></div>
      ) : (
        <>
          <RolloverReview items={state.rollover} targetDate={date} onResolve={(item, action) => void state.resolveRollover(item, action)} />

          <section className="today-zone" aria-labelledby="today-intents-title">
            <header><span>Intenção</span><h2 id="today-intents-title">Para hoje</h2></header>
            <TodayExecutionList
              entries={pending}
              label="Para hoje"
              onToggle={(item) => void state.toggleCompleted(item)}
              onRemove={(item) => void state.removeFromToday(item)}
              onReorder={(orderedIds) => void state.reorder(orderedIds)}
              onStart={(item) => void state.startSession(item)}
            />
            <Button
              variant="tertiary"
              size="sm"
              className="today-workspace__add"
              leadingIcon={<Plus aria-hidden="true" size={16} />}
              onClick={() => setInboxOpen(true)}
            >
              Adicionar item
            </Button>
          </section>

          <section className="today-zone today-zone--timeline" aria-labelledby="today-timeline-title">
            <header><span>Tempo reservado</span><h2 id="today-timeline-title">Linha do tempo</h2></header>
            {state.dayPlanError ? <p className="today-workspace__resource-error" aria-live="polite">{state.dayPlanError}</p> : null}
            <div ref={timelineContainer} className="today-timeline-shell">
              <MobileDayTimeline
                week={timelineWeek}
                selectedDate={date}
                controller={timelineController}
                mode="single-day"
                onOpenBlock={(block) => {
                  if (block.kind === 'commitment') return;
                  const entry = entryForBlock(block);
                  if (entry) void state.startSession(entry);
                }}
              />
            </div>
          </section>

          {completed.length ? (
            <section className="today-zone today-zone--completed" aria-labelledby="today-completed-title">
              <header><span>Registro</span><h2 id="today-completed-title">Concluídas hoje</h2></header>
              <TodayExecutionList
                entries={completed}
                label="Concluídas hoje"
                reorderable={false}
                onToggle={(item) => void state.toggleCompleted(item)}
                onRemove={(item) => void state.removeFromToday(item)}
                onReorder={() => undefined}
                onStart={() => undefined}
              />
            </section>
          ) : null}
        </>
      )}

      {state.inboxError ? <p className="today-workspace__resource-error" aria-live="polite">{state.inboxError}</p> : null}
      <InboxTray open={inboxOpen} onClose={() => setInboxOpen(false)} date={date} onAddToToday={state.addInboxToToday} />
    </main>
  );
}
