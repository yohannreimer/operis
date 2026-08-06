import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, CheckSquare2, Clock3, MoreHorizontal, Zap } from 'lucide-react';

import type { AgendaBlock, AgendaWeek, CommitmentOccurrence } from '../../api';
import { blockAccessibleName } from './planner-block';
import type { AgendaWeekController, PlannerBlockModel } from './types';

const longDate = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
});
const shortWeekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow', timeZone: 'UTC' });
const monthDay = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function dateAtNoon(date: string) {
  return new Date(`${date}T12:00:00.000Z`);
}

function time(value: string) {
  return value.match(/(?:T|^)(\d{2}:\d{2})/)?.[1] ?? value;
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function commitmentToBlock(item: CommitmentOccurrence): PlannerBlockModel | null {
  if (!item.startTime) return null;
  const startTime = `${item.date}T${item.startTime}:00.000Z`;
  return {
    id: item.id,
    kind: 'commitment',
    sourceId: item.commitmentId,
    date: item.date,
    title: item.title,
    startTime,
    endTime: addMinutes(startTime, item.durationMin ?? 30),
    completedAt: null,
    workspaceId: item.workspaceId,
    plannedMinutes: item.durationMin ?? 30,
    recurring: item.recurring,
    rescheduled: item.rescheduled
  };
}

function MobileBlock({
  block,
  onOpen,
  onMove,
  onComplete
  ,planning = true
}: {
  block: PlannerBlockModel;
  onOpen(block: PlannerBlockModel): void;
  onMove(block: AgendaBlock): void;
  onComplete(block: AgendaBlock): void;
  planning?: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(block.date);
  const [startTime, setStartTime] = useState(time(block.startTime));
  const [duration, setDuration] = useState(block.plannedMinutes);
  const Icon = block.kind === 'commitment' ? CalendarDays : block.kind === 'task' ? CheckSquare2 : Zap;

  function startPress() {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      if (block.kind !== 'commitment') setMoving(true);
    }, 450);
  }

  function endPress() {
    if (timer.current) clearTimeout(timer.current);
  }

  return (
    <article className={`agenda-mobile-block agenda-mobile-block--${block.kind}`} data-completed={Boolean(block.completedAt) || undefined}>
      <span className="agenda-mobile-block-time">{time(block.startTime)}</span>
      <button
        type="button"
        className="agenda-mobile-block-main"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onClick={() => { if (!longPressed.current) onOpen(block); }}
        aria-label={blockAccessibleName(block)}
      >
        <Icon aria-hidden="true" />
        <span><strong>{block.title}</strong><small>{block.plannedMinutes} min</small></span>
      </button>
      {block.kind !== 'commitment' ? (
        <div className="agenda-mobile-block-controls">
          <button type="button" aria-label={`${block.completedAt ? 'Reabrir' : 'Concluir'} ${block.title}`} onClick={() => onComplete(block)}><Check aria-hidden="true" /></button>
          {planning ? <button type="button" aria-label={`Mover ${block.title}`} onClick={() => setMoving(true)}><MoreHorizontal aria-hidden="true" /></button> : null}
        </div>
      ) : null}
      {moving && block.kind !== 'commitment' ? (
        <div className="agenda-mobile-move-sheet" role="dialog" aria-label={`Mover ${block.title}`}>
          <label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Horário<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
          <label>Duração<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{[15, 30, 45, 60, 90, 120].map((value) => <option key={value} value={value}>{value} min</option>)}</select></label>
          <button type="button" onClick={() => {
            const nextStart = `${date}T${startTime}:00.000Z`;
            onMove({ ...block, date, startTime: nextStart, endTime: addMinutes(nextStart, duration), plannedMinutes: duration });
            setMoving(false);
          }}>Confirmar mudança</button>
        </div>
      ) : null}
    </article>
  );
}

type Props = {
  week: AgendaWeek;
  selectedDate: string;
  controller: AgendaWeekController;
  onSelectedDateChange?(date: string): void;
  onOpenBlock?(block: PlannerBlockModel): void;
  mode?: 'week' | 'single-day';
};

export function MobileDayTimeline({
  week,
  selectedDate,
  controller,
  onSelectedDateChange,
  onOpenBlock = () => undefined,
  mode = 'week'
}: Props) {
  const [date, setDate] = useState(selectedDate);
  const touchStartX = useRef<number | null>(null);
  useEffect(() => setDate(selectedDate), [selectedDate]);
  const selected = week.days.find((day) => day.date === date) ?? week.days[0];
  const blocks = useMemo(() => {
    if (!selected) return [];
    return [
      ...selected.commitments.map(commitmentToBlock).filter((item): item is PlannerBlockModel => Boolean(item)),
      ...selected.blocks
    ].sort((left, right) => left.startTime.localeCompare(right.startTime));
  }, [selected]);

  function choose(nextDate: string) {
    setDate(nextDate);
    onSelectedDateChange?.(nextDate);
  }

  function finishSwipe(clientX: number) {
    if (touchStartX.current === null) return;
    const distance = clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 48) return;
    const currentIndex = week.days.findIndex((day) => day.date === selected.date);
    const nextIndex = Math.max(0, Math.min(week.days.length - 1, currentIndex + (distance < 0 ? 1 : -1)));
    if (nextIndex !== currentIndex) choose(week.days[nextIndex].date);
  }

  if (!selected) return null;
  const label = longDate.format(dateAtNoon(selected.date));

  return (
    <section
      className="agenda-mobile-timeline"
      aria-label={`Linha do tempo de ${label}`}
      tabIndex={mode === 'single-day' ? -1 : undefined}
      onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}
    >
      {mode === 'week' ? <nav className="agenda-mobile-week-strip" aria-label="Dias da semana">
        {week.days.map((day) => {
          const value = dateAtNoon(day.date);
          const planned = day.blocks.reduce((sum, block) => sum + block.plannedMinutes, 0) + day.commitments.reduce((sum, item) => sum + (item.durationMin ?? 30), 0);
          return (
            <button
              type="button"
              key={day.date}
              aria-label={`Selecionar ${longDate.format(value)}`}
              aria-current={day.date === selected.date ? 'date' : undefined}
              onClick={() => choose(day.date)}
            >
              <span>{shortWeekday.format(value)}</span>
              <strong>{value.getUTCDate()}</strong>
              <i style={{ '--agenda-load': Math.min(1, planned / 480) } as React.CSSProperties} />
            </button>
          );
        })}
      </nav> : null}
      <header className="agenda-mobile-day-heading">
        <div><span className="agenda-eyebrow">{monthDay.format(dateAtNoon(selected.date))}</span><h2>{label.split(',')[0]}</h2></div>
        <span><Clock3 aria-hidden="true" /> {blocks.reduce((sum, block) => sum + block.plannedMinutes, 0)} min</span>
      </header>
      {selected.intents.length ? (
        <ul className="agenda-mobile-intents" aria-label="Foco do dia">
          {selected.intents.map((intent) => <li key={intent.id}>{intent.title}</li>)}
        </ul>
      ) : null}
      <div className="agenda-mobile-block-list">
        {blocks.map((block) => (
          <MobileBlock
            key={block.id}
            block={block}
            onOpen={onOpenBlock}
            onMove={(next) => void controller.moveBlock(next.id, { date: next.date, startTime: next.startTime, endTime: next.endTime })}
            onComplete={(next) => void controller.setBlockCompleted(next.id, !next.completedAt)}
            planning={mode === 'week'}
          />
        ))}
        {!blocks.length ? <p className="agenda-mobile-empty">Nada marcado.</p> : null}
      </div>
    </section>
  );
}
