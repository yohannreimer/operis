import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  api,
  type DiagramData,
  type MindMapData,
  type NoteArtifact,
  type WhiteboardData
} from '../../api';
import { DiagramCanvas } from '../../components/diagram-canvas';
import { MindMapCanvas } from '../../components/mindmap-canvas';
import { WhiteboardCanvas } from '../../components/whiteboard-canvas';
import { artifactLabel } from './artifact-blocks';
import './notes.css';

type ArtifactSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

function draftKey(artifactId: string) {
  return `operis.notes.artifact-draft:${artifactId}`;
}

function readDraft(artifactId: string) {
  try {
    const raw = localStorage.getItem(draftKey(artifactId));
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function writeDraft(artifactId: string, data: Record<string, unknown> | null) {
  try {
    if (data) localStorage.setItem(draftKey(artifactId), JSON.stringify(data));
    else localStorage.removeItem(draftKey(artifactId));
  } catch {
    // Focus mode remains functional without browser persistence.
  }
}

export function ArtifactWorkspacePage({
  noteId,
  artifactId
}: {
  noteId: string;
  artifactId: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [artifact, setArtifact] = useState<NoteArtifact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<ArtifactSaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const versionRef = useRef(1);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, [artifact]);

  useEffect(() => {
    let active = true;
    void api.getNoteArtifact(noteId, artifactId)
      .then((loaded) => {
        if (!active) return;
        const draft = readDraft(artifactId);
        versionRef.current = loaded.editVersion;
        setArtifact(draft ? { ...loaded, data: draft } : loaded);
        if (draft) setSaveStatus('pending');
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Não foi possível abrir o artefato.');
      });
    return () => { active = false; };
  }, [artifactId, noteId]);

  const saveArtifact = useCallback(async (data: object) => {
    const jsonData = data as Record<string, unknown>;
    writeDraft(artifactId, jsonData);
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const updated = await api.updateNoteArtifact(noteId, artifactId, {
        data: jsonData,
        baseVersion: versionRef.current
      });
      versionRef.current = updated.editVersion;
      setArtifact(updated);
      writeDraft(artifactId, null);
      setSaveStatus('saved');
    } catch (error) {
      setSaveStatus('failed');
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar.');
      throw error;
    }
  }, [artifactId, noteId]);

  const navigateToNote = useCallback(() => {
    const openerBlockId = (location.state as { openerBlockId?: unknown } | null)?.openerBlockId;
    if (typeof openerBlockId === 'string') {
      try {
        sessionStorage.setItem(
          `operis.notes.return:${noteId}`,
          JSON.stringify({ blockId: openerBlockId })
        );
      } catch {
        // Returning still works if session storage is unavailable.
      }
    }
    navigate(`/notas/${noteId}`);
  }, [location.state, navigate, noteId]);

  const attemptBack = useCallback(async () => {
    try {
      await flushRef.current?.();
      navigateToNote();
    } catch {
      // saveArtifact already exposes recovery controls and keeps focus mode open.
    }
  }, [navigateToNote]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      void attemptBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [attemptBack]);

  if (loadError) {
    return <main className="note-artifact-focus" aria-label="Editor visual em foco"><p role="alert">{loadError}</p></main>;
  }
  if (!artifact) {
    return <main className="note-artifact-focus" aria-label="Editor visual em foco"><p>Carregando editor visual…</p></main>;
  }

  const canvasProps = {
    onSave: saveArtifact,
    onDirtyChange: (dirty: boolean) => {
      if (dirty) setSaveStatus((current) => current === 'failed' ? current : 'pending');
    },
    registerFlush: (flush: () => Promise<void>) => { flushRef.current = flush; }
  };

  return (
    <main
      ref={rootRef}
      className="note-artifact-focus"
      aria-label="Editor visual em foco"
      tabIndex={-1}
    >
      <header className="note-artifact-focus-header">
        <button type="button" aria-label="Voltar para a nota" onClick={() => void attemptBack()}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <span>{artifactLabel(artifact.kind)}</span>
          <h1>{artifact.title || `Novo ${artifactLabel(artifact.kind).toLocaleLowerCase('pt-BR')}`}</h1>
        </div>
        <span className={`note-artifact-save-status status-${saveStatus}`} aria-live="polite">
          {saveStatus === 'pending' ? 'Alterações pendentes' : null}
          {saveStatus === 'saving' ? 'Salvando…' : null}
          {saveStatus === 'saved' ? 'Salvo' : null}
          {saveStatus === 'failed' ? 'Não salvo' : null}
        </span>
      </header>

      <div className="note-artifact-focus-canvas">
        {artifact.kind === 'diagram' ? (
          <DiagramCanvas
            {...canvasProps}
            initialData={artifact.data as unknown as DiagramData}
          />
        ) : null}
        {artifact.kind === 'mindmap' ? (
          <MindMapCanvas
            {...canvasProps}
            initialData={artifact.data as unknown as MindMapData}
          />
        ) : null}
        {artifact.kind === 'whiteboard' ? (
          <WhiteboardCanvas
            {...canvasProps}
            initialData={artifact.data as WhiteboardData}
          />
        ) : null}
      </div>

      {saveStatus === 'failed' ? (
        <div className="note-artifact-save-error" role="alert">
          <span>Não foi possível salvar{saveError ? ` · ${saveError}` : ''}</span>
          <button type="button" onClick={() => void flushRef.current?.()}>
            <RotateCcw size={15} /> Tentar novamente
          </button>
          <button type="button" onClick={navigateToNote}>Voltar com alterações pendentes</button>
        </div>
      ) : null}
    </main>
  );
}
