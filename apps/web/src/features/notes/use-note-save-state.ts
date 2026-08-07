import { useCallback, useEffect, useRef, useState } from 'react';

export type NoteSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';

type SaveResult = { editVersion: number };

function storageKey(noteId: string) {
  return `operis.notes.draft:${noteId}`;
}

function readStoredDraft<TDraft>(noteId: string): TDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { draft?: TDraft } | TDraft;
    return parsed && typeof parsed === 'object' && 'draft' in parsed
      ? (parsed.draft ?? null)
      : (parsed as TDraft);
  } catch {
    return null;
  }
}

function storeDraft<TDraft>(noteId: string, draft: TDraft | null, baseVersion: number) {
  try {
    if (draft === null) localStorage.removeItem(storageKey(noteId));
    else localStorage.setItem(storageKey(noteId), JSON.stringify({ draft, baseVersion }));
  } catch {
    // Saving still works when persistent browser storage is unavailable.
  }
}

function isConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  return (
    candidate.status === 409 ||
    candidate.statusCode === 409 ||
    String(candidate.message ?? '').includes('note_version_conflict')
  );
}

export function useNoteSaveState<TDraft>({
  noteId,
  initialVersion,
  save
}: {
  noteId: string;
  initialVersion: number;
  save(draft: TDraft, baseVersion: number): Promise<SaveResult>;
}) {
  const restoredDraft = useRef(readStoredDraft<TDraft>(noteId));
  const [draft, setDraft] = useState<TDraft | null>(restoredDraft.current);
  const [status, setStatus] = useState<NoteSaveStatus>(
    restoredDraft.current === null ? 'idle' : 'dirty'
  );
  const [baseVersion, setBaseVersion] = useState(initialVersion);
  const draftRef = useRef<TDraft | null>(restoredDraft.current);
  const baseVersionRef = useRef(initialVersion);

  const runSave = useCallback(async () => {
    const savingDraft = draftRef.current;
    if (savingDraft === null) return;
    const savingVersion = baseVersionRef.current;
    setStatus('saving');

    try {
      const result = await save(savingDraft, savingVersion);
      baseVersionRef.current = result.editVersion;
      setBaseVersion(result.editVersion);

      if (draftRef.current === savingDraft) {
        draftRef.current = null;
        setDraft(null);
        storeDraft(noteId, null, result.editVersion);
        setStatus('saved');
      } else {
        storeDraft(noteId, draftRef.current, result.editVersion);
        setStatus('dirty');
      }
    } catch (error) {
      setStatus(isConflict(error) ? 'conflict' : 'failed');
    }
  }, [noteId, save]);

  useEffect(() => {
    if (status !== 'dirty' || draft === null) return;
    const timeoutId = window.setTimeout(() => void runSave(), 900);
    return () => window.clearTimeout(timeoutId);
  }, [draft, runSave, status]);

  const markDirty = useCallback(
    (nextDraft: TDraft) => {
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      storeDraft(noteId, nextDraft, baseVersionRef.current);
      setStatus('dirty');
    },
    [noteId]
  );

  return {
    status,
    draft,
    baseVersion,
    markDirty,
    retry: runSave
  };
}
