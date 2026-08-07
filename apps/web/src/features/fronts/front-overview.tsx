import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  MoreHorizontal,
  Pause,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, type Workspace, type WorkspaceMode, type WorkspaceType } from '../../api';
import type {
  FrontOverview as FrontOverviewModel,
  FrontOverviewListItem,
  Responsibility
} from '../projects/types';
import { FrontRail } from './front-rail';
import { ResponsibilityEditorPanel, type ResponsibilityDraft } from './responsibility-editor-panel';
import { ResponsibilityReviewPanel } from './responsibility-review-panel';
import './fronts.css';

function modeLabel(mode?: WorkspaceMode) {
  if (mode === 'expansao') return 'Expansão';
  if (mode === 'standby') return 'Standby';
  return 'Manutenção';
}

function stateLabel(state: string) {
  if (state === 'blocked') return 'Bloqueado';
  if (state === 'at_risk') return 'Em risco';
  if (state === 'stalled') return 'Parado';
  if (state === 'paused') return 'Pausado';
  return 'Em movimento';
}

export function FrontOverview({
  front,
  onReview,
  onNewResponsibility,
  onEditResponsibility,
  onPauseResponsibility,
  onArchiveResponsibility,
  onEditFront
}: {
  front: FrontOverviewModel;
  onReview: (responsibility: Responsibility) => void;
  onNewResponsibility: () => void;
  onEditResponsibility: (responsibility: Responsibility) => void;
  onPauseResponsibility: (responsibility: Responsibility) => void;
  onArchiveResponsibility: (responsibility: Responsibility) => void;
  onEditFront: () => void;
}) {
  const attentionResponsibility = front.attention?.kind === 'responsibility'
    ? front.responsibilities.find((item) => item.id === front.attention?.sourceId) ?? null
    : null;

  return (
    <section className="front-overview" aria-labelledby="front-title">
      <Link className="front-overview__mobile-back" to="/frentes"><ArrowLeft size={16} /> Todas as Frentes</Link>
      <header className="front-overview__header">
        <div>
          <span className="front-eyebrow">FRENTE · {modeLabel(front.mode).toUpperCase()}</span>
          <h1 id="front-title">{front.name}</h1>
        </div>
        <button type="button" className="front-icon-button" aria-label={`Editar ${front.name}`} onClick={onEditFront}><MoreHorizontal size={18} /></button>
      </header>

      {front.attention && (
        <section className={`front-attention front-attention--${front.attention.severity}`}>
          <AlertTriangle size={18} />
          <div><span>Pede sua atenção</span><strong>{front.attention.title}</strong><p>{front.attention.reason}</p></div>
          {attentionResponsibility ? <button type="button" onClick={() => onReview(attentionResponsibility)}>Abrir cuidado <ChevronRight size={15} /></button> : <Link to={`/projetos/${front.attention.sourceId}`}>Abrir Projeto <ChevronRight size={15} /></Link>}
        </section>
      )}

      <section className="front-section" aria-labelledby="front-projects-title">
        <header><div><span>PROJETOS</span><h2 id="front-projects-title">O que está avançando</h2></div><Link to={`/projetos?workspaceId=${front.id}`}>Ver todos</Link></header>
        <div className="front-project-list">
          {front.projects.map((project) => (
            <Link key={project.id} to={`/projetos/${project.id}`} className="front-project-row">
              <span className={`front-project-state state-${project.operationalState}`} />
              <span className="front-project-row__main"><strong>{project.title}</strong><small>{project.activeMove?.text ?? project.recommendation?.text ?? project.objective ?? 'Defina o próximo movimento'}</small></span>
              <span className="front-project-row__progress">{project.progress.label}</span>
              <span className={`front-project-row__status state-${project.operationalState}`}>{stateLabel(project.operationalState)}</span>
              <ChevronRight size={16} />
            </Link>
          ))}
          {!front.projects.length && <div className="front-empty-line"><p>Nenhum Projeto ativo nesta Frente.</p><Link to={`/projetos?workspaceId=${front.id}&new=true`}>Criar Projeto</Link></div>}
        </div>
      </section>

      <section className="front-section" aria-labelledby="front-responsibilities-title">
        <header><div><span>RESPONSABILIDADES</span><h2 id="front-responsibilities-title">O que precisa permanecer bem</h2></div><button type="button" onClick={onNewResponsibility}><Plus size={15} /> Nova responsabilidade</button></header>
        <div className="front-responsibility-list">
          {front.responsibilities.filter((item) => item.status !== 'archived').map((responsibility) => (
            <article key={responsibility.id} className="front-responsibility-row">
              <span className={`front-responsibility-health health-${responsibility.health}`} />
              <div><strong>{responsibility.title}</strong><small>{responsibility.expectedStandard}</small><p>{`Próximo cuidado · ${responsibility.nextCare}`}</p></div>
              <time dateTime={responsibility.nextReviewAt}>{new Date(responsibility.nextReviewAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</time>
              <button type="button" className="front-care-button" onClick={() => onReview(responsibility)}>Cuidar agora</button>
              <details className="front-row-menu"><summary aria-label={`Opções de ${responsibility.title}`}><MoreHorizontal size={16} /></summary><div role="menu"><button type="button" onClick={() => onEditResponsibility(responsibility)}><Pencil size={14} /> Editar</button><button type="button" onClick={() => onPauseResponsibility(responsibility)}>{responsibility.status === 'paused' ? <RotateCcw size={14} /> : <Pause size={14} />}{responsibility.status === 'paused' ? 'Retomar' : 'Pausar'}</button><button type="button" onClick={() => onArchiveResponsibility(responsibility)}><Trash2 size={14} /> Arquivar</button></div></details>
            </article>
          ))}
          {!front.responsibilities.length && <div className="front-empty-line"><p>Use Responsabilidades para áreas contínuas, sem linha de chegada.</p><button type="button" onClick={onNewResponsibility}>Criar a primeira</button></div>}
        </div>
      </section>

      <footer className="front-capacity"><CircleGauge size={15} /><span>{front.capacity.activeProjects} {front.capacity.activeProjects === 1 ? 'Projeto ativo' : 'Projetos ativos'} · {front.capacity.todayTasks} {front.capacity.todayTasks === 1 ? 'tarefa' : 'tarefas'} em Hoje</span></footer>

      {!!front.pausedProjects.length && <details className="front-paused"><summary><ChevronDown size={15} /> Pausados · {front.pausedProjects.length}</summary><div>{front.pausedProjects.map((project) => <Link key={project.id} to={`/projetos/${project.id}`}>{project.title}<ChevronRight size={15} /></Link>)}</div></details>}
    </section>
  );
}

type FrontDraft = { name: string; type: Exclude<WorkspaceType, 'geral'>; mode: WorkspaceMode; color: string };

function FrontEditor({ open, workspace, busy, onClose, onSave, onDelete }: { open: boolean; workspace?: Workspace | null; busy: boolean; onClose: () => void; onSave: (draft: FrontDraft) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [draft, setDraft] = useState<FrontDraft>({ name: '', type: 'empresa', mode: 'manutencao', color: '#f97316' });
  useEffect(() => { if (open) setDraft(workspace ? { name: workspace.name, type: workspace.type === 'geral' ? 'empresa' : workspace.type, mode: workspace.mode ?? 'manutencao', color: workspace.color ?? '#f97316' } : { name: '', type: 'empresa', mode: 'manutencao', color: '#f97316' }); }, [open, workspace]);
  if (!open) return null;
  return <div className="front-panel-backdrop" role="presentation"><form className="front-panel front-editor" role="dialog" aria-label={workspace ? 'Editar Frente' : 'Nova Frente'} onSubmit={(event: FormEvent) => { event.preventDefault(); void onSave(draft); }}><header><div><small>FRENTE</small><h2>{workspace ? 'Editar Frente' : 'Nova Frente'}</h2></div><button type="button" aria-label="Fechar" onClick={onClose}><X size={18} /></button></header><div className="front-panel__body"><label><span>Nome</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><div className="front-panel__split"><label><span>Tipo</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as FrontDraft['type'] })}><option value="empresa">Empresa</option><option value="pessoal">Pessoal</option><option value="vida">Vida</option><option value="autoridade">Autoridade</option><option value="outro">Outro</option></select></label><label><span>Modo</span><select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as WorkspaceMode })}><option value="expansao">Expansão</option><option value="manutencao">Manutenção</option><option value="standby">Standby</option></select></label></div><label><span>Cor</span><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label></div><footer>{workspace && onDelete ? <button type="button" className="front-danger-button" onClick={() => void onDelete()} disabled={busy}>Excluir</button> : <span />}<span><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar Frente'}</button></span></footer></form></div>;
}

export function FrontsExecutionPage() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const [fronts, setFronts] = useState<FrontOverviewListItem[]>([]);
  const [selectedId, setSelectedId] = useState(workspaceId ?? '');
  const [front, setFront] = useState<FrontOverviewModel | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<Responsibility | null>(null);
  const [editingResponsibility, setEditingResponsibility] = useState<Responsibility | null | undefined>(undefined);
  const [frontEditorOpen, setFrontEditorOpen] = useState(false);
  const [workspaceRecord, setWorkspaceRecord] = useState<Workspace | null>(null);

  const loadFront = useCallback(async (id: string) => {
    try { setError(''); setFront(await api.getFrontOverview(id)); } catch (requestError) { setError((requestError as Error).message); }
  }, []);

  const loadRail = useCallback(async () => {
    try {
      setError('');
      const items = await api.getFrontsOverview();
      setFronts(items);
      const persisted = localStorage.getItem('operis:last-front-id');
      const candidate = workspaceId && items.some((item) => item.id === workspaceId)
        ? workspaceId
        : persisted && items.some((item) => item.id === persisted)
          ? persisted
          : items.find((item) => item.attention)?.id ?? items[0]?.id ?? '';
      setSelectedId(candidate);
      if (candidate) {
        localStorage.setItem('operis:last-front-id', candidate);
        const mobile = window.matchMedia?.('(max-width: 720px)').matches ?? false;
        if (!workspaceId && !mobile) navigate(`/frentes/${candidate}`, { replace: true });
        await loadFront(candidate);
      }
    } catch (requestError) { setError((requestError as Error).message); } finally { setReady(true); }
  }, [loadFront, navigate, workspaceId]);

  useEffect(() => { void loadRail(); }, [loadRail]);
  useEffect(() => { if (workspaceId && workspaceId !== selectedId) { setSelectedId(workspaceId); localStorage.setItem('operis:last-front-id', workspaceId); void loadFront(workspaceId); } }, [loadFront, selectedId, workspaceId]);

  async function refresh() { await Promise.all([loadRail(), selectedId ? loadFront(selectedId) : Promise.resolve()]); }

  async function saveResponsibility(draft: ResponsibilityDraft) {
    if (!selectedId) return;
    setBusy(true);
    try {
      if (editingResponsibility) await api.updateResponsibility(editingResponsibility.id, draft);
      else await api.createResponsibility(selectedId, draft);
      setEditingResponsibility(undefined);
      await refresh();
    } finally { setBusy(false); }
  }

  async function openFrontEditor() {
    if (front) {
      const workspaces = await api.getWorkspaces();
      setWorkspaceRecord(workspaces.find((item) => item.id === front.id) ?? { id: front.id, name: front.name, type: front.type, mode: front.mode, color: front.color });
    } else setWorkspaceRecord(null);
    setFrontEditorOpen(true);
  }

  return (
    <div className={`fronts-execution ${workspaceId ? 'has-route-selection' : ''}`}>
      <FrontRail fronts={fronts} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); localStorage.setItem('operis:last-front-id', id); }} onCreate={() => { setWorkspaceRecord(null); setFrontEditorOpen(true); }} />
      <main className="fronts-execution__detail">
        {!ready ? <div className="front-loading"><span /><span /><span /></div> : error ? <div className="front-error" role="alert"><p>{error}</p><button type="button" onClick={() => void refresh()}>Tentar novamente</button></div> : front ? <FrontOverview front={front} onReview={setReviewing} onNewResponsibility={() => setEditingResponsibility(null)} onEditResponsibility={setEditingResponsibility} onPauseResponsibility={async (item) => { await api.pauseResponsibility(item.id, item.status !== 'paused'); await refresh(); }} onArchiveResponsibility={async (item) => { await api.archiveResponsibility(item.id); await refresh(); }} onEditFront={() => void openFrontEditor()} /> : <div className="front-no-selection"><h1>Frentes</h1><p>Escolha ou crie uma Frente para começar.</p></div>}
      </main>
      <ResponsibilityEditorPanel open={editingResponsibility !== undefined} responsibility={editingResponsibility} busy={busy} onClose={() => setEditingResponsibility(undefined)} onSave={saveResponsibility} />
      <ResponsibilityReviewPanel responsibility={reviewing} busy={busy} onClose={() => setReviewing(null)} onSave={async (input) => { if (!reviewing) return; setBusy(true); try { await api.reviewResponsibility(reviewing.id, input); setReviewing(null); await refresh(); } finally { setBusy(false); } }} />
      <FrontEditor open={frontEditorOpen} workspace={workspaceRecord} busy={busy} onClose={() => setFrontEditorOpen(false)} onSave={async (draft) => { setBusy(true); try { const saved = workspaceRecord ? await api.updateWorkspace(workspaceRecord.id, draft) : await api.createWorkspace(draft); setFrontEditorOpen(false); navigate(`/frentes/${saved.id}`); await refresh(); } finally { setBusy(false); } }} onDelete={workspaceRecord ? async () => { setBusy(true); try { await api.deleteWorkspace(workspaceRecord.id); setFrontEditorOpen(false); navigate('/frentes'); await refresh(); } finally { setBusy(false); } } : undefined} />
    </div>
  );
}
