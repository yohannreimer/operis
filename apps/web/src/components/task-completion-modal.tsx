import { useEffect, useMemo, useState } from 'react';

import { fireTaskComplete } from '../utils/celebrations';
import { Modal } from './modal';
import { Button, Field } from './ui';

type CompletionMode = 'note' | 'no_note';

type TaskCompletionModalProps = {
  open: boolean;
  taskTitle: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (input: { completionMode: CompletionMode; completionNote?: string }) => Promise<void> | void;
};

export function TaskCompletionModal({
  open,
  taskTitle,
  busy = false,
  onClose,
  onConfirm
}: TaskCompletionModalProps) {
  const [mode, setMode] = useState<CompletionMode>('note');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode('note');
    setNote('');
  }, [open]);

  const canSubmit = useMemo(() => {
    if (busy) {
      return false;
    }

    if (mode === 'no_note') {
      return true;
    }

    return note.trim().length > 0;
  }, [mode, note, busy]);

  async function handleConfirm() {
    if (!canSubmit) {
      return;
    }

    fireTaskComplete();
    await onConfirm({
      completionMode: mode,
      completionNote: mode === 'note' ? note.trim() : undefined
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Concluir tarefa"
      subtitle={taskTitle}
      size="md"
      footer={
        <div className="inline-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={!canSubmit} loading={busy}>Concluir e registrar</Button>
        </div>
      }
    >
      <div className="completion-note-flow">
        <p>
          Ao concluir, o sistema salva um log em <strong>Notas &gt; Conclusões</strong>.
        </p>

        <div className="completion-mode-switch">
          <Button
            type="button"
            variant="secondary"
            aria-pressed={mode === 'note'}
            onClick={() => setMode('note')}
            disabled={busy}
          >
            Adicionar nota final
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-pressed={mode === 'no_note'}
            onClick={() => setMode('no_note')}
            disabled={busy}
          >
            Nada a escrever
          </Button>
        </div>

        {mode === 'note' ? (
          <Field label="Resumo da conclusão" htmlFor="task-completion-note">
            <textarea
              id="task-completion-note"
              rows={5}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="O que foi entregue, resultado, contexto e próximo passo."
              maxLength={5000}
            />
          </Field>
        ) : (
          <div className="completion-note-placeholder">
            Será salvo automaticamente: <strong>"Nada a registrar."</strong>
          </div>
        )}
      </div>
    </Modal>
  );
}
