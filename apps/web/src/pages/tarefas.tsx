import { FormEvent, useEffect, useMemo, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import {
  api,
  InboxItem,
  Project,
  Subtask,
  Task,
  TaskRestriction,
  TaskMultiBlockProgress,
  TaskEnergy,
  TaskExecutionKind,
  TaskHistoryEntry,
  TaskHorizon,
  WaitingFollowupRadar,
  TaskStatus,
  TaskType,
  WaitingType,
  WaitingPriority,
  Workspace
} from '../api';
import { Modal } from '../components/modal';
import {
  EmptyState,
  MetricCard,
  PremiumCard,
  PremiumHeader,
  PremiumPage,
  SkeletonBlock
} from '../components/premium-ui';
import { useShellContext } from '../components/shell-context';
import { TaskIntelligenceTable } from '../components/task-intelligence-table';
import { workspaceQuery } from '../utils/workspace';

type TaskView = 'open' | 'done' | 'all' | 'restricted';
type TaskPanel = 'tasks' | 'inbox';
type DetailTab = 'overview' | 'checklist' | 'restrictions' | 'history';
type TaskListMode = 'list' | 'table';

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
  const parsed = new Date(value);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toStableIsoFromDateInput(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

function historyTypeLabel(type: TaskHistoryEntry['type']) {
  if (type === 'created') {
    return 'criada';
  }
  if (type === 'scheduled') {
    return 'planejada';
  }
  if (type === 'completed') {
    return 'concluída';
  }
  if (type === 'postponed') {
    return 'adiada';
  }
  if (type === 'not_confirmed') {
    return 'não confirmada';
  }
  if (type === 'updated') {
    return 'atualizada';
  }
  if (type === 'whatsapp_in') {
    return 'whatsapp in';
  }
  return 'whatsapp out';
}

function priorityAlias(priority: number) {
  if (priority >= 5) {
    return 'Crítica';
  }
  if (priority === 4) {
    return 'Alta';
  }
  if (priority === 3) {
    return 'Média';
  }
  if (priority === 2) {
    return 'Baixa';
  }
  return 'Base';
}

function taskTypeLabel(type: TaskType) {
  if (type === 'a') {
    return 'A';
  }
  if (type === 'b') {
    return 'B';
  }
  return 'C';
}

function failureReasonLabel(value?: string) {
  if (!value) {
    return '';
  }

  const labels: Record<string, string> = {
    energia: 'Energia',
    medo: 'Medo',
    distracao: 'Distração',
    dependencia: 'Dependência',
    falta_clareza: 'Falta de clareza',
    falta_habilidade: 'Falta de habilidade'
  };

  return labels[value] ?? value;
}

function openRestrictionCount(task: Task) {
  return (task.restrictions ?? []).filter((restriction) => restriction.status === 'aberta').length;
}

function waitingRadarTone(state: WaitingFollowupRadar['rows'][number]['followupState']) {
  if (state === 'urgente') {
    return 'danger' as const;
  }
  if (state === 'hoje') {
    return 'warning' as const;
  }
  return 'default' as const;
}

export function TarefasPage() {
  const { activeWorkspaceId, workspaces: shellWorkspaces } = useShellContext();
  const scopedWorkspaceId = workspaceQuery(activeWorkspaceId);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusMode = searchParams.get('focus') === '1';
  const composeMode = searchParams.get('compose') === '1';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [waitingRadar, setWaitingRadar] = useState<WaitingFollowupRadar | null>(null);

  const [taskPanel, setTaskPanel] = useState<TaskPanel>('tasks');
  const [taskView, setTaskView] = useState<TaskView>('open');
  const [taskListMode, setTaskListMode] = useState<TaskListMode>('table');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [horizonFilter, setHorizonFilter] = useState<'all' | TaskHorizon>('all');
  const [selectedTaskId, setSelectedTaskId] = useState('');

  const [createTitle, setCreateTitle] = useState('');
  const [createDefinitionOfDone, setCreateDefinitionOfDone] = useState('');
  const [createPriority, setCreatePriority] = useState(3);
  const [createTaskType, setCreateTaskType] = useState<TaskType>('b');
  const [createEnergyLevel, setCreateEnergyLevel] = useState<TaskEnergy>('media');
  const [createExecutionKind, setCreateExecutionKind] = useState<TaskExecutionKind>('operacao');
  const [createHorizon, setCreateHorizon] = useState<TaskHorizon>('active');
  const [createEstimatedMinutes, setCreateEstimatedMinutes] = useState('60');
  const [createIsMultiBlock, setCreateIsMultiBlock] = useState(false);
  const [createMultiBlockGoalMinutes, setCreateMultiBlockGoalMinutes] = useState('');
  const [createWorkspaceId, setCreateWorkspaceId] = useState('');
  const [createProjectId, setCreateProjectId] = useState('');

  const [captureText, setCaptureText] = useState('');
  const [processingWorkspaceId, setProcessingWorkspaceId] = useState('');
  const [processingProjectId, setProcessingProjectId] = useState('');
  const [processingHorizon, setProcessingHorizon] = useState<TaskHorizon>('active');

  const [detailTitle, setDetailTitle] = useState('');
  const [detailDescription, setDetailDescription] = useState('');
  const [detailDefinitionOfDone, setDetailDefinitionOfDone] = useState('');
  const [detailWorkspaceId, setDetailWorkspaceId] = useState('');
  const [detailProjectId, setDetailProjectId] = useState('');
  const [detailStatus, setDetailStatus] = useState<TaskStatus>('backlog');
  const [detailTaskType, setDetailTaskType] = useState<TaskType>('b');
  const [detailEnergyLevel, setDetailEnergyLevel] = useState<TaskEnergy>('media');
  const [detailExecutionKind, setDetailExecutionKind] = useState<TaskExecutionKind>('operacao');
  const [detailPriority, setDetailPriority] = useState(3);
  const [detailHorizon, setDetailHorizon] = useState<TaskHorizon>('active');
  const [detailEstimatedMinutes, setDetailEstimatedMinutes] = useState('');
  const [detailIsMultiBlock, setDetailIsMultiBlock] = useState(false);
  const [detailMultiBlockGoalMinutes, setDetailMultiBlockGoalMinutes] = useState('');
  const [detailDueDate, setDetailDueDate] = useState('');
  const [detailWaitingOnPerson, setDetailWaitingOnPerson] = useState('');
  const [detailWaitingType, setDetailWaitingType] = useState<WaitingType>('resposta');
  const [detailWaitingPriority, setDetailWaitingPriority] = useState<WaitingPriority>('media');
  const [detailWaitingDueDate, setDetailWaitingDueDate] = useState('');
  const [restrictionDependsOnPerson, setRestrictionDependsOnPerson] = useState(false);

  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [taskRestrictions, setTaskRestrictions] = useState<TaskRestriction[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newRestrictionTitle, setNewRestrictionTitle] = useState('');
  const [newRestrictionDetail, setNewRestrictionDetail] = useState('');
  const [taskHistory, setTaskHistory] = useState<TaskHistoryEntry[]>([]);
  const [multiBlockProgress, setMultiBlockProgress] = useState<TaskMultiBlockProgress | null>(null);

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [taskData, inboxData, workspaceData, projectData, waitingRadarData] = await Promise.all([
        api.getTasks(scopedWorkspaceId ? { workspaceId: scopedWorkspaceId } : undefined),
        api.getInbox(),
        api.getWorkspaces(),
        api.getProjects(),
        api.getWaitingFollowupRadar(scopedWorkspaceId ? { workspaceId: scopedWorkspaceId } : undefined)
      ]);

      const visibleWorkspaces = workspaceData.filter((workspace) => workspace.type !== 'geral');
      const visibleWorkspaceIds = new Set(visibleWorkspaces.map((workspace) => workspace.id));

      const resolvedWorkspace =
        scopedWorkspaceId && visibleWorkspaceIds.has(scopedWorkspaceId)
          ? scopedWorkspaceId
          : visibleWorkspaces[0]?.id ?? '';

      const visibleTasks = taskData.filter((task) => task.status !== 'arquivado');

      setTasks(visibleTasks);
      setInboxItems(inboxData);
      setWorkspaces(visibleWorkspaces);
      setProjects(projectData.filter((project) => visibleWorkspaceIds.has(project.workspaceId)));
      setWaitingRadar(waitingRadarData);

      setCreateWorkspaceId((current) =>
        current && visibleWorkspaceIds.has(current) ? current : resolvedWorkspace
      );
      setProcessingWorkspaceId((current) =>
        current && visibleWorkspaceIds.has(current) ? current : resolvedWorkspace
      );

      const hasSelected = visibleTasks.some((task) => task.id === selectedTaskId);
      if (!hasSelected) {
        setSelectedTaskId(visibleTasks.find((task) => task.status !== 'feito')?.id ?? visibleTasks[0]?.id ?? '');
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    load();
  }, [activeWorkspaceId, shellWorkspaces.length]);

  useEffect(() => {
    if (!composeMode) {
      return;
    }
    if (taskPanel !== 'tasks') {
      setTaskPanel('tasks');
    }
  }, [composeMode, taskPanel]);

  useEffect(() => {
    if (!focusMode) {
      return;
    }

    if (taskPanel !== 'tasks') {
      setTaskPanel('tasks');
    }

    if (taskListMode !== 'table') {
      setTaskListMode('table');
    }
  }, [focusMode, taskPanel, taskListMode]);

  function setTaskFocusMode(enabled: boolean) {
    const next = new URLSearchParams(searchParams);

    if (enabled) {
      next.set('focus', '1');
    } else {
      next.delete('focus');
    }

    setSearchParams(next, { replace: true });
  }

  function setTaskComposeMode(enabled: boolean) {
    const next = new URLSearchParams(searchParams);

    if (enabled) {
      next.set('compose', '1');
    } else {
      next.delete('compose');
    }

    setSearchParams(next, { replace: true });
  }

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (taskView === 'open') {
          return task.status !== 'feito';
        }

        if (taskView === 'done') {
          return task.status === 'feito';
        }

        if (taskView === 'restricted') {
          return task.status !== 'feito' && openRestrictionCount(task) > 0;
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
          task.title.toLowerCase().includes(normalized) ||
          (task.description ?? '').toLowerCase().includes(normalized)
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

  const taskInsights = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((task) => task.status === 'feito').length;
    const inFlow = filteredTasks.filter((task) => task.status === 'hoje' || task.status === 'andamento').length;
    const waiting = filteredTasks.filter((task) => Boolean(task.waitingOnPerson?.trim()) && task.status !== 'feito').length;
    const restricted = filteredTasks.filter((task) => task.status !== 'feito' && openRestrictionCount(task) > 0).length;
    const openRestrictions = filteredTasks.reduce((sum, task) => sum + openRestrictionCount(task), 0);
    const overdue = filteredTasks.filter((task) => {
      if (!task.dueDate || task.status === 'feito') {
        return false;
      }
      return new Date(task.dueDate).getTime() < Date.now();
    }).length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const avgPriority = total
      ? (filteredTasks.reduce((sum, task) => sum + task.priority, 0) / total).toFixed(1)
      : '0.0';

    const statusOrder: TaskStatus[] = ['backlog', 'hoje', 'andamento', 'feito'];
    const statusLabels: Record<TaskStatus, string> = {
      backlog: 'Backlog',
      hoje: 'Hoje',
      andamento: 'Andamento',
      feito: 'Concluídas',
      arquivado: 'Arquivadas'
    };
    const statusBreakdown = statusOrder.map((status) => ({
      name: statusLabels[status],
      value: filteredTasks.filter((task) => task.status === status).length
    }));

    const priorityBreakdown = [1, 2, 3, 4, 5].map((priority) => ({
      name: `P${priority}`,
      value: filteredTasks.filter((task) => task.priority === priority).length
    }));

    return {
      total,
      completed,
      inFlow,
      waiting,
      restricted,
      openRestrictions,
      overdue,
      completionRate,
      avgPriority,
      statusBreakdown,
      priorityBreakdown
    };
  }, [filteredTasks]);

  const waitingTasks = waitingRadar?.rows ?? [];

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  function openTaskDetails(taskId: string, tab: DetailTab = 'overview') {
    setSelectedTaskId(taskId);
    setDetailTab(tab);
    setTaskDetailOpen(true);
  }

  useEffect(() => {
    if (!selectedTask) {
      setSubtasks([]);
      setTaskRestrictions([]);
      setTaskHistory([]);
      setMultiBlockProgress(null);
      setRestrictionDependsOnPerson(false);
      return;
    }

    setDetailTitle(selectedTask.title);
    setDetailDescription(selectedTask.description ?? '');
    setDetailDefinitionOfDone(selectedTask.definitionOfDone ?? '');
    setDetailWorkspaceId(selectedTask.workspaceId);
    setDetailProjectId(selectedTask.projectId ?? '');
    setDetailStatus(selectedTask.status);
    setDetailTaskType(selectedTask.taskType ?? 'b');
    setDetailEnergyLevel(selectedTask.energyLevel ?? 'media');
    setDetailExecutionKind(selectedTask.executionKind ?? 'operacao');
    setDetailPriority(selectedTask.priority);
    setDetailHorizon(selectedTask.horizon ?? 'active');
    setDetailEstimatedMinutes(selectedTask.estimatedMinutes ? String(selectedTask.estimatedMinutes) : '');
    setDetailIsMultiBlock(Boolean(selectedTask.isMultiBlock));
    setDetailMultiBlockGoalMinutes(
      selectedTask.multiBlockGoalMinutes ? String(selectedTask.multiBlockGoalMinutes) : ''
    );
    setDetailDueDate(toDateInput(selectedTask.dueDate));
    setDetailWaitingOnPerson(selectedTask.waitingOnPerson ?? '');
    setDetailWaitingType(selectedTask.waitingType ?? 'resposta');
    setDetailWaitingPriority(selectedTask.waitingPriority ?? 'media');
    setDetailWaitingDueDate(toDateInput(selectedTask.waitingDueDate));
    setRestrictionDependsOnPerson(Boolean(selectedTask.waitingOnPerson?.trim()));
  }, [selectedTask]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSubtasks([]);
      setTaskRestrictions([]);
      setTaskHistory([]);
      setMultiBlockProgress(null);
      return;
    }

    let cancelled = false;

    Promise.all([
      api.getTaskSubtasks(selectedTaskId),
      api.getTaskRestrictions(selectedTaskId),
      api.getTaskHistory(selectedTaskId),
      api.getTaskMultiBlockProgress(selectedTaskId)
    ])
      .then(([subtaskData, restrictionData, historyData, multiBlockData]) => {
        if (cancelled) {
          return;
        }

        setSubtasks(subtaskData);
        setTaskRestrictions(restrictionData);
        setTaskHistory(historyData);
        setMultiBlockProgress(multiBlockData);
      })
      .catch((requestError: Error) => {
        if (cancelled) {
          return;
        }

        setError(requestError.message);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  const createProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === createWorkspaceId),
    [projects, createWorkspaceId]
  );
  const createWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === createWorkspaceId) ?? null,
    [workspaces, createWorkspaceId]
  );
  const detailWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === detailWorkspaceId) ?? null,
    [workspaces, detailWorkspaceId]
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

  const completedSubtasks = subtasks.filter((subtask) => subtask.status === 'feito').length;
  const subtaskProgress = subtasks.length ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;
  const openRestrictions = taskRestrictions.filter((restriction) => restriction.status === 'aberta');
  const resolvedRestrictions = taskRestrictions.filter((restriction) => restriction.status === 'resolvida');

  useEffect(() => {
    if (createWorkspace?.mode === 'manutencao' && createExecutionKind === 'construcao') {
      setCreateExecutionKind('operacao');
    }
  }, [createWorkspace?.mode, createExecutionKind]);

  useEffect(() => {
    if (detailWorkspace?.mode === 'manutencao' && detailExecutionKind === 'construcao') {
      setDetailExecutionKind('operacao');
    }
    if (
      detailWorkspace?.mode === 'standby' &&
      (detailStatus === 'hoje' || detailStatus === 'andamento')
    ) {
      setDetailStatus('backlog');
    }
  }, [detailWorkspace?.mode, detailExecutionKind, detailStatus]);

  async function createTask(event: FormEvent) {
    event.preventDefault();

    if (!createWorkspaceId) {
      setError('Selecione uma frente para criar a tarefa.');
      return;
    }

    const estimatedMinutes = Number(createEstimatedMinutes);
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
      setError('Informe um tempo estimado válido.');
      return;
    }

    if (createIsMultiBlock && createMultiBlockGoalMinutes) {
      const goal = Number(createMultiBlockGoalMinutes);
      if (!Number.isFinite(goal) || goal <= 0) {
        setError('Informe uma meta de minutos válida para tarefa multiblock.');
        return;
      }
    }

    try {
      setBusy(true);
      await api.createTask({
        workspaceId: createWorkspaceId,
        projectId: createProjectId || null,
        title: createTitle,
        definitionOfDone: createDefinitionOfDone,
        taskType: createTaskType,
        energyLevel: createEnergyLevel,
        executionKind: createExecutionKind,
        estimatedMinutes,
        isMultiBlock: createIsMultiBlock,
        multiBlockGoalMinutes: createIsMultiBlock
          ? createMultiBlockGoalMinutes
            ? Number(createMultiBlockGoalMinutes)
            : estimatedMinutes
          : null,
        priority: createPriority,
        horizon: createHorizon
      });

      setCreateTitle('');
      setCreateDefinitionOfDone('');
      setCreateTaskType('b');
      setCreateEnergyLevel('media');
      setCreateExecutionKind('operacao');
      setCreateEstimatedMinutes('60');
      setCreateIsMultiBlock(false);
      setCreateMultiBlockGoalMinutes('');
      setCreatePriority(3);
      setCreateHorizon('active');
      setCreateProjectId('');
      setTaskComposeMode(false);
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

    if (detailIsMultiBlock && detailMultiBlockGoalMinutes) {
      const goal = Number(detailMultiBlockGoalMinutes);
      if (!Number.isFinite(goal) || goal <= 0) {
        setError('Meta de minutos inválida para tarefa multiblock.');
        return;
      }
    }

    try {
      setBusy(true);
      await api.updateTask(selectedTask.id, {
        title: detailTitle.trim(),
        description: detailDescription.trim() ? detailDescription : null,
        definitionOfDone: detailDefinitionOfDone.trim() ? detailDefinitionOfDone : null,
        workspaceId: detailWorkspaceId,
        projectId: detailProjectId || null,
        status: detailStatus,
        taskType: detailTaskType,
        energyLevel: detailEnergyLevel,
        executionKind: detailExecutionKind,
        priority: detailPriority,
        horizon: detailHorizon,
        estimatedMinutes: detailEstimatedMinutes ? Number(detailEstimatedMinutes) : null,
        isMultiBlock: detailIsMultiBlock,
        multiBlockGoalMinutes: detailIsMultiBlock
          ? detailMultiBlockGoalMinutes
            ? Number(detailMultiBlockGoalMinutes)
            : detailEstimatedMinutes
              ? Number(detailEstimatedMinutes)
              : null
          : null,
        dueDate: detailDueDate ? toStableIsoFromDateInput(detailDueDate) : null,
        waitingOnPerson: detailWaitingOnPerson.trim() ? detailWaitingOnPerson : null,
        waitingType: detailWaitingOnPerson.trim() ? detailWaitingType : null,
        waitingPriority: detailWaitingOnPerson.trim() ? detailWaitingPriority : null,
        waitingDueDate: detailWaitingOnPerson.trim()
          ? detailWaitingDueDate
            ? toStableIsoFromDateInput(detailWaitingDueDate)
            : null
          : null
      });

      await load();
      await refreshSelectedTaskContext(selectedTask.id);
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

      if (selectedTaskId === taskId) {
        await refreshSelectedTaskContext(taskId);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(taskId: string) {
    const target = tasks.find((task) => task.id === taskId);
    const shouldDelete = window.confirm(
      `Excluir a tarefa "${target?.title ?? 'selecionada'}"? Esta ação não pode ser desfeita.`
    );

    if (!shouldDelete) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteTask(taskId);
      if (selectedTaskId === taskId) {
        setTaskDetailOpen(false);
        setSelectedTaskId('');
      }
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearWaitingDependency(taskId: string) {
    try {
      setBusy(true);
      await api.updateTask(taskId, {
        waitingOnPerson: null,
        waitingType: null,
        waitingPriority: null,
        waitingDueDate: null
      });
      await load();
      if (selectedTaskId === taskId) {
        await refreshSelectedTaskContext(taskId);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function registerWaitingFollowup(entry: WaitingFollowupRadar['rows'][number]) {
    try {
      setBusy(true);
      await api.registerWaitingFollowup(entry.taskId, {
        source: 'manual',
        triggerQueue: false
      });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyWaitingFollowup(entry: WaitingFollowupRadar['rows'][number]) {
    const dueDate = entry.waitingDueDate ? new Date(entry.waitingDueDate).toLocaleDateString('pt-BR') : 'sem data';
    const message = `Follow-up: ${entry.waitingOnPerson} • ${entry.title} • prazo ${dueDate}.`;

    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Falha silenciosa de clipboard.
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
      setError('Selecione uma frente para processar itens.');
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

  async function refreshSelectedTaskContext(taskId: string) {
    const [subtaskData, restrictionData, historyData, multiBlockData] = await Promise.all([
      api.getTaskSubtasks(taskId),
      api.getTaskRestrictions(taskId),
      api.getTaskHistory(taskId),
      api.getTaskMultiBlockProgress(taskId)
    ]);

    setSubtasks(subtaskData);
    setTaskRestrictions(restrictionData);
    setTaskHistory(historyData);
    setMultiBlockProgress(multiBlockData);
  }

  async function createSubtask(event: FormEvent) {
    event.preventDefault();

    if (!selectedTask || !newSubtaskTitle.trim()) {
      return;
    }

    try {
      setBusy(true);
      await api.createTaskSubtask(selectedTask.id, newSubtaskTitle.trim());
      setNewSubtaskTitle('');
      await refreshSelectedTaskContext(selectedTask.id);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSubtask(subtask: Subtask) {
    try {
      setBusy(true);
      await api.updateTaskSubtask(subtask.id, {
        status: subtask.status === 'feito' ? 'backlog' : 'feito'
      });

      if (selectedTask) {
        await refreshSelectedTaskContext(selectedTask.id);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSubtask(subtaskId: string) {
    try {
      setBusy(true);
      await api.deleteTaskSubtask(subtaskId);

      if (selectedTask) {
        await refreshSelectedTaskContext(selectedTask.id);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createRestriction(event: FormEvent) {
    event.preventDefault();

    if (!selectedTask || !newRestrictionTitle.trim()) {
      return;
    }

    try {
      setBusy(true);
      await api.createTaskRestriction(selectedTask.id, {
        title: newRestrictionTitle.trim(),
        detail: newRestrictionDetail.trim() ? newRestrictionDetail.trim() : null
      });
      setNewRestrictionTitle('');
      setNewRestrictionDetail('');
      await load();
      await refreshSelectedTaskContext(selectedTask.id);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRestrictionStatus(restriction: TaskRestriction) {
    try {
      setBusy(true);
      await api.updateTaskRestriction(restriction.id, {
        status: restriction.status === 'aberta' ? 'resolvida' : 'aberta'
      });
      if (selectedTask) {
        await load();
        await refreshSelectedTaskContext(selectedTask.id);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeRestriction(restrictionId: string) {
    try {
      setBusy(true);
      await api.deleteTaskRestriction(restrictionId);
      if (selectedTask) {
        await load();
        await refreshSelectedTaskContext(selectedTask.id);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTaskDependency(event: FormEvent) {
    event.preventDefault();

    if (!selectedTask) {
      return;
    }

    if (restrictionDependsOnPerson && !detailWaitingOnPerson.trim()) {
      setError('Informe a pessoa da dependência para salvar a restrição externa.');
      return;
    }

    try {
      setBusy(true);
      await api.updateTask(selectedTask.id, {
        waitingOnPerson: restrictionDependsOnPerson && detailWaitingOnPerson.trim() ? detailWaitingOnPerson.trim() : null,
        waitingType: restrictionDependsOnPerson && detailWaitingOnPerson.trim() ? detailWaitingType : null,
        waitingPriority: restrictionDependsOnPerson && detailWaitingOnPerson.trim() ? detailWaitingPriority : null,
        waitingDueDate: restrictionDependsOnPerson && detailWaitingOnPerson.trim()
          ? detailWaitingDueDate
            ? toStableIsoFromDateInput(detailWaitingDueDate)
            : null
          : null
      });
      await load();
      await refreshSelectedTaskContext(selectedTask.id);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearTaskDependency() {
    if (!selectedTask) {
      return;
    }

    try {
      setBusy(true);
      await api.updateTask(selectedTask.id, {
        waitingOnPerson: null,
        waitingType: null,
        waitingPriority: null,
        waitingDueDate: null
      });
      setDetailWaitingOnPerson('');
      setDetailWaitingDueDate('');
      setDetailWaitingType('resposta');
      setDetailWaitingPriority('media');
      setRestrictionDependsOnPerson(false);
      await load();
      await refreshSelectedTaskContext(selectedTask.id);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    if (focusMode) {
      return (
        <PremiumPage>
          <section className="task-table-focus-screen">
            <div className="task-table-focus-actions">
              <button type="button" disabled>
                Adicionar tarefa
              </button>
            </div>
            <article className="surface-card task-master-pane single task-master-pane-focus">
              <SkeletonBlock lines={12} />
            </article>
          </section>
        </PremiumPage>
      );
    }

    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Operação"
          title="Tarefas"
          subtitle="Lista clara, contexto mínimo e execução por foco."
        />
        <section className="task-canvas">
          <article className="surface-card task-master-pane single">
            <SkeletonBlock lines={9} />
          </article>
        </section>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      {!focusMode && (
        <PremiumHeader
          eyebrow="Operação"
          title="Tarefas"
          subtitle="Lista clara, contexto mínimo e execução por foco."
          actions={
            <div className="header-actions">
              <button
                type="button"
                className={taskPanel === 'tasks' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                onClick={() => setTaskPanel('tasks')}
              >
                Tarefas
              </button>
              <button
                type="button"
                className={taskPanel === 'inbox' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                onClick={() => setTaskPanel('inbox')}
              >
                Inbox ({pendingInbox.length})
              </button>
              {taskPanel === 'tasks' && (
                <>
                  <button type="button" className="ghost-button" onClick={() => setTaskFocusMode(true)}>
                    Foco da lista (F)
                  </button>
                  <button type="button" onClick={() => setTaskComposeMode(true)}>
                    Criar
                  </button>
                </>
              )}
            </div>
          }
        />
      )}

      {!focusMode && error && <p className="surface-error">{error}</p>}

      {focusMode || taskPanel === 'tasks' ? (
        <>
          {focusMode ? (
            <section className="task-table-focus-screen">
              <div className="task-table-focus-actions">
                <button type="button" onClick={() => setTaskComposeMode(true)}>
                  Adicionar tarefa
                </button>
              </div>
              <TaskIntelligenceTable
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                busy={busy}
                onSelectTask={(taskId) => openTaskDetails(taskId, 'overview')}
                onCompleteTask={completeTask}
                onDeleteTask={deleteTask}
              />
            </section>
          ) : (
            <>
              <section className="premium-metric-grid mini task-analytics-metrics">
                <MetricCard
                  label="Taxa concluída"
                  value={`${taskInsights.completionRate}%`}
                  tone="accent"
                  hint={`${taskInsights.completed}/${taskInsights.total}`}
                />
                <MetricCard
                  label="Em fluxo"
                  value={taskInsights.inFlow}
                  hint="hoje + andamento"
                />
                <MetricCard
                  label="Aguardando"
                  value={taskInsights.waiting}
                  tone={taskInsights.waiting > 0 ? 'warning' : 'default'}
                  hint="dependência externa"
                />
                <MetricCard
                  label="Com restrições"
                  value={taskInsights.restricted}
                  tone={taskInsights.restricted > 0 ? 'warning' : 'default'}
                  hint={`${taskInsights.openRestrictions} restrições abertas`}
                />
                <MetricCard
                  label="Atrasadas"
                  value={taskInsights.overdue}
                  tone={taskInsights.overdue > 0 ? 'warning' : 'default'}
                  hint={`prioridade média P${taskInsights.avgPriority}`}
                />
              </section>

              <PremiumCard
                title="Central de dependências externas"
                subtitle={waitingTasks.length === 0 ? 'sem bloqueios de terceiros no momento' : `${waitingTasks.length} tarefa(s) aguardando terceiros`}
              >
                {waitingTasks.length === 0 ? (
                  <EmptyState
                    title="Nenhuma pendência externa"
                    description="Quando uma tarefa depender de outra pessoa, ela aparece aqui com ação imediata."
                  />
                ) : (
                  <ul className="premium-list dense">
                    {waitingTasks.slice(0, 10).map((entry) => {
                      const dueTone = waitingRadarTone(entry.followupState);
                      return (
                        <li key={`waiting-${entry.taskId}`}>
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.workspaceName} • aguardando {entry.waitingOnPerson} • prazo{' '}
                              {entry.waitingDueDate ? new Date(entry.waitingDueDate).toLocaleDateString('pt-BR') : 'n/d'}
                            </small>
                            <small>
                              {entry.followupState === 'urgente'
                                ? `Atrasada há ${Math.max(1, entry.daysWaiting)} dia(s).`
                                : entry.followupState === 'hoje'
                                  ? 'Follow-up vence hoje.'
                                  : `Próximo follow-up em ${new Date(entry.nextFollowupAt).toLocaleDateString('pt-BR')}.`}
                            </small>
                          </div>
                          <div className="inline-actions">
                            <span className={`status-tag ${dueTone === 'danger' ? 'backlog' : dueTone === 'warning' ? 'andamento' : 'feito'}`}>
                              {dueTone === 'danger' ? 'urgente' : dueTone === 'warning' ? 'cobrar hoje' : 'agendado'}
                            </span>
                            <button type="button" className="ghost-button" onClick={() => openTaskDetails(entry.taskId, 'restrictions')}>
                              Abrir
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={busy}
                              onClick={() => void registerWaitingFollowup(entry)}
                            >
                              Registrar cobrança
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={busy}
                              onClick={() => void copyWaitingFollowup(entry)}
                            >
                              Copiar follow-up
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={busy}
                              onClick={() => clearWaitingDependency(entry.taskId)}
                            >
                              Marcar resolvida
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </PremiumCard>

              <section className="premium-grid two task-analytics-grid">
                <PremiumCard title="Ritmo por status" subtitle="distribuição na visão atual">
                  {taskInsights.statusBreakdown.every((entry) => entry.value === 0) ? (
                    <EmptyState
                      title="Sem dados para o gráfico"
                      description="Crie ou carregue tarefas para ativar a análise de execução."
                    />
                  ) : (
                    <div className="premium-chart-wrap">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={taskInsights.statusBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                          <XAxis dataKey="name" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{ fill: 'rgba(31, 94, 255, 0.08)' }} contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#2563eb" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </PremiumCard>

                <PremiumCard title="Mix de prioridade" subtitle="equilíbrio do backlog">
                  {taskInsights.priorityBreakdown.every((entry) => entry.value === 0) ? (
                    <EmptyState
                      title="Sem distribuição de prioridade"
                      description="As prioridades aparecem automaticamente conforme você cadastra tarefas."
                    />
                  ) : (
                    <div className="premium-chart-wrap pie">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={taskInsights.priorityBreakdown}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={48}
                            outerRadius={82}
                            paddingAngle={4}
                          >
                            {taskInsights.priorityBreakdown.map((entry, index) => (
                              <Cell
                                key={entry.name}
                                fill={['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'][index] ?? '#1d4ed8'}
                              />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </PremiumCard>
              </section>

              <section className="task-canvas">
                <article className="surface-card task-master-pane single">
                  <div className="section-title">
                    <h4>Tarefas</h4>
                    <small>{filteredTasks.length} visíveis</small>
                  </div>

                  <div className="task-filter-stack">
                    <div className="inline-actions task-mode-tabs">
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
                      <button
                        type="button"
                        className={
                          taskView === 'restricted' ? 'ghost-button task-filter active' : 'ghost-button task-filter'
                        }
                        onClick={() => setTaskView('restricted')}
                      >
                        Com restrições
                      </button>
                      <button
                        type="button"
                        className={taskListMode === 'list' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                        onClick={() => setTaskListMode('list')}
                      >
                        Lista
                      </button>
                      <button
                        type="button"
                        className={taskListMode === 'table' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                        onClick={() => setTaskListMode('table')}
                      >
                        Tabela
                      </button>
                    </div>

                    <div className="task-list-filters">
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
                  </div>

                  {filteredTasks.length === 0 ? (
                    <EmptyState
                      title="Nenhuma tarefa para estes filtros"
                      description="Ajuste busca/horizonte ou crie uma nova tarefa para continuar."
                    />
                  ) : taskListMode === 'table' ? (
                    <TaskIntelligenceTable
                      tasks={filteredTasks}
                      selectedTaskId={selectedTaskId}
                      busy={busy}
                      onSelectTask={(taskId) => openTaskDetails(taskId, 'overview')}
                      onCompleteTask={completeTask}
                      onDeleteTask={deleteTask}
                    />
                  ) : (
                    <ul className="task-master-list">
                      {filteredTasks.map((task) => (
                        <li
                          key={task.id}
                          className={selectedTaskId === task.id ? 'task-master-item selected' : 'task-master-item'}
                          onClick={() => openTaskDetails(task.id, 'overview')}
                        >
                          <div>
                            <strong>{task.title}</strong>
                            <small>
                              {task.workspace?.name ?? 'Sem frente'} • {task.project?.title ?? 'Sem projeto'} • Tipo{' '}
                              {taskTypeLabel(task.taskType ?? 'b')} • {task.executionKind ?? 'operacao'}
                              {task.isMultiBlock ? ' • multiblock' : ''} • {openRestrictionCount(task)} restrições
                            </small>
                          </div>

                          <div className="inline-actions">
                            <span className={`priority-chip priority-${task.priority}`}>P{task.priority}</span>
                            <span className={`status-tag ${task.status}`}>{task.status}</span>
                            {openRestrictionCount(task) > 0 && (
                              <span className="restriction-chip">{openRestrictionCount(task)} bloqueios</span>
                            )}
                            <button
                              type="button"
                              className="text-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteTask(task.id);
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </section>
            </>
          )}

          <Modal
            open={composeMode}
            onClose={() => setTaskComposeMode(false)}
            title="Nova tarefa"
            subtitle="Crie tarefa sem poluir a tela principal"
            size="lg"
          >
          <form className="minimal-form create-task-modal-form" onSubmit={createTask}>
            <input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="Verbo + objeto (ex: Fechar proposta comercial)"
              required
            />

            <input
              value={createDefinitionOfDone}
              onChange={(event) => setCreateDefinitionOfDone(event.target.value)}
              placeholder="Definição de pronto"
              required
            />

            <div className="row-2">
              <select
                value={createWorkspaceId}
                onChange={(event) => {
                  setCreateWorkspaceId(event.target.value);
                  setCreateProjectId('');
                }}
                required
              >
                <option value="">Frente</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>

              <select value={createProjectId} onChange={(event) => setCreateProjectId(event.target.value)}>
                <option value="">Sem projeto</option>
                {createProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="row-2">
              <label>
                Tempo estimado (min)
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={createEstimatedMinutes}
                  onChange={(event) => setCreateEstimatedMinutes(event.target.value)}
                  required
                />
              </label>
              <select value={createTaskType} onChange={(event) => setCreateTaskType(event.target.value as TaskType)}>
                <option value="a">Tipo A (alto impacto)</option>
                <option value="b">Tipo B (importante)</option>
                <option value="c">Tipo C (conveniência)</option>
              </select>
            </div>

            <div className="row-2">
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={createIsMultiBlock}
                  onChange={(event) => setCreateIsMultiBlock(event.target.checked)}
                />
                Tarefa complexa (multiblock)
              </label>
              <label>
                Meta total (min)
                <input
                  type="number"
                  min={30}
                  step={15}
                  value={createMultiBlockGoalMinutes}
                  onChange={(event) => setCreateMultiBlockGoalMinutes(event.target.value)}
                  placeholder={createEstimatedMinutes || '180'}
                  disabled={!createIsMultiBlock}
                />
              </label>
            </div>

            <div className="row-2">
              <select
                value={createEnergyLevel}
                onChange={(event) => setCreateEnergyLevel(event.target.value as TaskEnergy)}
              >
                <option value="alta">Energia alta</option>
                <option value="media">Energia média</option>
                <option value="baixa">Energia baixa</option>
              </select>
              <select
                value={createExecutionKind}
                onChange={(event) => setCreateExecutionKind(event.target.value as TaskExecutionKind)}
              >
                <option value="construcao" disabled={createWorkspace?.mode === 'manutencao'}>
                  Construção
                </option>
                <option value="operacao">Operação</option>
              </select>
            </div>

            {createWorkspace?.mode === 'manutencao' && (
              <p className="premium-empty">
                Frente em manutenção: tarefas de construção ficam bloqueadas por coerência estratégica.
              </p>
            )}
            {createWorkspace?.mode === 'standby' && (
              <p className="premium-empty">
                Frente em standby: você pode capturar backlog, mas evite mover para execução sem reativar o modo.
              </p>
            )}

            <div className="priority-pill-grid">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === createPriority ? `priority-pill active p${value}` : `priority-pill p${value}`}
                  onClick={() => setCreatePriority(value)}
                >
                  P{value} {priorityAlias(value)}
                </button>
              ))}
            </div>

            <select value={createHorizon} onChange={(event) => setCreateHorizon(event.target.value as TaskHorizon)}>
              <option value="active">Ativo</option>
              <option value="future">Futuro</option>
            </select>

            <button type="submit" disabled={busy}>
              Criar tarefa
            </button>
          </form>
          </Modal>

          <Modal
            open={taskDetailOpen && Boolean(selectedTask)}
            onClose={() => setTaskDetailOpen(false)}
            title={selectedTask?.title ?? 'Detalhe da tarefa'}
            subtitle={selectedTask ? `ID ${selectedTask.id.slice(0, 8)}` : 'Selecione uma tarefa'}
            size="xl"
          >
          {!selectedTask ? (
            <EmptyState title="Sem tarefa selecionada" description="Escolha uma tarefa na tabela para abrir o detalhe." />
          ) : (
            <>
              <div className="inline-actions task-detail-modal-actions">
                <span className={`status-tag ${selectedTask.status}`}>{selectedTask.status}</span>
                {openRestrictions.length > 0 && (
                  <span className="restriction-chip">{openRestrictions.length} restrições abertas</span>
                )}
                {selectedTask.status !== 'feito' && (
                  <button type="button" className="success-button" onClick={() => completeTask(selectedTask.id)}>
                    Concluir
                  </button>
                )}
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={() => deleteTask(selectedTask.id)}
                >
                  Excluir tarefa
                </button>
              </div>

              <Tabs.Root
                className="radix-tabs task-detail-tabs"
                value={detailTab}
                onValueChange={(value) => setDetailTab(value as DetailTab)}
              >
                <Tabs.List className="radix-tabs-list" aria-label="Detalhes da tarefa">
                  <Tabs.Trigger value="overview" className="radix-tabs-trigger">
                    Detalhes
                  </Tabs.Trigger>
                  <Tabs.Trigger value="checklist" className="radix-tabs-trigger">
                    Checklist ({completedSubtasks}/{subtasks.length})
                  </Tabs.Trigger>
                  <Tabs.Trigger value="restrictions" className="radix-tabs-trigger">
                    Restrições ({openRestrictions.length}/{taskRestrictions.length})
                  </Tabs.Trigger>
                  <Tabs.Trigger value="history" className="radix-tabs-trigger">
                    Histórico ({taskHistory.length})
                  </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="overview" className="radix-tabs-content">
                  <form className="task-detail-form" onSubmit={saveTaskDetails}>
                    <label>
                      Título
                      <input value={detailTitle} onChange={(event) => setDetailTitle(event.target.value)} required />
                    </label>

                    <label>
                      Definição de pronto
                      <input
                        value={detailDefinitionOfDone}
                        onChange={(event) => setDetailDefinitionOfDone(event.target.value)}
                        placeholder="Como saber que a tarefa terminou de verdade"
                      />
                    </label>

                    <div className="row-2">
                      <label>
                        Status
                        <select
                          value={detailStatus}
                          onChange={(event) => setDetailStatus(event.target.value as TaskStatus)}
                        >
                          <option value="backlog">backlog</option>
                          <option value="hoje" disabled={detailWorkspace?.mode === 'standby'}>
                            hoje
                          </option>
                          <option value="andamento" disabled={detailWorkspace?.mode === 'standby'}>
                            andamento
                          </option>
                          <option value="feito">feito</option>
                        </select>
                      </label>

                      <label>
                        Horizonte
                        <select
                          value={detailHorizon}
                          onChange={(event) => setDetailHorizon(event.target.value as TaskHorizon)}
                        >
                          <option value="active">ativo</option>
                          <option value="future">futuro</option>
                        </select>
                      </label>
                    </div>

                    <div className="row-2">
                      <label>
                        Tipo de tarefa
                        <select
                          value={detailTaskType}
                          onChange={(event) => setDetailTaskType(event.target.value as TaskType)}
                        >
                          <option value="a">A (alto impacto)</option>
                          <option value="b">B (importante)</option>
                          <option value="c">C (conveniência)</option>
                        </select>
                      </label>

                      <label>
                        Energia necessária
                        <select
                          value={detailEnergyLevel}
                          onChange={(event) => setDetailEnergyLevel(event.target.value as TaskEnergy)}
                        >
                          <option value="alta">alta</option>
                          <option value="media">média</option>
                          <option value="baixa">baixa</option>
                        </select>
                      </label>
                    </div>

                    <label>
                      Natureza
                      <select
                        value={detailExecutionKind}
                        onChange={(event) => setDetailExecutionKind(event.target.value as TaskExecutionKind)}
                      >
                        <option value="construcao" disabled={detailWorkspace?.mode === 'manutencao'}>
                          Construção
                        </option>
                        <option value="operacao">Operação</option>
                      </select>
                    </label>

                    {detailWorkspace?.mode === 'manutencao' && (
                      <p className="premium-empty">
                        Modo manutenção ativo: tarefa de construção é bloqueada nesta frente.
                      </p>
                    )}
                    {detailWorkspace?.mode === 'standby' && (
                      <p className="premium-empty">
                        Modo standby ativo: status hoje/andamento ficam bloqueados até reativar a frente.
                      </p>
                    )}

                    <div className="row-2">
                      <label>
                        Frente
                        <select
                          value={detailWorkspaceId}
                          onChange={(event) => {
                            const nextWorkspaceId = event.target.value;
                            setDetailWorkspaceId(nextWorkspaceId);
                            if (
                              !projects.some(
                                (project) => project.id === detailProjectId && project.workspaceId === nextWorkspaceId
                              )
                            ) {
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

                    <div className="priority-hero compact-priority">
                      <span>Prioridade atual</span>
                      <strong>P{detailPriority}</strong>
                      <small>{priorityLabel(detailPriority)}</small>
                      <div className="priority-pill-grid">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={value === detailPriority ? `priority-pill active p${value}` : `priority-pill p${value}`}
                            onClick={() => setDetailPriority(value)}
                          >
                            P{value}
                          </button>
                        ))}
                      </div>
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
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={detailIsMultiBlock}
                          onChange={(event) => setDetailIsMultiBlock(event.target.checked)}
                        />
                        Tarefa multiblock (múltiplas sessões)
                      </label>
                      <label>
                        Meta total (min)
                        <input
                          type="number"
                          min={30}
                          step={15}
                          value={detailMultiBlockGoalMinutes}
                          onChange={(event) => setDetailMultiBlockGoalMinutes(event.target.value)}
                          placeholder={detailEstimatedMinutes || '180'}
                          disabled={!detailIsMultiBlock}
                        />
                      </label>
                    </div>

                    {detailIsMultiBlock && multiBlockProgress && (
                      <div className="premium-empty">
                        Progresso multiblock: {multiBlockProgress.summary.completedMinutes}/
                        {multiBlockProgress.summary.goalMinutes} min (
                        {multiBlockProgress.summary.progressPercent}%)
                        {' • '}
                        Sessões {multiBlockProgress.summary.sessionsCount}
                        {' • '}
                        Última sessão {multiBlockProgress.summary.lastSessionAt ? new Date(multiBlockProgress.summary.lastSessionAt).toLocaleString('pt-BR') : 'n/d'}
                        {' • '}
                        A conclusão pode ser manual mesmo abaixo da meta de minutos.
                      </div>
                    )}

                    <div className="task-restriction-summary">
                      <strong>Restrições da execução</strong>
                      <span>
                        {openRestrictions.length} abertas • {resolvedRestrictions.length} resolvidas
                      </span>
                      {openRestrictions.length > 0 ? (
                        <ul>
                          {openRestrictions.slice(0, 3).map((restriction) => (
                            <li key={restriction.id}>{restriction.title}</li>
                          ))}
                        </ul>
                      ) : (
                        <small>Sem bloqueios ativos no momento.</small>
                      )}
                    </div>

                    <label className="task-notes-field">
                      Notas
                      <textarea
                        value={detailDescription}
                        onChange={(event) => setDetailDescription(event.target.value)}
                        placeholder="Contexto da tarefa"
                      />
                    </label>

                    <div className="inline-actions">
                      <button type="submit" disabled={busy}>
                        Salvar
                      </button>
                    </div>
                  </form>
                </Tabs.Content>

                <Tabs.Content value="checklist" className="radix-tabs-content">
                  <section className="detail-extension-panel">
                    <div className="subtask-progress-track">
                      <div style={{ width: `${subtaskProgress}%` }} />
                    </div>

                    <form className="subtask-create-row" onSubmit={createSubtask}>
                      <input
                        value={newSubtaskTitle}
                        onChange={(event) => setNewSubtaskTitle(event.target.value)}
                        placeholder="Nova subtarefa"
                      />
                      <button type="submit" disabled={busy}>
                        Adicionar
                      </button>
                    </form>

                    {subtasks.length === 0 ? (
                      <EmptyState
                        title="Checklist vazio"
                        description="Adicione subtarefas para acompanhar progresso percentual da execução."
                      />
                    ) : (
                      <ul className="subtask-list">
                        {subtasks.map((subtask) => (
                          <li key={subtask.id}>
                            <label className="subtask-toggle">
                              <input
                                type="checkbox"
                                checked={subtask.status === 'feito'}
                                onChange={() => toggleSubtask(subtask)}
                              />
                              <span className={subtask.status === 'feito' ? 'done' : ''}>{subtask.title}</span>
                            </label>

                            <button
                              type="button"
                              className="text-button"
                              onClick={() => removeSubtask(subtask.id)}
                              disabled={busy}
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </Tabs.Content>

                <Tabs.Content value="restrictions" className="radix-tabs-content">
                  <section className="detail-extension-panel">
                    <form className="restriction-create-form" onSubmit={createRestriction}>
                      <input
                        value={newRestrictionTitle}
                        onChange={(event) => setNewRestrictionTitle(event.target.value)}
                        placeholder="Nova restrição (ex: obter extratos)"
                        required
                      />
                      <textarea
                        value={newRestrictionDetail}
                        onChange={(event) => setNewRestrictionDetail(event.target.value)}
                        placeholder="Contexto opcional para destravar"
                        rows={2}
                      />
                      <button type="submit" disabled={busy}>
                        Adicionar restrição
                      </button>
                    </form>

                    <form className="restriction-dependency-form" onSubmit={saveTaskDependency}>
                      <div className="section-title">
                        <h5>Dependência externa</h5>
                        <small>{restrictionDependsOnPerson ? 'ativa' : 'não configurada'}</small>
                      </div>

                      <div className="inline-actions">
                        <span className="premium-empty">Esta restrição depende de outra pessoa?</span>
                        <button
                          type="button"
                          className={restrictionDependsOnPerson ? 'ghost-button task-filter active' : 'ghost-button'}
                          onClick={() => setRestrictionDependsOnPerson(true)}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          className={!restrictionDependsOnPerson ? 'ghost-button task-filter active' : 'ghost-button'}
                          onClick={() => {
                            setRestrictionDependsOnPerson(false);
                            setDetailWaitingOnPerson('');
                            setDetailWaitingType('resposta');
                            setDetailWaitingPriority('media');
                            setDetailWaitingDueDate('');
                          }}
                        >
                          Não
                        </button>
                      </div>

                      <div className="row-2">
                        <label>
                          Aguardando pessoa
                          <input
                            value={detailWaitingOnPerson}
                            onChange={(event) => setDetailWaitingOnPerson(event.target.value)}
                            placeholder="Ex: Fulano"
                            disabled={!restrictionDependsOnPerson}
                          />
                        </label>

                        <label>
                          Tipo
                          <select
                            value={detailWaitingType}
                            onChange={(event) => setDetailWaitingType(event.target.value as WaitingType)}
                            disabled={!restrictionDependsOnPerson}
                          >
                            <option value="resposta">Aguardando resposta</option>
                            <option value="entrega">Aguardando entrega</option>
                          </select>
                        </label>
                      </div>

                      <div className="row-2">
                        <label>
                          Prioridade do follow-up
                          <select
                            value={detailWaitingPriority}
                            onChange={(event) => setDetailWaitingPriority(event.target.value as WaitingPriority)}
                            disabled={!restrictionDependsOnPerson}
                          >
                            <option value="alta">alta</option>
                            <option value="media">média</option>
                            <option value="baixa">baixa</option>
                          </select>
                        </label>

                        <label>
                          Data limite da dependência
                          <input
                            type="date"
                            value={detailWaitingDueDate}
                            onChange={(event) => setDetailWaitingDueDate(event.target.value)}
                            disabled={!restrictionDependsOnPerson}
                          />
                        </label>
                      </div>

                      <div className="inline-actions">
                        <button type="submit" disabled={busy}>
                          Salvar dependência
                        </button>
                        {restrictionDependsOnPerson && (
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={busy}
                            onClick={() => void clearTaskDependency()}
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                    </form>

                    {taskRestrictions.length === 0 ? (
                      <EmptyState
                        title="Sem restrições"
                        description="Use este painel para registrar bloqueios reais e destravar execução."
                      />
                    ) : (
                      <div className="restriction-lanes">
                        <article>
                          <div className="section-title">
                            <h5>Abertas</h5>
                            <small>{openRestrictions.length}</small>
                          </div>
                          {openRestrictions.length === 0 ? (
                            <p className="premium-empty">Nenhuma restrição ativa.</p>
                          ) : (
                            <ul className="restriction-list">
                              {openRestrictions.map((restriction) => (
                                <li key={restriction.id}>
                                  <div>
                                    <strong>{restriction.title}</strong>
                                    {restriction.detail && <small>{restriction.detail}</small>}
                                  </div>
                                  <div className="inline-actions">
                                    <button
                                      type="button"
                                      className="ghost-button smart-row-action"
                                      onClick={() => toggleRestrictionStatus(restriction)}
                                      disabled={busy}
                                    >
                                      Resolver
                                    </button>
                                    <button
                                      type="button"
                                      className="text-button smart-row-action danger"
                                      onClick={() => removeRestriction(restriction.id)}
                                      disabled={busy}
                                    >
                                      Excluir
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>

                        <article>
                          <div className="section-title">
                            <h5>Resolvidas</h5>
                            <small>{resolvedRestrictions.length}</small>
                          </div>
                          {resolvedRestrictions.length === 0 ? (
                            <p className="premium-empty">Sem histórico resolvido ainda.</p>
                          ) : (
                            <ul className="restriction-list resolved">
                              {resolvedRestrictions.map((restriction) => (
                                <li key={restriction.id}>
                                  <div>
                                    <strong>{restriction.title}</strong>
                                    <small>
                                      Resolvida em{' '}
                                      {restriction.resolvedAt
                                        ? new Date(restriction.resolvedAt).toLocaleDateString('pt-BR')
                                        : 'n/d'}
                                    </small>
                                  </div>
                                  <div className="inline-actions">
                                    <button
                                      type="button"
                                      className="ghost-button smart-row-action"
                                      onClick={() => toggleRestrictionStatus(restriction)}
                                      disabled={busy}
                                    >
                                      Reabrir
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      </div>
                    )}
                  </section>
                </Tabs.Content>

                <Tabs.Content value="history" className="radix-tabs-content">
                  <section className="detail-extension-panel">
                    {taskHistory.length === 0 ? (
                      <EmptyState
                        title="Sem eventos ainda"
                        description="Mudanças de status, reagendamentos e conclusões aparecem nesta timeline."
                      />
                    ) : (
                      <ul className="task-history-list">
                        {taskHistory.map((entry) => (
                          <li key={entry.id}>
                            <div>
                              <strong>{entry.title}</strong>
                              {entry.description && <small>{failureReasonLabel(entry.description)}</small>}
                            </div>

                            <div className="task-history-meta">
                              <span className="history-kind">{historyTypeLabel(entry.type)}</span>
                              <small>{new Date(entry.at).toLocaleString('pt-BR')}</small>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </Tabs.Content>
              </Tabs.Root>
            </>
          )}
          </Modal>
        </>
      ) : (
        <section className="two-col-grid large">
          <article className="surface-card">
            <div className="section-title">
              <h4>Capturas pendentes</h4>
              <small>{pendingInbox.length}</small>
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
                Frente
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
                Projeto
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
              <EmptyState
                title="Inbox zerada"
                description="Tudo processado. Capture novas entradas para não perder contexto."
              />
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
              <h4>Processadas</h4>
              <small>{processedInbox.length}</small>
            </div>

            {processedInbox.length === 0 ? (
              <EmptyState
                title="Sem histórico de processadas"
                description="Quando você processar capturas, os últimos itens aparecem aqui."
              />
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
      )}
    </PremiumPage>
  );
}
