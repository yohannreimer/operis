export function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function startOfDay(dateInput: string): Date {
  return new Date(`${dateInput}T00:00:00.000Z`);
}

export function endOfDay(dateInput: string): Date {
  return new Date(`${dateInput}T23:59:59.999Z`);
}
