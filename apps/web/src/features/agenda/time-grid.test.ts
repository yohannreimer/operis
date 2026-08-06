import { describe, expect, it } from 'vitest';

import { blockGeometry, findConflictIds, snapMinutes } from './time-grid.js';

describe('time grid', () => {
  it('maps pointer minutes to 15-minute slots', () => {
    expect(snapMinutes(7)).toBe(0);
    expect(snapMinutes(8)).toBe(15);
    expect(snapMinutes(52)).toBe(45);
  });

  it('keeps a 15-minute block touchable without changing its duration', () => {
    expect(blockGeometry('09:00', '09:15', { startHour: 6, pixelsPerHour: 72 })).toEqual({
      top: 216,
      height: 44,
      visualOverflow: 26
    });
  });

  it('detects overlaps but never rejects them', () => {
    const block = (id: string, startTime: string, endTime: string) => ({
      id,
      startTime,
      endTime
    });

    expect(
      findConflictIds([
        block('a', '09:00', '10:00'),
        block('b', '09:30', '10:15')
      ])
    ).toEqual(new Set(['a', 'b']));
  });

  it('does not mark adjacent blocks as conflicts', () => {
    expect(
      findConflictIds([
        { id: 'a', startTime: '09:00', endTime: '10:00' },
        { id: 'b', startTime: '10:00', endTime: '10:15' }
      ])
    ).toEqual(new Set());
  });
});
