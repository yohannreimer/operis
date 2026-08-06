import { describe, expect, it } from 'vitest';

import { classifyHabitDate, periodBounds, type SchedulableHabit } from './habit-schedule.js';

const base: SchedulableHabit = {
  frequencyType: 'daily',
  frequencyTarget: 1,
  specificDays: [],
};

describe('classifyHabitDate', () => {
  it('keeps daily habits scheduled and respects specific weekdays', () => {
    expect(classifyHabitDate(base, '2026-08-06', 0, false)).toBe(true);
    expect(
      classifyHabitDate(
        { ...base, frequencyType: 'specific_days', specificDays: ['seg', 'qui'] },
        '2026-08-06',
        0,
        false,
      ),
    ).toBe(true);
    expect(
      classifyHabitDate(
        { ...base, frequencyType: 'specific_days', specificDays: ['seg'] },
        '2026-08-06',
        0,
        false,
      ),
    ).toBe(false);
    expect(
      classifyHabitDate(
        { ...base, frequencyType: 'specific_days', specificDays: ['seg'] },
        '2026-08-06',
        0,
        true,
      ),
    ).toBe(false);
  });

  it('keeps flexible habits due until the period target is reached', () => {
    const weekly: SchedulableHabit = {
      ...base,
      frequencyType: 'weekly',
      frequencyTarget: 2,
    };

    expect(classifyHabitDate(weekly, '2026-08-06', 1, false)).toBe(true);
    expect(classifyHabitDate(weekly, '2026-08-06', 2, false)).toBe(false);
    expect(classifyHabitDate(weekly, '2026-08-06', 2, true)).toBe(true);
  });
});

describe('periodBounds', () => {
  it('uses Monday for weekly periods and never reads after the selected date', () => {
    expect(periodBounds('weekly', '2026-08-06')).toEqual({
      start: '2026-08-03',
      end: '2026-08-06',
    });
  });

  it('uses the first day of the month and never reads after the selected date', () => {
    expect(periodBounds('monthly', '2026-08-06')).toEqual({
      start: '2026-08-01',
      end: '2026-08-06',
    });
  });
});
