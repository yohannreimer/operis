import { useCallback, useEffect, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { WhiteboardData } from '../api';

// Carrega assets (fontes, locales) do CDN para não precisar copiar arquivos ao deploy.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).EXCALIDRAW_ASSET_PATH =
    'https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/prod/';
}

type WhiteboardCanvasProps = {
  initialData?: WhiteboardData | null;
  onSave: (data: WhiteboardData) => void;
  onDelete: () => void;
};

export function WhiteboardCanvas({ initialData, onSave, onDelete }: WhiteboardCanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => { onSaveRef.current = onSave; });

  // Limpa o timer ao desmontar para não disparar save com dados obsoletos
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((elements: readonly any[], _appState: any, files: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        // Salva apenas os elementos (sem appState — passá-lo de volta ao init
        // causa restauração quebrada) e os files (imagens coladas).
        // Elementos deletados são preservados pois o Excalidraw precisa deles
        // para o histórico de undo, mas são ignorados na renderização.
        onSaveRef.current({
          elements: Array.from(elements),
          files: files ?? {},
        } as unknown as WhiteboardData);
      } catch (e) {
        console.error('[Whiteboard] save error:', e);
      }
    }, 1500);
  }, []);

  const handleDelete = () => {
    if (window.confirm('Deletar a lousa desta nota? Esta ação não pode ser desfeita.')) {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      onDelete();
    }
  };

  // Só passa elements e files para o init — o appState é reinicializado pelo
  // Excalidraw com valores padrão seguros, evitando canvas em branco ao reabrir.
  const excalidrawInitialData = initialData
    ? {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements: (initialData as any).elements ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        files: (initialData as any).files ?? {},
        scrollToContent: true,
      }
    : undefined;

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
