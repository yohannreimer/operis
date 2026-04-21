import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Check, Clock, Play, Calendar, ArrowRight, Trash2, MoveRight, ChevronUp, ChevronDown, Sun } from 'lucide-react';
import { InboxItem as InboxItemType, InboxContext, Workspace } from '../api';

type Props = {
  item: InboxItemType;
  contexts: InboxContext[];
  workspaces: Workspace[];
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
  onAddToToday?: () => void;
  isInToday?: boolean;
};

function getItemAge(createdAt?: string): string | null {
  if (!createdAt) return null;
  const diffDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (diffDays < 3) return null;            // menos de 3 dias → nada
  if (diffDays < 7) return `${diffDays}d`;  // 3d … 6d
  if (diffDays < 14) return '1sem';
  if (diffDays < 21) return '2sem';
  if (diffDays < 30) return '3sem';
  return `${Math.floor(diffDays / 30)}mes`;
}

function formatWaitingDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatScheduledTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function InboxItem({
  item,
  contexts,
  workspaces,
  onToggleDone,
  onEdit,
  onDelete,
  onWaiting,
  onExecute,
  onConvert,
  onMoveContext,
  onMoveItemUp,
  onMoveItemDown,
  canMoveItemUp,
  canMoveItemDown,
  onAddToToday,
  isInToday = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.content);
  const [showWaiting, setShowWaiting] = useState(false);
  const [showMoveContext, setShowMoveContext] = useState(false);
  const [waitingDate, setWaitingDate] = useState('');
  const [waitingPerson, setWaitingPerson] = useState('');
  const [waitingNote, setWaitingNote] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      el.select();
      // Auto-size to content on open
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  function startEdit() {
    setEditValue(item.content);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== item.content) {
      onEdit(item, trimmed);
    }
    setEditing(false);
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { setEditing(false); setEditValue(item.content); }
  }

  function handleEditChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setEditValue(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  }

  function handleWaitingSave() {
    if (!waitingDate) return;
    onWaiting(item, waitingDate, waitingPerson || undefined, waitingNote || undefined);
    setShowWaiting(false);
    setWaitingDate('');
    setWaitingPerson('');
    setWaitingNote('');
  }

  const isDone = item.status === 'feito';
  const isWaiting = item.status === 'aguardando';
  const isConverted = item.status === 'convertido';
  const isAgenda = item.status === 'agenda';
  const age = getItemAge(item.createdAt);

  return (
    <div
      className={`inbox-item${isDone ? ' inbox-item--done' : ''}${isWaiting ? ' inbox-item--waiting' : ''}${isInToday && !isDone ? ' inbox-item--in-today' : ''}`}
    >
      <div className="inbox-item-row">
        {/* Item reorder handle */}
        {(onMoveItemUp || onMoveItemDown) && (
          <div className="inbox-item-reorder">
            <button
              type="button"
              className="inbox-item-reorder-btn"
              onClick={() => onMoveItemUp?.(item)}
              disabled={!canMoveItemUp?.(item)}
              aria-label="Mover item acima"
            >
              <ChevronUp size={10} />
            </button>
            <button
              type="button"
              className="inbox-item-reorder-btn"
              onClick={() => onMoveItemDown?.(item)}
              disabled={!canMoveItemDown?.(item)}
              aria-label="Mover item abaixo"
            >
              <ChevronDown size={10} />
            </button>
          </div>
        )}

        {/* Checkbox */}
        <button
          type="button"
          className={`inbox-item-checkbox${isDone ? ' checked' : ''}`}
          onClick={() => onToggleDone(item)}
          aria-label={isDone ? 'Desmarcar' : 'Marcar como feito'}
        >
          {isDone && <Check size={10} />}
        </button>

        {/* Today toggle — visible only in split mode */}
        {onAddToToday && (
          <button
            type="button"
            className={`inbox-item-today-btn${isInToday ? ' inbox-item-today-btn--active' : ''}`}
            onClick={onAddToToday}
            title={isInToday ? 'Remover do Hoje' : 'Adicionar ao Hoje'}
            aria-label={isInToday ? 'Remover do Hoje' : 'Adicionar ao Hoje'}
          >
            <Sun size={12} />
          </button>
        )}

        {/* Content */}
        <div className="inbox-item-content">
          {editing ? (
            <textarea
              ref={inputRef}
              className="inbox-item-edit-input"
              value={editValue}
              onChange={handleEditChange}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              rows={1}
            />
          ) : (
            <span
              className={`inbox-item-text${isDone ? ' inbox-item-text--strikethrough' : ''}`}
              onClick={startEdit}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && startEdit()}
            >
              {item.content}
            </span>
          )}

          {/* Badges */}
          <div className="inbox-item-badges">
            {item.source === 'whatsapp' && (
              <span className="inbox-badge inbox-badge--whatsapp">WhatsApp</span>
            )}
            {isWaiting && item.waitingDate && (
              <span className="inbox-badge inbox-badge--waiting">
                <Clock size={10} /> {formatWaitingDate(item.waitingDate)}
                {item.waitingPerson && ` · ${item.waitingPerson}`}
              </span>
            )}
            {isConverted && (
              <span className="inbox-badge inbox-badge--converted">→ Tarefa</span>
            )}
            {isAgenda && item.scheduledAt && (
              <span className="inbox-badge inbox-badge--agenda">
                <Calendar size={10} /> {formatScheduledTime(item.scheduledAt)}
              </span>
            )}
          </div>
        </div>

        {/* Age chip — inline, não adiciona altura */}
        {age && !isDone && (
          <span className="inbox-item-age" title={`Criado há ${age}`}>{age}</span>
        )}

        {/* Inline action icons — revealed on hover */}
        <div className="inbox-item-actions">
          <button
            type="button"
            className="inbox-item-action-btn"
            onClick={() => onToggleDone(item)}
            title={isDone ? 'Desmarcar' : 'Marcar como feito'}
            aria-label={isDone ? 'Desmarcar' : 'Marcar como feito'}
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            className={`inbox-item-action-btn${showWaiting ? ' active' : ''}`}
            onClick={() => { setShowWaiting((v) => !v); setShowMoveContext(false); }}
            title="Aguardando"
            aria-label="Aguardando"
          >
            <Clock size={13} />
          </button>
          <button
            type="button"
            className="inbox-item-action-btn inbox-item-action-btn--execute"
            onClick={() => onExecute(item)}
            title={item.workspaceId ? 'Executar agora' : 'Atribua uma frente para executar'}
            aria-label="Executar agora"
            disabled={!item.workspaceId}
          >
            <Play size={13} />
          </button>
          <button
            type="button"
            className="inbox-item-action-btn"
            onClick={() => onConvert(item)}
            title="Transformar em tarefa"
            aria-label="Transformar em tarefa"
          >
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            className={`inbox-item-action-btn${showMoveContext ? ' active' : ''}`}
            onClick={() => { setShowMoveContext((v) => !v); setShowWaiting(false); }}
            title="Mover contexto"
            aria-label="Mover contexto"
          >
            <MoveRight size={13} />
          </button>
          <button
            type="button"
            className="inbox-item-action-btn inbox-item-action-btn--danger"
            onClick={() => onDelete(item)}
            title="Deletar"
            aria-label="Deletar"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Waiting form (inline expand) */}
      {showWaiting && (
        <div className="inbox-item-waiting-form">
          <input
            type="date"
            value={waitingDate}
            onChange={(e) => setWaitingDate(e.target.value)}
            placeholder="Data de lembrete"
          />
          <input
            value={waitingPerson}
            onChange={(e) => setWaitingPerson(e.target.value)}
            placeholder="De quem? (opcional)"
          />
          <input
            value={waitingNote}
            onChange={(e) => setWaitingNote(e.target.value)}
            placeholder="Nota (opcional)"
          />
          <div className="inbox-item-waiting-actions">
            <button type="button" className="ghost-button" onClick={() => setShowWaiting(false)}>
              Cancelar
            </button>
            <button type="button" onClick={handleWaitingSave} disabled={!waitingDate}>
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Move context submenu */}
      {showMoveContext && (
        <div className="inbox-item-move-context">
          <small>Mover para:</small>
          <button
            type="button"
            className="ghost-button"
            onClick={() => { onMoveContext(item, null, null); setShowMoveContext(false); }}
          >
            Sem contexto
          </button>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              className="ghost-button"
              onClick={() => { onMoveContext(item, w.id, null); setShowMoveContext(false); }}
            >
              {w.name}
            </button>
          ))}
          {contexts.map((c) => (
            <button
              key={c.id}
              type="button"
              className="ghost-button"
              onClick={() => { onMoveContext(item, null, c.id); setShowMoveContext(false); }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
