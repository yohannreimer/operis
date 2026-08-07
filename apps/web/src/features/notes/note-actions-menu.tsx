import { Archive, Copy, FileDown, History, Mic, Pin, PinOff, Share2, Sparkles, X } from 'lucide-react';

import type { Note } from '../../api';

export type NoteActionsMenuProps = {
  note: Note;
  onPin(): Promise<void>;
  onOpenTemplates(): void;
  onOpenHistory(): void;
  onStartDictation(): void;
  onExport(format: 'copy' | 'txt' | 'pdf' | 'whatsapp'): Promise<void> | void;
  onArchive(): Promise<void>;
  onClose(): void;
};

export function NoteActionsMenu({
  note,
  onPin,
  onOpenTemplates,
  onOpenHistory,
  onStartDictation,
  onExport,
  onArchive,
  onClose
}: NoteActionsMenuProps) {
  return (
    <aside className="note-side-panel note-actions-panel" aria-label="Ações da nota">
      <header>
        <div>
          <span>Documento</span>
          <h2>Ações da nota</h2>
        </div>
        <button type="button" aria-label="Fechar ações" onClick={onClose}><X size={17} /></button>
      </header>

      <button type="button" onClick={() => void onPin()}>
        {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
        {note.pinned ? 'Desafixar' : 'Fixar nota'}
      </button>
      <button type="button" onClick={onOpenTemplates}><Sparkles size={16} />Templates</button>
      <button type="button" onClick={onOpenHistory}><History size={16} />Histórico e checkpoints</button>
      <button type="button" onClick={onStartDictation}><Mic size={16} />Ditado</button>

      <div className="note-side-panel-divider" />
      <span className="note-actions-label">Exportar</span>
      <div className="note-export-grid">
        <button type="button" onClick={() => void onExport('copy')}><Copy size={15} />Copiar</button>
        <button type="button" onClick={() => void onExport('txt')}><FileDown size={15} />TXT</button>
        <button type="button" onClick={() => void onExport('pdf')}><FileDown size={15} />PDF</button>
        <button type="button" onClick={() => void onExport('whatsapp')}><Share2 size={15} />WhatsApp</button>
      </div>

      <div className="note-side-panel-divider" />
      <button type="button" className="danger" onClick={() => void onArchive()}>
        <Archive size={16} />Arquivar nota
      </button>
    </aside>
  );
}
