import { createContext, useContext, type ReactNode } from 'react';
import { Network, PencilRuler, Workflow } from 'lucide-react';

import { artifactLabel } from './artifact-blocks';
import type { NoteArtifactKind } from './types';

type ArtifactBlockContextValue = {
  onOpen(artifactId: string): void;
};

const ArtifactBlockContext = createContext<ArtifactBlockContextValue | null>(null);

export function ArtifactBlockProvider({
  onOpen,
  children
}: {
  onOpen(artifactId: string): void;
  children: ReactNode;
}) {
  return (
    <ArtifactBlockContext.Provider value={{ onOpen }}>
      {children}
    </ArtifactBlockContext.Provider>
  );
}

const artifactIcons: Record<NoteArtifactKind, ReactNode> = {
  diagram: <Workflow size={19} />,
  mindmap: <Network size={19} />,
  whiteboard: <PencilRuler size={19} />
};

export function ArtifactBlock({
  artifactId,
  artifactKind,
  title
}: {
  artifactId: string;
  artifactKind: NoteArtifactKind;
  title: string;
}) {
  const context = useContext(ArtifactBlockContext);
  const label = artifactLabel(artifactKind);
  const displayTitle = title.trim() || `Novo ${label.toLocaleLowerCase('pt-BR')}`;

  return (
    <button
      type="button"
      className="note-artifact-block"
      aria-label={`Abrir ${label.toLocaleLowerCase('pt-BR')} ${displayTitle}`}
      onClick={(event) => {
        event.stopPropagation();
        context?.onOpen(artifactId);
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className={`note-artifact-block-icon note-artifact-block-icon-${artifactKind}`} aria-hidden="true">
        {artifactIcons[artifactKind]}
      </span>
      <span className="note-artifact-block-copy">
        <span className="note-artifact-block-kind">{label}</span>
        <span className="note-artifact-block-title">{displayTitle}</span>
      </span>
      <span className="note-artifact-block-action">Abrir</span>
    </button>
  );
}
