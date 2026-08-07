import { Check, Scale } from 'lucide-react';

import { api } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

function ScenarioView({ project, data, onReload }: ProjectEngineViewProps) {
  return <section aria-labelledby="decision-engine-title"><EngineSectionHeader id="decision-engine-title" eyebrow="CENÁRIOS" title="Ações robustas" description="Priorize ações que ajudam em mais de um futuro possível." /><div className="scenario-actions">{data.scenarioActions?.map((action) => <label key={action.id} data-done={action.done || undefined}><input type="checkbox" checked={action.done} onChange={() => void api.updateMethodologyItem(project.id, action.id, { arrayKey: 'scenarioActions', item: { done: !action.done } }).then(onReload)} /><span>{action.done && <Check size={13} />}</span><div><strong>{action.text}</strong><small>Ajuda em {action.scenarioIds.length} {action.scenarioIds.length === 1 ? 'cenário' : 'cenários'}</small></div></label>)}{!data.scenarioActions?.length && <EngineEmpty><p>Registre ações que continuam boas mesmo quando o cenário muda.</p></EngineEmpty>}</div></section>;
}

export function DecisionEngine(props: ProjectEngineViewProps) {
  const { project, data, onReload } = props;
  if (project.engine.methodology === 'cenario') return <ScenarioView {...props} />;
  const options = data.options ?? [];
  const criteria = data.criteria ?? [];

  async function score(option: typeof options[number], criterionId: string, value: number) {
    await api.updateMethodologyItem(project.id, option.id, {
      arrayKey: 'options',
      item: { scores: { ...(option.scores ?? {}), [criterionId]: value } }
    });
    onReload();
  }

  return <section className="engine-view decision-engine" aria-labelledby="decision-engine-title"><EngineSectionHeader id="decision-engine-title" eyebrow="DECISÃO" title="Matriz de escolha" description="Critérios explícitos reduzem a força do argumento mais recente." />
    {options.length && criteria.length ? <div className="decision-table-wrap"><table className="decision-table"><thead><tr><th>Opção</th>{criteria.map((criterion) => <th key={criterion.id}>{criterion.label}<small>peso {criterion.weight}</small></th>)}<th>Total</th></tr></thead><tbody>{options.map((option) => { const total = criteria.reduce((sum, criterion) => sum + (option.scores?.[criterion.id] ?? 0) * criterion.weight, 0); return <tr key={option.id}><th>{option.label}</th>{criteria.map((criterion) => <td key={criterion.id}><input type="number" min="0" max="5" aria-label={`Pontuação ${option.label} em ${criterion.label}`} value={option.scores?.[criterion.id] ?? ''} onChange={(event) => void score(option, criterion.id, Number(event.target.value))} /></td>)}<td><strong>{total}</strong></td></tr>; })}</tbody></table></div> : <EngineEmpty><p>Adicione pelo menos duas opções e os critérios que realmente importam.</p></EngineEmpty>}
    {data.decisionChoice && <section className="decision-result"><Scale size={17} /><div><span>DECISÃO</span><strong>{data.decisionChoice}</strong><p>{data.decisionJustification}</p></div></section>}
  </section>;
}
