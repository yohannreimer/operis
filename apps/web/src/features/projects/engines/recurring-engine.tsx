import { Check, Repeat2 } from 'lucide-react';

import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

export function RecurringEngine({ data }: ProjectEngineViewProps) {
  const cycle = data.cycles?.at(-1);
  const templates = new Map((data.cycleTemplate ?? []).map((item) => [item.id, item]));
  const items = cycle?.items.map((item) => ({ ...item, template: templates.get(item.templateId) })).filter((item) => item.template) ?? [];
  return <section className="engine-view recurring-engine" aria-labelledby="recurring-engine-title"><EngineSectionHeader id="recurring-engine-title" eyebrow="PROCESSO LEGADO" title={cycle?.periodLabel ?? 'Último ciclo'} description="Este ciclo foi preservado para consulta e conclusão do histórico." />
    <div className="recurring-migration-note"><Repeat2 size={17} /><div><strong>Novos processos são criados como Responsabilidades.</strong><p>Isso mantém o cuidado contínuo na Frente, sem fingir que existe uma linha de chegada.</p></div></div>
    {items.length ? <div className="recurring-checklist">{items.map((item) => <div key={item.templateId} data-done={item.done || undefined}><span>{item.done && <Check size={13} />}</span><strong>{item.template?.text}</strong></div>)}</div> : <EngineEmpty><p>Nenhum item disponível no ciclo legado.</p></EngineEmpty>}
  </section>;
}
