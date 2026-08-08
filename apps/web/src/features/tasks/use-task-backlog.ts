import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  api,
  type Project,
  type Subtask,
  type Task,
  type TaskBacklogItem,
  type TaskHistoryEntry,
  type TaskMultiBlockProgress,
  type TaskRestriction,
  type WaitingFollowupRadar,
  type Workspace
} from '../../api';
import { filterTasks, groupTasks, sortTasks } from './task-backlog-model';
import type { TaskBacklogFilters, TaskGroupId, TaskMovement } from './types';
import { readPreferredTaskWorkspaceId, resolveTaskWorkspaceId } from './task-workspace';

const COLLAPSED_GROUPS_KEY = 'operis:tasks:collapsed-groups';

export type TaskDetailData = {
  subtasks: Subtask[];
  restrictions: TaskRestriction[];
  history: TaskHistoryEntry[];
  multiBlock: TaskMultiBlockProgress | null;
  loaded: boolean;
};

type CreateTaskInput = {
  title: string;
  workspaceId?: string | null;
  projectId?: string | null;
  dueDate?: string | null;
};

type WaitingInput = {
  waitingOnPerson: string;
  waitingType: 'resposta' | 'entrega';
  waitingPriority: 'alta' | 'media' | 'baixa';
  waitingDueDate: string;
};

type UseTaskBacklogInput = {
  date: string;
  activeWorkspaceId: string;
  filters: TaskBacklogFilters;
  selectedTaskId: string | null;
};

export type TaskUpdatePatch = Parameters<typeof api.updateTask>[1];

function emptyDetail(): TaskDetailData {
  return { subtasks: [], restrictions: [], history: [], multiBlock: null, loaded: false };
}

function readCollapsedGroups() {
  try {
    const value = JSON.parse(window.localStorage.getItem(COLLAPSED_GROUPS_KEY) ?? '[]');
    if (!Array.isArray(value)) return new Set<TaskGroupId>();
    return new Set(value.filter((item): item is TaskGroupId =>
      ['in_progress', 'next', 'waiting', 'future', 'done', 'archived'].includes(item)
    ));
  } catch {
    return new Set<TaskGroupId>();
  }
}

function taskError(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function projectedTask(
  task: Task,
  workspaces: Workspace[],
  projects: Project[]
): TaskBacklogItem {
  return {
    ...task,
    workspace: task.workspace ?? workspaces.find((item) => item.id === task.workspaceId),
    project: task.project ?? projects.find((item) => item.id === task.projectId) ?? null,
    horizon: task.horizon ?? 'active',
    todayEntryId: null,
    stepSummary: { total: 0, completed: 0 },
    openRestrictionCount: 0,
    restrictions: task.restrictions ?? []
  };
}

export function useTaskBacklog(input: UseTaskBacklogInput) {
  const [tasks, setTasks] = useState<TaskBacklogItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [details, setDetails] = useState<Record<string, TaskDetailData>>({});
  const [waitingRadar, setWaitingRadar] = useState<Record<string, WaitingFollowupRadar>>({});
  const [busyTaskIds, setBusyTaskIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskGroupId>>(readCollapsedGroups);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const tasksRef = useRef(tasks);
  const detailRequests = useRef(new Set<string>());
  const detailAttempted = useRef(new Set<string>());

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const scopedWorkspaceId = input.activeWorkspaceId === 'all'
    ? undefined
    : input.activeWorkspaceId;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [backlog, workspaceData, projectData] = await Promise.all([
        api.getTaskBacklog({ date: input.date, workspaceId: scopedWorkspaceId }),
        api.getWorkspaces(),
        api.getProjects()
      ]);
      const visibleWorkspaces = workspaceData.filter((workspace) => workspace.type !== 'geral');
      const visibleIds = new Set(visibleWorkspaces.map((workspace) => workspace.id));
      setTasks(backlog.items);
      setWorkspaces(visibleWorkspaces);
      setProjects(projectData.filter((project) => visibleIds.has(project.workspaceId)));
    } catch (cause) {
      setError(taskError(cause, 'Não foi possível carregar as tarefas.'));
    } finally {
      setLoading(false);
    }
  }, [input.date, scopedWorkspaceId]);

  useEffect(() => { void reload(); }, [reload]);

  const loadDetail = useCallback(async (taskId: string, force = false) => {
    if ((!force && detailAttempted.current.has(taskId)) || detailRequests.current.has(taskId)) return;
    detailRequests.current.add(taskId);
    detailAttempted.current.add(taskId);
    setDetailLoading(true);
    setDetailError(null);
    const [subtasks, restrictions, history, multiBlock] = await Promise.allSettled([
      api.getTaskSubtasks(taskId),
      api.getTaskRestrictions(taskId),
      api.getTaskHistory(taskId),
      api.getTaskMultiBlockProgress(taskId)
    ]);
    detailRequests.current.delete(taskId);
    const failed = [subtasks, restrictions, history, multiBlock].some((result) => result.status === 'rejected');
    setDetails((current) => ({
      ...current,
      [taskId]: {
        subtasks: subtasks.status === 'fulfilled' ? subtasks.value : current[taskId]?.subtasks ?? [],
        restrictions: restrictions.status === 'fulfilled' ? restrictions.value : current[taskId]?.restrictions ?? [],
        history: history.status === 'fulfilled' ? history.value : current[taskId]?.history ?? [],
        multiBlock: multiBlock.status === 'fulfilled' ? multiBlock.value : current[taskId]?.multiBlock ?? null,
        loaded: !failed
      }
    }));
    if (failed) setDetailError('Alguns detalhes não puderam ser carregados.');
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (input.selectedTaskId) void loadDetail(input.selectedTaskId);
  }, [input.selectedTaskId, loadDetail]);

  const visibleTasks = useMemo(
    () => sortTasks(filterTasks(tasks, input.filters, input.date), input.filters.sort, input.date),
    [tasks, input.filters, input.date]
  );
  const groups = useMemo(() => {
    const openGroups = groupTasks(visibleTasks);
    const done = visibleTasks.filter((task) => task.status === 'feito');
    const archived = visibleTasks.filter((task) => task.status === 'arquivado');
    return [
      ...openGroups,
      ...(done.length ? [{ id: 'done' as const, label: 'Concluídas', tasks: done }] : []),
      ...(archived.length ? [{ id: 'archived' as const, label: 'Arquivadas', tasks: archived }] : [])
    ];
  }, [visibleTasks]);
  const selectedTask = tasks.find((task) => task.id === input.selectedTaskId) ?? null;
  const detail = input.selectedTaskId ? details[input.selectedTaskId] ?? emptyDetail() : null;
  const resolvedWorkspaceId = resolveTaskWorkspaceId({
    activeWorkspaceId: input.activeWorkspaceId,
    preferredWorkspaceId: readPreferredTaskWorkspaceId(),
    workspaces
  });

  const setBusy = useCallback((taskId: string, busy: boolean) => {
    setBusyTaskIds((current) => {
      const next = new Set(current);
      if (busy) next.add(taskId); else next.delete(taskId);
      return next;
    });
  }, []);

  const mergeTask = useCallback((taskId: string, persisted: Task | Partial<TaskBacklogItem>) => {
    setTasks((current) => current.map((task) =>
      task.id === taskId ? { ...task, ...persisted } : task
    ));
  }, []);

  const mutateTask = useCallback(async (
    taskId: string,
    optimistic: (task: TaskBacklogItem) => TaskBacklogItem,
    persist: () => Promise<Task | Partial<TaskBacklogItem>>,
    successMessage = 'Tarefa atualizada.'
  ) => {
    const previous = tasksRef.current.find((task) => task.id === taskId);
    if (!previous) throw new Error('Tarefa não encontrada.');
    setTasks((current) => current.map((task) => task.id === taskId ? optimistic(task) : task));
    setBusy(taskId, true);
    try {
      const persisted = await persist();
      mergeTask(taskId, persisted);
      setAnnouncement(successMessage);
      return persisted;
    } catch (cause) {
      setTasks((current) => current.map((task) => task.id === taskId ? previous : task));
      setAnnouncement('A alteração foi desfeita porque não pôde ser salva.');
      throw cause;
    } finally {
      setBusy(taskId, false);
    }
  }, [mergeTask, setBusy]);

  const createTask = useCallback(async (values: CreateTaskInput) => {
    const workspaceId = values.workspaceId || resolvedWorkspaceId;
    if (!workspaceId) throw new Error('Crie uma Frente antes de adicionar uma tarefa complexa.');
    const created = await api.createTask({
      workspaceId,
      title: values.title.trim(),
      projectId: values.projectId || null,
      dueDate: values.dueDate || null
    });
    const projection = projectedTask(created, workspaces, projects);
    setTasks((current) => [projection, ...current]);
    setAnnouncement('Tarefa criada em Próximas.');
    return projection;
  }, [projects, resolvedWorkspaceId, workspaces]);

  const updateTask = useCallback(async (taskId: string, patch: Parameters<typeof api.updateTask>[1]) =>
    mutateTask(taskId, (task) => ({ ...task, ...patch }), () => api.updateTask(taskId, patch)),
  [mutateTask]);

  const clearWaitingPatch = {
    waitingOnPerson: null,
    waitingType: null,
    waitingPriority: null,
    waitingDueDate: null
  } as const;

  const moveTask = useCallback(async (
    taskId: string,
    movement: TaskMovement,
    waiting?: WaitingInput
  ) => {
    const patch: Parameters<typeof api.updateTask>[1] = movement === 'in_progress'
      ? { status: 'andamento', horizon: 'active', ...clearWaitingPatch }
      : movement === 'next'
        ? { status: 'backlog', horizon: 'active', ...clearWaitingPatch }
        : movement === 'future'
          ? { horizon: 'future' }
          : waiting
            ? { ...waiting }
            : (() => { throw new Error('Informe a dependência antes de aguardar.'); })();
    return updateTask(taskId, patch);
  }, [updateTask]);

  const planForToday = useCallback(async (task: TaskBacklogItem) => {
    const created = await mutateTask(
      task.id,
      (current) => ({ ...current, todayEntryId: `optimistic:${current.id}` }),
      async () => {
        const entry = await api.assignDailyExecution(input.date, { sourceType: 'task', sourceId: task.id });
        return { todayEntryId: entry.id };
      },
      'Planejada para Hoje.'
    );
    return created;
  }, [input.date, mutateTask]);

  const removeFromToday = useCallback(async (task: TaskBacklogItem) => {
    if (!task.todayEntryId) return;
    const entryId = task.todayEntryId;
    await mutateTask(
      task.id,
      (current) => ({ ...current, todayEntryId: null }),
      async () => { await api.removeDailyExecution(entryId); return { todayEntryId: null }; },
      'Retirada de Hoje.'
    );
  }, [mutateTask]);

  const scheduleTask = useCallback(async (taskId: string, date: string, startTime: string, endTime: string) => {
    const created = await api.createDayPlanItem(date, {
      taskId, inboxItemId: null, startTime, endTime, blockType: 'task'
    });
    setAnnouncement('Sessão adicionada à Agenda.');
    return created;
  }, []);

  const completeTask = useCallback(async (
    taskId: string,
    completion: { completionMode: 'note' | 'no_note'; completionNote?: string }
  ) => mutateTask(
    taskId,
    (task) => ({ ...task, status: 'feito', completedAt: new Date().toISOString() }),
    () => api.completeTask(taskId, completion),
    'Tarefa concluída.'
  ), [mutateTask]);

  const reopenTask = useCallback(async (taskId: string) => mutateTask(
    taskId,
    (task) => ({ ...task, status: 'backlog', completedAt: null }),
    () => api.reopenTask(taskId),
    'Tarefa reaberta em Próximas.'
  ), [mutateTask]);

  const archiveTask = useCallback(async (taskId: string) => mutateTask(
    taskId,
    (task) => ({ ...task, status: 'arquivado' }),
    () => api.archiveTask(taskId),
    'Tarefa arquivada.'
  ), [mutateTask]);

  const deleteTask = useCallback(async (taskId: string) => {
    const previous = tasksRef.current;
    setTasks((current) => current.filter((task) => task.id !== taskId));
    try {
      await api.deleteTask(taskId);
      setAnnouncement('Tarefa excluída.');
      return true;
    } catch (cause) {
      setTasks(previous);
      setAnnouncement('A exclusão foi desfeita porque não pôde ser salva.');
      throw cause;
    }
  }, []);

  const updateDetail = useCallback((taskId: string, change: (detail: TaskDetailData) => TaskDetailData) => {
    setDetails((current) => ({
      ...current,
      [taskId]: change(current[taskId] ?? emptyDetail())
    }));
  }, []);

  const createStep = useCallback(async (taskId: string, title: string) => {
    const created = await api.createTaskSubtask(taskId, title);
    const nextSteps = [...(details[taskId]?.subtasks ?? []), created];
    updateDetail(taskId, (current) => ({ ...current, subtasks: nextSteps }));
    mergeTask(taskId, { stepSummary: {
      total: nextSteps.length,
      completed: nextSteps.filter((step) => step.status === 'feito').length
    } });
    return created;
  }, [details, mergeTask, updateDetail]);

  const updateStep = useCallback(async (taskId: string, stepId: string, patch: { title?: string; status?: 'backlog' | 'feito' }) => {
    const updated = await api.updateTaskSubtask(stepId, patch);
    const nextSteps = (details[taskId]?.subtasks ?? []).map((step) => step.id === stepId ? updated : step);
    updateDetail(taskId, (current) => ({ ...current, subtasks: nextSteps }));
    mergeTask(taskId, { stepSummary: {
      total: nextSteps.length,
      completed: nextSteps.filter((step) => step.status === 'feito').length
    } });
    return updated;
  }, [details, mergeTask, updateDetail]);

  const reorderSteps = useCallback(async (taskId: string, orderedIds: string[]) => {
    const previous = details[taskId]?.subtasks ?? [];
    const byId = new Map(previous.map((step) => [step.id, step]));
    const reordered = orderedIds.map((id, position) => ({ ...byId.get(id)!, position }));
    updateDetail(taskId, (current) => ({ ...current, subtasks: reordered }));
    try {
      await api.reorderTaskSubtasks(taskId, orderedIds);
    } catch (cause) {
      updateDetail(taskId, (current) => ({ ...current, subtasks: previous }));
      throw cause;
    }
  }, [details, updateDetail]);

  const deleteStep = useCallback(async (taskId: string, stepId: string) => {
    await api.deleteTaskSubtask(stepId);
    const nextSteps = (details[taskId]?.subtasks ?? []).filter((step) => step.id !== stepId);
    updateDetail(taskId, (current) => ({ ...current, subtasks: nextSteps }));
    mergeTask(taskId, { stepSummary: {
      total: nextSteps.length,
      completed: nextSteps.filter((step) => step.status === 'feito').length
    } });
  }, [details, mergeTask, updateDetail]);

  const createRestriction = useCallback(async (taskId: string, title: string, detail?: string) => {
    const created = await api.createTaskRestriction(taskId, { title, detail });
    updateDetail(taskId, (current) => ({ ...current, restrictions: [...current.restrictions, created] }));
    mergeTask(taskId, {
      openRestrictionCount: (tasksRef.current.find((task) => task.id === taskId)?.openRestrictionCount ?? 0) + 1
    });
    return created;
  }, [mergeTask, updateDetail]);

  const updateRestriction = useCallback(async (
    taskId: string,
    restrictionId: string,
    patch: { title?: string; detail?: string | null; status?: 'aberta' | 'resolvida' }
  ) => {
    const updated = await api.updateTaskRestriction(restrictionId, patch);
    const nextRestrictions = (details[taskId]?.restrictions ?? []).map((item) => item.id === restrictionId ? updated : item);
    updateDetail(taskId, (current) => ({ ...current, restrictions: nextRestrictions }));
    mergeTask(taskId, { openRestrictionCount: nextRestrictions.filter((item) => item.status === 'aberta').length });
    return updated;
  }, [details, mergeTask, updateDetail]);

  const deleteRestriction = useCallback(async (taskId: string, restrictionId: string) => {
    await api.deleteTaskRestriction(restrictionId);
    const nextRestrictions = (details[taskId]?.restrictions ?? []).filter((item) => item.id !== restrictionId);
    updateDetail(taskId, (current) => ({ ...current, restrictions: nextRestrictions }));
    mergeTask(taskId, { openRestrictionCount: nextRestrictions.filter((item) => item.status === 'aberta').length });
  }, [details, mergeTask, updateDetail]);

  const loadWaitingRadar = useCallback(async (workspaceId: string) => {
    if (waitingRadar[workspaceId]) return waitingRadar[workspaceId];
    const radar = await api.getWaitingFollowupRadar({ workspaceId });
    setWaitingRadar((current) => ({ ...current, [workspaceId]: radar }));
    return radar;
  }, [waitingRadar]);

  const registerWaitingFollowup = useCallback(async (taskId: string, note?: string) => {
    const result = await api.registerWaitingFollowup(taskId, { note });
    setAnnouncement('Acompanhamento registrado.');
    return result;
  }, []);

  const toggleGroup = useCallback((movement: TaskGroupId) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(movement)) next.delete(movement); else next.add(movement);
      try { window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, []);

  return {
    tasks, visibleTasks, groups, workspaces, projects, selectedTask, detail,
    waitingRadar, resolvedWorkspaceId, loading, detailLoading, error, detailError,
    busyTaskIds, collapsedGroups, announcement,
    reload, loadDetail, createTask, updateTask, moveTask, planForToday, removeFromToday,
    scheduleTask, completeTask, reopenTask, archiveTask, deleteTask, createStep, updateStep, reorderSteps, deleteStep,
    createRestriction, updateRestriction, deleteRestriction, loadWaitingRadar,
    registerWaitingFollowup, clearWaiting: (taskId: string) => updateTask(taskId, clearWaitingPatch),
    toggleGroup
  };
}
