import { useState } from 'react';
import { Check, ChevronDown, Flame, MoreHorizontal, Plus, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { HabitTodayStat } from '../../api';
import { AREA_MAP, habitIncrement } from './habit-ui';
import { HabitValueEditor } from './habit-value-editor';

export type HabitDayListProps = {
  stats: HabitTodayStat[];
  busyIds: Set<string>;
  onToggle: (id: string, completed: boolean) => Promise<void> | void;
  onIncrement: (id: string, amount: number) => Promise<void> | void;
  onSetTotal: (id: string, value: number) => Promise<void> | void;
  onRelapse: (id: string) => Promise<void> | void;
  onUndoRelapse: (id: string) => Promise<void> | void;
  onClear: (id: string) => Promise<void> | void;
  onEdit: (habit: HabitTodayStat) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
};

function HabitMenu({ habit, onEdit, onArchive, onDelete, onUndoRelapse }: Pick<HabitDayListProps, 'onEdit' | 'onArchive' | 'onDelete' | 'onUndoRelapse'> & { habit: HabitTodayStat }) {
  const [open, setOpen] = useState(false);
  const relapse = habit.type === 'vice' && habit.currentLog?.value === -1;
  return (
    <div className="habit-row-menu">
      <button type="button" className="habit-icon-button" aria-label={`Opções de ${habit.title}`} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={16} /></button>
      {open && <div className="habit-row-menu-popover" role="menu">
        {relapse && <button type="button" role="menuitem" onClick={() => { setOpen(false); void onUndoRelapse(habit.id); }}><RotateCcw size={13} /> Desfazer recaída</button>}
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(habit); }}>Editar</button>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onArchive(habit.id); }}>Arquivar</button>
        <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(habit.id); }}>Excluir</button>
      </div>}
    </div>
  );
}

function HabitRow({ habit, props }: { habit: HabitTodayStat; props: HabitDayListProps }) {
  const busy = props.busyIds.has(habit.id);
  const area = AREA_MAP[habit.lifeArea];
  const current = habit.currentLog?.value ?? 0;
  const target = habit.dailyTarget ?? habit.frequencyTarget;
  const relapse = habit.type === 'vice' && current === -1;
  const title = <><span className="habit-row-title">{habit.icon && <span aria-hidden="true">{habit.icon}</span>}{habit.title}</span><span className="habit-row-meta">{area.label}{habit.streak > 1 ? <><Flame size={11} /> {habit.streak} dias</> : null}</span></>;

  return (
    <div className={`habit-ledger-row${habit.isCompletedToday ? ' completed' : ''}${relapse ? ' relapse' : ''}`} style={{ '--habit-area': area.color } as React.CSSProperties}>
      <span className="habit-area-mark" aria-hidden="true" />
      <div className="habit-row-copy">{title}</div>
      <div className="habit-row-primary">
        {habit.type === 'binary' && <button type="button" className={`habit-action-button${habit.isCompletedToday ? ' active' : ''}`} disabled={busy} aria-label={`${habit.isCompletedToday ? 'Desmarcar' : 'Marcar'} ${habit.title}`} onClick={() => void props.onToggle(habit.id, habit.isCompletedToday)}><Check size={15} />{habit.isCompletedToday ? 'Feito' : 'Marcar'}</button>}
        {habit.type === 'quantitative' && <>
          <HabitValueEditor habit={habit} currentValue={current} disabled={busy} onSave={(value) => props.onSetTotal(habit.id, value)} onClear={() => props.onClear(habit.id)} />
          <button type="button" className="habit-action-button" disabled={busy} aria-label={`Adicionar ${habitIncrement(habit.unit)} ${habit.unit ?? ''} a ${habit.title}`} onClick={() => void props.onIncrement(habit.id, habitIncrement(habit.unit))}><Plus size={15} />{habitIncrement(habit.unit)} {habit.unit ?? ''}</button>
          <span className="habit-progress-track" aria-label={`${Math.min(100, Math.round(current / Math.max(1, target) * 100))}% concluído`}><span style={{ width: `${Math.min(100, current / Math.max(1, target) * 100)}%` }} /></span>
        </>}
        {habit.type === 'vice' && <button type="button" className={`habit-action-button vice${relapse ? 'active' : ''}`} disabled={busy || relapse} aria-label={`Registrar recaída em ${habit.title}`} onClick={() => void props.onRelapse(habit.id)}>{relapse ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />}{relapse ? 'Recaída registrada' : 'Sigo firme'}</button>}
      </div>
      <HabitMenu habit={habit} onEdit={props.onEdit} onArchive={props.onArchive} onDelete={props.onDelete} onUndoRelapse={props.onUndoRelapse} />
    </div>
  );
}

export function HabitDayList(props: HabitDayListProps) {
  const [otherOpen, setOtherOpen] = useState(false);
  const scheduled = props.stats.filter((habit) => habit.isScheduledForDate);
  const other = props.stats.filter((habit) => !habit.isScheduledForDate);
  return (
    <section className="habit-ledger" aria-label="Hábitos da data selecionada">
      <h2 className="habit-ledger-label">Para hoje</h2>
      <div className="habit-ledger-list">
        {scheduled.length ? scheduled.map((habit) => <HabitRow key={habit.id} habit={habit} props={props} />) : <p className="habit-ledger-empty">Nenhum hábito previsto para esta data.</p>}
      </div>
      {other.length > 0 && <>
        <button type="button" className="habit-other-toggle" aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)}><span>Outros hábitos</span><span className="habit-other-count">{other.length}</span><ChevronDown size={14} /></button>
        {otherOpen && <div className="habit-ledger-list secondary">{other.map((habit) => <HabitRow key={habit.id} habit={habit} props={props} />)}</div>}
      </>}
    </section>
  );
}
