import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  api,
  type HabitFrequency,
  type HabitLifeArea,
  type HabitRadarStats,
  type HabitTodayStat,
  type HabitType,
  type RecurrenceDay,
} from '../api';
import { HabitDayList } from '../features/habits/habit-day-list';
import { ALL_DAYS, AREA_MAP, DAY_LABELS, LIFE_AREAS } from '../features/habits/habit-ui';
import '../features/habits/habits.css';
import { localDateKey } from '../utils/date';

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dateCopy(value: string, today: string) {
  if (value === today) return { overline: new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }), title: 'Hábitos de hoje' };
  if (value === addDays(today, -1)) return { overline: 'Dia anterior', title: 'Hábitos de ontem' };
  const formatted = new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  return { overline: 'Ritual diário', title: `Hábitos de ${formatted}` };
}

type HabitForm = {
  title: string;
  icon: string;
  lifeArea: HabitLifeArea;
  type: HabitType;
  frequencyType: HabitFrequency;
  frequencyTarget: number;
  specificDays: RecurrenceDay[];
  unit: string;
  dailyTarget: number;
};

function HabitFormDialog({ open, habit, onOpenChange, onSaved }: {
  open: boolean;
  habit: HabitTodayStat | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const initial = useMemo<HabitForm>(() => ({
    title: habit?.title ?? '', icon: habit?.icon ?? '', lifeArea: habit?.lifeArea ?? 'corpo',
    type: habit?.type ?? 'binary', frequencyType: habit?.frequencyType ?? 'daily',
    frequencyTarget: habit?.frequencyTarget ?? 1, specificDays: habit?.specificDays ?? [],
    unit: habit?.unit ?? '', dailyTarget: habit?.dailyTarget ?? 1,
  }), [habit]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(initial); }, [initial, open]);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(), icon: form.icon.trim() || undefined, lifeArea: form.lifeArea,
      type: form.type, frequencyType: form.frequencyType,
      frequencyTarget: form.frequencyType === 'weekly' || form.frequencyType === 'monthly' ? Math.max(1, form.frequencyTarget) : 1,
      specificDays: form.frequencyType === 'specific_days' ? form.specificDays : [],
      unit: form.type === 'quantitative' ? form.unit.trim() || undefined : undefined,
      dailyTarget: form.type === 'quantitative' ? Math.max(1, form.dailyTarget) : undefined,
    };
    try {
      if (habit) await api.updateHabit(habit.id, payload);
      else await api.createHabit(payload);
      toast.success(habit ? 'Hábito atualizado' : 'Hábito criado');
      onOpenChange(false);
      await onSaved();
    } catch { toast.error('Não foi possível salvar o hábito'); }
    finally { setSaving(false); }
  }

  function toggleDay(day: RecurrenceDay) {
    setForm((current) => ({ ...current, specificDays: current.specificDays.includes(day) ? current.specificDays.filter((item) => item !== day) : [...current.specificDays, day] }));
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay" />
        <Dialog.Content className="habit-form-dialog">
          <div className="habit-form-head">
            <div><Dialog.Title>{habit ? 'Editar hábito' : 'Novo hábito'}</Dialog.Title><Dialog.Description>Defina o comportamento que você quer tornar recorrente.</Dialog.Description></div>
            <Dialog.Close asChild><button type="button" className="habit-icon-button" aria-label="Fechar formulário"><X size={16} /></button></Dialog.Close>
          </div>
          <div className="habit-form-grid">
            <label className="habit-form-title">Nome<input autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Leitura" /></label>
            <label>Emoji<input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} placeholder="Opcional" maxLength={4} /></label>
            <label>Área<select value={form.lifeArea} onChange={(event) => setForm({ ...form, lifeArea: event.target.value as HabitLifeArea })}>{LIFE_AREAS.map((area) => <option key={area.key} value={area.key}>{area.label}</option>)}</select></label>
            <label>Tipo<select value={form.type} disabled={Boolean(habit)} onChange={(event) => setForm({ ...form, type: event.target.value as HabitType })}><option value="binary">Feito ou não feito</option><option value="quantitative">Quantidade</option><option value="vice">Evitar recaída</option></select></label>
            <label>Frequência<select value={form.frequencyType} onChange={(event) => setForm({ ...form, frequencyType: event.target.value as HabitFrequency })}><option value="daily">Todos os dias</option><option value="specific_days">Dias específicos</option><option value="weekly">Meta semanal</option><option value="monthly">Meta mensal</option></select></label>
            {(form.frequencyType === 'weekly' || form.frequencyType === 'monthly') && <label>Meta por período<input type="number" min="1" value={form.frequencyTarget} onChange={(event) => setForm({ ...form, frequencyTarget: Number(event.target.value) })} /></label>}
            {form.type === 'quantitative' && <><label>Unidade<input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="páginas, min, km" /></label><label>Meta diária<input type="number" min="1" value={form.dailyTarget} onChange={(event) => setForm({ ...form, dailyTarget: Number(event.target.value) })} /></label></>}
          </div>
          {form.frequencyType === 'specific_days' && <fieldset className="habit-weekdays"><legend>Dias da semana</legend>{ALL_DAYS.map((day) => <button type="button" key={day} className={form.specificDays.includes(day) ? 'active' : ''} onClick={() => toggleDay(day)}>{DAY_LABELS[day]}</button>)}</fieldset>}
          <div className="habit-form-actions"><Dialog.Close asChild><button type="button" className="ghost-button">Cancelar</button></Dialog.Close><button type="button" onClick={() => void save()} disabled={saving || !form.title.trim()}>{saving ? 'Salvando…' : 'Salvar hábito'}</button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function HabitosPage() {
  const today = localDateKey();
  const [date, setDate] = useState(today);
  const [habits, setHabits] = useState<HabitTodayStat[]>([]);
  const [radar, setRadar] = useState<HabitRadarStats | null>(null);
  const [ready, setReady] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitTodayStat | null>(null);
  const copy = dateCopy(date, today);

  const load = useCallback(async () => {
    try {
      const [stats, radarStats] = await Promise.all([
        api.getHabitsTodayStats(date, { includeUnscheduled: true }), api.getHabitsRadar()
      ]);
      setHabits(stats); setRadar(radarStats);
    } catch { toast.error('Não foi possível carregar os hábitos'); }
    finally { setReady(true); }
  }, [date]);

  useEffect(() => { setReady(false); void load(); }, [load]);

  const mutate = useCallback(async (id: string, action: () => Promise<unknown>, success?: string) => {
    setBusyIds((current) => new Set(current).add(id));
    try { await action(); await load(); if (success) toast.success(success); }
    catch { toast.error('Não foi possível atualizar o hábito'); }
    finally { setBusyIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
  }, [load]);

  const undo = useCallback((id: string) => mutate(id, () => api.deleteHabitLog(id, date)), [date, mutate]);
  const relapse = useCallback(async (id: string) => {
    setBusyIds((current) => new Set(current).add(id));
    try {
      await api.habitRecaiu(id, date); await load();
      toast('Recaída registrada', { action: { label: 'Desfazer', onClick: () => void undo(id) } });
    } catch { toast.error('Não foi possível registrar a recaída'); }
    finally { setBusyIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
  }, [date, load, undo]);

  const remove = useCallback(async (id: string, label: string) => {
    if (!window.confirm(`${label} este hábito?`)) return;
    try { await api.archiveHabit(id); toast.success(label === 'Excluir' ? 'Hábito removido' : 'Hábito arquivado'); await load(); }
    catch { toast.error('Não foi possível alterar o hábito'); }
  }, [load]);

  const topAreas = LIFE_AREAS.filter((area) => radar?.[area.key]).sort((a, b) => (radar?.[b.key]?.totalXp ?? 0) - (radar?.[a.key]?.totalXp ?? 0)).slice(0, 3);

  return (
    <div className="habits-page">
      <header className="habits-page-header">
        <div><p className="habits-page-overline">{copy.overline}</p><h1>{copy.title}</h1><p>Registre o dia em poucos segundos. Consistência antes de perfeição.</p></div>
        <div className="habits-header-actions">
          <div className="habits-date-nav"><button type="button" className="habit-icon-button" aria-label="Dia anterior" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={17} /></button><button type="button" className="habit-icon-button" aria-label="Próximo dia" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}><ChevronRight size={17} /></button></div>
          <button type="button" className="habits-new-button" onClick={() => { setEditingHabit(null); setFormOpen(true); }}><Plus size={16} /><span>Novo hábito</span></button>
        </div>
      </header>

      {!ready ? <div className="habit-ledger-loading" aria-label="Carregando hábitos"><span /><span /><span /></div> : <HabitDayList
        stats={habits} busyIds={busyIds}
        onToggle={(id, completed) => mutate(id, () => completed ? api.deleteHabitLog(id, date) : api.logHabit(id, { date }))}
        onIncrement={(id, amount) => mutate(id, () => api.logHabit(id, { date, value: amount }))}
        onSetTotal={(id, value) => mutate(id, () => api.setHabitTotal(id, { date, value }))}
        onClear={(id) => mutate(id, () => api.deleteHabitLog(id, date))}
        onRelapse={relapse} onUndoRelapse={undo}
        onEdit={(habit) => { setEditingHabit(habit); setFormOpen(true); }}
        onArchive={(id) => void remove(id, 'Arquivar')} onDelete={(id) => void remove(id, 'Excluir')}
      />}

      {radar && topAreas.length > 0 && <section className="habit-rpg-summary">
        <div className="habit-rpg-summary-head"><h2>Evolução por área</h2><Link to="/habitos/evolucao">Ver evolução completa</Link></div>
        <div className="habit-area-levels">{topAreas.map((area) => { const level = radar[area.key]; const Icon = AREA_MAP[area.key].icon; return <div key={area.key} className="habit-area-level" style={{ '--area-color': area.color } as React.CSSProperties}><Icon size={18} /><span><strong>{area.label}</strong><small>{level.name}</small></span><span>Nv. {level.level}</span></div>; })}</div>
      </section>}

      <HabitFormDialog open={formOpen} habit={editingHabit} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditingHabit(null); }} onSaved={load} />
    </div>
  );
}
