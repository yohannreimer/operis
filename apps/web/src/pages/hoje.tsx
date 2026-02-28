import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import {
  api,
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
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock, TabSwitch } from '../components/premium-ui';
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

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const STRICT_MODE_STORAGE_KEY = 'execution-os.strict-mode';

function readStrictModePreference() {
  try {
    return window.localStorage.getItem(STRICT_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
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

type HojeSection = 'foco' | 'agenda';

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

export function HojePage() {
  const date = useMemo(() => todayIsoDate(), []);
  const { activeWorkspaceId, workspaces } = useShellContext();
  const workspaceId = workspaceQuery(activeWorkspaceId);

  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
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
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDefinitionOfDone, setNewTaskDefinitionOfDone] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('a');
  const [newTaskEnergy, setNewTaskEnergy] = useState<TaskEnergy>('alta');
  const [newTaskExecutionKind, setNewTaskExecutionKind] = useState<TaskExecutionKind>('construcao');
  const [newTaskEstimatedMinutes, setNewTaskEstimatedMinutes] = useState('60');
  const [newTaskPriority, setNewTaskPriority] = useState(3);
  const [newTaskHorizon, setNewTaskHorizon] = useState<TaskHorizon>('active');
  const [hojeSection, setHojeSection] = useState<HojeSection>('foco');
  const [top3DraftIds, setTop3DraftIds] = useState<string[]>([]);
  const [top3Note, setTop3Note] = useState('');

  const [strictMode, setStrictMode] = useState(() => readStrictModePreference());
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspaceName =
    activeWorkspaceId === 'all'
      ? 'Geral'
      : workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? 'Frente';
  const activeWorkspaceMode =
    activeWorkspaceId === 'all'
      ? undefined
      : workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.mode;

  useEffect(() => {
    if (activeWorkspaceMode === 'manutencao' && newTaskExecutionKind === 'construcao') {
      setNewTaskExecutionKind('operacao');
    }
  }, [activeWorkspaceMode, newTaskExecutionKind]);

  async function load() {
    try {
      setError(null);
      const [nextDayPlan, taskList, nextBriefing, nextDeepSummary, nextActiveDeepWork, nextEvolution] = await Promise.all([
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
        })
      ]);

      setDayPlan(nextDayPlan);
      setTasks(taskList.filter((task) => task.status !== 'arquivado'));
      setBriefing(nextBriefing);
      setDeepWorkSummary(nextDeepSummary);
      setActiveDeepWork(nextActiveDeepWork);
      setEvolution(nextEvolution);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    load();
  }, [activeWorkspaceId, strictMode]);

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

  const items = dayPlan?.items ?? [];
  const plannedTaskIds = new Set(items.map((item) => item.taskId).filter(Boolean));

  const doneTasks = tasks.filter((task) => task.status === 'feito');
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
  const explainablePressureRules = (evolution?.explainableRules ?? [])
    .filter((rule) => rule.status !== 'ok')
    .slice(0, 3);
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
      alerts.push(`${briefing.alerts.maintenanceConstructionCount} tarefa(s) de construção em frente de manutenção.`);
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

    const deltaMinutes = briefing.capacity.availableMinutes - briefing.capacity.plannedTaskMinutes;

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
            (left.executionKind === 'construcao' ? 28 : 0) +
            dueUrgencyWeight(left.dueDate) * 26;
          const rightScore =
            taskTypeWeight(right.taskType) * 120 +
            right.priority * 14 +
            (right.executionKind === 'construcao' ? 28 : 0) +
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
  }, [briefing, plannedTaskBlocks, taskPool]);

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
        horizon: newTaskHorizon
      });
      setCreateTaskOpen(false);
      setNewTaskTitle('');
      setNewTaskDefinitionOfDone('');
      setNewTaskType('a');
      setNewTaskEnergy('alta');
      setNewTaskExecutionKind('construcao');
      setNewTaskEstimatedMinutes('60');
      setNewTaskPriority(3);
      setNewTaskHorizon('active');
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

  async function completeTask(taskId: string) {
    try {
      setBusy(true);
      await api.completeTask(taskId, { strictMode });
      if (activeDeepWork?.taskId === taskId && activeDeepWork.state === 'active') {
        await api.stopDeepWork(activeDeepWork.id, {
          switchedTask: false,
          notes: 'Finalizada junto com conclusão da tarefa.'
        });
      }
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startDeepWork(taskId: string) {
    try {
      setBusy(true);
      await api.startDeepWork({
        taskId,
        targetMinutes: evolution?.systemMode.deepWorkTargetMinutes ?? 45
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

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Operação do dia"
          title="Hoje"
          subtitle={`Contexto: ${workspaceName}`}
        />
        <section className="premium-grid two-wide">
          <PremiumCard title={`Agenda ${date}`}>
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
        eyebrow="Operação do dia"
        title="Hoje"
        subtitle={`Contexto: ${workspaceName}`}
        actions={
          <div className="inline-actions">
            <button
              type="button"
              className={strictMode ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => setStrictMode((current) => !current)}
            >
              Modo rígido {strictMode ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={newTaskLimitReached}
              onClick={() => setCreateTaskOpen(true)}
            >
              Nova tarefa ({createdTodayCount}/{maxNewTasksPerDay})
            </button>
          </div>
        }
      />

      {error && <p className="surface-error">{error}</p>}
      <PremiumCard title="Visão do dia">
        <TabSwitch
          value={hojeSection}
          onChange={setHojeSection}
          options={[
            { value: 'foco', label: 'Foco e Deep Work' },
            { value: 'agenda', label: 'Agenda + Pool' }
          ]}
        />
      </PremiumCard>

      {hojeSection === 'foco' && (
        <section className="premium-grid two">
          <PremiumCard title={`Top ${focusLimit} do dia`} subtitle="foco dominante com menor ruído">
            {evolution && (
              <p className="premium-empty">
                Nível {evolution.stage.label} • regra {evolution.systemMode.enforcement} • criação {createdTodayCount}/{maxNewTasksPerDay}
              </p>
            )}
            {briefing && (
              <div className="capacity-insight-panel">
                <div className="capacity-insight-head">
                  <strong>
                    {briefing.top3Meta.locked ? `Top ${focusLimit} confirmado` : `Top ${focusLimit} em edição`}
                  </strong>
                  <small>
                    {briefing.top3Meta.locked
                      ? briefing.top3Meta.committedAt
                        ? `confirmado em ${new Date(briefing.top3Meta.committedAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}`
                        : 'confirmado manualmente'
                      : 'selecione as tarefas A de maior impacto e confirme'}
                  </small>
                </div>
                {briefing.top3Meta.locked ? (
                  <div className="inline-actions">
                    <span className="status-tag feito">Compromisso travado</span>
                    <button type="button" className="ghost-button" disabled={busy} onClick={unlockTop3}>
                      Destravar para trocar
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="inline-actions task-mode-tabs">
                      {topFocusCandidates.slice(0, 8).map((task) => (
                        <button
                          key={`top3-candidate-${task.id}`}
                          type="button"
                          className={top3DraftIds.includes(task.id) ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                          disabled={busy || (!top3DraftIds.includes(task.id) && top3DraftIds.length >= Math.max(1, focusLimit))}
                          onClick={() => toggleTop3Draft(task.id)}
                          title={task.title}
                        >
                          {task.title}
                        </button>
                      ))}
                    </div>
                    <input
                      value={top3Note}
                      onChange={(event) => setTop3Note(event.target.value)}
                      placeholder="Nota opcional do compromisso de hoje"
                      maxLength={180}
                    />
                    <div className="inline-actions">
                      <button type="button" disabled={busy || top3DraftIds.length === 0} onClick={commitTop3Draft}>
                        Confirmar Top {top3DraftIds.length}
                      </button>
                    </div>
                  </>
                )}
                {briefing.top3Meta.locked && briefing.top3Meta.guidedSwapNeeded && (
                  <div className="capacity-insight-panel">
                    <div className="capacity-insight-head">
                      <strong>Troca guiada recomendada</strong>
                      <small>{briefing.top3Meta.swapReason ?? 'Compromisso ficou desatualizado.'}</small>
                    </div>
                    <p className="capacity-insight-copy">
                      {briefing.top3Meta.missingSlots > 0
                        ? `${briefing.top3Meta.missingSlots} vaga(s) do Top ${focusLimit} sem tarefa elegível confirmada.`
                        : `${briefing.top3Meta.droppedTaskIds.length} tarefa(s) do compromisso original saiu(ram) de elegibilidade.`}
                    </p>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busy || briefing.top3Meta.swapTaskIds.length === 0}
                        onClick={applyGuidedTop3Swap}
                      >
                        Aplicar troca guiada
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {focusAlerts.length > 0 && (
              <ul className="premium-list dense compact-alert-list">
                {focusAlerts.map((alert, index) => (
                  <li key={`${index}-${alert}`}>
                    <div>
                      <small>{alert}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {explainablePressureRules.length > 0 && (
              <details className="evolution-inline-details">
                <summary>Regras acionadas ({explainablePressureRules.length})</summary>
                <ul className="evolution-rule-list">
                  {explainablePressureRules.map((rule) => (
                    <li key={rule.id} className={`evolution-rule-item status-${rule.status}`}>
                      <div className="evolution-rule-head">
                        <strong>{rule.title}</strong>
                        <span className="priority-chip">
                          Peso {rule.weight} • Impacto {rule.impact}
                        </span>
                      </div>
                      <small>
                        Atual {rule.current}
                        {rule.unit} • Meta {rule.operator === 'gte' ? '>=' : '<='} {rule.target}
                        {rule.unit}
                      </small>
                      <small>Ação: {rule.recommendation}</small>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {!topFocusTasks.length ? (
              <EmptyState
                title="Sem foco automático"
                description="Crie tarefas do tipo A para o sistema montar o foco executivo."
              />
            ) : (
              <ul className="premium-list dense">
                {topFocusTasks.map((task, index) => (
                  <li key={task.id}>
                    <div>
                      <strong>
                        {index + 1}. {task.title}
                      </strong>
                      <small>
                        {task.workspace?.name ?? 'Sem frente'} • {task.project?.title ?? 'Sem projeto'}
                      </small>
                    </div>
                    <div className="inline-actions">
                      <span className={`priority-chip priority-${task.priority}`}>P{task.priority}</span>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={busy}
                        onClick={() => startDeepWork(task.id)}
                      >
                        Deep Work
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PremiumCard>

          <PremiumCard title="Capacidade + Deep Work" subtitle="minutos planejados vs minutos livres reais do dia">
            {briefing ? (
              <div className="premium-thermo">
                <div className="premium-thermo-head">
                  <span>Capacidade planejada</span>
                  <strong>
                    {briefing.capacity.plannedTaskMinutes} / {briefing.capacity.availableMinutes} min
                  </strong>
                </div>
                <small className="premium-empty">planejado em tarefas / capacidade livre calculada para hoje</small>
                <div className="meter-track">
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((briefing.capacity.plannedTaskMinutes / Math.max(1, briefing.capacity.availableMinutes)) * 100)
                      )}%`
                    }}
                  />
                </div>
                {briefing.capacity.isUnrealistic && (
                  <p className="surface-error">
                    Planejamento irreal: excedeu capacidade do dia em {briefing.capacity.overloadMinutes} min.
                  </p>
                )}
              </div>
            ) : (
              <SkeletonBlock lines={3} />
            )}

            {capacityInsight && (
              <div className="capacity-insight-panel">
                <div className="capacity-insight-head">
                  <strong>Rearranjo sugerido</strong>
                  <small>
                    {capacityInsight.deltaMinutes < 0
                      ? `Excesso de ${Math.abs(capacityInsight.deltaMinutes)} min`
                      : capacityInsight.deltaMinutes > 0
                        ? `Folga de ${capacityInsight.deltaMinutes} min`
                        : 'Plano equilibrado'}
                  </small>
                </div>

                {capacityInsight.mode === 'balanced' ? (
                  <p className="premium-empty">Capacidade e plano estão coerentes. Mantenha o foco do Top 3.</p>
                ) : (
                  <>
                    <p className="capacity-insight-copy">
                      {capacityInsight.mode === 'overload'
                        ? 'Sugestão automática para reduzir pressão e evitar planejamento irreal.'
                        : 'Sugestão automática para preencher capacidade livre com tarefas de maior impacto.'}
                    </p>
                    <ul className="capacity-suggestion-list">
                      {capacityInsight.suggestions.map((suggestion) => (
                        <li key={`${suggestion.taskId}-${suggestion.itemId ?? 'pool'}`}>
                          <span>{suggestion.title}</span>
                          <small>{suggestion.minutes} min • {suggestion.reason}</small>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="ghost-button capacity-apply-action"
                      disabled={busy || capacityInsight.suggestions.length === 0}
                      onClick={applyCapacitySuggestion}
                    >
                      {capacityInsight.mode === 'overload'
                        ? 'Aplicar corte automático no plano'
                        : 'Puxar sugestões para hoje'}
                    </button>
                  </>
                )}
              </div>
            )}

            <ul className="premium-kv-list compact">
              <li>
                <span>Deep Work hoje</span>
                <strong>{deepWorkSummary?.totalMinutes ?? 0} min</strong>
              </li>
              <li>
                <span>Sessões concluídas</span>
                <strong>{deepWorkSummary?.completedCount ?? 0}</strong>
              </li>
              <li>
                <span>Interrupções</span>
                <strong>{deepWorkSummary?.totalInterruptions ?? 0}</strong>
              </li>
            </ul>

            {activeDeepWork ? (
              <div className="deep-work-live">
                <div className="deep-work-live-head">
                  <span className="status-tag andamento">Em Deep Work: {activeDeepWork.task?.title}</span>
                  <strong>{formatDuration(deepWorkElapsedSeconds)}</strong>
                </div>
                <div className="meter-track">
                  <div style={{ width: `${deepWorkProgressPercent}%` }} />
                </div>
                <small>
                  {deepWorkElapsedSeconds >= deepWorkTargetSeconds
                    ? `Meta mínima de ${activeDeepWork.targetMinutes} min atingida`
                    : `Meta mínima: ${activeDeepWork.targetMinutes} min`}
                </small>
                <div className="inline-actions">
                  <button type="button" className="warning-button" disabled={busy} onClick={registerDeepWorkInterruption}>
                    Interrupção
                  </button>
                  <button type="button" className="ghost-button" disabled={busy} onClick={() => stopDeepWork(false)}>
                    Encerrar
                  </button>
                  <button type="button" className="text-button" disabled={busy} onClick={() => stopDeepWork(true)}>
                    Quebrar foco
                  </button>
                </div>
              </div>
            ) : (
              <p className="premium-empty">Nenhuma sessão ativa no momento.</p>
            )}
          </PremiumCard>
        </section>
      )}

      {hojeSection === 'agenda' && (
        <section className="premium-grid two-wide">
          <PremiumCard title={`Agenda ${date}`} subtitle="arraste tarefas para blocos de tempo" className="scheduler-card">
            <SchedulerGrid
              date={date}
              items={items}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              onItemDoubleClick={openBlockEditor}
              onDropPayload={onDropPayload}
              onItemDragStart={handleItemDragStart}
            />
          </PremiumCard>

          <PremiumCard title="Pool de execução" subtitle={`${taskPool.length} tarefas disponíveis`}>
            <div className="task-list-filters pool-filter-row">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa" />
              <select
                value={horizonFilter}
                onChange={(event) => setHorizonFilter(event.target.value as 'all' | TaskHorizon)}
              >
                <option value="all">Todos horizontes</option>
                <option value="active">Ativo</option>
                <option value="future">Futuro</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as 'all' | '4' | '5')}
              >
                <option value="all">Todas prioridades</option>
                <option value="4">Prioridade 4+</option>
                <option value="5">Prioridade 5</option>
              </select>
            </div>

            {taskPool.length === 0 ? (
              <EmptyState
                title="Pool vazio para os filtros atuais"
                description="Remova filtros ou crie uma tarefa para abastecer sua execução de hoje."
                actionLabel="Limpar filtros"
                onAction={() => {
                  setSearch('');
                  setHorizonFilter('all');
                  setPriorityFilter('all');
                }}
              />
            ) : (
              <ul className="premium-list dense draggable-list">
                {taskPool.map((task) => (
                  <li key={task.id} draggable onDragStart={(event) => handleTaskDragStart(event, task.id)}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        tipo {(task.taskType ?? 'b').toUpperCase()} • prioridade {task.priority} •{' '}
                        {horizonLabel(task.horizon)}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || (strictMode && task.taskType !== 'a' && (briefing?.pendingA ?? 0) > 0)}
                      onClick={() => completeTask(task.id)}
                    >
                      Concluir
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <hr className="surface-divider" />

            <div className="section-title">
              <h4>Concluídas hoje</h4>
              <small>{doneTasks.length}</small>
            </div>

            {doneTasks.length === 0 ? (
              <EmptyState
                title="Ainda sem concluídas hoje"
                description="Conclua itens no pool para alimentar seu ritmo diário e score."
              />
            ) : (
              <ul className="premium-list dense">
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
          </PremiumCard>
        </section>
      )}

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
              <select value={newTaskType} onChange={(event) => setNewTaskType(event.target.value as TaskType)}>
                <option value="a">A - Alto impacto</option>
                <option value="b">B - Importante</option>
                <option value="c">C - Conveniência</option>
              </select>
            </label>

            <label>
              Tempo estimado (min)
              <input
                type="number"
                min={15}
                step={5}
                value={newTaskEstimatedMinutes}
                onChange={(event) => setNewTaskEstimatedMinutes(event.target.value)}
              />
            </label>
          </div>

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
                <option value="operacao">Operação</option>
              </select>
            </label>
          </div>

          {activeWorkspaceMode === 'manutencao' && (
            <p className="premium-empty">
              Frente em manutenção: criação de tarefa no dia fica restrita a operação.
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
    </PremiumPage>
  );
}
