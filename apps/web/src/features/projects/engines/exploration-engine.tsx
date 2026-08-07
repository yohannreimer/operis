import { useState, type FormEvent } from 'react';
import { Check, FlaskConical, Minus, Plus, X } from 'lucide-react';

import { api } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

export function ExplorationEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState<'confirms' | 'refutes' | 'inconclusive'>('confirms');
  const mentoring = project.engine.methodology === 'mentoria';

  async function addEvidence(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    await api.addMethodologyItem(project.id, { arrayKey: 'discoveries', item: {
      id: crypto.randomUUID(), text: text.trim(), type,
      week: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString()
    } });
    setText(''); setEvidenceOpen(false); onReload();
  }

  return <section className="engine-view exploration-engine" aria-labelledby="exploration-engine-title">
    <EngineSectionHeader id="exploration-engine-title" eyebrow={mentoring ? 'MENTORIA' : 'EXPLORAÇÃO'} title={mentoring ? 'Sessões e compromissos' : 'Evidências da hipótese'} description={mentoring ? 'Cada sessão termina em um compromisso observável.' : 'Registre o que o mundo mostrou — inclusive quando contradiz a ideia.'} actionLabel={mentoring ? undefined : 'Registrar evidência'} onAction={mentoring ? undefined : () => setEvidenceOpen(true)} />
    {mentoring ? <div className="mentoring-sessions">{data.sessions?.map((session) => <article key={session.id}><time>{new Date(session.date).toLocaleDateString('pt-BR')}</time><div><strong>{session.learned}</strong>{session.commitments.map((commitment) => <p key={commitment.id} data-done={commitment.done || undefined}>{commitment.done && <Check size={12} />}{commitment.text}</p>)}</div></article>)}{!data.sessions?.length && <EngineEmpty><p>Registre uma sessão para transformar aprendizado em compromisso.</p></EngineEmpty>}</div> : <>
      <section className="hypothesis-brief"><span><FlaskConical size={18} /></span><div><small>HIPÓTESE</small><strong>{data.hypothesis || 'Hipótese ainda não definida'}</strong><p>{data.hypothesisCriteria ? `Válida quando: ${data.hypothesisCriteria}` : 'Defina um critério antes de coletar evidências.'}</p></div></section>
      <div className="evidence-ledger">{data.discoveries?.map((discovery) => <article key={discovery.id} className={`evidence-${discovery.type}`}><span>{discovery.type === 'confirms' ? <Plus size={14} /> : discovery.type === 'refutes' ? <Minus size={14} /> : '·'}</span><div><strong>{discovery.text}</strong><small>{discovery.type === 'confirms' ? 'Confirma' : discovery.type === 'refutes' ? 'Refuta' : 'Inconclusiva'} · {discovery.week}</small></div></article>)}{!data.discoveries?.length && <EngineEmpty><p>A primeira evidência vale mais que mais uma rodada de planejamento.</p></EngineEmpty>}</div>
      {data.decision && <section className="exploration-decision"><small>DECISÃO REGISTRADA</small><strong>{data.decision.choice === 'follow' ? 'Seguir' : data.decision.choice === 'pivot' ? 'Pivotar' : 'Descartar'}</strong><p>{data.decision.justification}</p></section>}
    </>}
    {evidenceOpen && <div className="engine-dialog-backdrop"><form className="engine-dialog" role="dialog" aria-modal="true" aria-label="Nova evidência" onSubmit={addEvidence}><header><div><span>EXPERIMENTO</span><h3>Nova evidência</h3></div><button type="button" aria-label="Fechar" onClick={() => setEvidenceOpen(false)}><X size={17} /></button></header><div className="engine-dialog__body"><label><span>O que aconteceu?</span><textarea autoFocus rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label><label><span>Leitura</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="confirms">Confirma a hipótese</option><option value="refutes">Refuta a hipótese</option><option value="inconclusive">Inconclusiva</option></select></label></div><footer><button type="button" onClick={() => setEvidenceOpen(false)}>Cancelar</button><button type="submit">Registrar</button></footer></form></div>}
  </section>;
}
