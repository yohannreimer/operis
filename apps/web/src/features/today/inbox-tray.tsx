import { useEffect, useRef, useState } from 'react';
import { Inbox, X } from 'lucide-react';

import type { InboxItem, Task } from '../../api';
import { CreateTaskModal } from '../../components/create-task-modal';
import { InboxGroup } from '../../components/inbox-group';
import { InboxInput } from '../../components/inbox-input';
import { useInboxController } from '../inbox/use-inbox-controller';

type Props = {
  open: boolean;
  onClose(): void;
  date: string;
  onAddToToday(item: InboxItem): void | Promise<void>;
};

export function InboxTray({ open, onClose, date, onAddToToday }: Props) {
  const controller = useInboxController({ view: 'unprocessed', date });
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [convertingItem, setConvertingItem] = useState<InboxItem | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  async function handleAddToToday(item: InboxItem) {
    await onAddToToday(item);
    await controller.reload();
  }

  async function handleConverted(task: Task) {
    if (!convertingItem) {
      return;
    }
    await controller.convert(convertingItem, task.id);
    setConvertingItem(null);
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="inbox-tray__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        className="inbox-tray"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-tray-title"
      >
        <header className="inbox-tray__header">
          <div>
            <span className="inbox-tray__eyebrow"><Inbox aria-hidden="true" size={14} /> Capturas</span>
            <h2 id="inbox-tray-title">Inbox</h2>
          </div>
          <div className="inbox-tray__header-actions">
            <span aria-label={`${controller.items.length} itens a processar`}>
              {controller.items.length}
            </span>
            <button type="button" aria-label="Fechar Inbox" onClick={onClose}>
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </header>

        <div className="inbox-tray__capture">
          <InboxInput
            inputRef={inputRef}
            workspaces={controller.workspaces}
            contexts={controller.contexts}
            onSubmit={(content, workspaceId, inboxContextId) => {
              void controller.create(content, workspaceId, inboxContextId);
            }}
          />
        </div>

        {controller.error ? (
          <div className="inbox-tray__status" role="status" aria-live="polite">
            <span>{controller.error}</span>
            <button type="button" onClick={() => void controller.reload()}>Tentar novamente</button>
          </div>
        ) : null}

        <div className="inbox-tray__content">
          {controller.loading ? (
            <p className="inbox-tray__loading">Carregando capturas…</p>
          ) : controller.items.length === 0 ? (
            <div className="inbox-tray__empty">
              <span>Tudo processado.</span>
              <small>Novas capturas aparecem aqui.</small>
            </div>
          ) : (
            <InboxGroup
              label="A processar"
              items={controller.items}
              contexts={controller.contexts}
              workspaces={controller.workspaces}
              onToggleDone={(item) => void controller.toggleDone(item)}
              onEdit={(item, content) => void controller.edit(item, content)}
              onDelete={(item) => void controller.remove(item)}
              onWaiting={(item, waitingDate, person, note) => {
                void controller.setWaiting(item, waitingDate, person, note);
              }}
              onExecute={(item) => void controller.execute(item)}
              onConvert={setConvertingItem}
              onMoveContext={(item, workspaceId, inboxContextId) => {
                void controller.moveContext(item, workspaceId, inboxContextId);
              }}
              onAddToToday={(item) => void handleAddToToday(item)}
            />
          )}
        </div>
      </aside>

      <CreateTaskModal
        open={Boolean(convertingItem)}
        onClose={() => setConvertingItem(null)}
        workspaces={controller.workspaces}
        prefill={{
          title: convertingItem?.content,
          workspaceId: convertingItem?.workspaceId ?? undefined
        }}
        onCreated={(task) => void handleConverted(task)}
      />
    </div>
  );
}
