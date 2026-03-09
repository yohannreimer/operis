import { useEffect, useMemo, useState } from 'react';

import { Modal } from './modal';

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
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" onClick={() => void handleConfirm()} disabled={!canSubmit}>
            Concluir e registrar
          </button>
        </div>
      }
    >
      <div className="completion-note-flow">
        <p>
          Ao concluir, o sistema salva um log em <strong>Notas &gt; Conclusões</strong>.
        </p>

        <div className="completion-mode-switch">
          <button
            type="button"
            className={mode === 'note' ? 'active' : ''}
            onClick={() => setMode('note')}
            disabled={busy}
          >
            Adicionar nota final
          </button>
          <button
            type="button"
            className={mode === 'no_note' ? 'active' : ''}
            onClick={() => setMode('no_note')}
            disabled={busy}
          >
            Nada a escrever
          </button>
        </div>

        {mode === 'note' ? (
          <label className="modal-field">
            <span>Resumo da conclusão</span>
            <textarea
              rows={5}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="O que foi entregue, resultado, contexto e próximo passo."
              maxLength={5000}
            />
          </label>
        ) : (
          <div className="completion-note-placeholder">
            Será salvo automaticamente: <strong>"Nada a registrar."</strong>
          </div>
        )}
      </div>
    </Modal>
  );
}
