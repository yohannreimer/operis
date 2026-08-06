import type { GridMetrics, PlannerBlockModel } from './types';

export const SLOT_MINUTES = 15;
export const MIN_BLOCK_PX = 44;

export function snapMinutes(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

export function minutesOfDay(value: string) {
  const match = value.match(/(?:T|^)(\d{2}):(\d{2})/);
  if (!match) {
    throw new Error(`Horário inválido: ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function blockGeometry(start: string, end: string, grid: GridMetrics) {
  const startMinutes = minutesOfDay(start) - grid.startHour * 60;
  const duration = Math.max(0, minutesOfDay(end) - minutesOfDay(start));
  const top = Math.round((startMinutes / 60) * grid.pixelsPerHour);
  const naturalHeight = Math.round((duration / 60) * grid.pixelsPerHour);
  const height = Math.max(MIN_BLOCK_PX, naturalHeight);
  return { top, height, visualOverflow: height - naturalHeight };
}

export function overlaps(
  left: Pick<PlannerBlockModel, 'startTime' | 'endTime'>,
  right: Pick<PlannerBlockModel, 'startTime' | 'endTime'>
) {
  const leftStart = minutesOfDay(left.startTime);
  const leftEnd = minutesOfDay(left.endTime);
  const rightStart = minutesOfDay(right.startTime);
  const rightEnd = minutesOfDay(right.endTime);
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function findConflictIds(
  blocks: Array<Pick<PlannerBlockModel, 'id' | 'startTime' | 'endTime'>>
) {
  const conflicts = new Set<string>();
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      if (overlaps(blocks[left], blocks[right])) {
        conflicts.add(blocks[left].id);
        conflicts.add(blocks[right].id);
      }
    }
  }
  return conflicts;
}
