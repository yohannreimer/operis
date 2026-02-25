import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import { api, DayPlan, DayPlanItem, Task, TaskHorizon } from '../api';
import { Modal } from '../components/modal';
import { DragPayload, SchedulerGrid } from '../components/scheduler-grid';
import { useShellContext } from '../components/shell-context';
import { todayIsoDate } from '../utils/date';
import { workspaceQuery } from '../utils/workspace';

function toDragText(payload: DragPayload) {
  return `${payload.kind}:${payload.id}`;
}

function taskDurationMinutes(task: Task) {
  return task.estimatedMinutes && task.estimatedMinutes > 0 ? task.estimatedMinutes : 60;
}

function itemDurationMinutes(item: DayPlanItem) {
  const start = new Date(item.startTime).getTime();
  const end = new Date(item.endTime).getTime();
  const duration = Math.round((end - start) / 60000);
  return duration > 0 ? duration : 60;
}

function toTimeValue(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function horizonLabel(horizon?: TaskHorizon) {
  return horizon === 'future' ? 'futuro' : 'ativo';
}

export function HojePage() {
  const date = useMemo(() => todayIsoDate(), []);
  const { activeWorkspaceId, workspaces } = useShellContext();
  const workspaceId = workspaceQuery(activeWorkspaceId);

  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [horizonFilter, setHorizonFilter] = useState<'all' | TaskHorizon>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | '4' | '5'>('all');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [editStart, setEditStart] = useState('09:00');
  const [editEnd, setEditEnd] = useState('10:00');
  const [blockEditorOpen, setBlockEditorOpen] = useState(false);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState(3);
  const [newTaskHorizon, setNewTaskHorizon] = useState<TaskHorizon>('active');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspaceName =
    activeWorkspaceId === 'all'
      ? 'Geral'
      : workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? 'Workspace';

  async function load() {
    try {
      const [nextDayPlan, taskList] = await Promise.all([
        api.getDayPlan(date),
        api.getTasks(workspaceId ? { workspaceId } : undefined)
      ]);

      setDayPlan(nextDayPlan);
      setTasks(taskList.filter((task) => task.status !== 'arquivado'));
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [activeWorkspaceId]);

  const items = dayPlan?.items ?? [];
  const plannedTaskIds = new Set(items.map((item) => item.taskId).filter(Boolean));

  const doneTasks = tasks.filter((task) => task.status === 'feito');
  const openTasks = tasks.filter((task) => ['backlog', 'hoje', 'andamento'].includes(task.status));

  const taskPool = openTasks
    .filter((task) => !plannedTaskIds.has(task.id))
    .filter((task) => {
      const matchesSearch =
        search.trim().length === 0 ||
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        (task.description ?? '').toLowerCase().includes(search.toLowerCase());

      const matchesHorizon = horizonFilter === 'all' ? true : (task.horizon ?? 'active') === horizonFilter;
      const matchesPriority = priorityFilter === 'all' ? true : task.priority >= Number(priorityFilter);

      return matchesSearch && matchesHorizon && matchesPriority;
    })
    .sort((left, right) => right.priority - left.priority);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setEditStart(toTimeValue(selectedItem.startTime));
    setEditEnd(toTimeValue(selectedItem.endTime));
  }, [selectedItemId]);

  function handleTaskDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    const payload: DragPayload = { kind: 'task', id: taskId };
    const encoded = JSON.stringify(payload);

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-execution-os', encoded);
    event.dataTransfer.setData('text/plain', toDragText(payload));
  }

  function handleItemDragStart(event: DragEvent<HTMLElement>, payload: DragPayload) {
    const encoded = JSON.stringify(payload);

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-execution-os', encoded);
    event.dataTransfer.setData('text/plain', toDragText(payload));
  }

  function openBlockEditor(itemId: string) {
    setSelectedItemId(itemId);
    setBlockEditorOpen(true);
  }

  async function handleDropPayload(payload: DragPayload, startISO: string) {
    if (payload.kind === 'task') {
      const task = tasks.find((entry) => entry.id === payload.id);
      if (!task) {
        return;
      }

      const endDate = new Date(startISO);
      endDate.setMinutes(endDate.getMinutes() + taskDurationMinutes(task));

      await api.createDayPlanItem(date, {
        taskId: task.id,
        blockType: 'task',
        startTime: startISO,
        endTime: endDate.toISOString()
      });

      await api.updateTask(task.id, {
        status: 'hoje',
        horizon: 'active'
      });

      return;
    }

    const item = items.find((entry) => entry.id === payload.id);
    if (!item) {
      return;
    }

    const endDate = new Date(startISO);
    endDate.setMinutes(endDate.getMinutes() + itemDurationMinutes(item));

    await api.updateDayPlanItem(item.id, {
      startTime: startISO,
      endTime: endDate.toISOString()
    });
  }

  async function onDropPayload(payload: DragPayload, startISO: string) {
    try {
      setBusy(true);
      await handleDropPayload(payload, startISO);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveBlockEdit(event: FormEvent) {
    event.preventDefault();

    if (!selectedItem) {
      return;
    }

    try {
      setBusy(true);
      await api.updateDayPlanItem(selectedItem.id, {
        startTime: new Date(`${date}T${editStart}:00`).toISOString(),
        endTime: new Date(`${date}T${editEnd}:00`).toISOString()
      });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock() {
    if (!selectedItem) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteDayPlanItem(selectedItem.id);
      setSelectedItemId('');
      setBlockEditorOpen(false);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmBlock(action: 'done' | 'not_done' | 'postpone') {
    if (!selectedItem) {
      return;
    }

    try {
      setBusy(true);
      await api.confirmDayPlanItem(selectedItem.id, action);
      setBlockEditorOpen(false);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();

    const fallbackWorkspaceId = workspaces.find((workspace) => workspace.type === 'pessoal')?.id ?? workspaces[0]?.id;
    const targetWorkspace = workspaceId ?? fallbackWorkspaceId;

    if (!targetWorkspace) {
      setError('Crie um workspace antes de adicionar tarefas.');
      return;
    }

    try {
      setBusy(true);
      await api.createTask({
        workspaceId: targetWorkspace,
        title: newTaskTitle,
        priority: newTaskPriority,
        horizon: newTaskHorizon
      });
      setCreateTaskOpen(false);
      setNewTaskTitle('');
      setNewTaskPriority(3);
      setNewTaskHorizon('active');
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

  return (
    <section className="page-stack">
      <header className="page-header-premium">
        <div>
          <p className="eyebrow">Hoje</p>
          <h3>Planejamento e execução do dia</h3>
          <p>Contexto: {workspaceName} • arraste tarefas para os horários na agenda.</p>
        </div>

        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => setCreateTaskOpen(true)}>
            + Nova tarefa
          </button>
          <div className="date-pill">{date}</div>
        </div>
      </header>

      {error && <p className="surface-error">{error}</p>}

      <section className="today-layout">
        <article className="surface-card">
          <div className="section-title">
            <h4>Agenda do dia</h4>
            <small>drag-and-drop em blocos de 30 min</small>
          </div>

          <SchedulerGrid
            date={date}
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onItemDoubleClick={openBlockEditor}
            onDropPayload={onDropPayload}
            onItemDragStart={handleItemDragStart}
          />

          <p className="scheduler-tip">Duplo clique no bloco para editar horário, confirmar ou remover.</p>
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>Tarefas disponíveis</h4>
            <small>{taskPool.length} tarefas no pool</small>
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
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as 'all' | '4' | '5')}
            >
              <option value="all">Prioridade: todas</option>
              <option value="4">Prioridade 4+</option>
              <option value="5">Prioridade 5</option>
            </select>
          </div>

          <ul className="pool-list">
            {taskPool.map((task) => (
              <li key={task.id} draggable onDragStart={(event) => handleTaskDragStart(event, task.id)}>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    prioridade {task.priority} • {horizonLabel(task.horizon)}
                  </small>
                </div>

                <div className="inline-actions">
                  <button type="button" className="ghost-button" onClick={() => completeTask(task.id)}>
                    Concluir
                  </button>
                </div>
              </li>
            ))}

            {taskPool.length === 0 && <li className="empty-list">Sem tarefas para os filtros atuais.</li>}
          </ul>

          <hr className="surface-divider" />

          <div className="section-title">
            <h4>Concluídas hoje</h4>
            <small>{doneTasks.length}</small>
          </div>

          {doneTasks.length === 0 ? (
            <p className="empty-state">Nenhuma tarefa concluída ainda.</p>
          ) : (
            <ul className="task-list">
              {doneTasks.map((task) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <small>prioridade {task.priority}</small>
                  </div>
                  <span className="status-tag feito">feito</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <Modal open={createTaskOpen} onClose={() => setCreateTaskOpen(false)} title="Nova tarefa" subtitle="Criar tarefa no contexto atual">
        <form onSubmit={createTask} className="modal-form">
          <label>
            Título
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Ex: Revisar proposta"
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

      <Modal
        open={blockEditorOpen && Boolean(selectedItem)}
        onClose={() => setBlockEditorOpen(false)}
        title="Editar bloco da agenda"
        subtitle={selectedItem?.task?.title ?? 'Bloco fixo'}
      >
        {selectedItem ? (
          <form onSubmit={saveBlockEdit} className="block-editor-form">
            <div className="row-2">
              <label>
                Início
                <input type="time" value={editStart} onChange={(event) => setEditStart(event.target.value)} required />
              </label>
              <label>
                Fim
                <input type="time" value={editEnd} onChange={(event) => setEditEnd(event.target.value)} required />
              </label>
            </div>

            <div className="inline-actions">
              <button type="submit" disabled={busy}>
                Salvar horário
              </button>
              <button type="button" className="ghost-button" onClick={removeBlock} disabled={busy}>
                Remover bloco
              </button>
              <button type="button" className="success-button" onClick={() => confirmBlock('done')} disabled={busy}>
                Fiz
              </button>
              <button type="button" className="warning-button" onClick={() => confirmBlock('postpone')} disabled={busy}>
                Adiar
              </button>
              <button type="button" className="text-button" onClick={() => confirmBlock('not_done')} disabled={busy}>
                Não fiz
              </button>
            </div>
          </form>
        ) : (
          <p className="empty-state">Selecione um bloco para editar.</p>
        )}
      </Modal>
    </section>
  );
}
