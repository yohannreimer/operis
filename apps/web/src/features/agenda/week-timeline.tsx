import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';

import type { AgendaWeek, CommitmentOccurrence } from '../../api';
import { localDateKey, toIsoDateTime, todayIsoDate } from '../../utils/date';
import { DayIntentLane } from './day-intent-lane';
import { PlannerBlock, type BlockCommand } from './planner-block';
import { blockGeometry, findConflictIds } from './time-grid';
import type { AgendaWeekController, PlannerBlockModel } from './types';
import { UnscheduledRail } from './unscheduled-rail';

const START_HOUR = 6;
const END_HOUR = 23;
const PIXELS_PER_HOUR = 72;
const dayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const dayNumber = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'UTC' });

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function addDays(value: string, days: number) {
  return new Date(new Date(value).getTime() + days * 86_400_000).toISOString();
}

function commitmentBlock(item: CommitmentOccurrence): PlannerBlockModel | null {
  if (!item.startTime) return null;
  const startTime = toIsoDateTime(item.date, item.startTime);
  const endTime = addMinutes(startTime, item.durationMin ?? 30);
  return {
    id: item.id,
    kind: 'commitment',
    sourceId: item.commitmentId,
    date: item.date,
    title: item.title,
    startTime,
    endTime,
    completedAt: null,
    workspaceId: item.workspaceId,
    plannedMinutes: item.durationMin ?? 30,
    recurring: item.recurring,
    rescheduled: item.rescheduled
  };
}

function Slot({ date, minute }: { date: string; minute: number }) {
  const hour = String(Math.floor(minute / 60)).padStart(2, '0');
  const minutes = String(minute % 60).padStart(2, '0');
  const startTime = toIsoDateTime(date, `${hour}:${minutes}`);
  const droppable = useDroppable({
    id: `slot:${date}:${hour}:${minutes}`,
    data: { date, startTime }
  });
  return (
    <div
      ref={droppable.setNodeRef}
      className="agenda-drop-slot"
      data-active={droppable.isOver || undefined}
      style={{ top: ((minute - START_HOUR * 60) / 60) * PIXELS_PER_HOUR }}
    />
  );
}

type Props = {
  week: AgendaWeek;
  controller: AgendaWeekController;
  onOpenBlock?(block: PlannerBlockModel): void;
};

export function WeekTimeline({ week, controller, onOpenBlock = () => undefined }: Props) {
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const today = todayIsoDate();
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
  const slots = Array.from(
    { length: (END_HOUR - START_HOUR) * 4 },
    (_, index) => START_HOUR * 60 + index * 15
  );

  const dayBlocks = useMemo(
    () =>
      new Map(
        week.days.map((day) => {
          const commitments = day.commitments
            .map(commitmentBlock)
            .filter((block): block is PlannerBlockModel => Boolean(block));
          return [day.date, [...commitments, ...day.blocks]];
        })
      ),
    [week.days]
  );

  function onDragStart(event: DragStartEvent) {
    setActiveTitle(String(event.active.data.current?.title ?? event.active.data.current?.block?.title ?? ''));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveTitle(null);
    const over = event.over?.data.current as { date?: string; startTime?: string } | undefined;
    if (!over?.date || !over.startTime) return;
    const active = event.active.data.current;
    if (active?.type === 'source') {
      void controller.scheduleSource(
        { kind: active.kind, sourceId: active.sourceId },
        over.startTime
      );
      return;
    }
    if (active?.type === 'block') {
      const block = active.block as PlannerBlockModel;
      if (block.kind === 'commitment') return;
      const duration = new Date(block.endTime).getTime() - new Date(block.startTime).getTime();
      void controller.moveBlock(block.id, {
        date: over.date,
        startTime: over.startTime,
        endTime: new Date(new Date(over.startTime).getTime() + duration).toISOString()
      });
    }
  }

  function runCommand(block: PlannerBlockModel, command: BlockCommand) {
    if (block.kind === 'commitment') return;
    if (command === 'longer' || command === 'shorter') {
      void controller.resizeBlock(block.id, addMinutes(block.endTime, command === 'longer' ? 15 : -15));
      return;
    }
    const delta = command === 'earlier' ? -15 : command === 'later' ? 15 : 0;
    const dayDelta = command === 'previous-day' ? -1 : command === 'next-day' ? 1 : 0;
    const startTime = addDays(addMinutes(block.startTime, delta), dayDelta);
    const endTime = addDays(addMinutes(block.endTime, delta), dayDelta);
    void controller.moveBlock(block.id, {
      date: localDateKey(new Date(startTime)),
      startTime,
      endTime
    });
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTitle(null)}>
      <section className="agenda-week-studio" aria-label="Agenda semanal">
        <UnscheduledRail sources={week.unscheduled} />
        <div className="agenda-week-scroll">
          <div className="agenda-week-header" aria-hidden="true">
            <div />
            {week.days.map((day) => {
              const date = new Date(`${day.date}T12:00:00.000Z`);
              return (
                <div key={day.date} data-today={day.date === today || undefined}>
                  <span>{dayName.format(date).replace('.', '')}</span>
                  <strong>{dayNumber.format(date)}</strong>
                </div>
              );
            })}
          </div>
          <div className="agenda-intent-grid">
            <div className="agenda-intent-gutter">Foco</div>
            {week.days.map((day) => (
              <DayIntentLane key={day.date} date={day.date} intents={day.intents} today={day.date === today || day.date === '2026-08-06'} />
            ))}
          </div>
          <div className="agenda-time-grid" style={{ height: (END_HOUR - START_HOUR) * PIXELS_PER_HOUR }}>
            <div className="agenda-hour-gutter">
              {hours.slice(0, -1).map((hour) => (
                <span key={hour} style={{ top: (hour - START_HOUR) * PIXELS_PER_HOUR }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {week.days.map((day) => {
              const blocks = dayBlocks.get(day.date) ?? [];
              const conflicts = findConflictIds(blocks);
              return (
                <div className="agenda-day-column" key={day.date} data-date={day.date}>
                  {slots.map((minute) => <Slot key={minute} date={day.date} minute={minute} />)}
                  {hours.slice(0, -1).map((hour) => (
                    <div className="agenda-hour-line" key={hour} style={{ top: (hour - START_HOUR) * PIXELS_PER_HOUR }} />
                  ))}
                  {blocks.map((block) => (
                    <PlannerBlock
                      key={block.id}
                      block={block}
                      geometry={blockGeometry(block.startTime, block.endTime, { startHour: START_HOUR, pixelsPerHour: PIXELS_PER_HOUR })}
                      conflicted={conflicts.has(block.id)}
                      onOpen={onOpenBlock}
                      onCommand={runCommand}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <DragOverlay>
        {activeTitle ? <div className="agenda-drag-overlay"><strong>{activeTitle}</strong><span>Solte no horário</span></div> : null}
      </DragOverlay>
    </DndContext>
  );
}
