import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api, InboxItem, Project, Task, TaskHorizon, TaskStatus, WaitingPriority, Workspace } from '../api';
import { useShellContext } from '../components/shell-context';
import { workspaceQuery } from '../utils/workspace';

type TaskView = 'open' | 'done' | 'all';

function priorityLabel(priority: number) {
  if (priority >= 5) {
    return 'Crítica';
  }
  if (priority >= 4) {
    return 'Alta';
  }
  if (priority >= 3) {
    return 'Média';
  }
  return 'Base';
}

function toDateInput(value?: string | null) {
  if (!value) {
    return '';
  }
  return new Date(value).toISOString().slice(0, 10);
}

export function TarefasPage() {
  const { activeWorkspaceId, workspaces: shellWorkspaces } = useShellContext();
  const scopedWorkspaceId = workspaceQuery(activeWorkspaceId);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [search, setSearch] = useState('');
  const [taskView, setTaskView] = useState<TaskView>('open');
  const [horizonFilter, setHorizonFilter] = useState<'all' | TaskHorizon>('all');

  const [selectedTaskId, setSelectedTaskId] = useState('');

  const [createTitle, setCreateTitle] = useState('');
  const [createPriority, setCreatePriority] = useState(3);
  const [createHorizon, setCreateHorizon] = useState<TaskHorizon>('active');
  const [createWorkspaceId, setCreateWorkspaceId] = useState('');
  const [createProjectId, setCreateProjectId] = useState('');

  const [captureText, setCaptureText] = useState('');
  const [processingWorkspaceId, setProcessingWorkspaceId] = useState('');
  const [processingProjectId, setProcessingProjectId] = useState('');
  const [processingHorizon, setProcessingHorizon] = useState<TaskHorizon>('active');

  const [detailTitle, setDetailTitle] = useState('');
  const [detailDescription, setDetailDescription] = useState('');
  const [detailWorkspaceId, setDetailWorkspaceId] = useState('');
  const [detailProjectId, setDetailProjectId] = useState('');
  const [detailStatus, setDetailStatus] = useState<TaskStatus>('backlog');
  const [detailPriority, setDetailPriority] = useState(3);
  const [detailHorizon, setDetailHorizon] = useState<TaskHorizon>('active');
  const [detailEstimatedMinutes, setDetailEstimatedMinutes] = useState('');
  const [detailDueDate, setDetailDueDate] = useState('');
  const [detailWaitingOnPerson, setDetailWaitingOnPerson] = useState('');
  const [detailWaitingPriority, setDetailWaitingPriority] = useState<WaitingPriority>('media');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [taskData, inboxData, workspaceData, projectData] = await Promise.all([
        api.getTasks(scopedWorkspaceId ? { workspaceId: scopedWorkspaceId } : undefined),
        api.getInbox(),
        api.getWorkspaces(),
        api.getProjects()
      ]);

      const visibleWorkspaces = workspaceData.filter((workspace) => workspace.type !== 'geral');
      const visibleWorkspaceIds = new Set(visibleWorkspaces.map((workspace) => workspace.id));

      const resolvedWorkspace =
        scopedWorkspaceId && visibleWorkspaceIds.has(scopedWorkspaceId)
          ? scopedWorkspaceId
          : visibleWorkspaces[0]?.id ?? '';

      setTasks(taskData.filter((task) => task.status !== 'arquivado'));
      setInboxItems(inboxData);
      setWorkspaces(visibleWorkspaces);
      setProjects(projectData.filter((project) => visibleWorkspaceIds.has(project.workspaceId)));

      setCreateWorkspaceId((current) =>
        current && visibleWorkspaceIds.has(current) ? current : resolvedWorkspace
      );
      setProcessingWorkspaceId((current) =>
        current && visibleWorkspaceIds.has(current) ? current : resolvedWorkspace
      );

      const hasSelected = taskData.some((task) => task.id === selectedTaskId && task.status !== 'arquivado');
      if (!hasSelected) {
        const nextSelected =
          taskData.find((task) => task.status !== 'feito' && task.status !== 'arquivado')?.id ??
          taskData.find((task) => task.status !== 'arquivado')?.id ??
          '';
        setSelectedTaskId(nextSelected);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [activeWorkspaceId, shellWorkspaces.length]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (taskView === 'open') {
          return task.status !== 'feito';
        }
        if (taskView === 'done') {
          return task.status === 'feito';
        }
        return true;
      })
      .filter((task) => (horizonFilter === 'all' ? true : (task.horizon ?? 'active') === horizonFilter))
      .filter((task) => {
        if (!search.trim()) {
          return true;
        }
        const normalized = search.toLowerCase();
        return (
          task.title.toLowerCase().includes(normalized) || (task.description ?? '').toLowerCase().includes(normalized)
        );
      })
      .sort((left, right) => {
        if (left.status === 'feito' && right.status !== 'feito') {
          return 1;
        }
        if (left.status !== 'feito' && right.status === 'feito') {
          return -1;
        }
        return right.priority - left.priority;
      });
  }, [tasks, taskView, horizonFilter, search]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    setDetailTitle(selectedTask.title);
    setDetailDescription(selectedTask.description ?? '');
    setDetailWorkspaceId(selectedTask.workspaceId);
    setDetailProjectId(selectedTask.projectId ?? '');
    setDetailStatus(selectedTask.status);
    setDetailPriority(selectedTask.priority);
    setDetailHorizon(selectedTask.horizon ?? 'active');
    setDetailEstimatedMinutes(selectedTask.estimatedMinutes ? String(selectedTask.estimatedMinutes) : '');
    setDetailDueDate(toDateInput(selectedTask.dueDate));
    setDetailWaitingOnPerson(selectedTask.waitingOnPerson ?? '');
    setDetailWaitingPriority(selectedTask.waitingPriority ?? 'media');
  }, [selectedTaskId, selectedTask]);

  const createProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === createWorkspaceId),
    [projects, createWorkspaceId]
  );

  const detailProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === detailWorkspaceId),
    [projects, detailWorkspaceId]
  );

  const processingProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === processingWorkspaceId),
    [projects, processingWorkspaceId]
  );

  const pendingInbox = inboxItems.filter((item) => !item.processed);
  const processedInbox = inboxItems.filter((item) => item.processed);

  async function createTask(event: FormEvent) {
    event.preventDefault();

    if (!createWorkspaceId) {
      setError('Selecione um workspace para criar a tarefa.');
      return;
    }

    try {
      setBusy(true);
      await api.createTask({
        workspaceId: createWorkspaceId,
        projectId: createProjectId || null,
        title: createTitle,
        priority: createPriority,
        horizon: createHorizon
      });

      setCreateTitle('');
      setCreatePriority(3);
      setCreateHorizon('active');
      setCreateProjectId('');
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTaskDetails(event: FormEvent) {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    if (!detailWorkspaceId) {
      setError('A tarefa precisa ter um workspace.');
      return;
    }

    try {
      setBusy(true);
      await api.updateTask(selectedTask.id, {
        title: detailTitle.trim(),
        description: detailDescription.trim() ? detailDescription : null,
        workspaceId: detailWorkspaceId,
        projectId: detailProjectId || null,
        status: detailStatus,
        priority: detailPriority,
        horizon: detailHorizon,
        estimatedMinutes: detailEstimatedMinutes ? Number(detailEstimatedMinutes) : null,
        dueDate: detailDueDate ? new Date(`${detailDueDate}T23:59:00`).toISOString() : null,
        waitingOnPerson: detailWaitingOnPerson.trim() ? detailWaitingOnPerson : null,
        waitingPriority: detailWaitingOnPerson.trim() ? detailWaitingPriority : null
      });
      await load();
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
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function captureToQueue(event: FormEvent) {
    event.preventDefault();

    if (!captureText.trim()) {
      return;
    }

    try {
      setBusy(true);
      await api.createInboxItem(captureText.trim(), 'app');
      setCaptureText('');
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function processInboxItem(itemId: string, action: 'task' | 'project' | 'discard') {
    if (action !== 'discard' && !processingWorkspaceId) {
      setError('Selecione um workspace para processar itens.');
      return;
    }

    try {
      setBusy(true);
      await api.processInboxItem(itemId, {
        action,
        workspaceId: action === 'discard' ? undefined : processingWorkspaceId,
        projectId: action === 'task' && processingProjectId ? processingProjectId : undefined,
        horizon: action === 'task' ? processingHorizon : undefined
      });
      await load();
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
          <p className="eyebrow">Tarefas</p>
          <h3>Centro operacional completo das tarefas</h3>
          <p>
            Liste, detalhe e execute com contexto total: prioridade, notas, pessoa responsável, projeto e horizonte.
          </p>
        </div>
      </header>

      {error && <p className="surface-error">{error}</p>}

      <section className="surface-card">
        <form className="task-create-grid" onSubmit={createTask}>
          <label>
            Nova tarefa
            <input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="Ex: Fechar planejamento comercial"
              required
            />
          </label>

          <label>
            Workspace
            <select
              value={createWorkspaceId}
              onChange={(event) => {
                setCreateWorkspaceId(event.target.value);
                setCreateProjectId('');
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

          <label>
            Projeto (opcional)
            <select value={createProjectId} onChange={(event) => setCreateProjectId(event.target.value)}>
              <option value="">Sem projeto</option>
              {createProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Horizonte
            <select value={createHorizon} onChange={(event) => setCreateHorizon(event.target.value as TaskHorizon)}>
              <option value="active">Ativo</option>
              <option value="future">Futuro</option>
            </select>
          </label>

          <label>
            Prioridade {createPriority}
            <input
              type="range"
              min={1}
              max={5}
              value={createPriority}
              onChange={(event) => setCreatePriority(Number(event.target.value))}
            />
          </label>

          <button type="submit" disabled={busy}>
            Adicionar tarefa
          </button>
        </form>
      </section>

      <section className="two-col-grid large">
        <article className="surface-card">
          <div className="section-title">
            <h4>Lista de tarefas</h4>
            <small>{filteredTasks.length} visíveis</small>
          </div>

          <div className="inline-actions">
            <button
              type="button"
              className={taskView === 'open' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => setTaskView('open')}
            >
              Abertas
            </button>
            <button
              type="button"
              className={taskView === 'all' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => setTaskView('all')}
            >
              Todas
            </button>
            <button
              type="button"
              className={taskView === 'done' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => setTaskView('done')}
            >
              Concluídas
            </button>
          </div>

          <div className="filters-row">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa" />
            <select
              value={horizonFilter}
              onChange={(event) => setHorizonFilter(event.target.value as 'all' | TaskHorizon)}
            >
              <option value="all">Horizonte: todos</option>
              <option value="active">Horizonte: ativo</option>
              <option value="future">Horizonte: futuro</option>
            </select>
            <div className="empty-list">
              {tasks.filter((task) => task.status !== 'feito').length} em andamento/backlog
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <p className="empty-state">Nenhuma tarefa encontrada para os filtros atuais.</p>
          ) : (
            <ul className="task-list">
              {filteredTasks.map((task) => (
                <li
                  key={task.id}
                  className={selectedTaskId === task.id ? 'task-row selected' : 'task-row'}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.workspace?.name ?? 'Sem workspace'} • {task.project?.title ?? 'Sem projeto'}
                    </small>
                  </div>

                  <div className="inline-actions">
                    <span className={`priority-chip priority-${task.priority}`}>P{task.priority}</span>
                    <span className={`status-tag ${task.status}`}>{task.status}</span>
                    {task.status !== 'feito' && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          completeTask(task.id);
                        }}
                      >
                        Concluir
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>{selectedTask ? 'Detalhe da tarefa' : 'Selecione uma tarefa'}</h4>
            {selectedTask && <small>ID {selectedTask.id.slice(0, 8)}</small>}
          </div>

          {!selectedTask ? (
            <p className="empty-state">Clique em uma tarefa para abrir o painel completo.</p>
          ) : (
            <form className="task-detail-form" onSubmit={saveTaskDetails}>
              <label>
                Título
                <input value={detailTitle} onChange={(event) => setDetailTitle(event.target.value)} required />
              </label>

              <div className="row-2">
                <label>
                  Workspace
                  <select
                    value={detailWorkspaceId}
                    onChange={(event) => {
                      const nextWorkspaceId = event.target.value;
                      setDetailWorkspaceId(nextWorkspaceId);
                      if (!projects.some((project) => project.id === detailProjectId && project.workspaceId === nextWorkspaceId)) {
                        setDetailProjectId('');
                      }
                    }}
                  >
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Projeto
                  <select value={detailProjectId} onChange={(event) => setDetailProjectId(event.target.value)}>
                    <option value="">Sem projeto</option>
                    {detailProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="row-2">
                <label>
                  Status
                  <select value={detailStatus} onChange={(event) => setDetailStatus(event.target.value as TaskStatus)}>
                    <option value="backlog">backlog</option>
                    <option value="hoje">hoje</option>
                    <option value="andamento">andamento</option>
                    <option value="feito">feito</option>
                  </select>
                </label>

                <label>
                  Horizonte
                  <select value={detailHorizon} onChange={(event) => setDetailHorizon(event.target.value as TaskHorizon)}>
                    <option value="active">ativo</option>
                    <option value="future">futuro</option>
                  </select>
                </label>
              </div>

              <div className="priority-hero">
                <span>Prioridade atual</span>
                <strong>P{detailPriority}</strong>
                <small>{priorityLabel(detailPriority)}</small>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={detailPriority}
                  onChange={(event) => setDetailPriority(Number(event.target.value))}
                />
              </div>

              <div className="row-2">
                <label>
                  Data limite
                  <input
                    type="date"
                    value={detailDueDate}
                    onChange={(event) => setDetailDueDate(event.target.value)}
                  />
                </label>

                <label>
                  Duração estimada (min)
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={detailEstimatedMinutes}
                    onChange={(event) => setDetailEstimatedMinutes(event.target.value)}
                    placeholder="60"
                  />
                </label>
              </div>

              <div className="row-2">
                <label>
                  Aguardando pessoa
                  <input
                    value={detailWaitingOnPerson}
                    onChange={(event) => setDetailWaitingOnPerson(event.target.value)}
                    placeholder="Ex: Fulano"
                  />
                </label>

                <label>
                  Prioridade do follow-up
                  <select
                    value={detailWaitingPriority}
                    onChange={(event) => setDetailWaitingPriority(event.target.value as WaitingPriority)}
                    disabled={!detailWaitingOnPerson.trim()}
                  >
                    <option value="alta">alta</option>
                    <option value="media">média</option>
                    <option value="baixa">baixa</option>
                  </select>
                </label>
              </div>

              <label>
                Notas da tarefa
                <textarea
                  value={detailDescription}
                  onChange={(event) => setDetailDescription(event.target.value)}
                  placeholder="Contexto completo, decisões, links e observações."
                />
              </label>

              <div className="inline-actions">
                <button type="submit" disabled={busy}>
                  Salvar detalhes
                </button>
                {selectedTask.status !== 'feito' && (
                  <button
                    type="button"
                    className="success-button"
                    onClick={() => completeTask(selectedTask.id)}
                    disabled={busy}
                  >
                    Concluir agora
                  </button>
                )}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setDetailStatus('backlog')}
                  disabled={busy}
                >
                  Voltar para backlog
                </button>
              </div>
            </form>
          )}
        </article>
      </section>

      <section className="two-col-grid large">
        <article className="surface-card">
          <div className="section-title">
            <h4>Capturas para processar</h4>
            <small>{pendingInbox.length} pendentes</small>
          </div>

          <form className="capture-row" onSubmit={captureToQueue}>
            <input
              value={captureText}
              onChange={(event) => setCaptureText(event.target.value)}
              placeholder="capturar revisar proposta de parceria"
            />
            <button type="submit" disabled={busy}>
              Capturar
            </button>
          </form>

          <div className="process-settings-grid">
            <label>
              Workspace destino
              <select
                value={processingWorkspaceId}
                onChange={(event) => {
                  setProcessingWorkspaceId(event.target.value);
                  setProcessingProjectId('');
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

            <label>
              Projeto destino
              <select value={processingProjectId} onChange={(event) => setProcessingProjectId(event.target.value)}>
                <option value="">Sem projeto</option>
                {processingProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Horizonte
              <select
                value={processingHorizon}
                onChange={(event) => setProcessingHorizon(event.target.value as TaskHorizon)}
              >
                <option value="active">Ativo</option>
                <option value="future">Futuro</option>
              </select>
            </label>
          </div>

          {pendingInbox.length === 0 ? (
            <p className="empty-state">Sem capturas pendentes.</p>
          ) : (
            <div className="queue-list">
              {pendingInbox.map((item) => (
                <article key={item.id} className="queue-item">
                  <div>
                    <strong>{item.content}</strong>
                    <small>origem: {item.source}</small>
                  </div>

                  <div className="inline-actions">
                    <button type="button" className="success-button" onClick={() => processInboxItem(item.id, 'task')}>
                      Virar tarefa
                    </button>
                    <button type="button" className="ghost-button" onClick={() => processInboxItem(item.id, 'project')}>
                      Virar projeto
                    </button>
                    <button type="button" className="warning-button" onClick={() => processInboxItem(item.id, 'discard')}>
                      Descartar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>Histórico de processadas</h4>
            <small>{processedInbox.length}</small>
          </div>

          {processedInbox.length === 0 ? (
            <p className="empty-state">Nenhum item processado ainda.</p>
          ) : (
            <ul className="task-list">
              {processedInbox.slice(0, 20).map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.content}</strong>
                    <small>{new Date(item.createdAt).toLocaleString('pt-BR')}</small>
                  </div>
                  <span className="status-tag feito">processado</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </section>
  );
}
