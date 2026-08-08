import { FormEvent, useState } from 'react';
import { Check, Clock3, Plus, ShieldAlert, Trash2 } from 'lucide-react';

import type { TaskBacklogItem, TaskRestriction, WaitingFollowupRadar } from '../../api';

type Props = {
  task: TaskBacklogItem;
  restrictions: TaskRestriction[];
  radar: WaitingFollowupRadar | null;
  onLoadRadar(): Promise<unknown>;
  onCreateRestriction(title: string, detail?: string): Promise<unknown>;
  onUpdateRestriction(id: string, patch: { status?: 'aberta' | 'resolvida' }): Promise<unknown>;
  onDeleteRestriction(id: string): Promise<unknown>;
  onFollowup(note?: string): Promise<unknown>;
  onClearWaiting(): Promise<unknown>;
};

export function TaskConstraints(props: Props) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(Boolean(props.task.waitingOnPerson || props.restrictions.length));
  const radarRow = props.radar?.rows.find((row) => row.taskId === props.task.id);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await props.onCreateRestriction(title.trim());
    setTitle('');
  }

  return (
    <section className="task-detail-section task-constraints" aria-labelledby="task-constraints-title">
      <button type="button" className="task-section-toggle" aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next && props.task.waitingOnPerson) void props.onLoadRadar(); }}><span><ShieldAlert aria-hidden="true" /><strong id="task-constraints-title">Bloqueios e dependências</strong></span><small>{props.restrictions.filter((item) => item.status === 'aberta').length + (props.task.waitingOnPerson ? 1 : 0)} ativos</small></button>
      {open ? <div className="task-constraints-body">
        {props.task.waitingOnPerson ? <div className="task-waiting-summary"><Clock3 aria-hidden="true" /><div><strong>Aguardando {props.task.waitingOnPerson}</strong><span>{props.task.waitingType === 'entrega' ? 'Entrega' : 'Resposta'} · revisar {props.task.waitingDueDate ? new Intl.DateTimeFormat('pt-BR').format(new Date(props.task.waitingDueDate)) : 'sem data'}</span>{radarRow ? <p>{radarRow.suggestedAction}</p> : null}</div><button type="button" onClick={() => void props.onClearWaiting()}><Check aria-hidden="true" /> Resolvido</button></div> : null}
        {props.task.waitingOnPerson ? <form className="task-followup" onSubmit={(event) => { event.preventDefault(); void props.onFollowup(note.trim() || undefined).then(() => setNote('')); }}><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Registrar acompanhamento" /><button type="submit">Acompanhar</button></form> : null}
        <h3>Bloqueios internos</h3>
        <ul>{props.restrictions.map((item) => <li key={item.id} data-resolved={item.status === 'resolvida' || undefined}><button type="button" aria-label={`${item.status === 'aberta' ? 'Resolver' : 'Reabrir'} ${item.title}`} onClick={() => void props.onUpdateRestriction(item.id, { status: item.status === 'aberta' ? 'resolvida' : 'aberta' })}>{item.status === 'resolvida' ? <Check aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}</button><span>{item.title}</span><button type="button" aria-label={`Excluir bloqueio ${item.title}`} onClick={() => void props.onDeleteRestriction(item.id)}><Trash2 aria-hidden="true" /></button></li>)}</ul>
        <form className="task-step-create" onSubmit={create}><Plus aria-hidden="true" /><label className="sr-only" htmlFor="task-restriction-title">Novo bloqueio</label><input id="task-restriction-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Adicionar bloqueio interno" /><button type="submit" disabled={!title.trim()}>Adicionar</button></form>
      </div> : null}
    </section>
  );
}
