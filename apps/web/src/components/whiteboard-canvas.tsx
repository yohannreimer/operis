import { useCallback, useEffect, useRef } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { WhiteboardData } from '../api';

type WhiteboardCanvasProps = {
  initialData?: WhiteboardData | null;
  onSave: (data: WhiteboardData) => void;
  onDelete: () => void;
};

/**
 * Normalise whatever shape data came from the DB into a plain TLStoreSnapshot
 * ({ store, schema }) so we can pass { document: snapshot } to <Tldraw>.
 *
 * Handles two legacy formats:
 *   - { document: TLStoreSnapshot, session: ... }  ← old getSnapshot() output
 *   - { store: ..., schema: ... }                  ← plain store snapshot
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStoreSnapshot(data: any): any | null {
  if (!data || typeof data !== 'object') return null;
  // Already a TLEditorSnapshot — unwrap document part only (ignore session)
  if ('document' in data && data.document) return data.document;
  // Already a TLStoreSnapshot
  if ('store' in data && 'schema' in data) return data;
  return null;
}

export function WhiteboardCanvas({ initialData, onSave, onDelete }: WhiteboardCanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggerSave = useCallback((editor: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Save only the store snapshot (shapes/schema) — no camera/session state.
      // This avoids the "90-degree on reload" bug caused by stale session coords.
      const snapshot = editor.store.getStoreSnapshot();
      onSaveRef.current(snapshot as unknown as WhiteboardData);
    }, 1500);
  }, []);

  const handleDelete = () => {
    if (window.confirm('Deletar a lousa desta nota? Esta ação não pode ser desfeita.')) {
      onDelete();
    }
  };

  const storeSnapshot = toStoreSnapshot(initialData);
  // Tldraw snapshot prop expects Partial<TLEditorSnapshot>: { document?, session? }
  const snapshotProp = storeSnapshot ? { document: storeSnapshot } : undefined;

  return (
    <div className="whiteboard-wrap">
      <div className="whiteboard-toolbar">
        <button type="button" className="ghost-button danger-ghost" onClick={handleDelete}>
          Deletar lousa
        </button>
      </div>
      <div className="whiteboard-container">
        <Tldraw
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          snapshot={snapshotProp as any}
          onMount={(editor) => {
            // After tldraw finishes initializing, fit all content in view
            if (storeSnapshot) {
              setTimeout(() => editor.zoomToFit(), 80);
            }
            editor.store.listen(
              () => triggerSave(editor),
              { source: 'user', scope: 'document' }
            );
          }}
          forceDarkMode
        />
      </div>
    </div>
  );
}
