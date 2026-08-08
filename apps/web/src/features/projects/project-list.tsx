import { AlertTriangle, ChevronRight, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { getEngineDefinition } from './engine-registry';
import { Button } from '../../components/ui';
import type { ProjectExecutionListItem, ProjectOperationalState } from './types';

export type ProjectListFilters = {
  search: string;
  workspaceId: string;
  state: 'active' | 'attention' | 'paused' | 'completed' | 'all';
};

function matchesState(state: ProjectOperationalState, filter: ProjectListFilters['state']) {
  if (filter === 'all') return true;
  if (filter === 'attention') return state === 'blocked' || state === 'at_risk' || state === 'stalled';
  if (filter === 'paused') return state === 'paused';
  if (filter === 'completed') return state === 'completed' || state === 'archived';
  return state === 'moving' || state === 'blocked' || state === 'at_risk' || state === 'stalled';
}

function operationalLabel(state: ProjectOperationalState) {
  if (state === 'blocked') return 'Bloqueado';
  if (state === 'at_risk') return 'Em risco';
  if (state === 'stalled') return 'Parado';
  if (state === 'paused') return 'Pausado';
  if (state === 'completed') return 'Concluído';
  if (state === 'archived') return 'Arquivado';
  return 'Em movimento';
}

export function ProjectList({
  projects,
  filters,
  onFiltersChange,
  onNewProject
}: {
  projects: ProjectExecutionListItem[];
  filters: ProjectListFilters;
  onFiltersChange: (filters: ProjectListFilters) => void;
  onNewProject: () => void;
}) {
  const workspaces = new Map<string, { id: string; name: string }>();
  projects.forEach((project) => workspaces.set(project.workspace.id, project.workspace));

  const visibleProjects = projects.filter((project) => {
    const query = filters.search.trim().toLocaleLowerCase('pt-BR');
    const textMatch = !query || `${project.title} ${project.objective ?? ''} ${project.activeMove?.text ?? ''}`.toLocaleLowerCase('pt-BR').includes(query);
    return textMatch
      && (!filters.workspaceId || project.workspace.id === filters.workspaceId)
      && matchesState(project.operationalState, filters.state);
  });

  const groups = new Map<string, { workspace: ProjectExecutionListItem['workspace']; projects: ProjectExecutionListItem[] }>();
  visibleProjects.forEach((project) => {
    const existing = groups.get(project.workspace.id);
    if (existing) existing.projects.push(project);
    else groups.set(project.workspace.id, { workspace: project.workspace, projects: [project] });
  });

  return (
    <section className="project-list" aria-label="Lista de Projetos">
      <div className="project-list__filters">
        <label className="project-search"><Search size={15} /><span className="sr-only">Buscar Projetos</span><input value={filters.search} onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })} placeholder="Buscar Projeto ou movimento" /></label>
        <label><span className="sr-only">Filtrar por Frente</span><select value={filters.workspaceId} onChange={(event) => onFiltersChange({ ...filters, workspaceId: event.target.value })}><option value="">Todas as Frentes</option>{[...workspaces.values()].map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
        <label><span className="sr-only">Estado dos Projetos</span><select aria-label="Estado dos Projetos" value={filters.state} onChange={(event) => onFiltersChange({ ...filters, state: event.target.value as ProjectListFilters['state'] })}><option value="active">Ativos</option><option value="attention">Pedem atenção</option><option value="paused">Pausados</option><option value="completed">Concluídos</option><option value="all">Todos</option></select></label>
      </div>

      {[...groups.values()].map(({ workspace, projects: groupProjects }) => (
        <section key={workspace.id} className="project-list-group" aria-labelledby={`project-group-${workspace.id}`}>
          <header><span className="project-list-group__marker" style={{ backgroundColor: workspace.color ?? '#777' }} /><h2 id={`project-group-${workspace.id}`}>{workspace.name}</h2><small>{groupProjects.length}</small></header>
          <div>
            {groupProjects.map((project) => {
              const definition = getEngineDefinition(project.engine.methodology);
              const Icon = definition.icon;
              const movement = project.activeMove ?? project.recommendation;
              return (
                <Link key={project.id} to={`/projetos/${project.id}`} className="project-list-row">
                  <span className="project-list-row__icon"><Icon size={18} strokeWidth={1.8} /></span>
                  <span className="project-list-row__identity"><strong>{project.title}</strong><small>{project.intentLabel} · {project.methodLabel}</small></span>
                  <span className="project-list-row__movement">{project.recommendation && !project.activeMove && <AlertTriangle size={13} />}<span>{movement?.text ?? 'Defina o próximo movimento'}</span></span>
                  <span className="project-list-row__progress">{project.progress.kind === 'percent' && <i><b style={{ width: `${project.progress.value}%` }} /></i>}<small>{project.progress.label}</small></span>
                  <span className={`project-list-row__state state-${project.operationalState}`}>{operationalLabel(project.operationalState)}</span>
                  <ChevronRight size={16} />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {!visibleProjects.length && (
        <div className="project-list-empty">
          <span>SEM PROJETOS NESTA VISÃO</span>
          <h2>Nenhum Projeto corresponde aos filtros.</h2>
          <p>Um Projeto nasce com uma direção e um primeiro movimento — nada além disso é obrigatório.</p>
          <Button type="button" variant="secondary" leadingIcon={<Plus />} onClick={onNewProject}>Novo Projeto</Button>
        </div>
      )}
    </section>
  );
}
