import { Component, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronRight,
  ListChecks,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Wrench
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../../api';
import * as registry from './engine-registry';
import { ProjectTasksPanel } from './project-tasks-panel';
import type { ProjectCockpit, ProjectRecommendation } from './types';

class EngineErrorBoundary extends Component<{
  projectId: string;
  onReset: () => void;
  children: ReactNode;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  componentDidUpdate(previous: Readonly<{ projectId: string }>) {
    if (previous.projectId !== this.props.projectId && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="project-engine-error"><Wrench size={22} /><h2>Não foi possível abrir este motor.</h2><p>O restante do Projeto continua disponível. Tente renderizar o método novamente.</p><button type="button" onClick={() => { this.setState({ failed: false }); this.props.onReset(); }}><RefreshCw size={15} /> Tentar novamente</button></section>;
  }
}

function actionKey(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export function ProjectShell({ project, onReload }: { project: ProjectCockpit; onReload: () => void }) {
  const navigate = useNavigate();
  const tasksButtonRef = useRef<HTMLButtonElement>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const definition = registry.getEngineDefinition(project.engine.methodology);
  const EngineView = definition.View;
  const movement = project.activeMove;
  const recommendation = movement ? null : project.recommendation;

  async function run(label: string, operation: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try { await operation(); onReload(); }
    catch (requestError) { setError((requestError as Error).message); }
    finally { setBusy(''); }
  }

  async function adopt(recommendation: ProjectRecommendation) {
    await run('adopt', () => api.createProjectNextMove(project.id, {
      text: recommendation.text,
      source: 'recommendation',
      reason: recommendation.reason,
      ruleKey: recommendation.ruleKey
    }));
  }

  async function recommendationToToday(recommendation: ProjectRecommendation) {
    await run('today', async () => {
      const move = await api.createProjectNextMove(project.id, {
        text: recommendation.text,
        source: 'recommendation',
        reason: recommendation.reason,
        ruleKey: recommendation.ruleKey
      });
      return api.sendProjectMoveToToday(project.id, move.id, actionKey('recommendation-today'));
    });
  }

  async function recommendationToTask(recommendation: ProjectRecommendation) {
    await run('task', () => api.createTask({
      workspaceId: project.workspace.id,
      projectId: project.id,
      title: recommendation.text,
      description: recommendation.reason,
      definitionOfDone: `Concluir: ${recommendation.text}`,
      taskType: 'b', energyLevel: 'media', executionKind: 'operacao', priority: 3, estimatedMinutes: 30
    }));
  }

  return (
    <article className="project-shell">
      <header className="project-shell__header">
        <Link to="/projetos" className="project-shell__back"><ArrowLeft size={15} /> Projetos</Link>
        <div className="project-shell__title-row">
          <div><span className="project-shell__eyebrow"><Link to={`/frentes/${project.workspace.id}`}>{project.workspace.name}</Link> · {project.intentLabel} · {project.methodLabel}</span><h1>{project.title}</h1><p>{project.objective}</p></div>
          <div className="project-shell__header-actions">
            <button ref={tasksButtonRef} type="button" onClick={() => setTasksOpen(true)}><ListChecks size={16} /> Tarefas · {project.tasks.length}</button>
            <details><summary aria-label="Opções do Projeto"><MoreHorizontal size={18} /></summary><div role="menu">
              <button type="button" onClick={() => { const objective = window.prompt('Direção do Projeto', project.objective ?? ''); if (objective !== null) void run('edit', () => api.updateProject(project.id, { objective })); }}>Editar direção</button>
              <button type="button" onClick={() => void run('pause', () => api.updateProject(project.id, { status: project.persistedStatus === 'pausado' ? 'ativo' : 'pausado' }))}>{project.persistedStatus === 'pausado' ? 'Retomar' : 'Pausar'}</button>
              <button type="button" onClick={() => void run('complete', () => api.updateProject(project.id, { status: 'concluido' }))}>Concluir</button>
              <button type="button" onClick={() => void run('archive', () => api.updateProject(project.id, { status: 'arquivado' }))}>Arquivar</button>
              <button type="button" className="danger" onClick={() => { if (window.confirm(`Excluir ${project.title}?`)) void run('delete', async () => { await api.deleteProject(project.id); navigate('/projetos'); }); }}>Excluir</button>
            </div></details>
          </div>
        </div>
      </header>

      <section className={`project-movement ${recommendation ? `severity-${recommendation.severity}` : ''}`}>
        <div className="project-movement__label">{movement ? 'PRÓXIMO MOVIMENTO' : 'MOVIMENTO RECOMENDADO'}</div>
        <div className="project-movement__content">
          {recommendation && <AlertTriangle size={18} />}
          <div><strong>{movement?.text ?? recommendation?.text ?? 'Defina o próximo movimento'}</strong>{(movement?.reason ?? recommendation?.reason) && <p>{movement?.reason ?? recommendation?.reason}</p>}</div>
          <div className="project-movement__actions">
            {movement ? <><button type="button" disabled={Boolean(busy)} onClick={() => void run('today', () => api.sendProjectMoveToToday(project.id, movement.id, actionKey('move-today')))}><CalendarPlus size={15} /> Mandar para Hoje</button><button type="button" disabled={Boolean(busy)} onClick={() => void run('resolve', () => api.resolveProjectNextMove(project.id, movement.id))}><Check size={15} /> Resolvido</button></> : recommendation ? <><button type="button" disabled={Boolean(busy)} onClick={() => void adopt(recommendation)}>Adotar <ChevronRight size={15} /></button><button type="button" disabled={Boolean(busy)} onClick={() => void recommendationToTask(recommendation)}><Plus size={15} /> Criar tarefa</button><button type="button" disabled={Boolean(busy)} onClick={() => void recommendationToToday(recommendation)}><CalendarPlus size={15} /> Mandar para Hoje</button></> : null}
          </div>
        </div>
      </section>

      {error && <p className="project-shell__error" role="alert">{error}</p>}
      {project.engine.recovered && <section className="project-recovery"><div><Wrench size={17} /><span><strong>Dados do motor recuperados</strong><small>O Operis isolou campos inválidos e abriu uma versão segura. Nada foi sobrescrito.</small></span></div><button type="button" onClick={() => void run('repair', () => api.updateProject(project.id, { methodologyData: project.engine.data }))}>Reparar dados do motor</button></section>}

      <section className="project-engine-surface">
        <EngineErrorBoundary projectId={project.id} onReset={onReload}>
          <EngineView project={project} data={project.engine.data} onReload={onReload} />
        </EngineErrorBoundary>
      </section>

      <ProjectTasksPanel project={project} open={tasksOpen} onClose={() => setTasksOpen(false)} onReload={onReload} returnFocusRef={tasksButtonRef} />
    </article>
  );
}
