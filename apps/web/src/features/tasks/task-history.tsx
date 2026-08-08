import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';

import type { TaskHistoryEntry } from '../../api';

export function TaskHistory({ entries, onOpen }: { entries: TaskHistoryEntry[]; onOpen(): void | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="task-detail-section task-history">
      <button type="button" className="task-section-toggle" aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) void onOpen(); }}><span><History aria-hidden="true" /><strong>Histórico</strong></span><ChevronDown aria-hidden="true" /></button>
      {open ? entries.length ? <ol>{entries.map((entry) => <li key={entry.id}><span>{entry.title}</span><time dateTime={entry.at}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.at))}</time>{entry.description ? <p>{entry.description}</p> : null}</li>)}</ol> : <p className="task-section-empty">Nenhum evento registrado.</p> : null}
    </section>
  );
}
