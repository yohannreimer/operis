import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { PencilLine, X } from 'lucide-react';
import type { HabitTodayStat } from '../../api';

export function HabitValueEditor({ habit, currentValue, disabled, onSave, onClear }: {
  habit: HabitTodayStat;
  currentValue: number;
  disabled?: boolean;
  onSave: (value: number) => Promise<void> | void;
  onClear: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentValue));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setValue(String(currentValue));
  }, [currentValue, open]);

  async function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed === 0) await onClear();
    else await onSave(parsed);
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="habit-exact-button" disabled={disabled} aria-label={`Informar valor exato de ${habit.title}`}>
          <PencilLine size={14} />
          <span>{currentValue}/{habit.dailyTarget ?? habit.frequencyTarget}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="radix-overlay" />
        <Dialog.Content className="habit-value-dialog" aria-describedby="habit-value-help" onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}>
          <div className="habit-value-dialog-head">
            <Dialog.Title>Valor de {habit.title}</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="habit-icon-button" aria-label="Fechar editor"><X size={16} /></button></Dialog.Close>
          </div>
          <Dialog.Description id="habit-value-help">Informe o total realizado nesta data. Este valor substitui o total atual.</Dialog.Description>
          <label>
            Total {habit.unit ? `em ${habit.unit}` : ''}
            <input ref={inputRef} type="number" min="0" step="any" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(); }} />
          </label>
          <div className="habit-value-actions">
            <Dialog.Close asChild><button type="button" className="ghost-button">Cancelar</button></Dialog.Close>
            <button type="button" onClick={() => void save()} disabled={!value || Number(value) < 0}>Salvar total</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
