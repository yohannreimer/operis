import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DiagramData } from '../api';

type RFNode = { id: string; type: string; position: { x: number; y: number }; data: { label: string; [key: string]: unknown } };
type RFEdge = { id: string; source: string; target: string; label?: string };

// ── Custom node components ────────────────────────────────────────────────

function DefaultNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--default">
      <span>{data.label}</span>
    </div>
  );
}

function StartNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--start"><span>{data.label || 'Início'}</span></div>;
}

function EndNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--end"><span>{data.label || 'Fim'}</span></div>;
}

function DecisionNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--decision">
      <div className="rf-node-diamond"><span>{data.label}</span></div>
    </div>
  );
}

function ProcessNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--process"><span>{data.label}</span></div>;
}

function TriggerNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--trigger"><span>{data.label}</span></div>;
}

function DelayNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--delay">⏱ <span>{data.label}</span></div>;
}

function ParallelNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--parallel"><div className="rf-parallel-bar" /><span>{data.label}</span></div>;
}

function CheckpointNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--checkpoint">✓ <span>{data.label}</span></div>;
}

function WarningNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--warning">⚠ <span>{data.label}</span></div>;
}

function PersonNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--person">
      <div className="rf-person-avatar">{data.label[0]?.toUpperCase()}</div>
      <span>{data.label}</span>
    </div>
  );
}

function SystemNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--system"><span>{data.label}</span></div>;
}

function GroupNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--group"><span className="rf-group-label">{data.label}</span></div>;
}

function DatabaseNode({ data }: { data: { label: string } }) {
  return (
    <div className="rf-node rf-node--database">
      <svg viewBox="0 0 40 30" width="40" height="30">
        <ellipse cx="20" cy="6" rx="18" ry="5" fill="currentColor" opacity="0.3"/>
        <rect x="2" y="6" width="36" height="18" fill="currentColor" opacity="0.1"/>
        <ellipse cx="20" cy="24" rx="18" ry="5" fill="currentColor" opacity="0.3"/>
      </svg>
      <span>{data.label}</span>
    </div>
  );
}

function MetricNode({ data }: { data: { label: string; value?: string } }) {
  return (
    <div className="rf-node rf-node--metric">
      {data.value && <div className="rf-metric-value">{data.value}</div>}
      <span>{data.label}</span>
    </div>
  );
}

function AnnotationNode({ data }: { data: { label: string } }) {
  return <div className="rf-node rf-node--annotation"><span>{data.label}</span></div>;
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

type DiagramCanvasProps = {
  initialData?: DiagramData;
  onSave: (data: DiagramData) => void;
  onGenerate: () => void;
  onDelete: () => void;
  isGenerating: boolean;
  noteTextLength: number;
};

// ── Main Component ────────────────────────────────────────────────────────

export function DiagramCanvas({
  initialData,
  onSave,
  onGenerate,
  onDelete,
  isGenerating,
  noteTextLength,
}: DiagramCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges ?? []);
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rfInstance = useRef<any>(null);
  const saveTimer = useRef<{ id: ReturnType<typeof setTimeout> | null }>({ id: null });

  const triggerSave = useCallback(() => {
    if (saveTimer.current.id) clearTimeout(saveTimer.current.id);
    saveTimer.current.id = setTimeout(() => {
      if (!rfInstance.current) return;
      const flow = rfInstance.current.toObject();
      onSave(flow as DiagramData);
    }, 1500);
  }, [onSave]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
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
      <div className="diagram-toolbar">
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
      </div>

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
            <button className="diagram-delete-btn" onClick={() => { onDelete(); setShowDeleteConfirm(false); }}>Limpar</button>
          </div>
        </div>
      )}

      {/* React Flow */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => { onNodesChange(changes); triggerSave(); }}
        onEdgesChange={(changes) => { onEdgesChange(changes); triggerSave(); }}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onInit={(inst) => { rfInstance.current = inst as unknown; }}
        defaultViewport={initialData?.viewport ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!initialData}
        colorMode="dark"
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.06)" />
      </ReactFlow>
    </div>
  );
}
