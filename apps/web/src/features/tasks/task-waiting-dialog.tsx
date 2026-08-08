import { FormEvent, useEffect, useState } from 'react';

import { Modal } from '../../components/modal';

export type TaskWaitingValues = {
  waitingOnPerson: string;
  waitingType: 'resposta' | 'entrega';
  waitingPriority: 'alta' | 'media' | 'baixa';
  waitingDueDate: string;
};

type Props = {
  open: boolean;
  taskTitle: string;
  onClose(): void;
  onConfirm(values: TaskWaitingValues): void | Promise<void>;
};

export function TaskWaitingDialog({ open, taskTitle, onClose, onConfirm }: Props) {
  const [person, setPerson] = useState('');
  const [type, setType] = useState<TaskWaitingValues['waitingType']>('resposta');
  const [priority, setPriority] = useState<TaskWaitingValues['waitingPriority']>('media');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPerson(''); setType('resposta'); setPriority('media'); setDate('');
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!person.trim() || !date) return;
    setBusy(true);
    try {
      await onConfirm({
        waitingOnPerson: person.trim(), waitingType: type, waitingPriority: priority,
        waitingDueDate: new Date(`${date}T12:00:00`).toISOString()
      });
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="O que precisa acontecer?" subtitle={taskTitle} size="md">
      <form className="task-waiting-form" onSubmit={submit}>
        <label><span>Pessoa ou dependência</span><input autoFocus value={person} onChange={(event) => setPerson(event.target.value)} placeholder="Cliente, fornecedor, aprovação…" /></label>
        <div className="task-filter-pair">
          <label><span>Tipo</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="resposta">Resposta</option><option value="entrega">Entrega</option></select></label>
          <label><span>Prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
        </div>
        <label><span>Revisar em</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <div className="task-dialog-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy || !person.trim() || !date}>{busy ? 'Movendo…' : 'Aguardar'}</button></div>
      </form>
    </Modal>
  );
}
