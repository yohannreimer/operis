import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import { api, DayPlan, DayPlanItem, ExecutionBriefing, Task, TaskHorizon } from '../api';
import { Modal } from '../components/modal';
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
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
  const [briefing, setBriefing] = useState<ExecutionBriefing | null>(null);
  const [weekSummary, setWeekSummary] = useState<Array<{ date: string; count: number }>>([]);

  const [search, setSearch] = useState('');
  const [horizonFilter, setHorizonFilter] = useState<'all' | TaskHorizon>('all');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringTitle, setRecurringTitle] = useState('Deep Work');
  const [recurringStart, setRecurringStart] = useState('07:30');
  const [recurringEnd, setRecurringEnd] = useState('08:30');

  const workspaceName =
    activeWorkspaceId === 'all'
      ? 'Geral'
      : workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? 'Frente';

  async function loadDate(date: string) {
    const [planData, taskData, nextBriefing] = await Promise.all([
      api.getDayPlan(date),
      api.getTasks(workspaceId ? { workspaceId } : undefined),
      api.getExecutionBriefing(date, {
        workspaceId
      })
    ]);

    setDayPlan(planData);
    setTasks(taskData.filter((task) => task.status !== 'feito' && task.status !== 'arquivado'));
    setBriefing(nextBriefing);
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
      setError(null);
      await Promise.all([loadDate(selectedDate), loadWeek()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
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

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Planejamento futuro"
          title="Amanhã"
          subtitle={`Contexto: ${workspaceName}`}
        />
        <PremiumCard title="Semana planejada">
          <SkeletonBlock lines={2} />
        </PremiumCard>
        <section className="premium-grid two-wide">
          <PremiumCard title={`Agenda ${selectedDate}`}>
            <SkeletonBlock lines={10} />
          </PremiumCard>
          <PremiumCard title="Pool de tarefas">
            <SkeletonBlock lines={10} />
          </PremiumCard>
        </section>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PremiumHeader
        eyebrow="Planejamento futuro"
        title="Amanhã"
        subtitle={`Contexto: ${workspaceName}`}
        actions={
          <button type="button" className="ghost-button" onClick={() => setRecurringOpen(true)}>
            Novo recorrente
          </button>
        }
      />

      {error && <p className="surface-error">{error}</p>}

      <PremiumCard title="Semana planejada" subtitle="selecione o dia para detalhar">
        <div className="week-strip premium-week-strip">
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
      </PremiumCard>

      <section className="premium-grid two-wide">
        <PremiumCard title={`Agenda ${selectedDate}`} subtitle="drag-and-drop em blocos de 30 min" className="scheduler-card">
          <SchedulerGrid
            date={selectedDate}
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onDropPayload={onDropPayload}
            onItemDragStart={handleItemDragStart}
          />
        </PremiumCard>

        <PremiumCard title="Pool de tarefas" subtitle={`${taskPool.length} disponíveis`}>
          {briefing?.capacity.isUnrealistic && (
            <p className="surface-error">
              Planejamento irreal: capacidade excedida em {briefing.capacity.overloadMinutes} min.
            </p>
          )}

          <div className="task-list-filters pool-filter-row pool-filter-row-two">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa" />
            <select
              value={horizonFilter}
              onChange={(event) => setHorizonFilter(event.target.value as 'all' | TaskHorizon)}
            >
              <option value="all">Todos horizontes</option>
              <option value="active">Ativo</option>
              <option value="future">Futuro</option>
            </select>
          </div>

          {taskPool.length === 0 ? (
            <EmptyState
              title="Nada no pool para esse filtro"
              description="Limpe os filtros ou mova tarefas para manter uma semana planejável."
              actionLabel="Limpar filtros"
              onAction={() => {
                setSearch('');
                setHorizonFilter('all');
              }}
            />
          ) : (
            <ul className="premium-list dense draggable-list">
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
            </ul>
          )}

          <hr className="surface-divider" />

          <div className="inline-actions">
            <button type="button" onClick={applyRecurring} disabled={busy}>
              Aplicar recorrentes
            </button>
          </div>
        </PremiumCard>
      </section>

      <Modal
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        title="Novo bloco recorrente"
        subtitle="cria recorrência para o dia selecionado"
      >
        <form onSubmit={saveRecurring} className="modal-form">
          <label>
            Título
            <input value={recurringTitle} onChange={(event) => setRecurringTitle(event.target.value)} required />
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
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </PremiumPage>
  );
}
