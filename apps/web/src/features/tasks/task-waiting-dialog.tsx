import { FormEvent, useEffect, useState } from 'react';

import { Modal } from '../../components/modal';
import { Button, Field } from '../../components/ui';

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
        <Field label="Pessoa ou dependência" htmlFor="task-waiting-person"><input id="task-waiting-person" autoFocus value={person} onChange={(event) => setPerson(event.target.value)} placeholder="Cliente, fornecedor, aprovação…" /></Field>
        <div className="task-filter-pair">
          <Field label="Tipo" htmlFor="task-waiting-type"><select id="task-waiting-type" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="resposta">Resposta</option><option value="entrega">Entrega</option></select></Field>
          <Field label="Prioridade" htmlFor="task-waiting-priority"><select id="task-waiting-priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></Field>
        </div>
        <Field label="Revisar em" htmlFor="task-waiting-date"><input id="task-waiting-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <div className="task-dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy} disabled={!person.trim() || !date}>Aguardar</Button></div>
      </form>
    </Modal>
  );
}
