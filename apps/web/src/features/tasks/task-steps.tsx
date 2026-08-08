import { FormEvent, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Circle, Plus, Trash2 } from 'lucide-react';

import type { Subtask } from '../../api';

type Props = {
  steps: Subtask[];
  onCreate(title: string): Promise<unknown>;
  onUpdate(stepId: string, patch: { title?: string; status?: 'backlog' | 'feito' }): Promise<unknown>;
  onReorder(ids: string[]): Promise<unknown>;
  onDelete(stepId: string): Promise<unknown>;
  onCompleteTask(): void;
};

export function TaskSteps({ steps, onCreate, onUpdate, onReorder, onDelete, onCompleteTask }: Props) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const completed = steps.filter((step) => step.status === 'feito').length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try { await onCreate(title.trim()); setTitle(''); } finally { setBusy(false); }
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= steps.length) return;
    const ids = steps.map((step) => step.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void onReorder(ids);
  }

  return (
    <section className="task-detail-section task-steps" aria-labelledby="task-steps-title">
      <header><div><h2 id="task-steps-title">Etapas</h2><p>{steps.length ? `${completed} de ${steps.length} concluídas` : 'Quebre o trabalho apenas quando ajudar a avançar.'}</p></div>{steps.length ? <span className="task-step-count">{Math.round((completed / steps.length) * 100)}%</span> : null}</header>
      {steps.length ? <div className="task-step-progress" aria-label={`${completed} de ${steps.length} etapas concluídas`}><span style={{ width: `${(completed / steps.length) * 100}%` }} /></div> : null}
      <ul>
        {steps.map((step, index) => (
          <li key={step.id}>
            <button type="button" className="task-step-check" aria-label={`${step.status === 'feito' ? 'Reabrir' : 'Concluir'} ${step.title}`} onClick={() => void onUpdate(step.id, { status: step.status === 'feito' ? 'backlog' : 'feito' })}>{step.status === 'feito' ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}</button>
            <span className={step.status === 'feito' ? 'done' : ''}>{step.title}</span>
            <div className="task-step-actions"><button type="button" aria-label={`Mover ${step.title} para cima`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></button><button type="button" aria-label={`Mover ${step.title} para baixo`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></button><button type="button" aria-label={`Excluir ${step.title}`} onClick={() => void onDelete(step.id)}><Trash2 aria-hidden="true" /></button></div>
          </li>
        ))}
      </ul>
      <form className="task-step-create" onSubmit={submit}><Plus aria-hidden="true" /><label className="sr-only" htmlFor="task-step-title">Nova etapa</label><input id="task-step-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Adicionar etapa" /><button type="submit" disabled={busy || !title.trim()}>Adicionar</button></form>
      {steps.length > 0 && completed === steps.length ? <button type="button" className="task-finish-offer" onClick={onCompleteTask}>Todas as etapas terminaram — concluir tarefa</button> : null}
    </section>
  );
}
