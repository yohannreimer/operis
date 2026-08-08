import { useRef, useState } from 'react';

import type { InboxItem, Task } from '../../api';
import { CreateTaskModal } from '../../components/create-task-modal';
import { InboxGroup } from '../../components/inbox-group';
import { InboxInput } from '../../components/inbox-input';
import { Button, Sheet } from '../../components/ui';
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
  const [convertingItem, setConvertingItem] = useState<InboxItem | null>(null);

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

  function startConversion(item: InboxItem) {
    setConvertingItem(item);
    onClose();
  }

  return (
    <>
      <Sheet open={open} title="Inbox" eyebrow="Capturas" initialFocusRef={inputRef} onClose={onClose}>
        <div className="inbox-tray__capture">
          <span className="inbox-tray__count" aria-label={`${controller.items.length} itens a processar`}>
            {controller.items.length} a processar
          </span>
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
            <Button variant="tertiary" size="sm" onClick={() => void controller.reload()}>Tentar novamente</Button>
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
              onConvert={startConversion}
              onMoveContext={(item, workspaceId, inboxContextId) => {
                void controller.moveContext(item, workspaceId, inboxContextId);
              }}
              onAddToToday={(item) => void handleAddToToday(item)}
            />
          )}
        </div>
      </Sheet>

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
    </>
  );
}
