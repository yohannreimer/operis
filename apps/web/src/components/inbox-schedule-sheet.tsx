import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

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
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content schedule-sheet" aria-describedby={undefined}>
          <Dialog.Title className="modal-title">Executar hoje</Dialog.Title>

          <div className="schedule-sheet-options">
            <button
              type="button"
              className="schedule-sheet-option-btn"
              onClick={() => { onNow(); onClose(); }}
            >
              <strong>Agora</strong>
              <small>Ir para execução imediatamente</small>
            </button>

            <div className="schedule-sheet-divider">ou agendar horário</div>

            <div className="schedule-sheet-time-row">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <button
                type="button"
                onClick={handleScheduled}
                disabled={!time}
              >
                Agendar
              </button>
            </div>
          </div>

          <button type="button" className="ghost-button" onClick={onClose} style={{ marginTop: '12px', width: '100%' }}>
            Cancelar
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
