import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Check, Clock, Calendar, ArrowRight, Trash2, MoreHorizontal, Edit2, MoveRight } from 'lucide-react';
import { InboxItem as InboxItemType, InboxContext, Workspace } from '../api';

type Props = {
  item: InboxItemType;
  contexts: InboxContext[];
  workspaces: Workspace[];
  onToggleDone: (item: InboxItemType) => void;
  onEdit: (item: InboxItemType, newContent: string) => void;
  onDelete: (item: InboxItemType) => void;
  onWaiting: (item: InboxItemType, date: string, person?: string, note?: string) => void;
  onSchedule: (item: InboxItemType) => void;
  onConvert: (item: InboxItemType) => void;
  onMoveContext: (item: InboxItemType, workspaceId: string | null, inboxContextId: string | null) => void;
};

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
  onSchedule,
  onConvert,
  onMoveContext,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.content);
  const [showMenu, setShowMenu] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [showMoveContext, setShowMoveContext] = useState(false);
  const [waitingDate, setWaitingDate] = useState('');
  const [waitingPerson, setWaitingPerson] = useState('');
  const [waitingNote, setWaitingNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  function startEdit() {
    setEditValue(item.content);
    setEditing(true);
    setShowMenu(false);
  }

  function commitEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== item.content) {
      onEdit(item, trimmed);
    }
    setEditing(false);
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setEditing(false); setEditValue(item.content); }
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

  return (
    <div className={`inbox-item${isDone ? ' inbox-item--done' : ''}${isWaiting ? ' inbox-item--waiting' : ''}`}>
      <div className="inbox-item-row">
        {/* Checkbox */}
        <button
          type="button"
          className={`inbox-item-checkbox${isDone ? ' checked' : ''}`}
          onClick={() => onToggleDone(item)}
          aria-label={isDone ? 'Desmarcar' : 'Marcar como feito'}
        >
          {isDone && <Check size={10} />}
        </button>

        {/* Content */}
        <div className="inbox-item-content">
          {editing ? (
            <input
              ref={inputRef}
              className="inbox-item-edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
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
              <span className="inbox-badge inbox-badge--whatsapp">📱 WhatsApp</span>
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

        {/* Actions menu */}
        <div className="inbox-item-actions" ref={menuRef}>
          <button
            type="button"
            className="inbox-item-menu-trigger ghost-button"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Ações"
          >
            <MoreHorizontal size={14} />
          </button>

          {showMenu && (
            <div className="inbox-item-menu">
              <button type="button" onClick={() => { onToggleDone(item); setShowMenu(false); }}>
                <Check size={12} /> {isDone ? 'Desmarcar' : 'Marcar como feito'}
              </button>
              <button type="button" onClick={startEdit}>
                <Edit2 size={12} /> Editar
              </button>
              <button type="button" onClick={() => { setShowWaiting((v) => !v); setShowMenu(false); }}>
                <Clock size={12} /> Aguardando...
              </button>
              <button type="button" onClick={() => { onSchedule(item); setShowMenu(false); }}>
                <Calendar size={12} /> Executar hoje
              </button>
              <button type="button" onClick={() => { onConvert(item); setShowMenu(false); }}>
                <ArrowRight size={12} /> Transformar em tarefa
              </button>
              <button type="button" onClick={() => { setShowMoveContext((v) => !v); setShowMenu(false); }}>
                <MoveRight size={12} /> Mover para contexto
              </button>
              <button
                type="button"
                className="inbox-item-menu-danger"
                onClick={() => { onDelete(item); setShowMenu(false); }}
              >
                <Trash2 size={12} /> Deletar
              </button>
            </div>
          )}
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
              🏢 {w.name}
            </button>
          ))}
          {contexts.map((c) => (
            <button
              key={c.id}
              type="button"
              className="ghost-button"
              onClick={() => { onMoveContext(item, null, c.id); setShowMoveContext(false); }}
            >
              📁 {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
