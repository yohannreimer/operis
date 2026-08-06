import { Check } from 'lucide-react';
import type { AgendaWeek } from '../../api';

const weekday = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  timeZone: 'UTC'
});

export function DayIntentLane({
  date,
  intents,
  today = false
}: {
  date: string;
  intents: AgendaWeek['days'][number]['intents'];
  today?: boolean;
}) {
  const label = today
    ? `Para hoje — ${weekday.format(new Date(`${date}T12:00:00.000Z`))}`
    : `Intenções de ${weekday.format(new Date(`${date}T12:00:00.000Z`))}`;

  return (
    <ul className="agenda-intent-lane" aria-label={label}>
      {intents.map((intent) => (
        <li key={intent.id} data-completed={Boolean(intent.completedAt) || undefined}>
          <Check size={12} aria-hidden="true" />
          <span>{intent.title}</span>
        </li>
      ))}
      {!intents.length ? <li className="agenda-intent-empty">Sem foco definido</li> : null}
    </ul>
  );
}
