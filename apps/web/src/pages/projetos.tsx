import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api, Project, Task, TaskHorizon, Workspace } from '../api';
import { Modal } from '../components/modal';
import { useShellContext } from '../components/shell-context';
import { workspaceQuery } from '../utils/workspace';

export function ProjetosPage() {
  const { activeWorkspaceId, refreshGlobal } = useShellContext();
  const scopedWorkspaceId = workspaceQuery(activeWorkspaceId);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [workspaceId, setWorkspaceId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState(3);
  const [newTaskHorizon, setNewTaskHorizon] = useState<TaskHorizon>('active');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(baseWorkspaceId?: string) {
    try {
      const workspaceData = await api.getWorkspaces();
      const selectableWorkspaces = workspaceData.filter((workspace) => workspace.type !== 'geral');
      const selectableIds = new Set(selectableWorkspaces.map((workspace) => workspace.id));

      const preferredWorkspace =
        (baseWorkspaceId && selectableIds.has(baseWorkspaceId)
          ? baseWorkspaceId
          : scopedWorkspaceId && selectableIds.has(scopedWorkspaceId)
            ? scopedWorkspaceId
            : workspaceId && selectableIds.has(workspaceId)
              ? workspaceId
              : undefined) ?? selectableWorkspaces[0]?.id;

      const [projectData, taskData] = await Promise.all([
        api.getProjects(preferredWorkspace ? { workspaceId: preferredWorkspace } : undefined),
        api.getTasks(preferredWorkspace ? { workspaceId: preferredWorkspace } : undefined)
      ]);

      setWorkspaces(selectableWorkspaces);
      setProjects(projectData);
      setTasks(taskData);

      const resolvedWorkspace = preferredWorkspace ?? '';
      setWorkspaceId(resolvedWorkspace);

      if (!selectedProjectId || !projectData.some((project) => project.id === selectedProjectId)) {
        setSelectedProjectId(projectData[0]?.id ?? '');
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }

  useEffect(() => {
    load(scopedWorkspaceId);
  }, [activeWorkspaceId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === selectedProjectId),
    [tasks, selectedProjectId]
  );

  async function createProject(event: FormEvent) {
    event.preventDefault();

    if (!workspaceId) {
      setError('Selecione um workspace antes de criar projeto.');
      return;
    }

    try {
      setBusy(true);
      const created = await api.createProject({
        workspaceId,
        title: newProjectTitle,
        description: newProjectDescription
      });
      setSelectedProjectId(created.id);
      setCreateProjectOpen(false);
      setNewProjectTitle('');
      setNewProjectDescription('');
      await refreshGlobal();
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createProjectTask(event: FormEvent) {
    event.preventDefault();

    if (!workspaceId || !selectedProjectId) {
      setError('Selecione um projeto para adicionar tarefa.');
      return;
    }

    try {
      setBusy(true);
      await api.createTask({
        workspaceId,
        projectId: selectedProjectId,
        title: newTaskTitle,
        priority: newTaskPriority,
        horizon: newTaskHorizon
      });
      setCreateTaskOpen(false);
      setNewTaskTitle('');
      setNewTaskPriority(3);
      setNewTaskHorizon('active');
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function completeTask(taskId: string) {
    try {
      setBusy(true);
      await api.completeTask(taskId);
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header-premium">
        <div>
          <p className="eyebrow">Projetos</p>
          <h3>Gestão de projetos e tarefas internas</h3>
          <p>Selecione workspace, abra um projeto e execute por tarefas vinculadas.</p>
        </div>

        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => setCreateProjectOpen(true)}>
            + Novo projeto
          </button>
          <button type="button" onClick={() => setCreateTaskOpen(true)} disabled={!selectedProjectId}>
            + Nova tarefa
          </button>
        </div>
      </header>

      {error && <p className="surface-error">{error}</p>}

      <section className="surface-card project-toolbar">
        <label>
          Workspace
          <select
            value={workspaceId}
            onChange={(event) => {
              const nextWorkspace = event.target.value;
              setWorkspaceId(nextWorkspace);
              load(nextWorkspace);
            }}
          >
            <option value="">Selecione...</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="project-screen">
        <article className="surface-card">
          <div className="section-title">
            <h4>Projetos do workspace</h4>
            <small>{projects.length}</small>
          </div>

          {projects.length === 0 ? (
            <p className="empty-state">Sem projetos neste workspace.</p>
          ) : (
            <div className="project-list-rail">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={selectedProjectId === project.id ? 'project-rail-item active' : 'project-rail-item'}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <strong>{project.title}</strong>
                  <span>{project.description || 'Sem descrição'}</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>{selectedProject?.title ?? 'Selecione um projeto'}</h4>
            <small>{projectTasks.length} tarefas</small>
          </div>

          {!selectedProject ? (
            <p className="empty-state">Selecione um projeto na lista para ver detalhes.</p>
          ) : (
            <>
              <p className="project-description">{selectedProject.description || 'Sem descrição detalhada.'}</p>

              {projectTasks.length === 0 ? (
                <p className="empty-state">Nenhuma tarefa vinculada a este projeto.</p>
              ) : (
                <ul className="task-list">
                  {projectTasks.map((task) => (
                    <li key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          prioridade {task.priority} • horizonte {task.horizon ?? 'active'}
                        </small>
                      </div>

                      <div className="inline-actions">
                        <span className={`status-tag ${task.status}`}>{task.status}</span>
                        {task.status !== 'feito' && (
                          <button type="button" className="ghost-button" onClick={() => completeTask(task.id)}>
                            Concluir
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </article>
      </section>

      <Modal open={createProjectOpen} onClose={() => setCreateProjectOpen(false)} title="Novo projeto">
        <form onSubmit={createProject} className="modal-form">
          <label>
            Nome
            <input
              value={newProjectTitle}
              onChange={(event) => setNewProjectTitle(event.target.value)}
              placeholder="Ex: Operação Comercial Q2"
              required
            />
          </label>

          <label>
            Descrição
            <textarea
              value={newProjectDescription}
              onChange={(event) => setNewProjectDescription(event.target.value)}
              placeholder="Objetivo, escopo e entregas"
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="text-button" onClick={() => setCreateProjectOpen(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={busy}>
              Criar projeto
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        title="Nova tarefa do projeto"
        subtitle={selectedProject ? selectedProject.title : undefined}
      >
        <form onSubmit={createProjectTask} className="modal-form">
          <label>
            Título
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Ex: validar fluxo comercial"
              required
            />
          </label>

          <div className="row-2">
            <label>
              Prioridade {newTaskPriority}
              <input
                type="range"
                min={1}
                max={5}
                value={newTaskPriority}
                onChange={(event) => setNewTaskPriority(Number(event.target.value))}
              />
            </label>

            <label>
              Horizonte
              <select
                value={newTaskHorizon}
                onChange={(event) => setNewTaskHorizon(event.target.value as TaskHorizon)}
              >
                <option value="active">Ativo</option>
                <option value="future">Futuro</option>
              </select>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="text-button" onClick={() => setCreateTaskOpen(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={busy}>
              Criar tarefa
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
