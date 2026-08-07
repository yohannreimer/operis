import { useState, type FormEvent } from 'react';
import { ArrowRight, ChevronDown, CircleDollarSign, Plus, X } from 'lucide-react';

import { api } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

function money(value: number | null | undefined, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value ?? 0);
}

export function PipelineEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const stages = [...(data.stages ?? [])].sort((a, b) => a.order - b.order);
  const deals = data.deals ?? [];
  const currency = data.currency ?? 'BRL';
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [stageId, setStageId] = useState(stages[0]?.id ?? '');

  async function moveDeal(dealId: string, nextStageId: string) {
    await api.updateMethodologyItem(project.id, dealId, {
      arrayKey: 'deals',
      item: { stageId: nextStageId, stageEnteredAt: new Date().toISOString() }
    });
    onReload();
  }

  async function addDeal(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !stageId) return;
    await api.addMethodologyItem(project.id, { arrayKey: 'deals', item: {
      id: crypto.randomUUID(), name: name.trim(), stageId,
      amount: amount ? Number(amount) : null, probability: null,
      createdAt: new Date().toISOString(), stageEnteredAt: new Date().toISOString()
    } });
    setAdding(false); setName(''); setAmount(''); onReload();
  }

  const weighted = deals.reduce((sum, deal) => sum + (deal.amount ?? 0) * ((deal.probability ?? 0) / 100), 0);
  const variant = project.engine.methodology;
  const title = variant === 'captacao' ? 'Conversas de captação' : variant === 'sistema_receita' ? 'Sistema de receita' : 'Pipeline em movimento';

  return <section className="engine-view pipeline-engine" aria-labelledby="pipeline-engine-title">
    <EngineSectionHeader id="pipeline-engine-title" eyebrow={variant === 'captacao' ? 'CAPTAÇÃO' : variant === 'sistema_receita' ? 'RECEITA' : 'PIPELINE'} title={title} description="Oportunidade parada perde contexto. O objetivo aqui é tornar o próximo avanço inevitável." actionLabel="Nova oportunidade" onAction={() => setAdding(true)} />
    {(variant === 'captacao' || data.totalGoal) && <div className="pipeline-forecast"><CircleDollarSign size={18} /><div><span>FORECAST PONDERADO</span><strong>{money(weighted, currency)}</strong></div>{data.totalGoal != null && <p>de {money(data.totalGoal, currency)}</p>}</div>}
    {stages.length ? <div className="pipeline-board">{stages.map((stage) => {
      const stageDeals = deals.filter((deal) => deal.stageId === stage.id);
      return <section key={stage.id} className="pipeline-stage"><header><span>{stage.label}</span><small>{stageDeals.length}</small><strong>{money(stageDeals.reduce((sum, deal) => sum + (deal.amount ?? 0), 0), currency)}</strong></header><div>{stageDeals.map((deal) => <article key={deal.id}><div><strong>{deal.name}</strong><small>{money(deal.amount, currency)}{deal.probability != null ? ` · ${deal.probability}%` : ''}</small></div><details><summary role="button" aria-label={`Mover ${deal.name}`}><ArrowRight size={15} /><ChevronDown size={12} /></summary><div role="menu">{stages.filter((candidate) => candidate.id !== stage.id).map((candidate) => <button role="menuitem" type="button" key={candidate.id} onClick={() => void moveDeal(deal.id, candidate.id)}>{candidate.label}</button>)}</div></details></article>)}{!stageDeals.length && <p className="pipeline-stage__empty">Nenhuma oportunidade</p>}</div></section>;
    })}</div> : <EngineEmpty><p>Crie etapas no Projeto para começar a movimentar oportunidades.</p></EngineEmpty>}
    {variant === 'sistema_receita' && !!data.stageCriteria?.length && <section className="revenue-criteria"><header><span>CRITÉRIOS DE PASSAGEM</span><h3>O que torna o avanço repetível</h3></header>{data.stageCriteria.map((criterion) => <label key={criterion.id}><input type="checkbox" checked={criterion.done} onChange={() => void api.updateMethodologyItem(project.id, criterion.id, { arrayKey: 'stageCriteria', item: { done: !criterion.done } }).then(onReload)} />{criterion.text}</label>)}</section>}
    {adding && <div className="engine-dialog-backdrop"><form className="engine-dialog" role="dialog" aria-modal="true" aria-label="Nova oportunidade" onSubmit={addDeal}><header><div><span>PIPELINE</span><h3>Nova oportunidade</h3></div><button type="button" aria-label="Fechar" onClick={() => setAdding(false)}><X size={17} /></button></header><div className="engine-dialog__body"><label><span>Nome</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Valor</span><input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label><span>Etapa</span><select value={stageId} onChange={(event) => setStageId(event.target.value)}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label></div><footer><button type="button" onClick={() => setAdding(false)}>Cancelar</button><button type="submit"><Plus size={14} /> Adicionar</button></footer></form></div>}
  </section>;
}
