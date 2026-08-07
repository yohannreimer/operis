import { useCallback, useEffect, useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { WhiteboardData } from '../api';
import type { CanvasSaveStateProps } from './canvas-save-state';

// Carrega assets (fontes, locales) do CDN para não precisar copiar arquivos ao deploy.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).EXCALIDRAW_ASSET_PATH =
    'https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/prod/';
}

type WhiteboardCanvasProps = CanvasSaveStateProps<WhiteboardData> & {
  initialData?: WhiteboardData | null;
  onDelete?: () => void;
};

export function WhiteboardCanvas({
  initialData,
  onSave,
  onDelete,
  onDirtyChange,
  registerFlush,
  readOnly = false
}: WhiteboardCanvasProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const latestData = useRef<WhiteboardData>(initialData ?? { elements: [], files: {} });

  useEffect(() => { onSaveRef.current = onSave; });

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await onSaveRef.current(latestData.current);
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    registerFlush?.(flush);
  }, [flush, registerFlush]);

  // Limpa o timer ao desmontar para não disparar save com dados obsoletos
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((elements: readonly any[], _appState: any, files: any) => {
    if (readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    latestData.current = {
      elements: Array.from(elements),
      files: files ?? {}
    } as unknown as WhiteboardData;
    onDirtyChange?.(true);
    saveTimer.current = setTimeout(() => {
      void flush().catch(() => onDirtyChange?.(true));
    }, 1500);
  }, [flush, onDirtyChange, readOnly]);

  const handleDelete = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onDelete?.();
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
      {!readOnly ? <div className="whiteboard-toolbar">
        <button type="button" className="ghost-button danger-ghost" onClick={handleDelete}>
          Deletar lousa
        </button>
      </div> : null}
      <div className="whiteboard-container">
        <Excalidraw
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialData={excalidrawInitialData as any}
          onChange={handleChange}
          theme="light"
          langCode="pt-BR"
          viewModeEnabled={readOnly}
        />
      </div>
    </div>
  );
}
