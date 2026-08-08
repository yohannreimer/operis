import { useState } from 'react';
import { Button, Field, Sheet } from './ui';

type Props = {
  open: boolean;
  onClose: () => void;
  onNow: () => void;
  onScheduled: (isoDateTime: string) => void;
};

export function InboxScheduleSheet({ open, onClose, onNow, onScheduled }: Props) {
  const [time, setTime] = useState('');

  function handleScheduled() {
    if (!time) return;
    const today = new Date().toISOString().slice(0, 10);
    const isoDateTime = `${today}T${time}:00`;
    onScheduled(isoDateTime);
    setTime('');
    onClose();
  }

  return (
    <Sheet
      open={open}
      title="Executar hoje"
      side="bottom"
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Cancelar</Button>}
    >
      <div className="schedule-sheet-options">
        <Button
          type="button"
          variant="secondary"
          className="schedule-sheet-option-btn"
          onClick={() => { onNow(); onClose(); }}
        >
          <strong>Agora</strong>
          <small>Ir para execução imediatamente</small>
        </Button>

        <div className="schedule-sheet-divider">ou agendar horário</div>

        <div className="schedule-sheet-time-row">
          <Field label="Horário" htmlFor="inbox-schedule-time">
              <input
                id="inbox-schedule-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
          </Field>
          <Button type="button" onClick={handleScheduled} disabled={!time}>Agendar</Button>
        </div>
      </div>
    </Sheet>
  );
}
