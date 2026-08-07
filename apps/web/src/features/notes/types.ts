import type { Note, NoteFolder } from '../../api';

export type NoteArtifactKind = 'diagram' | 'mindmap' | 'whiteboard';

export type NoteArtifactSummary = {
  id: string;
  noteId: string;
  kind: NoteArtifactKind;
  title: string | null;
  editVersion: number;
  updatedAt: string;
};

export type NoteArtifact = NoteArtifactSummary & {
  data: Record<string, unknown>;
  createdAt: string;
};

export type NoteSummary = Pick<
  Note,
  'id' | 'title' | 'type' | 'tags' | 'pinned' | 'folderId' | 'createdAt' | 'updatedAt'
> & {
  excerpt: string;
  editVersion: number;
  folder?: Pick<NoteFolder, 'id' | 'name' | 'parentId'> | null;
};
