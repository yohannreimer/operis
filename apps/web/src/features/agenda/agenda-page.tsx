import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarClock, ChevronLeft, ChevronRight, Plus, RefreshCw, X } from 'lucide-react';

import type { Commitment, CommitmentOccurrence } from '../../api';
import { todayIsoDate, toIsoDateTime } from '../../utils/date';
import { BlockInspector } from './block-inspector';
import { MobileDayTimeline } from './mobile-day-timeline';
import { PlanningDrawer } from './planning-drawer';
import { RoutineManager } from './routine-manager';
import type { PlannerBlockModel, PlannerSource } from './types';
import { useAgendaWeek } from './use-agenda-week';
import { WeekTimeline } from './week-timeline';
import './agenda.css';

function mondayKey(date: Date) {
  const value = new Date(date);
  value.setHours(12, 0, 0, 0);
  const weekday = value.getDay();
  value.setDate(value.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

const dateRange = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric', month: 'short', timeZone: 'UTC'
});

function rangeLabel(start: string) {
  const end = shiftDate(start, 6);
  return `${dateRange.format(new Date(`${start}T12:00:00.000Z`))} – ${dateRange.format(new Date(`${end}T12:00:00.000Z`))}`;
}

function routineOccurrence(routine: Commitment, fallbackDate: string): CommitmentOccurrence {
  return {
    id: `${routine.id}:${fallbackDate}`,
    commitmentId: routine.id,
    date: routine.date?.slice(0, 10) ?? fallbackDate,
    title: routine.title,
    startTime: routine.startTime,
    durationMin: routine.durationMin,
    workspaceId: routine.workspaceId,
    recurring: routine.recurrenceDays.length > 0,
    rescheduled: false
  };
}

export function AgendaPage() {
  const [weekStart, setWeekStart] = useState(() => mondayKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => todayIsoDate());
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const [inspector, setInspector] = useState<{
    mode: 'create' | 'edit';
    block?: PlannerBlockModel | CommitmentOccurrence;
  } | null>(null);
  const controller = useAgendaWeek(weekStart);
  const week = controller?.week ?? null;
  const title = useMemo(() => rangeLabel(weekStart), [weekStart]);

  function moveWeek(days: number) {
    const next = shiftDate(weekStart, days);
    setWeekStart(next);
    setSelectedDate(days > 0 ? next : shiftDate(next, 6));
  }

  function goToday() {
    const today = todayIsoDate();
    setWeekStart(mondayKey(new Date(`${today}T12:00:00`)));
    setSelectedDate(today);
  }

  function scheduleOnSelectedDay(source: PlannerSource, time: string) {
    return controller?.scheduleSource(source, toIsoDateTime(selectedDate, time));
  }

  return (
    <main className="agenda-studio">
      <header className="agenda-studio-toolbar">
        <div className="agenda-studio-title">
          <span className="agenda-eyebrow">Estúdio de tempo</span>
          <h1>Agenda</h1>
        </div>
        <div className="agenda-week-controls" aria-label="Navegação da semana">
          <button type="button" aria-label="Semana anterior" onClick={() => moveWeek(-7)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" className="agenda-week-label" onClick={goToday}>{title}</button>
          <button type="button" aria-label="Próxima semana" onClick={() => moveWeek(7)}><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="agenda-studio-actions">
          <button type="button" onClick={goToday}>Hoje</button>
          <button type="button" aria-label="Abrir Rotinas" onClick={() => setRoutinesOpen(true)}><RefreshCw aria-hidden="true" /><span>Rotinas</span></button>
          <button type="button" className="agenda-new-block" onClick={() => setInspector({ mode: 'create' })}><Plus aria-hidden="true" /><span>Novo bloco</span></button>
        </div>
      </header>

      {controller?.error && !week ? (
        <div className="agenda-page-error" role="alert">
          <p>{controller.error}</p>
          <button type="button" onClick={() => void controller.reload()}>Tentar novamente</button>
        </div>
      ) : null}
      {controller?.loading && !week ? (
        <div className="agenda-page-loading" aria-label="Carregando Agenda"><span /><span /><span /></div>
      ) : null}

      {week ? (
        <>
          {week.resourceErrors.commitments ? (
            <p className="agenda-resource-warning" aria-live="polite"><CalendarClock aria-hidden="true" />{week.resourceErrors.commitments}</p>
          ) : null}
          <section data-testid="agenda-desktop" className="agenda-studio__desktop">
            <WeekTimeline
              week={week}
              controller={controller}
              onOpenBlock={(block) => setInspector({ mode: 'edit', block })}
            />
          </section>
          <section data-testid="agenda-mobile" className="agenda-studio__mobile">
            <MobileDayTimeline
              week={week}
              selectedDate={week.days.some((day) => day.date === selectedDate) ? selectedDate : week.days[0]?.date ?? selectedDate}
              onSelectedDateChange={setSelectedDate}
              controller={controller}
              onOpenBlock={(block) => setInspector({ mode: 'edit', block })}
            />
            <PlanningDrawer sources={week.unscheduled} onSchedule={scheduleOnSelectedDay} />
          </section>
        </>
      ) : null}

      {inspector ? (
        <BlockInspector
          mode={inspector.mode}
          block={inspector.block}
          defaultDate={selectedDate}
          open
          onOpenChange={(open) => { if (!open) setInspector(null); }}
        />
      ) : null}

      <Dialog.Root open={routinesOpen} onOpenChange={setRoutinesOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="agenda-inspector-overlay" />
          <Dialog.Content className="agenda-routines-dialog" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Rotinas</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="agenda-routines-close" aria-label="Fechar Rotinas"><X aria-hidden="true" /></button></Dialog.Close>
            <RoutineManager onEdit={(routine) => {
              setRoutinesOpen(false);
              setInspector({ mode: 'edit', block: routineOccurrence(routine, selectedDate) });
            }} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
