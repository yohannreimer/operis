import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Modal } from '../../components/modal';
import { localDateKey, toIsoDateTime } from '../../utils/date';

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

export function TaskScheduleDialog({ open, taskTitle, estimatedMinutes, onClose, onSchedule }: {
  open: boolean;
  taskTitle: string;
  estimatedMinutes?: number | null;
  onClose(): void;
  onSchedule(date: string, startTime: string, endTime: string): Promise<unknown>;
}) {
  const [date, setDate] = useState(localDateKey());
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(String(estimatedMinutes || 60));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setDuration(String(estimatedMinutes || 60)); }, [estimatedMinutes, open]);
  const endLabel = useMemo(() => {
    const start = toIsoDateTime(date, time);
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(addMinutes(start, Number(duration) || 60)));
  }, [date, duration, time]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const start = toIsoDateTime(date, time);
    setBusy(true);
    try { await onSchedule(date, start, addMinutes(start, Number(duration) || 60)); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Agendar uma sessão" subtitle={taskTitle} size="md">
      <form className="task-schedule-form" onSubmit={submit}>
        <div className="task-schedule-grid"><label><span>Data</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label><span>Início</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label><label><span>Duração</span><select value={duration} onChange={(e) => setDuration(e.target.value)}>{[15, 30, 45, 60, 90, 120, 180].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label></div>
        <p className="task-schedule-preview">Sessão termina às <strong>{endLabel}</strong>. A tarefa continua no mesmo movimento.</p>
        <div className="task-dialog-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy}>{busy ? 'Agendando…' : 'Adicionar à Agenda'}</button></div>
      </form>
    </Modal>
  );
}
