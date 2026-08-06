import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type Habit, type HabitEvolution, type HabitLog, type RecurrenceDay } from '../api';
import { HabitEvolutionView, type HabitHeatmapCell } from '../features/habits/habit-evolution-view';
import '../features/habits/habits.css';

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}

const DAY_KEYS: RecurrenceDay[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function makeCells(habit: Habit | undefined, logs: HabitLog[], endDate: string, days: number): HabitHeatmapCell[] {
  if (!habit) return [];
  const values = new Map(logs.map((log) => [log.date, log.value]));
  const start = addDays(endDate, -(days - 1));
  const cells: HabitHeatmapCell[] = [];
  for (let date = start; date <= endDate; date = addDays(date, 1)) {
    const day = DAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const expected = habit.frequencyType !== 'specific_days' || habit.specificDays.includes(day);
    const value = values.get(date) ?? null;
    cells.push({ date, value, expected, relapse: value === -1, completed: habit.type === 'vice' ? expected && value !== -1 : expected && (value ?? 0) > 0 });
  }
  return cells;
}

export function HabitEvolutionPage() {
  const [period, setPeriod] = useState<30 | 90 | 365>(90);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedHabitId, setSelectedHabitId] = useState('');
  const [evolution, setEvolution] = useState<HabitEvolution | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true; setReady(false);
    Promise.all([api.getHabitEvolution(period), api.getHabits({ status: 'ativo' })]).then(([summary, items]) => {
      if (!live) return; setEvolution(summary); setHabits(items); setSelectedHabitId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? '');
    }).catch(() => toast.error('Não foi possível carregar a evolução')).finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [period]);

  useEffect(() => {
    if (!selectedHabitId) { setLogs([]); return; }
    let live = true;
    api.getHabitHeatmap(selectedHabitId, period).then((result) => { if (live) setLogs(result.logs); }).catch(() => toast.error('Não foi possível carregar a consistência'));
    return () => { live = false; };
  }, [period, selectedHabitId]);

  const selected = habits.find((habit) => habit.id === selectedHabitId);
  const heatmap = useMemo(() => ({ cells: evolution ? makeCells(selected, logs, evolution.endDate, period) : [] }), [evolution, logs, period, selected]);
  if (!ready || !evolution) return <div className="habit-evolution-loading" aria-label="Carregando evolução"><span /></div>;
  return <HabitEvolutionView evolution={evolution} habits={habits} heatmap={heatmap} period={period} selectedHabitId={selectedHabitId} onPeriodChange={setPeriod} onHabitChange={setSelectedHabitId} />;
}
