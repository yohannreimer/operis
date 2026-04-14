import { Component, useCallback, useEffect, useRef } from 'react';
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

// ErrorBoundary catches tldraw internal errors and shows them instead of going black
type EBState = { error: Error | null };
class TldrawErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Whiteboard] tldraw error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#d46464', fontFamily: 'monospace', fontSize: 13 }}>
          <strong>Erro na lousa:</strong>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <button
            style={{ marginTop: 12, padding: '6px 14px', cursor: 'pointer' }}
            onClick={() => this.setState({ error: null })}
          >Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WhiteboardCanvas({ initialData, onSave, onDelete }: WhiteboardCanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  useEffect(() => { onSaveRef.current = onSave; });

  useEffect(() => {
    const onFsChange = () => {
      setTimeout(() => {
        try { editorRef.current?.zoomToFit({ animation: { duration: 0 } }); } catch { /* ignore */ }
      }, 300);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggerSave = useCallback((editor: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const snapshot = editor.store.getStoreSnapshot('document');
        onSaveRef.current(snapshot as unknown as WhiteboardData);
      } catch (e) {
        console.error('[Whiteboard] save error:', e);
      }
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
        <TldrawErrorBoundary>
          <Tldraw
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            snapshot={snapshotProp as any}
            onMount={(editor) => {
              editorRef.current = editor;
              editor.user.updateUserPreferences({ colorScheme: 'light' });
              if (storeSnapshot) {
                setTimeout(() => {
                  try { editor.zoomToFit({ animation: { duration: 0 } }); } catch { /* ignore */ }
                }, 80);
              }
              editor.store.listen(
                () => triggerSave(editor),
                { source: 'user', scope: 'document' }
              );
            }}
          />
        </TldrawErrorBoundary>
      </div>
    </div>
  );
}
