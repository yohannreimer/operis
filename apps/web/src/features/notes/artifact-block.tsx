import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Network, PencilRuler, Trash2, Workflow } from 'lucide-react';

import { api, type NoteArtifact } from '../../api';
import { artifactLabel } from './artifact-blocks';
import { ArtifactPreview } from './artifact-preview';
import type { NoteArtifactKind } from './types';

type ArtifactBlockContextValue = {
  noteId: string;
  onOpen(artifactId: string): void;
  onDelete?(artifactId: string): void;
  loadArtifact(artifactId: string, force?: boolean): Promise<NoteArtifact>;
};

const ArtifactBlockContext = createContext<ArtifactBlockContextValue | null>(null);

export function ArtifactBlockProvider({
  noteId,
  onOpen,
  onDelete,
  children
}: {
  noteId: string;
  onOpen(artifactId: string): void;
  onDelete?(artifactId: string): void;
  children: ReactNode;
}) {
  const cache = useRef(new Map<string, Promise<NoteArtifact>>());
  const onOpenRef = useRef(onOpen);
  const onDeleteRef = useRef(onDelete);
  onOpenRef.current = onOpen;
  onDeleteRef.current = onDelete;
  const loadArtifact = useCallback((artifactId: string, force = false) => {
    const key = `${noteId}:${artifactId}`;
    if (force) cache.current.delete(key);
    const current = cache.current.get(key);
    if (current) return current;
    const request = api.getNoteArtifact(noteId, artifactId).catch((error) => {
      cache.current.delete(key);
      throw error;
    });
    cache.current.set(key, request);
    return request;
  }, [noteId]);
  const openArtifact = useCallback((artifactId: string) => onOpenRef.current(artifactId), []);
  const deleteArtifact = useCallback((artifactId: string) => onDeleteRef.current?.(artifactId), []);
  const deleteEnabled = Boolean(onDelete);
  const value = useMemo(
    () => ({
      noteId,
      onOpen: openArtifact,
      onDelete: deleteEnabled ? deleteArtifact : undefined,
      loadArtifact
    }),
    [deleteArtifact, deleteEnabled, loadArtifact, noteId, openArtifact]
  );

  return (
    <ArtifactBlockContext.Provider value={value}>
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
  const [artifact, setArtifact] = useState<NoteArtifact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(context));

  const load = useCallback((force = false) => {
    if (!context) return () => undefined;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void context.loadArtifact(artifactId, force)
      .then((loaded) => { if (active) setArtifact(loaded); })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar o artefato.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [artifactId, context]);

  useEffect(() => load(), [load]);

  return (
    <div className="note-artifact-block">
      <div className="note-artifact-block-header">
        <span className={`note-artifact-block-icon note-artifact-block-icon-${artifactKind}`} aria-hidden="true">
          {artifactIcons[artifactKind]}
        </span>
        <span className="note-artifact-block-copy">
          <span className="note-artifact-block-kind">{label}</span>
          <span className="note-artifact-block-title">{displayTitle}</span>
        </span>
        <span className="note-artifact-block-action"><Maximize2 size={13} /> Editar em tela cheia</span>
        {context?.onDelete ? (
          <button
            type="button"
            className="note-artifact-block-delete"
            aria-label={`Excluir ${label.toLocaleLowerCase('pt-BR')} ${displayTitle}`}
            onClick={(event) => {
              event.stopPropagation();
              context.onDelete?.(artifactId);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="note-artifact-preview-state">
        {loading ? (
          <div className="note-artifact-preview-skeleton" role="status" aria-label={`Carregando ${label.toLocaleLowerCase('pt-BR')} ${displayTitle}`} />
        ) : null}
        {loadError ? (
          <div className="note-artifact-preview-error" role="alert">
            <span>{loadError}</span>
            <button
              type="button"
              aria-label={`Tentar carregar ${label.toLocaleLowerCase('pt-BR')} ${displayTitle} novamente`}
              onClick={(event) => { event.stopPropagation(); load(true); }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
        {artifact && !loading && !loadError ? (
          <>
            <ArtifactPreview artifact={artifact} />
            <button
              type="button"
              className="note-artifact-preview-open"
              aria-label={`Editar ${label.toLocaleLowerCase('pt-BR')} ${displayTitle} em tela cheia`}
              onClick={(event) => {
                event.stopPropagation();
                context?.onOpen(artifactId);
              }}
              onMouseDown={(event) => event.stopPropagation()}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
