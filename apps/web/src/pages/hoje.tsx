import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

import {
  api,
  Commitment,
  DayPlan,
  DayPlanItem,
  DeepWorkSession,
  DeepWorkSummary,
  ExecutionEvolution,
  ExecutionBriefing,
  FailureReason,
  Task,
  TaskEnergy,
  TaskExecutionKind,
  TaskHorizon,
  TaskType
} from '../api';
import { Modal } from '../components/modal';
import { TaskCompletionModal } from '../components/task-completion-modal';
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
import { CommitmentBlock, DragPayload, SchedulerGrid } from '../components/scheduler-grid';
import { useShellContext } from '../components/shell-context';
import { todayIsoDate, localDateKey } from '../utils/date';
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

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toIsoDateKey(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function formatAgendaDateLabel(isoDate: string) {
  const safe = new Date(`${isoDate}T12:00:00.000Z`);
  return safe.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

const STRICT_MODE_STORAGE_KEY = 'execution-os.strict-mode';

function readStrictModePreference() {
  try {
    return window.localStorage.getItem(STRICT_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00`); // local noon — safe across DST
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

type CapacitySuggestion = {
  taskId: string;
  title: string;
  minutes: number;
  reason: string;
  itemId?: string;
};

type CapacityInsight = {
  mode: 'balanced' | 'overload' | 'underload';
  deltaMinutes: number;
  targetMinutes: number;
  suggestions: CapacitySuggestion[];
};

const TASK_TYPE_PRIORITY_SUGGESTION: Record<TaskType, number> = {
  a: 5,
  b: 3,
  c: 1
};

function taskTypeWeight(taskType?: TaskType) {
  if (taskType === 'a') {
    return 3;
  }
  if (taskType === 'b') {
    return 2;
  }
  return 1;
}

function dueUrgencyWeight(dueDate?: string | null) {
  if (!dueDate) {
    return 0;
  }

  const diffHours = (new Date(dueDate).getTime() - Date.now()) / 36e5;
  if (diffHours <= 0) {
    return 3;
  }
  if (diffHours <= 24) {
    return 2;
  }
  if (diffHours <= 48) {
    return 1;
  }
  return 0;
}

function isStrategicExecutionKind(kind?: TaskExecutionKind) {
  return kind === 'construcao' || kind === 'otimizacao';
}

function executionKindPriorityBonus(kind?: TaskExecutionKind) {
  if (kind === 'construcao') {
    return 28;
  }
  if (kind === 'otimizacao') {
    return 20;
  }
  return 0;
}

function suggestedPriorityFromTaskType(type: TaskType) {
  return TASK_TYPE_PRIORITY_SUGGESTION[type];
}

export function HojePage() {
  const [date, setDate] = useState(() => todayIsoDate());
  const { activeWorkspaceId, workspaces } = useShellContext();
  const workspaceId = workspaceQuery(activeWorkspaceId);

  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayCommitments, setTodayCommitments] = useState<Commitment[]>([]);
  const [briefing, setBriefing] = useState<ExecutionBriefing | null>(null);
  const [deepWorkSummary, setDeepWorkSummary] = useState<DeepWorkSummary | null>(null);
  const [activeDeepWork, setActiveDeepWork] = useState<DeepWorkSession | null>(null);
  const [evolution, setEvolution] = useState<ExecutionEvolution | null>(null);
  const [deepWorkNowMs, setDeepWorkNowMs] = useState(() => Date.now());
  const [search, setSearch] = useState('');
  const [horizonFilter, setHorizonFilter] = useState<'all' | TaskHorizon>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | '4' | '5'>('all');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [editStart, setEditStart] = useState('09:00');
  const [editEnd, setEditEnd] = useState('10:00');
  const [failureReason, setFailureReason] = useState<FailureReason>('distracao');
  const [blockEditorOpen, setBlockEditorOpen] = useState(false);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [completionTaskId, setCompletionTaskId] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDefinitionOfDone, setNewTaskDefinitionOfDone] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('a');
  const [newTaskEnergy, setNewTaskEnergy] = useState<TaskEnergy>('alta');
  const [newTaskExecutionKind, setNewTaskExecutionKind] = useState<TaskExecutionKind>('construcao');
  const [newTaskEstimatedMinutes, setNewTaskEstimatedMinutes] = useState('60');
  const [newTaskPriority, setNewTaskPriority] = useState(5);
  const [newTaskHorizon, setNewTaskHorizon] = useState<TaskHorizon>('active');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [top3DraftIds, setTop3DraftIds] = useState<string[]>([]);
  const [top3Note, setTop3Note] = useState('');

  const [strictMode, setStrictMode] = useState(() => readStrictModePreference());
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isToday = date === todayIsoDate();

  const workspaceName =
    activeWorkspaceId === 'all'
      ? 'Geral'
      : workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? 'Frente';
  const activeWorkspaceMode =
    activeWorkspaceId === 'all'
      ? undefined
      : workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.mode;

  useEffect(() => {
    if (activeWorkspaceMode === 'manutencao' && isStrategicExecutionKind(newTaskExecutionKind)) {
      setNewTaskExecutionKind('operacao');
    }
  }, [activeWorkspaceMode, newTaskExecutionKind]);

  async function load() {
    try {
      setError(null);
      const [nextDayPlan, taskList, nextBriefing, nextDeepSummary, nextActiveDeepWork, nextEvolution, commitmentList] = await Promise.all([
        api.getDayPlan(date),
        api.getTasks(workspaceId ? { workspaceId } : undefined),
        api.getExecutionBriefing(date, {
          workspaceId,
          strictMode
        }),
        api.getDeepWorkSummary(date, {
          workspaceId
        }),
        api.getActiveDeepWork({
          workspaceId
        }),
        api.getExecutionEvolution({
          workspaceId,
          windowDays: 30
        }),
        api.getCommitments({ date, status: 'ativo' })
      ]);

      setDayPlan(nextDayPlan);
      setTasks(taskList.filter((task) => task.status !== 'arquivado'));
      setBriefing(nextBriefing);
      setDeepWorkSummary(nextDeepSummary);
      setActiveDeepWork(nextActiveDeepWork);
      setEvolution(nextEvolution);
      setTodayCommitments(commitmentList);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    setReady(false);
    load();
  }, [activeWorkspaceId, strictMode, date]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STRICT_MODE_STORAGE_KEY, strictMode ? '1' : '0');
    } catch {
      // Ignore persistence failures.
    }
  }, [strictMode]);

  useEffect(() => {
    if (!activeDeepWork || activeDeepWork.state !== 'active') {
      return;
    }

    setDeepWorkNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setDeepWorkNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeDeepWork?.id, activeDeepWork?.state]);

  const deepWorkElapsedSeconds = useMemo(() => {
    if (!activeDeepWork || activeDeepWork.state !== 'active') {
      return 0;
    }

    const startedAtMs = new Date(activeDeepWork.startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return 0;
    }

    return Math.max(0, Math.floor((deepWorkNowMs - startedAtMs) / 1000));
  }, [activeDeepWork, deepWorkNowMs]);

  const deepWorkTargetSeconds = activeDeepWork ? Math.max(1, activeDeepWork.targetMinutes * 60) : 1;
  const deepWorkProgressPercent = Math.min(100, Math.round((deepWorkElapsedSeconds / deepWorkTargetSeconds) * 100));
  const formattedAgendaDate = useMemo(() => formatAgendaDateLabel(date), [date]);

  const items = dayPlan?.items ?? [];
  const plannedTaskIds = new Set(items.map((item) => item.taskId).filter(Boolean));

  const doneTasks = tasks.filter((task) => {
    if (task.status !== 'feito') {
      return false;
    }
    const completionKey = toIsoDateKey(task.completedAt) ?? toIsoDateKey(task.updatedAt);
    return completionKey === date;
  });
  const openTasks = tasks.filter((task) => ['backlog', 'hoje', 'andamento'].includes(task.status));
  const focusLimit = evolution?.systemMode.focusLimit ?? 3;
  const maxNewTasksPerDay = evolution?.systemMode.maxNewTasksPerDay ?? 999;
  const createdTodayCount = tasks.filter((task) => {
    if (!task.createdAt) {
      return false;
    }
    return task.createdAt.slice(0, 10) === date;
  }).length;
  const newTaskLimitReached = createdTodayCount >= maxNewTasksPerDay;
  const topFocusCandidates = useMemo(
    () =>
      openTasks
        .filter((task) => task.taskType === 'a')
        .filter((task) => task.workspace?.mode !== 'standby')
        .filter((task) => !task.project || task.project.status === 'ativo')
        .filter((task) => !task.waitingOnPerson?.trim())
        .filter((task) => !(task.restrictions ?? []).some((restriction) => restriction.status === 'aberta'))
        .sort((left, right) => {
          if (left.priority !== right.priority) {
            return right.priority - left.priority;
          }
          const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          if (leftDue !== rightDue) {
            return leftDue - rightDue;
          }
          return new Date(left.createdAt ?? Date.now()).getTime() - new Date(right.createdAt ?? Date.now()).getTime();
        }),
    [openTasks]
  );

  useEffect(() => {
    if (!briefing) {
      return;
    }

    const seedIds =
      briefing.top3Meta.locked && briefing.top3Meta.taskIds.length > 0
        ? briefing.top3Meta.taskIds
        : briefing.top3.map((task) => task.id);
    setTop3DraftIds(seedIds.slice(0, Math.max(1, focusLimit)));
    setTop3Note(briefing.top3Meta.note ?? '');
  }, [briefing?.date, briefing?.top3Meta.committedAt, briefing?.top3Meta.locked, focusLimit]);

  const topFocusTasks = useMemo(() => {
    if (!briefing) {
      return [] as Task[];
    }

    if (briefing.top3Meta.locked) {
      return briefing.top3.slice(0, Math.max(1, focusLimit));
    }

    const taskById = new Map(topFocusCandidates.map((task) => [task.id, task]));
    const selected = top3DraftIds
      .map((taskId) => taskById.get(taskId))
      .filter((task): task is Task => Boolean(task))
      .slice(0, Math.max(1, focusLimit));

    if (selected.length > 0) {
      return selected;
    }

    return briefing.top3.slice(0, Math.max(1, focusLimit));
  }, [briefing, focusLimit, top3DraftIds, topFocusCandidates]);
  const focusAlerts = useMemo(() => {
    const alerts: string[] = [];

    if (briefing?.alerts.expansionNeedsA) {
      alerts.push('Frente em expansão sem tarefa A na semana.');
    }
    if (briefing?.alerts.expansionNeedsDeepWork) {
      alerts.push('Frente em expansão sem Deep Work mínimo na semana.');
    }
    if (briefing?.alerts.fragmentationRisk) {
      alerts.push(`Fragmentação: ${briefing.alerts.fragmentationCount} projetos estratégicos ativos.`);
    }
    if (briefing?.alerts.focusOverloadRisk) {
      alerts.push(`Foco saturado: ${briefing.alerts.focusOverloadCount} projetos em Deep Work.`);
    }
    if ((briefing?.alerts.excessiveRescheduleA ?? 0) > 0) {
      alerts.push(`${briefing?.alerts.excessiveRescheduleA} tarefa(s) A com 3+ reagendamentos.`);
    }
    if ((briefing?.alerts.vagueTasks ?? 0) > 0) {
      alerts.push(`${briefing?.alerts.vagueTasks} tarefa(s) vagas sem executabilidade completa.`);
    }
    if (briefing?.alerts.maintenanceConstructionRisk) {
      alerts.push(
        `${briefing.alerts.maintenanceConstructionCount} tarefa(s) de construção/otimização em frente de manutenção.`
      );
    }
    if (briefing?.alerts.standbyExecutionRisk) {
      alerts.push(`${briefing.alerts.standbyExecutionCount} tarefa(s) em execução em frente standby.`);
    }

    return alerts.slice(0, 4);
  }, [briefing]);

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

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const completionTask = tasks.find((task) => task.id === completionTaskId) ?? null;

  // Commitment blocks for the scheduler overlay (all timed commitments; default 30 min if no duration set)
  const schedulerCommitmentBlocks = useMemo((): CommitmentBlock[] =>
    todayCommitments
      .filter(c => c.startTime)
      .map(c => ({
        id: c.id,
        title: c.title,
        startTime: c.startTime!,
        durationMin: c.durationMin ?? 30
      })),
    [todayCommitments]
  );

  // Total minutes locked by active commitments today (used in capacity bar)
  const commitmentMinutes = useMemo(
    () => todayCommitments.reduce((sum, c) => sum + (c.durationMin ?? 0), 0),
    [todayCommitments]
  );

  const plannedTaskBlocks = useMemo(
    () =>
      items
        .filter((item) => item.blockType === 'task')
        .map((item) => {
          const task = item.task ?? (item.taskId ? taskById.get(item.taskId) : undefined);
          if (!task) {
            return null;
          }

          if (workspaceId && task.workspaceId !== workspaceId) {
            return null;
          }

          return {
            itemId: item.id,
            task,
            minutes: itemDurationMinutes(item)
          };
        })
        .filter(
          (entry): entry is { itemId: string; task: Task; minutes: number } =>
            Boolean(entry)
        ),
    [items, taskById, workspaceId]
  );

  const capacityInsight = useMemo<CapacityInsight | null>(() => {
    if (!briefing) {
      return null;
    }

    const deltaMinutes = briefing.capacity.availableMinutes - (briefing.capacity.plannedTaskMinutes + commitmentMinutes);

    if (deltaMinutes < 0) {
      const targetMinutes = Math.abs(deltaMinutes);
      let freedMinutes = 0;
      const suggestions: CapacitySuggestion[] = [];

      const dropCandidates = [...plannedTaskBlocks]
        .filter((entry) => entry.task.status !== 'feito')
        .sort((left, right) => {
          const leftDropScore =
            taskTypeWeight(left.task.taskType) * 100 +
            left.task.priority * 12 +
            dueUrgencyWeight(left.task.dueDate) * 38;
          const rightDropScore =
            taskTypeWeight(right.task.taskType) * 100 +
            right.task.priority * 12 +
            dueUrgencyWeight(right.task.dueDate) * 38;
          return leftDropScore - rightDropScore;
        });

      for (const candidate of dropCandidates) {
        if (freedMinutes >= targetMinutes) {
          break;
        }

        freedMinutes += candidate.minutes;
        suggestions.push({
          taskId: candidate.task.id,
          title: candidate.task.title,
          minutes: candidate.minutes,
          reason: 'mover para backlog para liberar capacidade',
          itemId: candidate.itemId
        });
      }

      return {
        mode: 'overload',
        deltaMinutes,
        targetMinutes,
        suggestions
      };
    }

    if (deltaMinutes > 30) {
      const targetMinutes = Math.min(deltaMinutes, 180);
      let scheduledMinutes = 0;
      const suggestions: CapacitySuggestion[] = [];

      const pullCandidates = [...taskPool]
        .filter((task) => task.status !== 'feito')
        .sort((left, right) => {
          const leftScore =
            taskTypeWeight(left.taskType) * 120 +
            left.priority * 14 +
            executionKindPriorityBonus(left.executionKind) +
            dueUrgencyWeight(left.dueDate) * 26;
          const rightScore =
            taskTypeWeight(right.taskType) * 120 +
            right.priority * 14 +
            executionKindPriorityBonus(right.executionKind) +
            dueUrgencyWeight(right.dueDate) * 26;
          return rightScore - leftScore;
        });

      for (const candidate of pullCandidates) {
        if (scheduledMinutes >= targetMinutes) {
          break;
        }

        const minutes = taskDurationMinutes(candidate);
        scheduledMinutes += minutes;
        suggestions.push({
          taskId: candidate.id,
          title: candidate.title,
          minutes,
          reason: 'puxar para hoje para ocupar capacidade livre'
        });
      }

      return {
        mode: 'underload',
        deltaMinutes,
        targetMinutes,
        suggestions
      };
    }

    return {
      mode: 'balanced',
      deltaMinutes,
      targetMinutes: 0,
      suggestions: []
    };
  }, [briefing, plannedTaskBlocks, taskPool, commitmentMinutes]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setEditStart(toTimeValue(selectedItem.startTime));
    setEditEnd(toTimeValue(selectedItem.endTime));
  }, [selectedItemId, selectedItem]);

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
      await api.confirmDayPlanItem(
        selectedItem.id,
        action,
        action === 'done' ? undefined : failureReason
      );
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
      setError('Crie uma frente antes de adicionar tarefas.');
      return;
    }

    if (newTaskLimitReached) {
      setError(
        `Limite diário de criação atingido para o nível ${evolution?.stage.label ?? 'atual'} (${maxNewTasksPerDay}/dia).`
      );
      return;
    }

    try {
      setBusy(true);
      await api.createTask({
        workspaceId: targetWorkspace,
        title: newTaskTitle,
        definitionOfDone: newTaskDefinitionOfDone,
        taskType: newTaskType,
        energyLevel: newTaskEnergy,
        executionKind: newTaskExecutionKind,
        estimatedMinutes: Number(newTaskEstimatedMinutes) || 60,
        priority: newTaskPriority,
        horizon: newTaskHorizon,
        dueDate: newTaskDueDate
          ? new Date(`${newTaskDueDate}T12:00:00.000Z`).toISOString()
          : null
      });
      setCreateTaskOpen(false);
      setNewTaskTitle('');
      setNewTaskDefinitionOfDone('');
      setNewTaskType('a');
      setNewTaskEnergy('alta');
      setNewTaskExecutionKind('construcao');
      setNewTaskEstimatedMinutes('60');
      setNewTaskPriority(5);
      setNewTaskHorizon('active');
      setNewTaskDueDate('');
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleTop3Draft(taskId: string) {
    setTop3DraftIds((current) => {
      if (current.includes(taskId)) {
        return current.filter((id) => id !== taskId);
      }

      if (current.length >= Math.max(1, focusLimit)) {
        return current;
      }

      return [...current, taskId];
    });
  }

  async function commitTop3Draft() {
    if (top3DraftIds.length === 0) {
      setError('Selecione ao menos 1 tarefa A para confirmar o Top do dia.');
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await api.commitExecutionTop3(
        date,
        {
          taskIds: top3DraftIds.slice(0, Math.max(1, focusLimit)),
          note: top3Note.trim() ? top3Note.trim() : undefined
        },
        workspaceId ? { workspaceId } : undefined
      );
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlockTop3() {
    try {
      setBusy(true);
      setError(null);
      await api.clearExecutionTop3(date, workspaceId ? { workspaceId } : undefined);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyGuidedTop3Swap() {
    if (!briefing || briefing.top3Meta.swapTaskIds.length === 0) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await api.commitExecutionTop3(
        date,
        {
          taskIds: briefing.top3Meta.swapTaskIds.slice(0, Math.max(1, focusLimit)),
          note: briefing.top3Meta.note ?? undefined
        },
        workspaceId ? { workspaceId } : undefined
      );
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function requestTaskCompletion(taskId: string) {
    setCompletionTaskId(taskId);
  }

  async function confirmTaskCompletion(input: {
    completionMode: 'note' | 'no_note';
    completionNote?: string;
  }) {
    if (!completionTaskId) {
      return;
    }

    try {
      setBusy(true);
      await api.completeTask(completionTaskId, {
        strictMode,
        completionMode: input.completionMode,
        completionNote: input.completionNote
      });
      if (activeDeepWork?.taskId === completionTaskId && activeDeepWork.state === 'active') {
        await api.stopDeepWork(activeDeepWork.id, {
          switchedTask: false,
          notes: 'Finalizada junto com conclusão da tarefa.'
        });
      }
      await load();
      setCompletionTaskId('');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startDeepWork(taskId: string) {
    try {
      setBusy(true);
      const session = await api.startDeepWork({
        taskId,
        targetMinutes: evolution?.systemMode.deepWorkTargetMinutes ?? 45
      });

      const task = tasks.find((entry) => entry.id === taskId);
      const alreadyPlannedToday = items.some((item) => item.taskId === taskId && item.blockType === 'task');

      if (!alreadyPlannedToday) {
        const startedAt = new Date(session.startedAt ?? new Date().toISOString());
        const blockMinutes = Math.max(1, task?.estimatedMinutes ?? session.targetMinutes ?? 45);
        const endAt = new Date(startedAt.getTime() + blockMinutes * 60000);

        try {
          await api.createDayPlanItem(date, {
            taskId,
            blockType: 'task',
            startTime: startedAt.toISOString(),
            endTime: endAt.toISOString()
          });
        } catch {
          // Keep Deep Work start resilient even if the agenda block cannot be created due to overlap rules.
        }
      }

      await api.updateTask(taskId, {
        status: 'andamento',
        horizon: 'active'
      });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function registerDeepWorkInterruption() {
    if (!activeDeepWork) {
      return;
    }

    try {
      setBusy(true);
      await api.registerDeepWorkInterruption(activeDeepWork.id);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stopDeepWork(switchedTask: boolean) {
    if (!activeDeepWork) {
      return;
    }

    try {
      setBusy(true);
      await api.stopDeepWork(activeDeepWork.id, {
        switchedTask,
        notes: switchedTask
          ? 'Sessão encerrada por troca de tarefa.'
          : 'Sessão encerrada manualmente.'
      });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyCapacitySuggestion() {
    if (!capacityInsight || capacityInsight.mode === 'balanced' || capacityInsight.suggestions.length === 0) {
      return;
    }

    try {
      setBusy(true);

      if (capacityInsight.mode === 'overload') {
        await Promise.all(
          capacityInsight.suggestions.map(async (suggestion) => {
            if (suggestion.itemId) {
              await api.deleteDayPlanItem(suggestion.itemId);
            }
            await api.updateTask(suggestion.taskId, {
              status: 'backlog'
            });
          })
        );
      } else {
        await Promise.all(
          capacityInsight.suggestions.map((suggestion) =>
            api.updateTask(suggestion.taskId, {
              status: 'hoje',
              horizon: 'active'
            })
          )
        );
      }

      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Total planned = tasks scheduled in day plan + active commitment blocks
  const totalPlannedMinutes = briefing
    ? briefing.capacity.plannedTaskMinutes + commitmentMinutes
    : 0;

  const capacityPct = briefing
    ? Math.min(100, Math.round((totalPlannedMinutes / Math.max(1, briefing.capacity.availableMinutes)) * 100))
    : 0;

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          title={isToday ? 'Hoje' : formattedAgendaDate}
          subtitle={`Contexto: ${workspaceName}`}
        />
        <div className="premium-card hoje-hero">
          <SkeletonBlock height={6} />
          <SkeletonBlock height={32} />
        </div>
        <section className="premium-grid two-wide">
          <PremiumCard title="Agenda">
            <SkeletonBlock lines={10} />
          </PremiumCard>
          <PremiumCard title="Pool de execução">
            <SkeletonBlock lines={10} />
          </PremiumCard>
        </section>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PremiumHeader
        title={isToday ? 'Hoje' : formattedAgendaDate}
        subtitle={`Contexto: ${workspaceName}`}
        actions={
          <div className="inline-actions">
            <button
              type="button"
              className={strictMode ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => setStrictMode((current) => !current)}
              title={strictMode ? 'Modo estrito ativo: bloqueia B/C enquanto há prioridades pendentes' : 'Modo estrito desativado: liberdade total de execução'}
            >
              {strictMode ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={newTaskLimitReached}
              onClick={() => setCreateTaskOpen(true)}
            >
              + Tarefa
              {createdTodayCount >= maxNewTasksPerDay - 1 && (
                <span className="hoje-task-limit-badge">{createdTodayCount}/{maxNewTasksPerDay}</span>
              )}
            </button>
          </div>
        }
      />

      {/* Date navigation — topo */}
      <nav className="hoje-date-nav">
        <button type="button" className="ghost-button" onClick={() => setDate(addDays(date, -1))}>
          ← Ontem
        </button>
        <button
          type="button"
          className={isToday ? 'ghost-button task-filter active' : 'ghost-button'}
          onClick={() => setDate(todayIsoDate())}
        >
          Hoje
        </button>
        <button type="button" className="ghost-button" onClick={() => setDate(addDays(date, 1))}>
          Amanhã →
        </button>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="hoje-date-input"
        />
      </nav>

      {error && <p className="surface-error">{error}</p>}

      {/* Hero: capacity + top3 + alerts + active deep work */}
      <div className="premium-card hoje-hero">
        {/* Capacity bar */}
        {briefing && (
          <div className="hoje-hero-capacity">
            <div className="hoje-hero-capacity-head">
              <span>Capacidade do dia</span>
              {totalPlannedMinutes > 0 ? (
                <strong>
                  {Math.floor(totalPlannedMinutes / 60)}h{totalPlannedMinutes % 60 > 0 ? ` ${totalPlannedMinutes % 60}min` : ''} de {Math.floor(briefing.capacity.availableMinutes / 60)}h disponíveis
                  {commitmentMinutes > 0 && briefing.capacity.plannedTaskMinutes > 0 && (
                    <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.75rem', marginLeft: 6 }}>
                      ({Math.floor(briefing.capacity.plannedTaskMinutes / 60)}h tarefas + {commitmentMinutes >= 60 ? `${Math.floor(commitmentMinutes / 60)}h` : `${commitmentMinutes}min`} compromissos)
                    </span>
                  )}
                  {commitmentMinutes > 0 && briefing.capacity.plannedTaskMinutes === 0 && (
                    <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.75rem', marginLeft: 6 }}>
                      (só compromissos)
                    </span>
                  )}
                </strong>
              ) : (
                <span className="hoje-capacity-empty">Nenhuma tarefa agendada ainda</span>
              )}
            </div>
            {totalPlannedMinutes > 0 && (
              <div className="score-hero-bar-track">
                <div className="score-hero-bar-fill" style={{ width: `${capacityPct}%` }} />
              </div>
            )}
            {(briefing.capacity.isUnrealistic || totalPlannedMinutes > briefing.capacity.availableMinutes) && (
              <p className="surface-error" style={{ marginTop: 6, fontSize: '0.8rem' }}>
                Excedeu capacidade em {totalPlannedMinutes - briefing.capacity.availableMinutes} min.
              </p>
            )}
          </div>
        )}

        {/* Top 3 inline */}
        <div className="hoje-hero-top3">
          {briefing && !briefing.top3Meta.locked && (
            <div className="hoje-top3-edit">
              <small>Escolha até {focusLimit} prioridades do dia</small>
              <div className="hoje-top3-candidates">
                {topFocusCandidates.slice(0, 8).map((task) => {
                  const selected = top3DraftIds.includes(task.id);
                  return (
                    <label
                      key={task.id}
                      className={`hoje-top3-checkbox-item ${selected ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={busy || (!selected && top3DraftIds.length >= Math.max(1, focusLimit))}
                        onChange={() => toggleTop3Draft(task.id)}
                      />
                      <span>{task.title}</span>
                    </label>
                  );
                })}
              </div>
              {top3DraftIds.length > 0 && (
                <div className="inline-actions">
                  <button type="button" disabled={busy} onClick={commitTop3Draft}>
                    Confirmar plano
                  </button>
                </div>
              )}
            </div>
          )}
          {topFocusTasks.length > 0 && (
            <ul className="hoje-top3-list">
              {topFocusTasks.map((task, index) => (
                <li key={task.id} className={`hoje-top3-item ${task.status === 'feito' ? 'done' : ''}`}>
                  <span className="hoje-top3-dot">{task.status === 'feito' ? '✓' : index + 1}</span>
                  <span className="hoje-top3-label">{task.title}</span>
                  {task.status !== 'feito' && (
                    <div className="inline-actions hoje-top3-actions">
                      <button type="button" className="ghost-button" disabled={busy} onClick={() => startDeepWork(task.id)}>
                        Iniciar
                      </button>
                      <button type="button" className="ghost-button" disabled={busy} onClick={() => requestTaskCompletion(task.id)}>
                        Concluir
                      </button>
                    </div>
                  )}
                  {briefing?.top3Meta.locked && index === 0 && (
                    <button type="button" className="hoje-top3-adjust-link" disabled={busy} onClick={unlockTop3}>
                      Ajustar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!topFocusTasks.length && briefing?.top3Meta.locked && (
            <p className="premium-empty">Sem prioridades configuradas. <button type="button" className="text-button" onClick={unlockTop3}>Configurar</button></p>
          )}
        </div>

        {/* Max 2 focus alerts */}
        {focusAlerts.slice(0, 2).map((alert, index) => (
          <p key={`${index}-${alert}`} className="hoje-hero-alert">{alert}</p>
        ))}

        {/* Active deep work banner */}
        {activeDeepWork && (
          <div className="hoje-deep-work-banner">
            <div className="hoje-deep-work-banner-head">
              <span className="status-tag andamento">Deep Work ativo</span>
              <span className="hoje-deep-work-task">{activeDeepWork.task?.title}</span>
              <strong className="hoje-deep-work-timer">{formatDuration(deepWorkElapsedSeconds)}</strong>
            </div>
            <div className="score-hero-bar-track">
              <div className="score-hero-bar-fill" style={{ width: `${deepWorkProgressPercent}%`, background: 'linear-gradient(90deg, #5bb98c, #5bb98c)' }} />
            </div>
            <div className="inline-actions" style={{ marginTop: 8 }}>
              <button type="button" className="success-button" disabled={busy} onClick={() => requestTaskCompletion(activeDeepWork.taskId)}>
                Concluir + encerrar
              </button>
              <button type="button" className="warning-button" disabled={busy} onClick={registerDeepWorkInterruption}>
                Interrupção
              </button>
              <button type="button" className="ghost-button" disabled={busy} onClick={() => stopDeepWork(false)}>
                Encerrar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main: Timeline + Pool */}
      <section className="premium-grid two-wide">
        <PremiumCard
          title="Agenda"
          subtitle={`${formattedAgendaDate} · arraste tarefas para blocos de tempo`}
          className="scheduler-card"
        >
          <SchedulerGrid
            date={date}
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
            onItemDoubleClick={openBlockEditor}
            onDropPayload={onDropPayload}
            onItemDragStart={handleItemDragStart}
            startHour={7}
            endHour={20}
            commitmentBlocks={schedulerCommitmentBlocks}
          />
        </PremiumCard>

        <div className="hoje-right-col">
          {/* Commitments strip */}
          {todayCommitments.length > 0 && (
            <div className="hoje-commitments-strip">
              {todayCommitments.map(c => (
                <div key={c.id} className="hoje-commitment-chip">
                  <span className="hoje-commitment-chip-dot" />
                  <span className="hoje-commitment-chip-title">{c.title}</span>
                  {c.startTime && <span className="hoje-commitment-chip-time">{c.startTime}</span>}
                </div>
              ))}
            </div>
          )}

          <PremiumCard title="Pool de execução" subtitle={`${taskPool.length} tarefas disponíveis`}>
            <div className="task-list-filters pool-filter-row">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa" />
              <select value={horizonFilter} onChange={(event) => setHorizonFilter(event.target.value as 'all' | TaskHorizon)}>
                <option value="all">Todos horizontes</option>
                <option value="active">Ativo</option>
                <option value="future">Futuro</option>
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | '4' | '5')}>
                <option value="all">Todas prioridades</option>
                <option value="4">P4+</option>
                <option value="5">P5</option>
              </select>
            </div>

            {taskPool.length === 0 ? (
              <EmptyState
                title="Pool vazio"
                description="Remova filtros ou crie uma tarefa para abastecer sua execução de hoje."
                actionLabel="Limpar filtros"
                onAction={() => { setSearch(''); setHorizonFilter('all'); setPriorityFilter('all'); }}
              />
            ) : (
              <ul className="premium-list dense draggable-list">
                {taskPool.map((task) => (
                  <li key={task.id} draggable onDragStart={(event) => handleTaskDragStart(event, task.id)}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        <span className="hoje-pool-type-badge">{(task.taskType ?? 'b').toUpperCase()}</span>
                        {task.estimatedMinutes ? ` · ${task.estimatedMinutes}min` : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || (strictMode && task.taskType !== 'a' && (briefing?.pendingA ?? 0) > 0)}
                      onClick={() => requestTaskCompletion(task.id)}
                    >
                      Concluir
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {capacityInsight && capacityInsight.mode !== 'balanced' && (
              <div className="hoje-capacity-callout">
                <div className="hoje-capacity-callout-head">
                  <span>
                    {capacityInsight.mode === 'overload'
                      ? `Sobrecarregado em ${Math.abs(capacityInsight.deltaMinutes)} min`
                      : `${capacityInsight.deltaMinutes} min de folga disponível`}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busy || capacityInsight.suggestions.length === 0}
                  onClick={applyCapacitySuggestion}
                >
                  {capacityInsight.mode === 'overload' ? 'Cortar plano' : 'Puxar sugestões'}
                </button>
              </div>
            )}

            <div className="hoje-pool-stats">
              <span>Deep Work {deepWorkSummary?.totalMinutes ?? 0}min</span>
              <span>·</span>
              <span>{deepWorkSummary?.completedCount ?? 0} sessões</span>
              <span>·</span>
              <span>{deepWorkSummary?.totalInterruptions ?? 0} interrupções</span>
            </div>

            {doneTasks.length > 0 && (
              <>
                <hr className="surface-divider" />
                <div className="section-title">
                  <h4>Concluídas hoje</h4>
                  <small>{doneTasks.length}</small>
                </div>
                <ul className="premium-list dense">
                  {doneTasks.map((task) => (
                    <li key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <small>P{task.priority}</small>
                      </div>
                      <span className="status-tag feito">feito</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </PremiumCard>
        </div>
      </section>

      <Modal open={createTaskOpen} onClose={() => setCreateTaskOpen(false)} title="Nova tarefa" subtitle="Criar no contexto atual">
        <form onSubmit={createTask} className="modal-form">
          <label>
            Título
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Ex: Revisar proposta comercial"
              required
            />
          </label>

          <label>
            Definição de pronto
            <input
              value={newTaskDefinitionOfDone}
              onChange={(event) => setNewTaskDefinitionOfDone(event.target.value)}
              placeholder="Quando esta tarefa estará finalizada de verdade?"
              required
            />
          </label>

          <div className="row-2">
            <label>
              Tipo
              <select
                value={newTaskType}
                onChange={(event) => {
                  const nextType = event.target.value as TaskType;
                  setNewTaskType(nextType);
                  setNewTaskPriority(suggestedPriorityFromTaskType(nextType));
                }}
              >
                <option value="a">A - Alto impacto</option>
                <option value="b">B - Importante</option>
                <option value="c">C - Conveniência</option>
              </select>
            </label>

            <label>
              Tempo estimado (min)
              <input
                type="number"
                min={1}
                step={1}
                value={newTaskEstimatedMinutes}
                onChange={(event) => setNewTaskEstimatedMinutes(event.target.value)}
              />
            </label>
          </div>
          <p className="premium-empty">
            Tipo define impacto ({newTaskType.toUpperCase()}) e prioridade define urgência. Sugestão: P
            {suggestedPriorityFromTaskType(newTaskType)}.
          </p>

          <div className="row-2">
            <label>
              Energia
              <select value={newTaskEnergy} onChange={(event) => setNewTaskEnergy(event.target.value as TaskEnergy)}>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </label>
            <label>
              Natureza
              <select
                value={newTaskExecutionKind}
                onChange={(event) => setNewTaskExecutionKind(event.target.value as TaskExecutionKind)}
              >
                <option value="construcao" disabled={activeWorkspaceMode === 'manutencao'}>
                  Construção
                </option>
                <option value="otimizacao" disabled={activeWorkspaceMode === 'manutencao'}>
                  Otimização
                </option>
                <option value="operacao">Operação</option>
                <option value="suporte">Suporte</option>
              </select>
            </label>
          </div>

          {activeWorkspaceMode === 'manutencao' && (
            <p className="premium-empty">
              Frente em manutenção: criação de tarefa no dia fica restrita a operação/suporte.
            </p>
          )}
          {activeWorkspaceMode === 'standby' && (
            <p className="premium-empty">
              Frente em standby: prefira apenas captura em backlog até reativar o modo.
            </p>
          )}
          {evolution && (
            <p className={newTaskLimitReached ? 'surface-error' : 'premium-empty'}>
              Limite de criação diário para o estágio {evolution.stage.label}:{' '}
              {createdTodayCount}/{maxNewTasksPerDay}.
            </p>
          )}

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
              <select value={newTaskHorizon} onChange={(event) => setNewTaskHorizon(event.target.value as TaskHorizon)}>
                <option value="active">Ativo</option>
                <option value="future">Futuro</option>
              </select>
            </label>
          </div>

          <label>
            Data limite (opcional)
            <input
              type="date"
              value={newTaskDueDate}
              onChange={(event) => setNewTaskDueDate(event.target.value)}
            />
          </label>

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
        title="Editar bloco"
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
                Salvar
              </button>
              <button type="button" className="ghost-button" onClick={removeBlock} disabled={busy}>
                Remover
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

            <label>
              Motivo (quando adia ou não conclui)
              <select
                value={failureReason}
                onChange={(event) => setFailureReason(event.target.value as FailureReason)}
              >
                <option value="energia">Energia</option>
                <option value="medo">Medo</option>
                <option value="distracao">Distração</option>
                <option value="dependencia">Dependência</option>
                <option value="falta_clareza">Falta de clareza</option>
                <option value="falta_habilidade">Falta de habilidade</option>
              </select>
            </label>
          </form>
        ) : (
          <EmptyState
            title="Nenhum bloco selecionado"
            description="Escolha um bloco na agenda para editar horário, remover ou confirmar."
            actionLabel="Fechar editor"
            onAction={() => setBlockEditorOpen(false)}
          />
        )}
      </Modal>

      <TaskCompletionModal
        open={Boolean(completionTask)}
        taskTitle={completionTask?.title ?? 'Tarefa'}
        busy={busy}
        onClose={() => setCompletionTaskId('')}
        onConfirm={(input) => confirmTaskCompletion(input)}
      />
    </PremiumPage>
  );
}
