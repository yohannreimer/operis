import { DragEvent, useEffect, useMemo, useState } from 'react';

import { DayPlanItem } from '../api';
import { formatTime, todayIsoDate } from '../utils/date';

export type CommitmentBlock = {
  id: string;
  title: string;
  startTime: string; // HH:mm
  durationMin: number;
};

export type DragPayload =
  | {
      kind: 'task';
      id: string;
    }
  | {
      kind: 'item';
      id: string;
    };

type SchedulerGridProps = {
  date: string;
  items: DayPlanItem[];
  selectedItemId: string;
  onSelectItem: (itemId: string) => void;
  onItemDoubleClick?: (itemId: string) => void;
  onDropPayload: (payload: DragPayload, startISO: string) => Promise<void> | void;
  onItemDragStart?: (event: DragEvent<HTMLElement>, payload: DragPayload) => void;
  startHour?: number;
  endHour?: number;
  commitmentBlocks?: CommitmentBlock[];
};

const ROW_HEIGHT = 38;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseDragPayload(event: DragEvent<HTMLElement>): DragPayload | null {
  const custom = event.dataTransfer.getData('application/x-execution-os');
  if (custom) {
    try {
      return JSON.parse(custom) as DragPayload;
    } catch {
      return null;
    }
  }

  const fallback = event.dataTransfer.getData('text/plain');
  if (!fallback) {
    return null;
  }

  if (fallback.startsWith('task:')) {
    return { kind: 'task', id: fallback.replace('task:', '') };
  }

  if (fallback.startsWith('item:')) {
    return { kind: 'item', id: fallback.replace('item:', '') };
  }

  return null;
}

function toIsoSlot(date: string, hour: number, minute: number) {
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00`).toISOString();
}

function startSlotIndex(date: Date, startHour: number) {
  const minutes = (date.getHours() - startHour) * 60 + date.getMinutes();
  return Math.floor(minutes / 30);
}

function endSlotIndex(date: Date, startHour: number) {
  const minutes = (date.getHours() - startHour) * 60 + date.getMinutes();
  return Math.ceil(minutes / 30);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function SchedulerGrid({
  date,
  items,
  selectedItemId,
  onSelectItem,
  onItemDoubleClick,
  onDropPayload,
  onItemDragStart,
  startHour = 6,
  endHour = 23,
  commitmentBlocks = []
}: SchedulerGridProps) {
  const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  const isToday = date === todayIsoDate();

  useEffect(() => {
    if (!isToday) { setNowMinutes(null); return; }
    function update() {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  const rows = useMemo(() => {
    const data: Array<{ key: string; hour: number; minute: number; label: string }> = [];

    for (let hour = startHour; hour < endHour; hour += 1) {
      data.push({
        key: `${hour}:00`,
        hour,
        minute: 0,
        label: `${pad(hour)}:00`
      });

      data.push({
        key: `${hour}:30`,
        hour,
        minute: 30,
        label: `${pad(hour)}:30`
      });
    }

    return data;
  }, [startHour, endHour]);

  const orderedItems = useMemo(
    () => [...items].sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()),
    [items]
  );

  function slotKey(hour: number, minute: number) {
    return `${pad(hour)}:${pad(minute)}`;
  }

  function activateSlot(hour: number, minute: number) {
    setHoveredSlotKey(slotKey(hour, minute));
  }

  async function handleDropRow(event: DragEvent<HTMLElement>, hour: number, minute: number) {
    event.preventDefault();
    setHoveredSlotKey(null);

    const payload = parseDragPayload(event);
    if (!payload) {
      return;
    }

    await onDropPayload(payload, toIsoSlot(date, hour, minute));
  }

  return (
    <div className="scheduler-grid">
      <div className="scheduler-time-column">
        {rows.map((row) => (
          <div
            key={row.key}
            className={hoveredSlotKey === slotKey(row.hour, row.minute) ? 'scheduler-time active' : 'scheduler-time'}
            onDragOver={(event) => {
              event.preventDefault();
              activateSlot(row.hour, row.minute);
            }}
            onDragEnter={() => activateSlot(row.hour, row.minute)}
            onDragLeave={() => setHoveredSlotKey(null)}
            onDrop={(event) => handleDropRow(event, row.hour, row.minute)}
          >
            {row.label}
          </div>
        ))}
      </div>

      <div className="scheduler-track">
        {rows.map((row) => (
          <div
            key={row.key}
            className={
              hoveredSlotKey === slotKey(row.hour, row.minute) ? 'scheduler-drop-row active' : 'scheduler-drop-row'
            }
            onDragOver={(event) => {
              event.preventDefault();
              activateSlot(row.hour, row.minute);
            }}
            onDragEnter={() => activateSlot(row.hour, row.minute)}
            onDragLeave={() => setHoveredSlotKey(null)}
            onDrop={(event) => handleDropRow(event, row.hour, row.minute)}
          />
        ))}

        {nowMinutes !== null && (() => {
          const offsetMinutes = nowMinutes - startHour * 60;
          if (offsetMinutes < 0 || offsetMinutes > (endHour - startHour) * 60) return null;
          const top = (offsetMinutes / 30) * ROW_HEIGHT;
          return <div className="scheduler-now-indicator" style={{ top }} />;
        })()}

        {orderedItems.length === 0 && commitmentBlocks.length === 0 && (
          <div className="scheduler-empty-state">
            Arraste tarefas do pool ou clique em um horário para agendar
          </div>
        )}

        {/* Commitment blocks — read-only, indigo layer */}
        {commitmentBlocks.map((cb) => {
          const [h, m] = cb.startTime.split(':').map(Number);
          const startMinutes = (h - startHour) * 60 + m;
          const slotStart = startMinutes / 30;
          const slotSpan = Math.max(1, cb.durationMin / 30);

          if (startMinutes < 0 || startMinutes >= (endHour - startHour) * 60) return null;

          return (
            <div
              key={`cb-${cb.id}`}
              className="scheduler-commitment-item"
              style={{
                top: slotStart * ROW_HEIGHT,
                height: slotSpan * ROW_HEIGHT
              }}
              title={`${cb.title} · ${cb.startTime} · ${cb.durationMin}min`}
            >
              <strong>{cb.title}</strong>
              <span>{cb.startTime} · {cb.durationMin}min</span>
            </div>
          );
        })}

        {orderedItems.map((item) => {
          const start = new Date(item.startTime);
          const end = new Date(item.endTime);

          const startIndex = clamp(startSlotIndex(start, startHour), 0, rows.length - 1);
          const endIndex = clamp(endSlotIndex(end, startHour), startIndex + 1, rows.length);
          const slotSpan = Math.max(1, endIndex - startIndex);

          return (
            <button
              key={item.id}
              type="button"
              className={selectedItemId === item.id ? 'scheduler-item active' : 'scheduler-item'}
              style={{
                top: startIndex * ROW_HEIGHT,
                height: slotSpan * ROW_HEIGHT
              }}
              draggable
              onDragStart={(event) =>
                onItemDragStart?.(event, {
                  kind: 'item',
                  id: item.id
                })
              }
              onClick={() => onSelectItem(item.id)}
              onDoubleClick={() => onItemDoubleClick?.(item.id)}
            >
              <strong>{item.task?.title ?? 'Bloco fixo'}</strong>
              <span>
                {formatTime(item.startTime)} - {formatTime(item.endTime)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
