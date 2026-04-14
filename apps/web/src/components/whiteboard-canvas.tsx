import { useCallback, useEffect, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { WhiteboardData } from '../api';

type WhiteboardCanvasProps = {
  initialData?: WhiteboardData | null;
  onSave: (data: WhiteboardData) => void;
  onDelete: () => void;
};

export function WhiteboardCanvas({ initialData, onSave, onDelete }: WhiteboardCanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => { onSaveRef.current = onSave; });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        // Remove collaborators que não é serializável
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { collaborators: _c, ...safeAppState } = appState;
        onSaveRef.current({
          elements: Array.from(elements),
          appState: safeAppState,
          files,
        } as unknown as WhiteboardData);
      } catch (e) {
        console.error('[Whiteboard] save error:', e);
      }
    }, 1500);
  }, []);

  const handleDelete = () => {
    if (window.confirm('Deletar a lousa desta nota? Esta ação não pode ser desfeita.')) {
      // Cancela o timer de auto-save pendente para evitar que ele recrie a lousa logo após deletar
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      onDelete();
    }
  };

  const excalidrawInitialData = initialData
    ? {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: (initialData as any).elements ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        appState: (initialData as any).appState ?? {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        files: (initialData as any).files ?? {},
        scrollToContent: true,
      }
    : null;

  return (
    <div className="whiteboard-wrap">
      <div className="whiteboard-toolbar">
        <button type="button" className="ghost-button danger-ghost" onClick={handleDelete}>
          Deletar lousa
        </button>
      </div>
      <div className="whiteboard-container">
        <Excalidraw
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialData={excalidrawInitialData as any}
          onChange={handleChange}
          theme="light"
          langCode="pt-BR"
        />
      </div>
    </div>
  );
}
