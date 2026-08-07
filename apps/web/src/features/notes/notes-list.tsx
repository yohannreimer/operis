import { ArrowUpRight, FileText, Pin } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { NoteSummary } from '../../api';

function relativeDate(value: string) {
  const timestamp = new Date(value).getTime();
  const delta = timestamp - Date.now();
  if (!Number.isFinite(timestamp)) return '';
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(delta / 3_600_000);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(delta / 86_400_000);
  if (Math.abs(days) < 30) return formatter.format(days, 'day');
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
    new Date(value)
  );
}

export function NotesList({
  rows,
  loading,
  error,
  query,
  onRetry
}: {
  rows: NoteSummary[];
  loading: boolean;
  error: string | null;
  query: string;
  onRetry(): Promise<void>;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="notes-list-loading" aria-label="Carregando notas">
        <span />
        <span />
        <span />
      </div>
    );
  }

  return (
    <section className="notes-list-section" aria-label="Lista de notas">
      {error ? (
        <div className="notes-list-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void onRetry()}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {rows.length === 0 && !error ? (
        <div className="notes-list-empty">
          <FileText size={23} aria-hidden="true" />
          <strong>{query ? 'Nenhuma nota encontrada' : 'Sua biblioteca começa aqui'}</strong>
          <span>
            {query
              ? 'Tente buscar por outra palavra ou pasta.'
              : 'Capture uma ideia acima. Ela aparecerá instantaneamente nesta lista.'}
          </span>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="notes-list" role="list">
          {rows.map((note) => (
            <div key={note.id} role="listitem">
              <Link to={`/notas/${note.id}`} className="notes-list-row">
                <span className="notes-list-row-main">
                  <span className="notes-list-row-title">
                    {note.pinned ? <Pin size={13} fill="currentColor" aria-label="Fixada" /> : null}
                    {note.title || 'Sem título'}
                  </span>
                  <span className="notes-list-row-excerpt">
                    {note.excerpt || 'Nota sem texto — abra para continuar.'}
                  </span>
                </span>
                <span className="notes-list-row-meta">
                  {note.folder?.name ? <span>{note.folder.name}</span> : null}
                  <time dateTime={note.updatedAt}>{relativeDate(note.updatedAt)}</time>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </span>
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
