import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, History, X } from 'lucide-react';

import { api } from '../../api';
import type { Responsibility, ResponsibilityHealth, ResponsibilityReview } from '../projects/types';

export function ResponsibilityReviewPanel({
  responsibility,
  busy,
  onClose,
  onSave
}: {
  responsibility: Responsibility | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (input: { health: ResponsibilityHealth; note?: string; nextCare: string; createTask?: 'backlog' | 'today' }) => Promise<void>;
}) {
  const [history, setHistory] = useState<ResponsibilityReview[]>([]);
  const [health, setHealth] = useState<ResponsibilityHealth>('healthy');
  const [note, setNote] = useState('');
  const [nextCare, setNextCare] = useState('');
  const [destination, setDestination] = useState<'none' | 'backlog' | 'today'>('none');

  useEffect(() => {
    if (!responsibility) return;
    setHealth(responsibility.health);
    setNextCare(responsibility.nextCare);
    setNote('');
    setDestination('none');
    void api.getResponsibilityReviews(responsibility.id).then(setHistory).catch(() => setHistory([]));
  }, [responsibility]);

  if (!responsibility) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!nextCare.trim()) return;
    await onSave({
      health,
      note: note.trim() || undefined,
      nextCare: nextCare.trim(),
      createTask: destination === 'none' ? undefined : destination
    });
  }

  return (
    <div className="front-panel-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="front-panel front-review-panel" role="dialog" aria-modal="true" aria-label={`Cuidar de ${responsibility.title}`} onSubmit={submit}>
        <header><div><small>PULSO DE CUIDADO</small><h2>{responsibility.title}</h2><p>{responsibility.expectedStandard}</p></div><button type="button" aria-label="Fechar" onClick={onClose}><X size={18} /></button></header>
        <div className="front-panel__body">
          <fieldset className="front-health-picker"><legend>Como está agora?</legend>{([['healthy', 'Saudável'], ['attention', 'Pede atenção'], ['critical', 'Crítico']] as const).map(([value, label]) => <label key={value} data-selected={health === value || undefined}><input type="radio" name="health" checked={health === value} onChange={() => setHealth(value)} />{label}</label>)}</fieldset>
          <label><span>Próximo cuidado</span><input value={nextCare} onChange={(event) => setNextCare(event.target.value)} /></label>
          <label><span>Nota da revisão <em>opcional</em></span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <fieldset className="front-task-choice"><legend>Transformar o cuidado em tarefa?</legend><label><input type="radio" name="create-task" checked={destination === 'none'} onChange={() => setDestination('none')} />Não agora</label><label><input type="radio" name="create-task" checked={destination === 'backlog'} onChange={() => setDestination('backlog')} />Adicionar ao backlog</label><label><input type="radio" name="create-task" checked={destination === 'today'} onChange={() => setDestination('today')} />Mandar para Hoje</label></fieldset>
          <section className="front-review-history" aria-label="Histórico de revisões"><h3><History size={15} /> Histórico</h3>{history.length ? history.slice(0, 5).map((review) => <div key={review.id}><span>{new Date(review.reviewedAt).toLocaleDateString('pt-BR')}</span><p>{review.nextCare}</p></div>) : <p className="front-muted">Esta será a primeira revisão registrada.</p>}</section>
        </div>
        <footer><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar revisão'} <ArrowUpRight size={15} /></button></footer>
      </form>
    </div>
  );
}
