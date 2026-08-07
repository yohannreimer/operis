import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { FolderFilterStrip } from './folder-filter-strip';
import { NotesList } from './notes-list';
import { QuickCapture } from './quick-capture';
import { useNotesLibrary } from './use-notes-library';
import './notes.css';

export function NotesLibraryPage() {
  const navigate = useNavigate();
  const controller = useNotesLibrary();

  return (
    <main className="notes-library-page">
      <header className="notes-library-header">
        <div>
          <span className="notes-library-eyebrow">Segundo cérebro</span>
          <h1>Notas</h1>
          <p>Capture rápido. Desenvolva apenas o que merece atenção.</p>
        </div>
        <label className="notes-library-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar em notas"
            placeholder="Buscar"
            value={controller.query}
            onChange={(event) => controller.setQuery(event.currentTarget.value)}
          />
          <kbd>⌘ K</kbd>
        </label>
      </header>

      <div className="notes-library-content">
        <QuickCapture
          onCaptured={controller.addCaptured}
          onOpen={(note) => navigate(`/notas/${note.id}`)}
        />
        <FolderFilterStrip controller={controller} />
        <div className="notes-list-heading">
          <span>{controller.selectedView === 'recent' ? 'Recentes' : 'Notas'}</span>
          <small>{controller.rows.length}</small>
        </div>
        <NotesList
          rows={controller.rows}
          loading={controller.loading}
          error={controller.notesError}
          query={controller.query}
          onRetry={controller.reload}
        />
      </div>
    </main>
  );
}
