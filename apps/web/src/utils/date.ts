export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
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
