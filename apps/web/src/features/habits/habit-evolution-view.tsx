import { useState } from 'react';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Habit, HabitEvolution } from '../../api';
import { Button } from '../../components/ui';
import { AREA_MAP } from './habit-ui';

export type HabitHeatmapCell = {
  date: string;
  value: number | null;
  expected: boolean;
  completed: boolean;
  relapse: boolean;
};

export function deriveHabitInsight(cells: HabitHeatmapCell[]) {
  const expected = cells.filter((cell) => cell.expected);
  if (expected.length < 14) return null;
  const midpoint = Math.floor(expected.length / 2);
  const rate = (items: HabitHeatmapCell[]) => items.filter((cell) => cell.completed).length / Math.max(1, items.length);
  const before = rate(expected.slice(0, midpoint));
  const after = rate(expected.slice(midpoint));
  if (after - before < .1) return null;
  return `A consistência subiu de ${Math.round(before * 100)}% para ${Math.round(after * 100)}%.`;
}

export function HabitEvolutionView({ evolution, habits, heatmap, period, selectedHabitId, onPeriodChange, onHabitChange }: {
  evolution: HabitEvolution;
  habits: Habit[];
  heatmap: { cells: HabitHeatmapCell[] };
  period: 30 | 90 | 365;
  selectedHabitId: string;
  onPeriodChange: (period: 30 | 90 | 365) => void;
  onHabitChange: (id: string) => void;
}) {
  const [tab, setTab] = useState<'overview' | 'habit'>('overview');
  const insight = deriveHabitInsight(heatmap.cells);
  const selected = habits.find((habit) => habit.id === selectedHabitId);
  return (
    <div className="habit-evolution-view">
      <header className="habit-evolution-header">
        <div><Link to="/habitos" className="habit-back-link"><ArrowLeft size={14} /> Hábitos</Link><h1>Evolução</h1><p>Leia o ritmo. Ajuste o sistema, não a culpa.</p></div>
        <div className="habit-period-switch" aria-label="Período analisado">{([30, 90, 365] as const).map((days) => <Button type="button" variant="tertiary" size="sm" key={days} aria-pressed={period === days} aria-label={`${days} dias`} onClick={() => onPeriodChange(days)}>{days === 365 ? '1 ano' : `${days}d`}</Button>)}</div>
      </header>

      <div className="habit-evolution-tabs" role="tablist" aria-label="Visão de evolução"><button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>Visão geral</button><button type="button" role="tab" aria-selected={tab === 'habit'} onClick={() => setTab('habit')}>Consistência por hábito</button></div>

      {tab === 'overview' ? <section className="habit-overview-panel">
        <div className="habit-rhythm"><span>Ritmo do período</span><strong>{evolution.rhythmPct}%</strong><p>{evolution.completedOccurrences} dias consistentes de {evolution.expectedOccurrences} ocorrências previstas</p><div><span style={{ width: `${Math.min(100, evolution.rhythmPct)}%` }} /></div></div>
        <div className="habit-evolution-areas"><h2>Áreas da vida</h2>{evolution.areas.map((level) => { const area = AREA_MAP[level.lifeArea]; const Icon = area.icon; return <div key={level.lifeArea} className="habit-evolution-area" style={{ '--area-color': area.color } as React.CSSProperties}><Icon size={17} /><span><strong>{area.label}</strong><small>{level.name} · {level.totalXp} XP</small></span><div><span style={{ width: `${level.progressPct}%` }} /></div><b>Nv. {level.level}</b></div>; })}</div>
      </section> : <section className="habit-consistency-panel">
        <div className="habit-consistency-head"><label>Hábito analisado<select aria-label="Hábito analisado" value={selectedHabitId} onChange={(event) => onHabitChange(event.target.value)}>{habits.map((habit) => <option key={habit.id} value={habit.id}>{habit.title}</option>)}</select></label>{selected && <span><CalendarDays size={14} /> {selected.frequencyType === 'daily' ? 'Diário' : 'Recorrente'}</span>}</div>
        <div className="habit-heatmap" role="list" aria-label={`Consistência de ${selected?.title ?? 'hábito'}`}>{heatmap.cells.map((cell) => { const state = cell.relapse ? 'recaída' : cell.completed ? 'concluído' : cell.expected ? 'não concluído' : 'não previsto'; return <span role="listitem" key={cell.date} className={`habit-heat-cell${cell.completed ? ' completed' : ''}${cell.relapse ? ' relapse' : ''}${!cell.expected ? ' idle' : ''}`} title={`${cell.date}: ${state}`} aria-label={`${cell.date}: ${state}`} />; })}</div>
        <div className="habit-heatmap-legend"><span><i className="idle" /> Não previsto</span><span><i /> Previsto</span><span><i className="completed" /> Concluído</span><span><i className="relapse" /> Recaída</span></div>
        {insight && <p className="habit-insight">{insight}</p>}
      </section>}
    </div>
  );
}
