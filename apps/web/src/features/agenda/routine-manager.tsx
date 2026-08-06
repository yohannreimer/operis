import { useCallback, useEffect, useState } from 'react';
import { Pause, Pencil, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { api, type Commitment } from '../../api';

const dayLabels: Record<string, string> = {
  seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom'
};

export function RoutineManager({ onEdit }: { onEdit?(routine: Commitment): void }) {
  const [routines, setRoutines] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await api.getCommitments();
      setRoutines(items.filter((item) => item.recurrenceDays.length > 0));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as rotinas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggle(routine: Commitment) {
    const nextStatus = routine.status === 'ativo' ? 'pausado' : 'ativo';
    const previous = routines;
    setRoutines((items) => items.map((item) => item.id === routine.id ? { ...item, status: nextStatus } : item));
    try {
      await api.updateCommitment(routine.id, { status: nextStatus });
      toast.success(nextStatus === 'ativo' ? 'Rotina reativada.' : 'Rotina pausada.');
    } catch (cause) {
      setRoutines(previous);
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível atualizar a rotina.');
    }
  }

  return (
    <section className="agenda-routine-manager" aria-labelledby="agenda-routines-title">
      <header>
        <div>
          <span className="agenda-eyebrow">Configuração</span>
          <h2 id="agenda-routines-title">Rotinas</h2>
        </div>
        <button type="button" onClick={() => void load()} aria-label="Atualizar rotinas"><RefreshCw aria-hidden="true" /></button>
      </header>
      {loading ? <p>Carregando rotinas…</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Tentar novamente</button></div> : null}
      {!loading && !error ? (
        <div className="agenda-routine-list">
          {routines.map((routine) => (
            <article key={routine.id} data-paused={routine.status === 'pausado' || undefined}>
              <div>
                <strong>{routine.title}</strong>
                <span>{routine.recurrenceDays.map((day) => dayLabels[day] ?? day).join(', ')} · {routine.startTime ?? 'Sem horário'} · {routine.durationMin ?? 30} min</span>
              </div>
              <div className="agenda-routine-actions">
                <button type="button" aria-label={`Editar ${routine.title}`} onClick={() => onEdit?.(routine)}><Pencil aria-hidden="true" /></button>
                <button type="button" aria-label={`${routine.status === 'ativo' ? 'Pausar' : 'Reativar'} ${routine.title}`} onClick={() => void toggle(routine)}>
                  {routine.status === 'ativo' ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                </button>
              </div>
            </article>
          ))}
          {!routines.length ? <p>Nenhuma rotina recorrente.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
