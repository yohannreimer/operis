import { useEffect, useState, type FormEvent } from 'react';
import { Activity, Check, Target, X } from 'lucide-react';

import { api, type ProjectScorecard } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineSectionHeader, EngineSkeleton } from './engine-ui';

export function MetricEngine({ project, onReload }: ProjectEngineViewProps) {
  const [scorecard, setScorecard] = useState<ProjectScorecard | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [lagValue, setLagValue] = useState('');
  const [leadChecks, setLeadChecks] = useState<boolean[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.getProjectScorecard(project.id).then((value) => {
      if (!active) return;
      setScorecard(value);
      const leads = value.metrics.filter((metric) => metric.kind === 'lead');
      setLeadChecks(leads.map((metric) => metric.weekChecked));
      const lag = value.metrics.find((metric) => metric.kind === 'lag');
      setLagValue(lag?.currentValue == null ? '' : String(lag.currentValue));
    }).catch((requestError) => active && setError((requestError as Error).message));
    return () => { active = false; };
  }, [project.id]);

  if (!scorecard && !error) return <EngineSkeleton />;
  if (!scorecard) return <div className="engine-inline-error" role="alert">{error}</div>;

  const leadMetrics = scorecard.metrics.filter((metric) => metric.kind === 'lead');
  const lagMetric = scorecard.metrics.find((metric) => metric.kind === 'lag');
  const percent = project.progress.kind === 'percent' ? project.progress.value : scorecard.summary.lagProgressPercent ?? 0;

  async function submitCheckin(event: FormEvent) {
    event.preventDefault();
    if (!scorecard) return;
    setBusy(true);
    try {
      const value = lagValue.trim() ? Number(lagValue) : null;
      if (lagMetric && value != null && Number.isFinite(value)) {
        await api.createProjectMetricCheckin(lagMetric.id, { value, note: note.trim() || null, syncCurrentValue: true });
      }
      await api.createProjectFrameworkCheckin(project.id, {
        leadOneDone: leadChecks[0] ?? false,
        leadTwoDone: leadChecks[1] ?? false,
        lagValue: value,
        note: note.trim() || null
      });
      setCheckinOpen(false);
      onReload();
    } finally { setBusy(false); }
  }

  return <section className="engine-view metric-engine" aria-labelledby="metric-engine-title">
    <EngineSectionHeader id="metric-engine-title" eyebrow="4DX" title="Ritmo da meta" description="O placar mostra o resultado. A semana mostra se o comportamento está no ritmo." actionLabel="Registrar check-in" onAction={() => setCheckinOpen(true)} />
    <div className="metric-pace">
      <div className="metric-pace__dial" style={{ '--engine-progress': `${percent * 3.6}deg` } as React.CSSProperties}><span><strong>{percent}%</strong><small>progresso</small></span></div>
      <div className="metric-pace__copy"><span>RITMO ESPERADO</span><strong>{project.progress.label}</strong><p>{scorecard.summary.isWeeklyCheckinMissing ? 'O check-in desta semana ainda está aberto.' : 'Semana atual registrada no placar.'}</p></div>
      <div className="metric-pace__facts"><div><Activity size={16} /><span><small>Execução semanal</small><strong>{scorecard.summary.weeklyLeadCompliancePercent}%</strong></span></div><div><Target size={16} /><span><small>Cadência</small><strong>{scorecard.summary.cadenceDays} dias</strong></span></div></div>
    </div>
    <section className="lead-measures"><header><span>MEDIDAS DE DIREÇÃO</span><h3>O que você controla nesta semana</h3></header>{leadMetrics.map((metric) => <article key={metric.id}><span className="lead-measure-check">{metric.weekChecked && <Check size={13} />}</span><div><strong>{metric.name}</strong><small>{metric.currentValue ?? 0}{metric.unit ? ` ${metric.unit}` : ''} de {metric.targetValue ?? '—'}</small></div><span>{metric.weekChecked ? 'registrada' : 'pendente'}</span></article>)}</section>

    {checkinOpen && <div className="engine-dialog-backdrop"><form className="engine-dialog" role="dialog" aria-modal="true" aria-label="Registrar check-in 4DX" onSubmit={submitCheckin}><header><div><span>PLACAR SEMANAL</span><h3>Registrar check-in</h3></div><button type="button" aria-label="Fechar" onClick={() => setCheckinOpen(false)}><X size={17} /></button></header><div className="engine-dialog__body">{leadMetrics.map((metric, index) => <label className="engine-check-line" key={metric.id}><input type="checkbox" checked={leadChecks[index] ?? false} onChange={(event) => setLeadChecks((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} /><span><strong>{metric.name}</strong><small>Compromisso executado nesta semana</small></span></label>)}<label><span>Valor atual{lagMetric ? ` · ${lagMetric.name}` : ''}</span><input type="number" step="any" value={lagValue} onChange={(event) => setLagValue(event.target.value)} /></label><label><span>Nota <em>opcional</em></span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label></div><footer><button type="button" onClick={() => setCheckinOpen(false)}>Cancelar</button><button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar check-in'}</button></footer></form></div>}
  </section>;
}
