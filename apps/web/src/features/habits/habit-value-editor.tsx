import { useEffect, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';

import type { HabitTodayStat } from '../../api';
import { Modal } from '../../components/modal';
import { Button, Field } from '../../components/ui';

export function HabitValueEditor({ habit, currentValue, disabled, onSave, onClear }: {
  habit: HabitTodayStat;
  currentValue: number;
  disabled?: boolean;
  onSave: (value: number) => Promise<void> | void;
  onClear: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentValue));
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setValue(String(currentValue));
  }, [currentValue, open]);

  function close() {
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  async function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed === 0) await onClear();
    else await onSave(parsed);
    close();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        size="sm"
        className="habit-exact-button"
        disabled={disabled}
        aria-label={`Informar valor exato de ${habit.title}`}
        leadingIcon={<PencilLine />}
        onClick={() => setOpen(true)}
      >
        {currentValue}/{habit.dailyTarget ?? habit.frequencyTarget}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={`Valor de ${habit.title}`}
        subtitle="Informe o total realizado nesta data. Este valor substitui o total atual."
        footer={(
          <div className="habit-value-actions">
            <Button type="button" variant="secondary" onClick={close}>Cancelar</Button>
            <Button type="button" onClick={() => void save()} disabled={!value || Number(value) < 0}>Salvar total</Button>
          </div>
        )}
      >
        <Field label={`Total ${habit.unit ? `em ${habit.unit}` : ''}`} htmlFor={`habit-value-${habit.id}`}>
          <input
            id={`habit-value-${habit.id}`}
            className="habit-value-input"
            autoFocus
            type="number"
            min="0"
            step="any"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void save(); }}
          />
        </Field>
      </Modal>
    </>
  );
}
