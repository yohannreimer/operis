import { useCallback, useEffect, useRef, useState } from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, Options } from 'mind-elixir';
import { MindMapData } from '../api';

const operisTheme = {
  name: 'operis-dark',
  palette: ['#f97316', '#6366f1', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'],
  cssVar: {
    '--main-color': '#e8e4df',
    '--main-bgcolor': '#232328',
    '--color': '#a09a92',
    '--bgcolor': '#2a2a30',
    '--selected': 'rgba(249,115,22,0.15)',
    '--border': 'rgba(255,255,255,0.07)',
    '--line-color': 'rgba(255,255,255,0.2)',
  },
};

const TEMPLATES: Record<string, MindMapData> = {
  idea_map: {
    nodeData: {
      id: 'root', topic: 'Ideia',
      children: [
        { id: '1', topic: 'O quê', children: [] },
        { id: '2', topic: 'Por quê', children: [] },
        { id: '3', topic: 'Como', children: [] },
        { id: '4', topic: 'Riscos', children: [] },
      ],
    },
  },
  problem_analysis: {
    nodeData: {
      id: 'root', topic: 'Problema',
      children: [
        { id: '1', topic: 'Causas', children: [] },
        { id: '2', topic: 'Sintomas', children: [] },
        { id: '3', topic: 'Soluções', children: [] },
      ],
    },
  },
  pros_cons: {
    nodeData: {
      id: 'root', topic: 'Decisão',
      children: [
        { id: '1', topic: 'Prós', children: [] },
        { id: '2', topic: 'Contras', children: [] },
      ],
    },
  },
  five_whys: {
    nodeData: {
      id: 'root', topic: 'Problema',
      children: [{
        id: '1', topic: 'Por quê 1?',
        children: [{
          id: '2', topic: 'Por quê 2?',
          children: [{
            id: '3', topic: 'Por quê 3?',
            children: [{
              id: '4', topic: 'Por quê 4?',
              children: [{ id: '5', topic: 'Por quê 5?', children: [] }],
            }],
          }],
        }],
      }],
    },
  },
};

type MindMapCanvasProps = {
  initialData?: MindMapData;
  onSave: (data: MindMapData) => void;
  onGenerate: () => void;
  onDelete: () => void;
  isGenerating: boolean;
  noteTextLength: number;
};

export function MindMapCanvas({
  initialData,
  onSave,
  onGenerate,
  onDelete,
  isGenerating,
  noteTextLength,
}: MindMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixirInstance | null>(null);
  const saveTimer = useRef<{ id: ReturnType<typeof setTimeout> | null }>({ id: null });
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const triggerSave = useCallback(() => {
    if (saveTimer.current.id) clearTimeout(saveTimer.current.id);
    saveTimer.current.id = setTimeout(() => {
      if (!meRef.current) return;
      const data = meRef.current.getData();
      onSave({ nodeData: data.nodeData } as MindMapData);
    }, 1500);
  }, [onSave]);

  useEffect(() => {
    if (!containerRef.current) return;

    const options: Options = {
      el: containerRef.current,
      direction: MindElixir.RIGHT,
      draggable: true,
      editable: true,
      theme: operisTheme as unknown as Options['theme'],
    };

    const me = new MindElixir(options);
    const data = initialData ?? TEMPLATES.idea_map;
    me.init(data as Parameters<typeof me.init>[0]);
    me.bus.addListener('operation', triggerSave);
    meRef.current = me;

    return () => {
      me.bus.removeListener('operation', triggerSave);
      meRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(key: string) {
    const t = TEMPLATES[key];
    if (!t || !meRef.current) return;
    meRef.current.refresh(t as Parameters<typeof meRef.current.refresh>[0]);
    setShowTemplates(false);
    triggerSave();
  }

  const TEMPLATE_LABELS: Record<string, string> = {
    idea_map: 'Mapa de Ideia',
    problem_analysis: 'Análise de Problema',
    pros_cons: 'Pros & Cons',
    five_whys: '5 Porquês',
  };

  return (
    <div className="mindmap-canvas-wrapper">
      <div className="diagram-toolbar">
        <button
          className="diagram-toolbar-btn"
          title="Templates"
          onClick={() => setShowTemplates((v) => !v)}
        >⬡</button>
        <button
          className={`diagram-toolbar-btn ${isGenerating ? 'loading' : ''}`}
          title={noteTextLength < 50 ? 'Nota muito curta' : 'Gerar com IA'}
          onClick={onGenerate}
          disabled={noteTextLength < 50 || isGenerating}
        >✦</button>
        <button
          className="diagram-toolbar-btn"
          title="Limpar mapa"
          onClick={() => setShowDeleteConfirm(true)}
        >···</button>
      </div>

      {showTemplates && (
        <div className="diagram-templates-menu">
          <div className="diagram-node-menu-group">Templates</div>
          {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
            <button key={key} className="diagram-node-menu-item" onClick={() => applyTemplate(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {showDeleteConfirm && (
        <div className="diagram-delete-confirm">
          <p>Tem certeza? Essa ação não pode ser desfeita.</p>
          <div className="diagram-delete-confirm-actions">
            <button className="ghost-button" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
            <button className="diagram-delete-btn" onClick={() => { onDelete(); setShowDeleteConfirm(false); }}>Limpar</button>
          </div>
        </div>
      )}

      <div ref={containerRef} className="mindmap-container" />
    </div>
  );
}
