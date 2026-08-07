import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  Connection,
  NodeTypes,
  Handle,
  Position,
  NodeToolbar,
  useReactFlow,
  ConnectionMode,
  MarkerType,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DiagramData } from '../api';
import type { CanvasSaveStateProps } from './canvas-save-state';
import { normalizeDiagramData } from './diagram-data';

type RFNode = { id: string; type: string; position: { x: number; y: number }; data: { label: string; [key: string]: unknown } };
type RFEdge = { id: string; source: string; target: string; label?: string };

function changesPersistedNodeData(changes: NodeChange[]) {
  return changes.some((change) => change.type !== 'dimensions' && change.type !== 'select');
}

function changesPersistedEdgeData(changes: EdgeChange[]) {
  return changes.some((change) => change.type !== 'select');
}

// ── Shared handles ────────────────────────────────────────────────────────

function NodeHandles() {
  return (
    <>
      <Handle type="source" position={Position.Top}    id="top"    className="rf-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="rf-handle" />
      <Handle type="source" position={Position.Left}   id="left"   className="rf-handle" />
      <Handle type="source" position={Position.Right}  id="right"  className="rf-handle" />
    </>
  );
}

// ── Node toolbar (shown on select) ───────────────────────────────────────

const NODE_COLORS = [
  { label: 'Laranja', bg: 'rgba(249,115,22,0.25)', border: '#f97316' },
  { label: 'Roxo',    bg: 'rgba(99,102,241,0.25)',  border: '#6366f1' },
  { label: 'Verde',   bg: 'rgba(34,197,94,0.25)',   border: '#22c55e' },
  { label: 'Azul',    bg: 'rgba(6,182,212,0.25)',   border: '#06b6d4' },
  { label: 'Verm',    bg: 'rgba(239,68,68,0.25)',   border: '#ef4444' },
  { label: 'Padrão',  bg: '',                        border: '' },
];

function RFNodeToolbar({ id, data }: { id: string; data: { label: string; bg?: string; border?: string } }) {
  const { updateNodeData, setNodes } = useReactFlow();
  return (
    <NodeToolbar className="rf-node-toolbar">
      {NODE_COLORS.map((c) => (
        <button
          key={c.label}
          title={c.label}
          className="rf-toolbar-color"
          style={{ background: c.bg || 'rgba(255,255,255,0.08)', borderColor: c.border || 'rgba(255,255,255,0.15)' }}
          onClick={() => updateNodeData(id, { bg: c.bg, border: c.border })}
        />
      ))}
      <div className="rf-toolbar-divider" />
      <button
        className="rf-toolbar-delete"
        title="Deletar nó"
        onClick={() => setNodes((ns) => ns.filter((n) => n.id !== id))}
      >✕</button>
    </NodeToolbar>
  );
}

// ── Inline-editable label ────────────────────────────────────────────────

function NodeLabel({ id, label }: { id: string; label: string }) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        autoFocus
        className="rf-node-input"
        defaultValue={label}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { updateNodeData(id, { label: e.currentTarget.value }); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={(e) => { updateNodeData(id, { label: e.target.value }); setEditing(false); }}
      />
    );
  }
  return <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>{label}</span>;
}

// ── Custom node components ────────────────────────────────────────────────

type NodeData = { label: string; bg?: string; border?: string };

function DefaultNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div className="rf-node rf-node--default" style={{ background: data.bg || '', borderColor: data.border || '' }}>
      <RFNodeToolbar id={id} data={data} />
      <NodeHandles />
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function StartNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div className="rf-node rf-node--start" style={{ background: data.bg || '', borderColor: data.border || '' }}>
      <RFNodeToolbar id={id} data={data} />
      <Handle type="source" position={Position.Bottom} id="bottom" className="rf-handle" />
      <Handle type="source" position={Position.Right}  id="right"  className="rf-handle" />
      <NodeLabel id={id} label={data.label || 'Início'} />
    </div>
  );
}

function EndNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div className="rf-node rf-node--end" style={{ background: data.bg || '', borderColor: data.border || '' }}>
      <RFNodeToolbar id={id} data={data} />
      <Handle type="source" position={Position.Top}  id="top"  className="rf-handle" />
      <Handle type="source" position={Position.Left} id="left" className="rf-handle" />
      <NodeLabel id={id} label={data.label || 'Fim'} />
    </div>
  );
}

function DecisionNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div className="rf-node rf-node--decision" style={{ background: data.bg || '', borderColor: data.border || '' }}>
      <RFNodeToolbar id={id} data={data} />
      <NodeHandles />
      <div className="rf-node-diamond"><NodeLabel id={id} label={data.label} /></div>
    </div>
  );
}

function ProcessNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--process">
      <NodeHandles />
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function TriggerNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--trigger">
      <NodeHandles />
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function DelayNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--delay">
      <NodeHandles />
      ⏱ <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function ParallelNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--parallel">
      <NodeHandles />
      <div className="rf-parallel-bar" /><NodeLabel id={id} label={data.label} />
    </div>
  );
}

function CheckpointNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--checkpoint">
      <NodeHandles />
      ✓ <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function WarningNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--warning">
      <NodeHandles />
      ⚠ <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function PersonNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--person">
      <NodeHandles />
      <div className="rf-person-avatar">{data.label[0]?.toUpperCase()}</div>
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function SystemNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--system">
      <NodeHandles />
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function GroupNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--group">
      <span className="rf-group-label"><NodeLabel id={id} label={data.label} /></span>
    </div>
  );
}

function DatabaseNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--database">
      <NodeHandles />
      <svg viewBox="0 0 40 30" width="40" height="30">
        <ellipse cx="20" cy="6" rx="18" ry="5" fill="currentColor" opacity="0.3"/>
        <rect x="2" y="6" width="36" height="18" fill="currentColor" opacity="0.1"/>
        <ellipse cx="20" cy="24" rx="18" ry="5" fill="currentColor" opacity="0.3"/>
      </svg>
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function MetricNode({ id, data }: { id: string; data: { label: string; value?: string } }) {
  return (
    <div className="rf-node rf-node--metric">
      <NodeHandles />
      {data.value && <div className="rf-metric-value">{data.value}</div>}
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

function AnnotationNode({ id, data }: { id: string; data: { label: string } }) {
  return (
    <div className="rf-node rf-node--annotation">
      <NodeHandles />
      <NodeLabel id={id} label={data.label} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  default: DefaultNode,
  start: StartNode,
  end: EndNode,
  decision: DecisionNode,
  process: ProcessNode,
  trigger: TriggerNode,
  delay: DelayNode,
  parallel: ParallelNode,
  checkpoint: CheckpointNode,
  warning: WarningNode,
  person: PersonNode,
  system: SystemNode,
  group: GroupNode,
  database: DatabaseNode,
  metric: MetricNode,
  annotation: AnnotationNode,
};

// ── Templates ─────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, Partial<DiagramData>> = {
  decision_flow: {
    nodes: [
      { id: '1', type: 'start', position: { x: 200, y: 0 }, data: { label: 'Início' } },
      { id: '2', type: 'decision', position: { x: 170, y: 100 }, data: { label: 'Decisão?' } },
      { id: '3', type: 'process', position: { x: 0, y: 240 }, data: { label: 'Caminho A' } },
      { id: '4', type: 'process', position: { x: 340, y: 240 }, data: { label: 'Caminho B' } },
      { id: '5', type: 'end', position: { x: 130, y: 380 }, data: { label: 'Resultado' } },
      { id: '6', type: 'end', position: { x: 310, y: 380 }, data: { label: 'Resultado' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3', label: 'Sim' },
      { id: 'e2-4', source: '2', target: '4', label: 'Não' },
      { id: 'e3-5', source: '3', target: '5' },
      { id: 'e4-6', source: '4', target: '6' },
    ],
  },
  roadmap: {
    nodes: [
      { id: '1', type: 'checkpoint', position: { x: 0, y: 100 }, data: { label: 'Marco 1' } },
      { id: '2', type: 'checkpoint', position: { x: 200, y: 100 }, data: { label: 'Marco 2' } },
      { id: '3', type: 'checkpoint', position: { x: 400, y: 100 }, data: { label: 'Marco 3' } },
      { id: '4', type: 'checkpoint', position: { x: 600, y: 100 }, data: { label: 'Marco 4' } },
      { id: '5', type: 'end', position: { x: 800, y: 100 }, data: { label: 'Entrega' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
      { id: 'e4-5', source: '4', target: '5' },
    ],
  },
  dependencies: {
    nodes: [
      { id: '1', type: 'default', position: { x: 200, y: 0 }, data: { label: 'Tarefa A' } },
      { id: '2', type: 'default', position: { x: 0, y: 150 }, data: { label: 'Tarefa B' } },
      { id: '3', type: 'default', position: { x: 400, y: 150 }, data: { label: 'Tarefa C' } },
      { id: '4', type: 'default', position: { x: 200, y: 300 }, data: { label: 'Tarefa D' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', label: 'bloqueia' },
      { id: 'e1-3', source: '1', target: '3', label: 'bloqueia' },
      { id: 'e2-4', source: '2', target: '4', label: 'bloqueia' },
      { id: 'e3-4', source: '3', target: '4', label: 'bloqueia' },
    ],
  },
  launch_plan: {
    nodes: [
      { id: 'g1', type: 'group', position: { x: 0, y: 0 }, data: { label: 'Pré-lançamento' } },
      { id: '1', type: 'process', position: { x: 20, y: 50 }, data: { label: 'Preparar copy' } },
      { id: '2', type: 'process', position: { x: 20, y: 120 }, data: { label: 'Setup ads' } },
      { id: 'g2', type: 'group', position: { x: 250, y: 0 }, data: { label: 'Lançamento' } },
      { id: '3', type: 'trigger', position: { x: 270, y: 50 }, data: { label: 'Go live' } },
      { id: 'g3', type: 'group', position: { x: 500, y: 0 }, data: { label: 'Pós-lançamento' } },
      { id: '4', type: 'metric', position: { x: 520, y: 50 }, data: { label: 'Resultado', value: '?' } },
    ],
    edges: [
      { id: 'e1-3', source: '1', target: '3' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
    ],
  },
};

// ── Node types menu ───────────────────────────────────────────────────────

const NODE_GROUPS = [
  {
    label: 'Básicos',
    types: [
      { type: 'default', label: 'Passo' },
      { type: 'start', label: 'Início' },
      { type: 'end', label: 'Fim' },
      { type: 'annotation', label: 'Nota' },
    ],
  },
  {
    label: 'Fluxo',
    types: [
      { type: 'decision', label: 'Decisão' },
      { type: 'process', label: 'Processo' },
      { type: 'trigger', label: 'Gatilho' },
      { type: 'delay', label: 'Espera' },
      { type: 'parallel', label: 'Paralelo' },
      { type: 'checkpoint', label: 'Checkpoint' },
      { type: 'warning', label: 'Alerta' },
    ],
  },
  {
    label: 'Pessoas & Sistemas',
    types: [
      { type: 'person', label: 'Pessoa' },
      { type: 'system', label: 'Sistema' },
      { type: 'group', label: 'Grupo' },
    ],
  },
  {
    label: 'Dados & Métricas',
    types: [
      { type: 'database', label: 'Banco de dados' },
      { type: 'metric', label: 'Métrica' },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────

type DiagramCanvasProps = CanvasSaveStateProps<DiagramData> & {
  initialData?: DiagramData;
  onGenerate?: () => void;
  onDelete?: () => void;
  isGenerating?: boolean;
  noteTextLength?: number;
};

// ── Main Component ────────────────────────────────────────────────────────

export function DiagramCanvas({
  initialData,
  onSave,
  onGenerate,
  onDelete,
  isGenerating = false,
  noteTextLength = 0,
  onDirtyChange,
  registerFlush,
  readOnly = false,
}: DiagramCanvasProps) {
  const normalizedInitialData = useMemo(() => normalizeDiagramData(initialData), [initialData]);
  const [nodes, setNodes, onNodesChange] = useNodesState(normalizedInitialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(normalizedInitialData.edges);
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfInstance = useRef<any>(null);
  const saveTimer = useRef<{ id: ReturnType<typeof setTimeout> | null }>({ id: null });

  // ── History for undo/redo ──────────────────────────────────────────────
  const history = useRef<Array<{ nodes: RFNode[]; edges: RFEdge[] }>>([]);
  const historyIndex = useRef(-1);

  const pushHistory = useCallback((ns: RFNode[], es: RFEdge[]) => {
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push({ nodes: JSON.parse(JSON.stringify(ns)), edges: JSON.parse(JSON.stringify(es)) });
    historyIndex.current = history.current.length - 1;
  }, []);

  const flush = useCallback(async () => {
    if (saveTimer.current.id) {
      clearTimeout(saveTimer.current.id);
      saveTimer.current.id = null;
    }
    const flow = rfInstance.current?.toObject() ?? {
      nodes,
      edges,
      viewport: normalizedInitialData.viewport
    };
    pushHistory(flow.nodes as RFNode[], flow.edges as RFEdge[]);
    await onSave(flow as DiagramData);
    onDirtyChange?.(false);
  }, [edges, nodes, normalizedInitialData.viewport, onDirtyChange, onSave, pushHistory]);

  useEffect(() => {
    registerFlush?.(flush);
  }, [flush, registerFlush]);

  useEffect(() => () => {
    if (saveTimer.current.id) clearTimeout(saveTimer.current.id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 'z' && !e.shiftKey) {
        if (historyIndex.current > 0) {
          e.preventDefault();
          historyIndex.current--;
          const s = history.current[historyIndex.current];
          setNodes(s.nodes as Parameters<typeof setNodes>[0]);
          setEdges(s.edges as Parameters<typeof setEdges>[0]);
        }
      }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        if (historyIndex.current < history.current.length - 1) {
          e.preventDefault();
          historyIndex.current++;
          const s = history.current[historyIndex.current];
          setNodes(s.nodes as Parameters<typeof setNodes>[0]);
          setEdges(s.edges as Parameters<typeof setEdges>[0]);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setNodes, setEdges]);

  const triggerSave = useCallback(() => {
    if (readOnly) return;
    onDirtyChange?.(true);
    if (saveTimer.current.id) clearTimeout(saveTimer.current.id);
    saveTimer.current.id = setTimeout(() => {
      void flush().catch(() => onDirtyChange?.(true));
    }, 1500);
  }, [flush, onDirtyChange, readOnly]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds).map((e) =>
        e.source === params.source && e.target === params.target
          ? { ...e, animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(249,115,22,0.8)' }, style: { stroke: 'rgba(249,115,22,0.6)', strokeWidth: 2 } }
          : e
      ));
      triggerSave();
    },
    [setEdges, triggerSave]
  );

  const addNode = (type: string, label: string) => {
    const id = `node-${Date.now()}`;
    const position = rfInstance.current
      ? { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 }
      : { x: 200, y: 200 };
    setNodes((nds) => [...nds, { id, type, position, data: { label } }]);
    setShowNodeMenu(false);
    triggerSave();
  };

  const applyTemplate = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    setNodes((t.nodes as RFNode[]) ?? []);
    setEdges((t.edges as RFEdge[]) ?? []);
    setShowTemplates(false);
    triggerSave();
  };

  return (
    <div className="diagram-canvas-wrapper">
      {/* Toolbar lateral */}
      {!readOnly ? <div className="diagram-toolbar">
        <button
          className="diagram-toolbar-btn"
          title="Adicionar nó"
          onClick={() => setShowNodeMenu((v) => !v)}
        >+</button>
        <button
          className="diagram-toolbar-btn"
          title="Templates"
          onClick={() => setShowTemplates((v) => !v)}
        >⬡</button>
        <button
          className="diagram-toolbar-btn"
          title="Fit view"
          onClick={() => rfInstance.current?.fitView()}
        >⊡</button>
        <button
          className={`diagram-toolbar-btn ${isGenerating ? 'loading' : ''}`}
          title={noteTextLength < 50 ? 'Nota muito curta para gerar' : 'Gerar com IA'}
          onClick={onGenerate}
          disabled={noteTextLength < 50 || isGenerating}
        >✦</button>
        <button
          className="diagram-toolbar-btn"
          title="Mais opções"
          onClick={() => setShowMenu((v) => !v)}
        >···</button>
      </div> : null}

      {/* Menu de tipos de nó */}
      {showNodeMenu && (
        <div className="diagram-node-menu">
          {NODE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="diagram-node-menu-group">{group.label}</div>
              {group.types.map((t) => (
                <button
                  key={t.type}
                  className="diagram-node-menu-item"
                  onClick={() => addNode(t.type, t.label)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Menu de templates */}
      {showTemplates && (
        <div className="diagram-templates-menu">
          <div className="diagram-node-menu-group">Templates</div>
          {Object.entries({
            decision_flow: 'Fluxo de Decisão',
            roadmap: 'Roadmap de Projeto',
            dependencies: 'Mapa de Dependências',
            launch_plan: 'Planejamento de Lançamento',
          }).map(([key, label]) => (
            <button key={key} className="diagram-node-menu-item" onClick={() => applyTemplate(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Menu ··· */}
      {showMenu && (
        <div className="diagram-overflow-menu">
          <button className="diagram-node-menu-item" onClick={() => { rfInstance.current?.fitView(); setShowMenu(false); }}>
            Fit view
          </button>
          <button
            className="diagram-node-menu-item diagram-node-menu-item--danger"
            onClick={() => { setShowDeleteConfirm(true); setShowMenu(false); }}
          >
            Limpar diagrama
          </button>
        </div>
      )}

      {/* Confirmação de delete */}
      {showDeleteConfirm && (
        <div className="diagram-delete-confirm">
          <p>Tem certeza? Essa ação não pode ser desfeita.</p>
          <div className="diagram-delete-confirm-actions">
            <button className="ghost-button" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
            <button className="diagram-delete-btn" onClick={() => { onDelete?.(); setShowDeleteConfirm(false); }}>Limpar</button>
          </div>
        </div>
      )}

      {/* React Flow */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => {
          onNodesChange(changes);
          if (changesPersistedNodeData(changes)) triggerSave();
        }}
        onEdgesChange={(changes) => {
          onEdgesChange(changes);
          if (changesPersistedEdgeData(changes)) triggerSave();
        }}
        onConnect={onConnect}
        onReconnect={(oldEdge, newConn) => {
          setEdges((eds) => eds.map((e) => e.id === oldEdge.id ? { ...oldEdge, ...newConn } : e));
          triggerSave();
        }}
        nodeTypes={nodeTypes}
        onInit={(inst) => {
          rfInstance.current = inst as unknown;
          if (initialData) setTimeout(() => (inst as any).fitView({ padding: 0.2 }), 150);
        }}
        defaultViewport={normalizedInitialData.viewport}
        fitView={!initialData}
        colorMode="dark"
        connectionMode={ConnectionMode.Loose}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
      >
        <Controls />
        <MiniMap
          nodeColor={() => 'rgba(249,115,22,0.5)'}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: '#1a1a20', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.06)" />
      </ReactFlow>
    </div>
  );
}
