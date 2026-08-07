import { CalendarClock, Check, CircleDollarSign } from 'lucide-react';

import { api } from '../../../api';
import type { ProjectEngineViewProps } from '../engine-registry';
import { EngineEmpty, EngineSectionHeader } from './engine-ui';

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

function RunwayView({ project, data, onReload }: ProjectEngineViewProps) {
  const months = data.availableCash != null && data.burnRateMonthly && data.burnRateMonthly > 0
    ? data.availableCash / data.burnRateMonthly : null;
  return <section aria-labelledby="campaign-engine-title"><EngineSectionHeader id="campaign-engine-title" eyebrow="RUNWAY" title="Meses de operação" description="Caixa é uma janela de decisão, não uma barra de progresso." />
    <div className="runway-hero"><CircleDollarSign size={23} /><div><span>RUNWAY ESTIMADO</span><strong>{months == null ? '—' : `${months.toFixed(1)} meses`}</strong><p>{data.availableCash == null ? 'Atualize o caixa disponível.' : `Caixa ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(data.availableCash)} · Burn mensal ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(data.burnRateMonthly ?? 0)}`}</p></div></div>
    <div className="runway-events">{data.runwayEvents?.map((event) => <article key={event.id} data-confirmed={event.confirmed || undefined}><time>{new Date(event.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</time><div><strong>{event.label}</strong><small>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(event.amount)}</small></div>{event.confirmed && <Check size={15} />}</article>)}{!data.runwayEvents?.length && <EngineEmpty><p>Adicione eventos financeiros confirmados para enxergar a janela real.</p></EngineEmpty>}</div>
  </section>;
}

export function CampaignEngine(props: ProjectEngineViewProps) {
  const { project, data, onReload } = props;
  if (project.engine.methodology === 'runway') return <RunwayView {...props} />;
  const launchDate = data.launchDate ?? project.timeHorizonEnd;
  const days = daysUntil(launchDate);
  const tasks = [...(data.dailyTasks ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  async function toggle(item: typeof tasks[number]) {
    await api.updateMethodologyItem(project.id, item.id, { arrayKey: 'dailyTasks', item: { done: !item.done } });
    onReload();
  }

  return <section className="engine-view campaign-engine" aria-labelledby="campaign-engine-title"><EngineSectionHeader id="campaign-engine-title" eyebrow="CAMPANHA" title="Linha de lançamento" description="Cada dia carrega somente o que precisa estar pronto para o próximo." />
    <div className="campaign-countdown"><CalendarClock size={21} /><div><span>JANELA ATUAL</span><strong>{days == null ? 'Data de lançamento não definida' : days === 1 ? '1 dia para o lançamento' : `${days} dias para o lançamento`}</strong><p>{launchDate ? new Date(launchDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Defina uma data para orientar a sequência.'}</p></div>{data.campaignGoal != null && <b>Meta {data.campaignGoal}</b>}</div>
    <div className="campaign-timeline">{tasks.map((item, index) => <label key={item.id} data-done={item.done || undefined}><time>{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</time><span className="campaign-line"><i />{index < tasks.length - 1 && <b />}</span><input type="checkbox" aria-label={item.text} checked={item.done} onChange={() => void toggle(item)} /><span className="campaign-check">{item.done && <Check size={13} />}</span><strong>{item.text}</strong></label>)}{!tasks.length && <EngineEmpty><p>Quebre o lançamento nas atividades críticas de cada dia.</p></EngineEmpty>}</div>
  </section>;
}
