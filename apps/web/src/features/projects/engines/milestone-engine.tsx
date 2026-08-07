import { useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ExternalLink, Plus } from 'lucide-react';

import { api } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

export function MilestoneEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const milestones = [...(data.milestones ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busyId, setBusyId] = useState('');
  const authority = project.engine.methodology === 'autoridade';

  async function toggle(item: typeof milestones[number]) {
    setBusyId(item.id);
    try {
      await api.updateMethodologyItem(project.id, item.id, { arrayKey: 'milestones', item: { done: !item.done } });
      onReload();
    } finally { setBusyId(''); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) return;
    await api.addMethodologyItem(project.id, { arrayKey: 'milestones', item: { id: crypto.randomUUID(), title: title.trim(), done: false, order: milestones.length + 1 } });
    setTitle(''); setAdding(false); onReload();
  }

  return <section className="engine-view milestone-engine" aria-labelledby="milestone-engine-title">
    <EngineSectionHeader id="milestone-engine-title" eyebrow={authority ? 'AUTORIDADE' : 'ENTREGA'} title={authority ? 'Provas no campo' : 'Marcos da entrega'} description={authority ? 'Autoridade cresce por evidências publicadas, não por intenção.' : 'Uma linha de chegada concreta, quebrada no que precisa ficar pronto.'} actionLabel={authority ? 'Adicionar marco' : 'Adicionar marco'} onAction={() => setAdding(true)} />
    {adding && <form className="engine-inline-create" onSubmit={add}><input autoFocus aria-label="Título do marco" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="O que precisa ficar pronto?" /><button type="button" onClick={() => setAdding(false)}>Cancelar</button><button type="submit"><Plus size={14} /> Adicionar</button></form>}
    <div className="milestone-list">
      {milestones.map((item, index) => <label key={item.id} data-done={item.done || undefined}><span className="milestone-order">{String(index + 1).padStart(2, '0')}</span><input type="checkbox" aria-label={item.title} checked={item.done} disabled={busyId === item.id} onChange={() => void toggle(item)} /><span className="milestone-check">{item.done && <Check size={14} />}</span><span className="milestone-copy"><strong>{item.title}</strong><small>{item.critical ? 'Marco crítico' : item.done ? 'Concluído' : 'Em aberto'}</small></span></label>)}
      {!milestones.length && <EngineEmpty><p>Comece pelo primeiro resultado observável que precisa ficar pronto.</p><button type="button" onClick={() => setAdding(true)}>Adicionar primeiro marco</button></EngineEmpty>}
    </div>
    {!!data.blockers?.length && <section className="engine-blockers"><header><AlertTriangle size={15} /><h3>Bloqueios</h3></header>{data.blockers.map((blocker) => <p key={blocker.id} data-resolved={Boolean(blocker.resolvedAt) || undefined}>{blocker.title}</p>)}</section>}
    {authority && !!data.proofs?.length && <section className="authority-proofs"><header><span>PROVAS PUBLICADAS</span><strong>{data.proofs.reduce((sum, proof) => sum + proof.points, 0)} pts</strong></header>{data.proofs.map((proof) => <article key={proof.id}><div><strong>{proof.title}</strong><small>{proof.type} · {proof.points} pts</small></div>{proof.link && <a href={proof.link} target="_blank" rel="noreferrer" aria-label={`Abrir ${proof.title}`}><ExternalLink size={15} /></a>}</article>)}</section>}
  </section>;
}
