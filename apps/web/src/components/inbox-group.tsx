import { Plus } from 'lucide-react';
import { InboxItem as InboxItemType, InboxContext, Workspace } from '../api';
import { InboxItem } from './inbox-item';

type ItemCallbacks = {
  onToggleDone: (item: InboxItemType) => void;
  onEdit: (item: InboxItemType, newContent: string) => void;
  onDelete: (item: InboxItemType) => void;
  onWaiting: (item: InboxItemType, date: string, person?: string, note?: string) => void;
  onExecute: (item: InboxItemType) => void;
  onConvert: (item: InboxItemType) => void;
  onMoveContext: (item: InboxItemType, workspaceId: string | null, inboxContextId: string | null) => void;
};

type Props = ItemCallbacks & {
  label: string;
  items: InboxItemType[];
  contexts: InboxContext[];
  workspaces: Workspace[];
  onAddItem?: () => void;
};

export function InboxGroup({
  label,
  items,
  contexts,
  workspaces,
  onAddItem,
  ...callbacks
}: Props) {
  if (items.length === 0) return null;

  return (
    <div className="inbox-group">
      {label && (
        <div className="inbox-group-header">
          <span className="inbox-group-label">{label}</span>
          <span className="inbox-group-count">{items.length}</span>
          {onAddItem && (
            <button
              type="button"
              className="inbox-group-add ghost-button"
              onClick={onAddItem}
              aria-label="Adicionar item"
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      )}
      <div className="inbox-group-items">
        {items.map((item) => (
          <InboxItem
            key={item.id}
            item={item}
            contexts={contexts}
            workspaces={workspaces}
            {...callbacks}
          />
        ))}
      </div>
    </div>
  );
}
