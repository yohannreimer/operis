import { Navigate, useParams } from 'react-router-dom';

import { ArtifactWorkspacePage } from '../features/notes/artifact-workspace-page';

export function NoteArtifactPage() {
  const { noteId, artifactId } = useParams<{ noteId: string; artifactId: string }>();
  if (!noteId || !artifactId) return <Navigate to="/notas" replace />;
  return <ArtifactWorkspacePage noteId={noteId} artifactId={artifactId} />;
}
