import { ArrowLeft, Info, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api, type Note, type NoteContentBlock, type NoteSummary } from '../../api';
import { mergeArtifactBlocks } from './artifact-blocks';
import type { OperisBlockEditorValue, OperisEditorCommand } from './editor';
import { NoteActionsMenu } from './note-actions-menu';
import { NoteDetailsPanel } from './note-details-panel';
import { NoteDocumentEditor } from './note-document-editor';
import { useNoteSaveState, type NoteSaveStatus } from './use-note-save-state';
import './notes.css';

type NoteDraft = Partial<
  Pick<
    Note,
    | 'title'
    | 'content'
    | 'contentBlocks'
    | 'contentText'
    | 'contentHtml'
    | 'contentVersion'
    | 'type'
    | 'tags'
    | 'pinned'
    | 'folderId'
    | 'workspaceId'
    | 'projectId'
    | 'taskId'
  >
>;

const saveLabels: Partial<Record<NoteSaveStatus, string>> = {
  saving: 'Salvando',
  saved: 'Salvo',
  failed: 'Não salvo',
  conflict: 'Conflito',
  dirty: 'Alterado'
};

function returnAnchor(noteId: string) {
  try {
    const key = `operis.notes.return:${noteId}`;
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { blockId?: unknown };
    return typeof parsed.blockId === 'string' ? parsed.blockId : null;
  } catch {
    return null;
  }
}

function RelatedNotes({ note }: { note: Note }) {
  const [rows, setRows] = useState<NoteSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const query = note.tags[0] ?? note.title.split(/\s+/).find((word) => word.length >= 4) ?? '';
    if (!query) {
      setLoaded(true);
      return () => { active = false; };
    }
    void api.getNotesLibrary({ q: query })
      .then((result) => {
        if (active) setRows(result.filter((candidate) => candidate.id !== note.id).slice(0, 4));
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [note.id, note.tags, note.title]);

  return (
    <details className="note-related-notes">
      <summary>Notas relacionadas{rows.length ? ` · ${rows.length}` : ''}</summary>
      <div>
        {rows.map((row) => <Link key={row.id} to={`/notas/${row.id}`}><strong>{row.title || 'Sem título'}</strong><span>{row.excerpt || 'Sem prévia'}</span></Link>)}
        {loaded && rows.length === 0 ? <p>Nenhuma relação forte encontrada ainda.</p> : null}
        {!loaded ? <p>Buscando relações…</p> : null}
      </div>
    </details>
  );
}

function LoadedNoteWorkspace({ initialNote }: { initialNote: Note }) {
  const navigate = useNavigate();
  const [note, setNote] = useState(initialNote);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [secondarySurface, setSecondarySurface] = useState<'templates' | 'history' | 'dictation' | null>(null);
  const pendingDraft = useRef<NoteDraft>({});

  const save = useCallback(
    async (draft: NoteDraft, baseVersion: number) => {
      const updated = await api.updateNote(initialNote.id, {
        ...draft,
        baseVersion,
        saveSource: 'autosave'
      });
      setNote(updated);
      return updated;
    },
    [initialNote.id]
  );
  const saveState = useNoteSaveState({
    noteId: initialNote.id,
    initialVersion: initialNote.editVersion,
    save
  });

  const markPatch = useCallback((patch: NoteDraft) => {
    const nextDraft = { ...pendingDraft.current, ...patch };
    pendingDraft.current = nextDraft;
    setNote((current) => ({ ...current, ...patch }));
    saveState.markDirty(nextDraft);
  }, [saveState]);

  useEffect(() => {
    if (saveState.draft) {
      pendingDraft.current = saveState.draft;
      setNote((current) => ({ ...current, ...saveState.draft }));
    }
  }, [saveState.draft]);

  useEffect(() => {
    const blockId = returnAnchor(initialNote.id);
    if (!blockId) return;
    const focusBlock = () => {
      const escaped = blockId.replace(/"/g, '\\"');
      const element = document.querySelector<HTMLElement>(`[data-block-id="${escaped}"]`);
      element?.scrollIntoView?.({ block: 'center' });
      element?.focus();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focusBlock);
    else window.setTimeout(focusBlock, 0);
  }, [initialNote.id]);

  function handleDocumentChange(value: OperisBlockEditorValue & { title: string }) {
    markPatch({
      title: value.title,
      content: value.html,
      contentBlocks: value.blocks as NoteContentBlock[],
      contentText: value.text,
      contentHtml: value.html,
      contentVersion: 1
    });
  }

  function handleEditorCommand(command: OperisEditorCommand) {
    if (command === 'details') {
      setDetailsOpen(true);
      setActionsOpen(false);
    } else if (command === 'templates') {
      setSecondarySurface('templates');
    } else if (command === 'save') {
      void saveState.retry();
    }
  }

  function exportNote(format: 'copy' | 'txt' | 'pdf' | 'whatsapp') {
    const text = [note.title, note.contentText ?? note.content ?? ''].filter(Boolean).join('\n\n');
    if (format === 'copy') return navigator.clipboard?.writeText(text);
    if (format === 'pdf') return window.print();
    if (format === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      return;
    }
    const href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${note.title || 'nota'}.txt`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const statusLabel = saveLabels[saveState.status];

  return (
    <main className="note-workspace-page">
      <header className="note-document-topbar">
        <Link to="/notas" aria-label="Voltar para todas as notas"><ArrowLeft size={17} /></Link>
        <div className="note-document-breadcrumb">
          <span>{note.folder?.name ?? 'Notas'}</span>
          <h1>{note.title || 'Sem título'}</h1>
        </div>
        <div className="note-document-topbar-actions">
          {statusLabel ? (
            <span className={`note-save-status note-save-status-${saveState.status}`} aria-live="polite">
              {statusLabel}
            </span>
          ) : null}
          {(saveState.status === 'failed' || saveState.status === 'conflict') ? (
            <button type="button" aria-label="Tentar salvar novamente" onClick={() => void saveState.retry()}>
              <RotateCcw size={15} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Abrir detalhes"
            aria-expanded={detailsOpen}
            onClick={() => {
              setDetailsOpen((open) => !open);
              setActionsOpen(false);
            }}
          >
            <Info size={17} />
          </button>
          <button
            type="button"
            aria-label="Abrir ações da nota"
            aria-expanded={actionsOpen}
            onClick={() => {
              setActionsOpen((open) => !open);
              setDetailsOpen(false);
            }}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      <NoteDocumentEditor
        note={note}
        onChange={handleDocumentChange}
        onCommand={handleEditorCommand}
        onStartDictation={() => setSecondarySurface('dictation')}
        onOpenArtifact={(artifactId, blockId) =>
          navigate(`/notas/${note.id}/artifacts/${artifactId}`, {
            state: { openerBlockId: blockId }
          })
        }
      />
      <RelatedNotes note={note} />

      {detailsOpen ? (
        <NoteDetailsPanel note={note} onChange={markPatch} onClose={() => setDetailsOpen(false)} />
      ) : null}
      {actionsOpen ? (
        <NoteActionsMenu
          note={note}
          onClose={() => setActionsOpen(false)}
          onPin={async () => markPatch({ pinned: !note.pinned })}
          onOpenTemplates={() => setSecondarySurface('templates')}
          onOpenHistory={() => setSecondarySurface('history')}
          onStartDictation={() => setSecondarySurface('dictation')}
          onGenerateArtifact={async (kind) => {
            const artifact = await api.generateNoteArtifact(note.id, { kind });
            setActionsOpen(false);
            navigate(`/notas/${note.id}/artifacts/${artifact.id}`);
          }}
          onExport={exportNote}
          onArchive={async () => {
            await api.updateNote(note.id, {
              archived: true,
              baseVersion: saveState.baseVersion,
              saveSource: 'manual'
            });
            navigate('/notas');
          }}
        />
      ) : null}

      {secondarySurface ? (
        <div className="note-secondary-surface" role="dialog" aria-label={secondarySurface}>
          <button type="button" onClick={() => setSecondarySurface(null)}>Fechar</button>
          {secondarySurface === 'templates' ? <p>Templates da nota</p> : null}
          {secondarySurface === 'history' ? (
            <div>
              <p>Histórico da nota</p>
              <button type="button" onClick={() => void api.createNoteRevision(note.id, { source: 'checkpoint' })}>
                Criar checkpoint
              </button>
            </div>
          ) : null}
          {secondarySurface === 'dictation' ? <p>Ditado da nota</p> : null}
        </div>
      ) : null}
    </main>
  );
}

export function NoteWorkspacePage({ noteId }: { noteId: string }) {
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.getNote(noteId)
      .then((detail) => {
        if (!active) return;
        const blocks = (detail.contentBlocks ?? []) as Parameters<typeof mergeArtifactBlocks>[0];
        const hydrated = mergeArtifactBlocks(blocks, detail.artifacts ?? []);
        setNote({ ...detail, contentBlocks: hydrated as NoteContentBlock[] });
      })
      .catch((cause) => {
        if (!active) return;
        const message = cause instanceof Error ? cause.message : 'Não foi possível abrir a nota.';
        if (message.toLocaleLowerCase('pt-BR').includes('não encontrada')) {
          window.alert('Nota não encontrada.');
          navigate('/notas', { replace: true });
          return;
        }
        setError(message);
      });
    return () => { active = false; };
  }, [navigate, noteId]);

  const content = useMemo(() => {
    if (error) return <div className="note-workspace-load-error" role="alert">{error}</div>;
    if (!note) return <div className="note-workspace-loading">Abrindo nota…</div>;
    return <LoadedNoteWorkspace initialNote={note} />;
  }, [error, note]);

  return content;
}
