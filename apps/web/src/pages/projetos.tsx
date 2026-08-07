import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { api, type Workspace } from '../api';
import { ProjectList, type ProjectListFilters } from '../features/projects/project-list';
import { ProjectShell } from '../features/projects/project-shell';
import type { ProjectCockpit, ProjectExecutionListItem } from '../features/projects/types';
import { ProjectWizard } from '../features/projects/project-wizard';

function ProjectsExecutionPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectExecutionListItem[]>([]);
  const [cockpit, setCockpit] = useState<ProjectCockpit | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [filters, setFilters] = useState<ProjectListFilters>({
    search: '',
    workspaceId: searchParams.get('workspaceId') ?? '',
    state: 'active'
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(searchParams.get('new') === 'true');
  const [reloadKey, setReloadKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const loadCockpit = useCallback(async () => {
    if (!projectId) return;
    try {
      setError('');
      setCockpit(await api.getProjectCockpit(projectId));
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }, [projectId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(filters.search), 250);
    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  useEffect(() => {
    if (projectId) return;
    let active = true;
    setReady(false);
    setError('');
    Promise.all([
      api.getProjectExecutionList({
        workspaceId: filters.workspaceId || undefined,
        search: debouncedSearch || undefined
      }),
      api.getWorkspaces()
    ])
      .then(([projectRows, workspaceRows]) => {
        if (!active) return;
        setProjects(projectRows);
        setWorkspaces(workspaceRows.filter((workspace) => workspace.type !== 'geral'));
      })
      .catch((requestError) => {
        if (!active) return;
        setError((requestError as Error).message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, filters.workspaceId, projectId, reloadKey]);

  useEffect(() => {
    if (!projectId) return;
    setReady(false);
    void loadCockpit();
  }, [loadCockpit, projectId]);

  function changeFilters(next: ProjectListFilters) {
    setFilters(next);
    const params = new URLSearchParams(searchParams);
    if (next.workspaceId) params.set('workspaceId', next.workspaceId);
    else params.delete('workspaceId');
    params.delete('new');
    setSearchParams(params, { replace: true });
  }

  function openWizard() {
    setWizardOpen(true);
    const params = new URLSearchParams(searchParams);
    params.set('new', 'true');
    setSearchParams(params, { replace: true });
  }

  function closeWizard() {
    setWizardOpen(false);
    const params = new URLSearchParams(searchParams);
    params.delete('new');
    setSearchParams(params, { replace: true });
  }

  if (projectId) {
    if (!ready) {
      return <div className="projects-list-loading project-detail-loading"><span /><span /><span /></div>;
    }
    if (error) {
      return <div className="projects-list-error project-detail-error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadCockpit()}>Tentar novamente</button></div>;
    }
    return cockpit ? <ProjectShell project={cockpit} onReload={() => void loadCockpit()} /> : null;
  }

  return (
    <section className="projects-execution-page">
      <header className="projects-execution-page__header">
        <div><span>EXECUÇÃO ADAPTATIVA</span><h1>Projetos</h1><p>Direção, movimento e método — numa única leitura.</p></div>
        <button type="button" onClick={openWizard}>Novo Projeto</button>
      </header>

      {!ready ? (
        <div className="projects-list-loading"><span /><span /><span /></div>
      ) : error ? (
        <div className="projects-list-error" role="alert"><p>{error}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Tentar novamente</button></div>
      ) : (
        <ProjectList projects={projects} filters={filters} onFiltersChange={changeFilters} onNewProject={openWizard} />
      )}

      <ProjectWizard open={wizardOpen} workspaces={workspaces} onClose={closeWizard} />
    </section>
  );
}

export function ProjetosPage() {
  return <ProjectsExecutionPage />;
}
