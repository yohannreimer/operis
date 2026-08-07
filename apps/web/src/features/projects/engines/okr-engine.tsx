import { api } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

export function OkrEngine({ project, data, onReload }: ProjectEngineViewProps) {
  const krs = [...(data.krs ?? [])].sort((a, b) => a.order - b.order);
  async function change(id: string, item: Record<string, unknown>) {
    await api.updateMethodologyItem(project.id, id, { arrayKey: 'krs', item });
    onReload();
  }
  return <section className="engine-view okr-engine" aria-labelledby="okr-engine-title"><EngineSectionHeader id="okr-engine-title" eyebrow={data.okrPeriod ?? 'OKR'} title="Resultados-chave" description="O objetivo dá direção; os KRs dizem se a realidade mudou." />
    <div className="okr-list">{krs.map((kr) => { const percent = kr.targetValue === 0 ? 0 : Math.max(0, Math.min(100, Math.round(kr.currentValue / kr.targetValue * 100))); return <article key={kr.id}><div className="okr-index">KR{kr.order}</div><div className="okr-copy"><strong>{kr.description}</strong><span><i><b style={{ width: `${percent}%` }} /></i><small>{kr.currentValue} de {kr.targetValue}{kr.unit ? ` ${kr.unit}` : ''} · {percent}%</small></span></div><label><span>Confiança</span><select aria-label={`Confiança ${kr.description}`} value={kr.confidence} onChange={(event) => void change(kr.id, { confidence: event.target.value })}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label><label><span>Atual</span><input aria-label={`Valor atual ${kr.description}`} type="number" value={kr.currentValue} onChange={(event) => void change(kr.id, { currentValue: Number(event.target.value) })} /></label></article>; })}{!krs.length && <EngineEmpty><p>Adicione resultados mensuráveis que, juntos, provem o avanço do objetivo.</p></EngineEmpty>}</div>
  </section>;
}
