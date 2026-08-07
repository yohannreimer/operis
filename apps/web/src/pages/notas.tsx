import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { NotesLibraryPage } from '../features/notes/notes-library-page';

function DocumentRoutePending({ noteId }: { noteId: string }) {
  return (
    <main className="notes-library-page" aria-label="Documento de nota">
      <Link to="/notas" className="notes-document-back">
        <ArrowLeft size={16} aria-hidden="true" />
        Todas as notas
      </Link>
      <p className="notes-document-route-pending" data-note-id={noteId}>
        Abrindo documento…
      </p>
    </main>
  );
}

export function NotasPage() {
  const { noteId } = useParams<{ noteId?: string }>();
  return noteId ? <DocumentRoutePending noteId={noteId} /> : <NotesLibraryPage />;
}
