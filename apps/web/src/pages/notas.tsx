import { useParams } from 'react-router-dom';

import { NotesLibraryPage } from '../features/notes/notes-library-page';
import { NoteWorkspacePage } from '../features/notes/note-workspace-page';

export function NotasPage() {
  const { noteId } = useParams<{ noteId?: string }>();
  return noteId ? <NoteWorkspacePage noteId={noteId} /> : <NotesLibraryPage />;
}
