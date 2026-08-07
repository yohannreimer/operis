import { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';

import { api } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

export function FunnelEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const stages = [...(data.funilStages ?? [])].sort((a, b) => a.order - b.order);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => setValues(Object.fromEntries(stages.map((stage) => [stage.id, stage.value == null ? '' : String(stage.value)]))), [data.funilStages]);

  async function save(stageId: string) {
    const value = values[stageId]?.trim() ? Number(values[stageId]) : null;
    await api.updateMethodologyItem(project.id, stageId, { arrayKey: 'funilStages', item: { value } });
    onReload();
  }

  return <section className="engine-view funnel-engine" aria-labelledby="funnel-engine-title"><EngineSectionHeader id="funnel-engine-title" eyebrow="FUNIL" title="Conversão entre etapas" description="Atualize os volumes e ataque a maior perda, não o número mais vistoso." />{stages.length ? <div className="funnel-stages">{stages.map((stage, index) => { const previous = stages[index - 1]; const conversion = previous?.value && stage.value != null ? Math.round(stage.value / previous.value * 100) : null; return <div key={stage.id} className="funnel-stage-row">{index > 0 && <span className="funnel-conversion"><ArrowDown size={13} />{conversion == null ? '—' : `${conversion}%`}</span>}<label><span>{stage.label}</span><input aria-label={`Valor de ${stage.label}`} type="number" min="0" value={values[stage.id] ?? ''} onChange={(event) => setValues({ ...values, [stage.id]: event.target.value })} onBlur={() => void save(stage.id)} /></label><i style={{ width: `${stages[0]?.value && stage.value != null ? Math.min(100, stage.value / stages[0].value * 100) : 0}%` }} /></div>; })}</div> : <EngineEmpty><p>Adicione etapas e seus volumes para enxergar a conversão.</p></EngineEmpty>}</section>;
}
