import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';

import type {
  Responsibility,
  ResponsibilityCadence,
  ResponsibilityHealth
} from '../projects/types';

function defaultReviewDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

export type ResponsibilityDraft = {
  title: string;
  expectedStandard: string;
  cadence: ResponsibilityCadence;
  cadenceIntervalDays?: number | null;
  health?: ResponsibilityHealth;
  nextCare: string;
  nextReviewAt: string;
};

export function ResponsibilityEditorPanel({
  open,
  responsibility,
  busy,
  onClose,
  onSave
}: {
  open: boolean;
  responsibility?: Responsibility | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (draft: ResponsibilityDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ResponsibilityDraft>({
    title: '', expectedStandard: '', cadence: 'weekly', nextCare: '', nextReviewAt: defaultReviewDate()
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(responsibility ? {
      title: responsibility.title,
      expectedStandard: responsibility.expectedStandard,
      cadence: responsibility.cadence,
      cadenceIntervalDays: responsibility.cadenceIntervalDays,
      health: responsibility.health,
      nextCare: responsibility.nextCare,
      nextReviewAt: responsibility.nextReviewAt.slice(0, 10)
    } : {
      title: '', expectedStandard: '', cadence: 'weekly', nextCare: '', nextReviewAt: defaultReviewDate()
    });
    setError('');
  }, [open, responsibility]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ([draft.title, draft.expectedStandard, draft.nextCare, draft.nextReviewAt].some((value) => !value.trim())) {
      setError('Preencha título, padrão, próximo cuidado e revisão.');
      return;
    }
    if (draft.cadence === 'custom' && !draft.cadenceIntervalDays) {
      setError('Informe o intervalo da cadência personalizada.');
      return;
    }
    await onSave({ ...draft, nextReviewAt: new Date(`${draft.nextReviewAt}T12:00:00`).toISOString() });
  }

  return (
    <div className="front-panel-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="front-panel" role="dialog" aria-modal="true" aria-label={responsibility ? 'Editar responsabilidade' : 'Nova responsabilidade'} onSubmit={submit}>
        <header><div><small>RESPONSABILIDADE</small><h2>{responsibility ? 'Editar cuidado contínuo' : 'O que precisa permanecer bem?'}</h2></div><button type="button" aria-label="Fechar" onClick={onClose}><X size={18} /></button></header>
        <div className="front-panel__body">
          <label><span>Título</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label><span>Padrão esperado</span><textarea rows={3} value={draft.expectedStandard} onChange={(event) => setDraft({ ...draft, expectedStandard: event.target.value })} placeholder="Como esta área se parece quando está saudável?" /></label>
          <label><span>Próximo cuidado</span><input value={draft.nextCare} onChange={(event) => setDraft({ ...draft, nextCare: event.target.value })} placeholder="A menor ação de manutenção necessária" /></label>
          <div className="front-panel__split">
            <label><span>Cadência</span><select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value as ResponsibilityCadence })}><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="custom">Personalizada</option></select></label>
            <label><span>Próxima revisão</span><input type="date" value={draft.nextReviewAt} onChange={(event) => setDraft({ ...draft, nextReviewAt: event.target.value })} /></label>
          </div>
          {draft.cadence === 'custom' && <label><span>Intervalo em dias</span><input type="number" min="1" max="365" value={draft.cadenceIntervalDays ?? ''} onChange={(event) => setDraft({ ...draft, cadenceIntervalDays: Number(event.target.value) || null })} /></label>}
          {error && <p role="alert" className="front-panel__error">{error}</p>}
        </div>
        <footer><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy}>{busy ? 'Salvando…' : responsibility ? 'Salvar alterações' : 'Criar responsabilidade'}</button></footer>
      </form>
    </div>
  );
}
