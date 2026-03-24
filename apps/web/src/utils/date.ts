/** Returns today's date in YYYY-MM-DD using the **local** timezone.
 *  `new Date().toISOString()` would return UTC, which is wrong for users
 *  in UTC-3 (São Paulo) after 21h — it would already show tomorrow.
 */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIsoDate() {
  return localDateKey();
}

export function tomorrowIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateKey(d);
}

export function toIsoDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseIsoDateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

export function formatIsoDate(value: string) {
  const date = parseIsoDateOnly(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('pt-BR');
}

export function formatIsoDateLong(value: string) {
  const date = parseIsoDateOnly(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formatIsoDateMonth(value: string) {
  const date = parseIsoDateOnly(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

export function formatIsoDateDayMonth(value: string) {
  const date = parseIsoDateOnly(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  });
}
