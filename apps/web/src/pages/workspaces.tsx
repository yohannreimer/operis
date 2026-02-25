import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api, Project, Task, Workspace } from '../api';
import { Modal } from '../components/modal';
import { useShellContext } from '../components/shell-context';

function workspaceTypeLabel(type: Workspace['type']) {
  if (type === 'empresa') {
    return 'Empresa';
  }

  if (type === 'pessoal') {
    return 'Pessoal';
  }

  return 'Geral';
}

export function WorkspacesPage() {
  const {
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaces: sharedWorkspaces,
    refreshGlobal
  } = useShellContext();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'empresa' | 'pessoal'>('empresa');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== 'geral'),
    [workspaces]
  );

  async function load() {
    try {
      const [workspaceData, taskData, projectData] = await Promise.all([
        api.getWorkspaces(),
        api.getTasks(),
        api.getProjects()
      ]);

      setWorkspaces(workspaceData);
      setTasks(taskData);
      setProjects(projectData);

      const selectableWorkspaceIds = new Set(
        workspaceData.filter((workspace) => workspace.type !== 'geral').map((workspace) => workspace.id)
      );

      if (selectedWorkspaceId !== 'all' && !selectableWorkspaceIds.has(selectedWorkspaceId)) {
        setSelectedWorkspaceId('all');
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [sharedWorkspaces.length]);

  useEffect(() => {
    if (activeWorkspaceId === 'all') {
      setSelectedWorkspaceId('all');
      return;
    }

    const existsInVisibleList = visibleWorkspaces.some((workspace) => workspace.id === activeWorkspaceId);
    setSelectedWorkspaceId(existsInVisibleList ? activeWorkspaceId : 'all');
  }, [activeWorkspaceId, visibleWorkspaces]);

  const scopedTasks = useMemo(() => {
    if (selectedWorkspaceId === 'all') {
      return tasks;
    }

    return tasks.filter((task) => task.workspaceId === selectedWorkspaceId);
  }, [tasks, selectedWorkspaceId]);

  const scopedProjects = useMemo(() => {
    if (selectedWorkspaceId === 'all') {
      return projects;
    }

    return projects.filter((project) => project.workspaceId === selectedWorkspaceId);
  }, [projects, selectedWorkspaceId]);

  const selectedWorkspace =
    selectedWorkspaceId === 'all'
      ? null
      : visibleWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();

    try {
      setBusy(true);
      await api.createWorkspace({
        name: newName,
        type: newType
      });
      setNewName('');
      setNewType('empresa');
      setCreateOpen(false);
      await Promise.all([load(), refreshGlobal()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function selectWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);
    setActiveWorkspaceId(workspaceId);
  }

  return (
    <section className="page-stack">
      <header className="page-header-premium">
        <div>
          <p className="eyebrow">Workspaces</p>
          <h3>Visualização por empresa com contexto claro</h3>
          <p>Entre em cada workspace para ver somente tarefas e projetos daquele ambiente.</p>
        </div>

        <div className="header-actions">
          <button type="button" onClick={() => setCreateOpen(true)}>
            + Novo workspace
          </button>
        </div>
      </header>

      {error && <p className="surface-error">{error}</p>}

      <section className="surface-card">
        <div className="workspace-tabs">
          <button
            type="button"
            className={selectedWorkspaceId === 'all' ? 'workspace-tab active' : 'workspace-tab'}
            onClick={() => selectWorkspace('all')}
          >
            Todos
          </button>

          {visibleWorkspaces.map((workspace) => (
            <button
              type="button"
              key={workspace.id}
              className={selectedWorkspaceId === workspace.id ? 'workspace-tab active' : 'workspace-tab'}
              onClick={() => selectWorkspace(workspace.id)}
            >
              {workspace.name}
            </button>
          ))}
        </div>
      </section>

      <section className="two-col-grid">
        <article className="surface-card">
          <div className="section-title">
            <h4>{selectedWorkspace ? selectedWorkspace.name : 'Visão geral'}</h4>
            <small>{selectedWorkspace ? workspaceTypeLabel(selectedWorkspace.type) : 'Todos os contextos'}</small>
          </div>

          <section className="metric-grid compact">
            <article className="metric-card">
              <span>Tarefas hoje</span>
              <strong>{scopedTasks.filter((task) => task.status === 'hoje').length}</strong>
            </article>
            <article className="metric-card">
              <span>Backlog</span>
              <strong>{scopedTasks.filter((task) => task.status === 'backlog').length}</strong>
            </article>
            <article className="metric-card">
              <span>Projetos</span>
              <strong>{scopedProjects.length}</strong>
            </article>
            <article className="metric-card">
              <span>Feitas</span>
              <strong>{scopedTasks.filter((task) => task.status === 'feito').length}</strong>
            </article>
          </section>
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>Projetos no contexto</h4>
            <small>{scopedProjects.length}</small>
          </div>

          {scopedProjects.length === 0 ? (
            <p className="empty-state">Nenhum projeto nesse workspace.</p>
          ) : (
            <ul className="task-list">
              {scopedProjects.map((project) => (
                <li key={project.id}>
                  <div>
                    <strong>{project.title}</strong>
                    <small>{project.description || 'Sem descrição'}</small>
                  </div>
                  <span className="status-tag andamento">{project.status ?? 'ativo'}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="surface-card">
        <div className="section-title">
          <h4>Tarefas do contexto</h4>
          <small>{scopedTasks.length}</small>
        </div>

        {scopedTasks.length === 0 ? (
          <p className="empty-state">Nenhuma tarefa cadastrada neste contexto.</p>
        ) : (
          <ul className="task-list">
            {scopedTasks.slice(0, 30).map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    prioridade {task.priority} • horizonte {task.horizon ?? 'active'}
                  </small>
                </div>
                <span className={`status-tag ${task.status}`}>{task.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo workspace">
        <form onSubmit={createWorkspace} className="modal-form">
          <label>
            Nome
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Ex: Empresa C"
              required
            />
          </label>

          <label>
            Tipo
            <select value={newType} onChange={(event) => setNewType(event.target.value as 'empresa' | 'pessoal')}>
              <option value="empresa">Empresa</option>
              <option value="pessoal">Pessoal</option>
            </select>
          </label>

          <div className="modal-actions">
            <button type="button" className="text-button" onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={busy}>
              Criar workspace
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
