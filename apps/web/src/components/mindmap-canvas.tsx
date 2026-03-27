import { useCallback, useEffect, useRef, useState } from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, Options } from 'mind-elixir';
import { toPng } from 'html-to-image';
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
  // Persist the last selected me-tpc element — me.currentNode goes null when toolbar is clicked
  const lastSelectedRef = useRef<HTMLElement | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [direction, setDirection] = useState<'right' | 'side'>('right');
  const [linkSource, setLinkSource] = useState<HTMLElement | null>(null);

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
      direction: direction === 'side' ? MindElixir.SIDE : MindElixir.RIGHT,
      draggable: true,
      editable: true,
      toolBar: false,
      contextMenu: false,
      keypress: true,
      allowUndo: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      markdown: ((text: string) =>
        text
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code>$1</code>')
          .replace(/~~(.*?)~~/g, '<s>$1</s>')
      ) as any,
      theme: operisTheme as unknown as Options['theme'],
    };

    const me = new MindElixir(options);
    const data = initialData ?? TEMPLATES.idea_map;
    me.init(data as Parameters<typeof me.init>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onOperation = (op: any) => {
      triggerSave();
      // Auto-open edit on newly created nodes (Tab=addChild, Enter=addSibling)
      // currentNode IS the me-tpc element — dispatch dblclick directly on it
      if (op?.name === 'addChild' || op?.name === 'addSibling') {
        setTimeout(() => {
          const tpc = meRef.current?.currentNode as HTMLElement | null;
          if (tpc) tpc.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        }, 80);
      }
    };
    me.bus.addListener('operation', onOperation);
    // Track the last selected node — me.currentNode goes null when toolbar receives focus
    // selectNodes fires whenever the user selects a node (before toolbar click clears it)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSelectNodes = (nodes: any[]) => {
      if (nodes && nodes.length > 0) {
        const el = me.findEle(nodes[0].id) as HTMLElement | null;
        if (el) lastSelectedRef.current = el;
      }
    };
    me.bus.addListener('selectNodes', onSelectNodes);
    meRef.current = me;

    // Hide the me-tpc text while #input-box is visible to prevent double-text glitch
    const observer = new MutationObserver(() => {
      const container = containerRef.current;
      if (!container) return;
      const inputBox = container.querySelector('#input-box') as HTMLElement | null;
      if (inputBox) {
        const inputRect = inputBox.getBoundingClientRect();
        container.querySelectorAll('me-tpc').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (Math.abs(rect.left - inputRect.left) < 40 && Math.abs(rect.top - inputRect.top) < 40) {
            (el as HTMLElement).dataset.editHidden = '1';
            (el as HTMLElement).style.visibility = 'hidden';
          }
        });
      } else {
        container.querySelectorAll('me-tpc[data-edit-hidden]').forEach((el) => {
          (el as HTMLElement).style.visibility = '';
          delete (el as HTMLElement).dataset.editHidden;
        });
      }
    });
    observer.observe(containerRef.current, { childList: true, subtree: true });

    // Space (when not editing) → open edit mode on selected node
    // Tab/Enter create new nodes and auto-open edit (handled via operation listener above)
    const handleKeydown = (e: KeyboardEvent) => {
      if (!meRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      // Don't steal from real input fields
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;

      // If already editing, let Space pass through as a normal space character
      if (container.querySelector('#input-box')) return;

      if (e.key !== ' ') return;

      // currentNode IS the me-tpc element — dispatch dblclick directly on it
      const tpc = meRef.current.currentNode as HTMLElement | null;
      if (!tpc) return;

      e.preventDefault();
      tpc.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    };
    // capture:true → fires before mind-elixir's own keydown handler on .map-container
    // (ME uses Space for pan mode and calls stopPropagation, blocking document bubbling)
    document.addEventListener('keydown', handleKeydown, true);

    return () => {
      me.bus.removeListener('operation', onOperation);
      me.bus.removeListener('selectNodes', onSelectNodes);
      observer.disconnect();
      document.removeEventListener('keydown', handleKeydown, true);
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
          title="Exportar PNG"
          onClick={() => {
            if (!containerRef.current || !meRef.current) return;

            // Center the map first, then wait for layout to settle
            meRef.current.toCenter();

            setTimeout(() => {
              if (!containerRef.current) return;
              // Capture the full map-canvas (not the clipped map-container)
              const mapCanvas = containerRef.current.querySelector('.map-canvas') as HTMLElement | null;
              if (!mapCanvas) return;

              const canvasRect = mapCanvas.getBoundingClientRect();
              const tpcs = mapCanvas.querySelectorAll('me-tpc');
              const PAD = 60;
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

              tpcs.forEach((el) => {
                const r = el.getBoundingClientRect();
                minX = Math.min(minX, r.left - canvasRect.left);
                minY = Math.min(minY, r.top  - canvasRect.top);
                maxX = Math.max(maxX, r.right  - canvasRect.left);
                maxY = Math.max(maxY, r.bottom - canvasRect.top);
              });

              // Fallback: capture the whole canvas if no nodes measured
              const cropX = isFinite(minX) ? Math.max(0, minX - PAD) : 0;
              const cropY = isFinite(minY) ? Math.max(0, minY - PAD) : 0;
              const cropW = isFinite(maxX) ? maxX - minX + PAD * 2 : canvasRect.width;
              const cropH = isFinite(maxY) ? maxY - minY + PAD * 2 : canvasRect.height;

              toPng(mapCanvas, {
                backgroundColor: '#1a1a1f',
                pixelRatio: 2,
                width:  Math.round(cropW),
                height: Math.round(cropH),
                style: {
                  transform: `translate(${-cropX}px, ${-cropY}px)`,
                  transformOrigin: 'top left',
                  overflow: 'visible',
                },
              }).then((dataUrl) => {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = 'mapa-mental.png';
                a.click();
              }).catch(console.error);
            }, 400);
          }}
        >↓</button>
        <button
          className="diagram-toolbar-btn"
          title="Estilos"
          onClick={() => {
            // Capture current node BEFORE menu opens and focus is lost
            if (meRef.current?.currentNode) {
              lastSelectedRef.current = meRef.current.currentNode as HTMLElement;
            }
            setShowStyleMenu((v) => !v);
          }}
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

      {showStyleMenu && (
        <div className="diagram-templates-menu">
          <div className="diagram-node-menu-group">Cor do nó selecionado</div>
          {[
            { color: '#f97316', border: '#c2590a', name: 'Laranja' },
            { color: '#6366f1', border: '#4346c8', name: 'Roxo' },
            { color: '#22c55e', border: '#15883f', name: 'Verde' },
            { color: '#f59e0b', border: '#b87208', name: 'Amarelo' },
            { color: '#8b5cf6', border: '#6430d4', name: 'Violeta' },
            { color: '#06b6d4', border: '#047d94', name: 'Ciano' },
            { color: '#ef4444', border: '#b91c1c', name: 'Vermelho' },
            { color: '#2a2a30', border: 'rgba(255,255,255,0.07)', name: 'Padrão' },
          ].map(({ color, border, name }) => (
            <button
              key={color}
              className="diagram-node-menu-item"
              onClick={() => {
                const me = meRef.current;
                if (me) {
                  // Use lastSelectedRef — me.currentNode is null after toolbar click
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const currentNode = (lastSelectedRef.current ?? me.currentNode) as any;
                  if (currentNode) {
                    const rawId: string = currentNode.dataset?.nodeid ?? currentNode.getAttribute?.('nodeid') ?? '';
                    const data = me.getData();
                    // mind-elixir always prefixes DOM data-nodeid with "me" (e.g. "meroot", "me<uuid>")
                    const nodeId = rawId.startsWith('me') ? rawId.slice(2) : rawId;
                    if (nodeId) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      function setColor(node: any): boolean {
                        if (node.id === nodeId) {
                          node.style = { ...(node.style ?? {}), background: color };
                          // branchColor controls both the connecting line and the node border-color
                          node.branchColor = border;
                          return true;
                        }
                        return (node.children ?? []).some(setColor);
                      }
                      setColor(data.nodeData);
                      me.refresh(data);
                      triggerSave();
                    }
                  }
                }
                setShowStyleMenu(false);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block', flexShrink: 0 }} />
              <span>{name}</span>
            </button>
          ))}
          <div className="diagram-node-menu-group" style={{ marginTop: 8 }}>Tag no nó selecionado</div>
          {[
            { text: '⚡ Urgente', bg: '#ef4444' },
            { text: '✓ Feito',   bg: '#22c55e' },
            { text: '? Dúvida',  bg: '#f59e0b' },
            { text: '→ Próximo', bg: '#6366f1' },
          ].map(({ text, bg }) => (
            <button
              key={text}
              className="diagram-node-menu-item"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => {
                const me = meRef.current;
                if (!me) return;
                // Use lastSelectedRef — me.currentNode is null after toolbar click
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const currentNode = (lastSelectedRef.current ?? me.currentNode) as any;
                if (!currentNode) return;
                const rawTagId: string = currentNode.dataset?.nodeid ?? currentNode.getAttribute?.('nodeid') ?? '';
                const data = me.getData();
                // mind-elixir always prefixes DOM data-nodeid with "me"
                const nodeId = rawTagId.startsWith('me') ? rawTagId.slice(2) : rawTagId;
                if (!nodeId) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                function addTag(node: any): boolean {
                  if (node.id === nodeId) {
                    const existing: Array<{ text: string; style: Record<string, string> }> = node.tags ?? [];
                    const hasTag = existing.some((t) => t.text === text);
                    node.tags = hasTag
                      ? existing.filter((t) => t.text !== text)
                      : [...existing, { text, style: { background: bg, color: '#fff', borderRadius: '4px', padding: '1px 5px', fontSize: '11px' } }];
                    return true;
                  }
                  return (node.children ?? []).some(addTag);
                }
                addTag(data.nodeData);
                me.refresh(data);
                triggerSave();
                setShowStyleMenu(false);
              }}
            >
              <span style={{ background: bg, color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{text}</span>
            </button>
          ))}
          <div className="diagram-node-menu-group" style={{ marginTop: 8 }}>Conexões</div>
          <button
            className="diagram-node-menu-item"
            onClick={() => {
              const me = meRef.current;
              if (!me) return;
              const src = (lastSelectedRef.current ?? me.currentNode) as HTMLElement | null;
              if (!src) return;
              setLinkSource(src);
              setShowStyleMenu(false);
              // selectNodes fires when user clicks any existing node — use it to pick the target
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const finish = (nodes: any[]) => {
                const targetNodeObj = nodes?.[0];
                if (targetNodeObj) {
                  const targetEl = me.findEle(targetNodeObj.id) as HTMLElement | null;
                  if (targetEl && targetEl !== src) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (me as any).createArrow(src, targetEl);
                    triggerSave();
                  }
                }
                setLinkSource(null);
                me.bus.removeListener('selectNodes', finish);
              };
              me.bus.addListener('selectNodes', finish);
            }}
          >↗ Criar seta para...</button>
          <button
            className="diagram-node-menu-item"
            onClick={() => {
              const me = meRef.current;
              if (!me) return;
              const node = (lastSelectedRef.current ?? me.currentNode) as HTMLElement | null;
              if (!node) return;
              const label = window.prompt('Texto do colchete (summary):', 'Grupo');
              if (label == null) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (me as any).createSummary(node, label);
              triggerSave();
              setShowStyleMenu(false);
            }}
          >⌒ Adicionar colchete</button>
          <div className="diagram-node-menu-group" style={{ marginTop: 8 }}>Layout</div>
          <button
            className="diagram-node-menu-item"
            onClick={() => {
              const next = direction === 'right' ? 'side' : 'right';
              setDirection(next);
              setShowStyleMenu(false);
              // Re-init with new direction after state update
              setTimeout(() => {
                if (!meRef.current || !containerRef.current) return;
                const data = meRef.current.getData();
                meRef.current.direction = next === 'side' ? MindElixir.SIDE : MindElixir.RIGHT;
                meRef.current.refresh(data);
              }, 50);
            }}
          >{direction === 'right' ? '⇔ Dois lados (SIDE)' : '→ Um lado (RIGHT)'}</button>
          <div className="diagram-node-menu-group" style={{ marginTop: 8 }}>Ações</div>
          <button
            className="diagram-node-menu-item diagram-node-menu-item--danger"
            onClick={() => {
              if (window.confirm('Limpar o mapa mental?')) { onDelete(); }
              setShowStyleMenu(false);
            }}
          >Limpar mapa</button>
        </div>
      )}

      {linkSource && (
        <div className="mindmap-link-hint">
          ↗ Selecione o nó destino para criar a seta
          <button onClick={() => { setLinkSource(null); meRef.current?.bus.removeListener('selectNewNode', () => {}); }}>✕</button>
        </div>
      )}
      <div ref={containerRef} className="mindmap-container" />
    </div>
  );
}
