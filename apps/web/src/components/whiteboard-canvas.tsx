import { useCallback, useEffect, useRef } from 'react';
import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { WhiteboardData } from '../api';

type WhiteboardCanvasProps = {
  initialData?: WhiteboardData | null;
  onSave: (data: WhiteboardData) => void;
  onDelete: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStoreSnapshot(data: any): any | null {
  if (!data || typeof data !== 'object') return null;
  if ('document' in data && data.document) return data.document;
  if ('store' in data && 'schema' in data) return data;
  return null;
}

export function WhiteboardCanvas({ initialData, onSave, onDelete }: WhiteboardCanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  useEffect(() => { onSaveRef.current = onSave; });

  // When fullscreen changes, tldraw's canvas may go black because the container
  // resizes abruptly. Re-fit the viewport after the transition settles.
  useEffect(() => {
    const onFsChange = () => {
      setTimeout(() => {
        editorRef.current?.zoomToFit({ duration: 0 });
      }, 300); // wait for the fullscreen transition to complete
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggerSave = useCallback((editor: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
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
            editorRef.current = editor;
            if (storeSnapshot) {
              setTimeout(() => editor.zoomToFit({ duration: 0 }), 80);
            }
            editor.store.listen(
              () => triggerSave(editor),
              { source: 'user', scope: 'document' }
            );
          }}
        />
      </div>
    </div>
  );
}
