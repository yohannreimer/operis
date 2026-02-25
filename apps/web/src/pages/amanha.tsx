import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import { api, DayPlan, DayPlanItem, Task, TaskHorizon } from '../api';
import { Modal } from '../components/modal';
import { DragPayload, SchedulerGrid } from '../components/scheduler-grid';
import { useShellContext } from '../components/shell-context';
import { tomorrowIsoDate } from '../utils/date';
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

function weekDates(baseDate: string) {
  const first = new Date(`${baseDate}T00:00:00`);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function horizonLabel(horizon?: TaskHorizon) {
  return horizon === 'future' ? 'futuro' : 'ativo';
}

export function AmanhaPage() {
  const initialDate = useMemo(() => tomorrowIsoDate(), []);
  const [selectedDate, setSelectedDate] = useState(initialDate);

  const { activeWorkspaceId, workspaces } = useShellContext();
  const workspaceId = workspaceQuery(activeWorkspaceId);

  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weekSummary, setWeekSummary] = useState<Array<{ date: string; count: number }>>([]);

  const [search, setSearch] = useState('');
  const [horizonFilter, setHorizonFilter] = useState<'all' | TaskHorizon>('all');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringTitle, setRecurringTitle] = useState('Deep Work');
  const [recurringStart, setRecurringStart] = useState('07:30');
  const [recurringEnd, setRecurringEnd] = useState('08:30');

  const workspaceName =
    activeWorkspaceId === 'all'
      ? 'Geral'
      : workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? 'Workspace';

  async function loadDate(date: string) {
    const [planData, taskData] = await Promise.all([
      api.getDayPlan(date),
      api.getTasks(workspaceId ? { workspaceId } : undefined)
    ]);

    setDayPlan(planData);
    setTasks(taskData.filter((task) => task.status !== 'feito' && task.status !== 'arquivado'));
  }

  async function loadWeek() {
    const dates = weekDates(initialDate);
    const plans = await Promise.all(dates.map((date) => api.getDayPlan(date)));

    setWeekSummary(
      plans.map((plan, index) => ({
        date: dates[index],
        count: plan.items.length
      }))
    );
  }

  async function load() {
    try {
      await Promise.all([loadDate(selectedDate), loadWeek()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, [activeWorkspaceId, selectedDate]);

  const items = dayPlan?.items ?? [];
  const plannedTaskIds = new Set(items.map((item) => item.taskId).filter(Boolean));

  const taskPool = tasks
    .filter((task) => !plannedTaskIds.has(task.id))
    .filter((task) => {
      const matchesSearch =
        search.trim().length === 0 ||
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        (task.description ?? '').toLowerCase().includes(search.toLowerCase());

      const matchesHorizon = horizonFilter === 'all' ? true : (task.horizon ?? 'active') === horizonFilter;

      return matchesSearch && matchesHorizon;
    })
    .sort((left, right) => right.priority - left.priority);

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

  async function handleDropPayload(payload: DragPayload, startISO: string) {
    if (payload.kind === 'task') {
      const task = tasks.find((entry) => entry.id === payload.id);
      if (!task) {
        return;
      }

      const endDate = new Date(startISO);
      endDate.setMinutes(endDate.getMinutes() + taskDurationMinutes(task));

      await api.createDayPlanItem(selectedDate, {
        taskId: task.id,
        blockType: 'task',
        startTime: startISO,
        endTime: endDate.toISOString()
      });

      await api.updateTask(task.id, {
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
      await loadDate(selectedDate);
      await loadWeek();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyRecurring() {
    try {
      setBusy(true);
      await api.applyRecurringBlocks(selectedDate);
      await loadDate(selectedDate);
      await loadWeek();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRecurring(event: FormEvent) {
    event.preventDefault();

    try {
      setBusy(true);
      const weekday = new Date(`${selectedDate}T00:00:00`).getDay();
      await api.createRecurringBlock({
        title: recurringTitle,
        weekday,
        startTime: recurringStart,
        endTime: recurringEnd
      });

      setRecurringOpen(false);
      await loadWeek();
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
          <p className="eyebrow">Amanhã</p>
          <h3>Planejamento visual semanal</h3>
          <p>Contexto: {workspaceName} • selecione um dia e arraste as tarefas para a agenda.</p>
        </div>

        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => setRecurringOpen(true)}>
            + Novo recorrente
          </button>
        </div>
      </header>

      {error && <p className="surface-error">{error}</p>}

      <section className="surface-card week-strip-card">
        <div className="week-strip">
          {weekSummary.map((entry) => (
            <button
              type="button"
              key={entry.date}
              className={selectedDate === entry.date ? 'day-chip active' : 'day-chip'}
              onClick={() => setSelectedDate(entry.date)}
            >
              <strong>{new Date(`${entry.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })}</strong>
              <span>{entry.date.slice(8)}</span>
              <small>{entry.count} blocos</small>
            </button>
          ))}
        </div>
      </section>

      <section className="today-layout">
        <article className="surface-card">
          <div className="section-title">
            <h4>Agenda de {selectedDate}</h4>
            <small>alocação em blocos de 30 min</small>
          </div>

          <SchedulerGrid
            date={selectedDate}
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onDropPayload={onDropPayload}
            onItemDragStart={handleItemDragStart}
          />
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>Pool de tarefas</h4>
            <small>{taskPool.length} disponíveis</small>
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
              </li>
            ))}
            {taskPool.length === 0 && <li className="empty-list">Sem tarefas para os filtros atuais.</li>}
          </ul>

          <hr className="surface-divider" />

          <div className="inline-actions">
            <button type="button" onClick={applyRecurring} disabled={busy}>
              Aplicar recorrentes do dia
            </button>
          </div>
        </article>
      </section>

      <Modal
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        title="Novo bloco recorrente"
        subtitle="Cria recorrência para o dia da semana selecionado"
      >
        <form onSubmit={saveRecurring} className="modal-form">
          <label>
            Título
            <input
              value={recurringTitle}
              onChange={(event) => setRecurringTitle(event.target.value)}
              required
            />
          </label>

          <div className="row-2">
            <label>
              Início
              <input
                type="time"
                value={recurringStart}
                onChange={(event) => setRecurringStart(event.target.value)}
                required
              />
            </label>

            <label>
              Fim
              <input
                type="time"
                value={recurringEnd}
                onChange={(event) => setRecurringEnd(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="text-button" onClick={() => setRecurringOpen(false)}>
              Cancelar
            </button>
            <button type="submit" disabled={busy}>
              Salvar recorrência
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
