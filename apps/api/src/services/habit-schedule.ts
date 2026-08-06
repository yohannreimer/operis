import type { HabitFrequency, RecurrenceDay } from '@prisma/client';

export type SchedulableHabit = {
  frequencyType: HabitFrequency;
  frequencyTarget: number;
  specificDays: readonly RecurrenceDay[];
};

const DAYS: RecurrenceDay[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

export function addDateDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function periodBounds(frequency: HabitFrequency, date: string) {
  const selected = new Date(`${date}T00:00:00Z`);

  if (frequency === 'weekly') {
    const start = new Date(selected);
    start.setUTCDate(start.getUTCDate() - ((selected.getUTCDay() + 6) % 7));
    return { start: start.toISOString().slice(0, 10), end: date };
  }

  if (frequency === 'monthly') {
    return { start: `${date.slice(0, 7)}-01`, end: date };
  }

  return { start: date, end: date };
}

export function isSpecificDayScheduled(habit: SchedulableHabit, date: string) {
  const day = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return habit.specificDays.includes(day);
}

export function classifyHabitDate(
  habit: SchedulableHabit,
  date: string,
  periodDone: number,
  hasLogOnDate: boolean,
) {
  if (habit.frequencyType === 'daily') return true;
  if (habit.frequencyType === 'specific_days') return isSpecificDayScheduled(habit, date);
  if (hasLogOnDate) return true;
  return periodDone < habit.frequencyTarget;
}
