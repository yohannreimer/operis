import { ChevronDown, ChevronRight, Plus, ArrowUp, ArrowDown } from 'lucide-react';
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
  onMoveItemUp?: (item: InboxItemType) => void;
  onMoveItemDown?: (item: InboxItemType) => void;
  canMoveItemUp?: (item: InboxItemType) => boolean;
  canMoveItemDown?: (item: InboxItemType) => boolean;
};

type Props = ItemCallbacks & {
  label: string;
  items: InboxItemType[];
  contexts: InboxContext[];
  workspaces: Workspace[];
  onAddItem?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isVirtual?: boolean;
  onAddToToday?: (item: InboxItemType) => void;
  todayInboxItemIds?: Set<string>;
};

export function InboxGroup({
  label,
  items,
  contexts,
  workspaces,
  onAddItem,
  collapsed = false,
  onToggleCollapse,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isVirtual = false,
  onAddToToday,
  todayInboxItemIds,
  ...callbacks
}: Props) {
  if (items.length === 0) return null;

  return (
    <div className={`inbox-group${isVirtual ? ' inbox-group--virtual' : ''}`}>
      {label && (
        <div className="inbox-group-header">
          {onToggleCollapse && (
            <button
              type="button"
              className="inbox-group-collapse ghost-button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expandir' : 'Recolher'}
            >
              {collapsed
                ? <ChevronRight size={12} />
                : <ChevronDown size={12} />}
            </button>
          )}
          <span className="inbox-group-label">{label}</span>
          <span className="inbox-group-count">{items.length}</span>

          {!isVirtual && (onMoveUp || onMoveDown) && (
            <div className="inbox-group-reorder">
              <button
                type="button"
                className="inbox-group-reorder-btn ghost-button"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                aria-label="Mover grupo para cima"
              >
                <ArrowUp size={11} />
              </button>
              <button
                type="button"
                className="inbox-group-reorder-btn ghost-button"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                aria-label="Mover grupo para baixo"
              >
                <ArrowDown size={11} />
              </button>
            </div>
          )}

          {!isVirtual && onAddItem && (
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

      {!collapsed && (
        <div className="inbox-group-items">
          {items.map((item) => (
            <InboxItem
              key={item.id}
              item={item}
              contexts={contexts}
              workspaces={workspaces}
              onAddToToday={onAddToToday ? () => onAddToToday(item) : undefined}
              isInToday={todayInboxItemIds?.has(item.id) ?? false}
              {...callbacks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
