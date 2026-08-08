import { useState } from 'react';
import { ChevronDown, Flame, MoreHorizontal, Plus, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { HabitTodayStat } from '../../api';
import { Button, CompletionControl, IconButton, Popover } from '../../components/ui';
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
  const relapse = habit.type === 'vice' && habit.currentLog?.value === -1;
  return (
    <div className="habit-row-menu">
      <Popover label={`Opções de ${habit.title}`} trigger={<IconButton type="button" label={`Opções de ${habit.title}`} icon={<MoreHorizontal size={16} />} />}>
        {relapse ? <Button type="button" variant="tertiary" size="sm" role="menuitem" leadingIcon={<RotateCcw />} onClick={() => void onUndoRelapse(habit.id)}>Desfazer recaída</Button> : null}
        <Button type="button" variant="tertiary" size="sm" role="menuitem" onClick={() => onEdit(habit)}>Editar</Button>
        <Button type="button" variant="tertiary" size="sm" role="menuitem" onClick={() => onArchive(habit.id)}>Arquivar</Button>
        <Button type="button" variant="danger" size="sm" role="menuitem" onClick={() => onDelete(habit.id)}>Excluir</Button>
      </Popover>
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
        {habit.type === 'binary' && <><CompletionControl checked={habit.isCompletedToday} disabled={busy} label={`${habit.isCompletedToday ? 'Desmarcar' : 'Marcar'} ${habit.title}`} onCheckedChange={() => void props.onToggle(habit.id, habit.isCompletedToday)} /><span className="habit-binary-status">{habit.isCompletedToday ? 'Feito' : 'Pendente'}</span></>}
        {habit.type === 'quantitative' && <>
          <HabitValueEditor habit={habit} currentValue={current} disabled={busy} onSave={(value) => props.onSetTotal(habit.id, value)} onClear={() => props.onClear(habit.id)} />
          <Button type="button" variant="secondary" size="sm" className="habit-action-button" disabled={busy} aria-label={`Adicionar ${habitIncrement(habit.unit)} ${habit.unit ?? ''} a ${habit.title}`} leadingIcon={<Plus />} onClick={() => void props.onIncrement(habit.id, habitIncrement(habit.unit))}>{habitIncrement(habit.unit)} {habit.unit ?? ''}</Button>
          <span className="habit-progress-track" aria-label={`${Math.min(100, Math.round(current / Math.max(1, target) * 100))}% concluído`}><span style={{ width: `${Math.min(100, current / Math.max(1, target) * 100)}%` }} /></span>
        </>}
        {habit.type === 'vice' && <Button type="button" variant={relapse ? 'danger' : 'secondary'} size="sm" className="habit-action-button vice" disabled={busy || relapse} aria-label={`Registrar recaída em ${habit.title}`} leadingIcon={relapse ? <TriangleAlert /> : <ShieldCheck />} onClick={() => void props.onRelapse(habit.id)}>{relapse ? 'Recaída registrada' : 'Sigo firme'}</Button>}
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
