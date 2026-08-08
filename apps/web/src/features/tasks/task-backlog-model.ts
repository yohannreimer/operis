import type { TaskBacklogItem } from '../../api';
import {
  DEFAULT_TASK_FILTERS,
  TASK_MOVEMENTS,
  type TaskActionView,
  type TaskBacklogFilters,
  type TaskGroup,
  type TaskMovement,
  type TaskSort
} from './types';

function normalized(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function dueDateKey(task: TaskBacklogItem) {
  return task.dueDate?.slice(0, 10) ?? null;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function taskMovement(task: TaskBacklogItem): TaskMovement | null {
  if (task.status === 'feito' || task.status === 'arquivado') return null;
  if (task.waitingOnPerson?.trim()) return 'waiting';
  if (task.horizon === 'future') return 'future';
  if (task.status === 'andamento') return 'in_progress';
  return 'next';
}

export function isTaskOverdue(task: TaskBacklogItem, date: string) {
  const due = dueDateKey(task);
  return Boolean(
    due && due < date && task.status !== 'feito' && task.status !== 'arquivado'
  );
}

export function applyTaskView(
  tasks: TaskBacklogItem[],
  view: TaskActionView,
  date: string
) {
  if (view === 'waiting') return tasks.filter((task) => Boolean(task.waitingOnPerson?.trim()));
  if (view === 'blocked') return tasks.filter((task) => task.openRestrictionCount > 0);
  if (view === 'overdue') return tasks.filter((task) => isTaskOverdue(task, date));
  if (view === 'no_next_step') return tasks.filter((task) => !task.nextStep?.trim());
  return tasks;
}

function matchesCompletion(task: TaskBacklogItem, completion: TaskBacklogFilters['completion']) {
  if (completion === 'done') return task.status === 'feito';
  if (completion === 'archived') return task.status === 'arquivado';
  if (completion === 'open') return task.status !== 'feito' && task.status !== 'arquivado';
  return true;
}

function matchesDue(task: TaskBacklogItem, filters: TaskBacklogFilters, date: string) {
  const due = dueDateKey(task);
  if (filters.due === 'none') return due === null;
  if (filters.due === 'today') return due === date;
  if (filters.due === 'overdue') return isTaskOverdue(task, date);
  if (filters.due === 'week') return Boolean(due && due >= date && due <= addDays(date, 7));
  return true;
}

export function filterTasks(
  tasks: TaskBacklogItem[],
  filters: TaskBacklogFilters,
  date: string
) {
  const query = normalized(filters.query);
  return applyTaskView(tasks, filters.view, date).filter((task) => {
    const haystack = normalized([
      task.title,
      task.definitionOfDone,
      task.nextStep,
      task.workspace?.name,
      task.project?.title
    ].filter(Boolean).join(' '));
    return (
      matchesCompletion(task, filters.completion) &&
      (!query || haystack.includes(query)) &&
      (!filters.workspaceId || task.workspaceId === filters.workspaceId) &&
      (!filters.projectId || task.projectId === filters.projectId) &&
      (!filters.priority || task.priority === filters.priority) &&
      (filters.today === null || Boolean(task.todayEntryId) === filters.today) &&
      (!filters.horizon || task.horizon === filters.horizon) &&
      matchesDue(task, filters, date)
    );
  });
}

function attentionRank(task: TaskBacklogItem, date: string) {
  if (isTaskOverdue(task, date)) return 3;
  if (task.openRestrictionCount > 0) return 2;
  if (task.waitingOnPerson?.trim()) return 1;
  return 0;
}

function compareNullableDate(left?: string | null, right?: string | null) {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function sortTasks(tasks: TaskBacklogItem[], sort: TaskSort, date: string) {
  return [...tasks].sort((left, right) => {
    let result = 0;
    if (sort === 'due') result = compareNullableDate(left.dueDate, right.dueDate);
    if (sort === 'priority') result = right.priority - left.priority;
    if (sort === 'project') {
      result = (left.project?.title ?? '').localeCompare(right.project?.title ?? '', 'pt-BR');
    }
    if (sort === 'updated') result = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    if (sort === 'default') {
      result = attentionRank(right, date) - attentionRank(left, date);
      if (!result) result = right.priority - left.priority;
      if (!result) result = compareNullableDate(left.dueDate, right.dueDate);
      if (!result) result = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    }
    if (!result) result = left.title.localeCompare(right.title, 'pt-BR');
    if (!result) result = left.id.localeCompare(right.id);
    return result;
  });
}

export function groupTasks(tasks: TaskBacklogItem[]): TaskGroup[] {
  return TASK_MOVEMENTS.map((movement) => ({
    ...movement,
    tasks: tasks.filter((task) => taskMovement(task) === movement.id)
  }));
}

function enumValue<T extends string>(value: string | null, values: readonly T[], fallback: T) {
  return values.includes(value as T) ? value as T : fallback;
}

export function parseTaskSearchParams(params: URLSearchParams): TaskBacklogFilters {
  const priorityValue = Number(params.get('priority'));
  const todayValue = params.get('today');
  return {
    query: params.get('q') ?? '',
    view: enumValue(params.get('view'), ['all', 'waiting', 'blocked', 'overdue', 'no_next_step'], 'all'),
    workspaceId: params.get('workspaceId') || null,
    projectId: params.get('projectId') || null,
    priority: Number.isInteger(priorityValue) && priorityValue >= 1 && priorityValue <= 5
      ? priorityValue
      : null,
    due: enumValue(params.get('due'), ['all', 'overdue', 'today', 'week', 'none'], 'all'),
    today: todayValue === '1' ? true : todayValue === '0' ? false : null,
    horizon: enumValue(params.get('horizon'), ['active', 'future', ''] as const, '') || null,
    completion: enumValue(params.get('completion'), ['open', 'done', 'archived', 'all'], 'open'),
    sort: enumValue(params.get('sort'), ['default', 'due', 'priority', 'project', 'updated'], 'default')
  };
}

export function writeTaskSearchParams(filters: TaskBacklogFilters, current = new URLSearchParams()) {
  const next = new URLSearchParams(current);
  ['q', 'view', 'workspaceId', 'projectId', 'priority', 'due', 'today', 'horizon', 'completion', 'sort']
    .forEach((key) => next.delete(key));
  if (filters.query) next.set('q', filters.query);
  if (filters.view !== DEFAULT_TASK_FILTERS.view) next.set('view', filters.view);
  if (filters.workspaceId) next.set('workspaceId', filters.workspaceId);
  if (filters.projectId) next.set('projectId', filters.projectId);
  if (filters.priority) next.set('priority', String(filters.priority));
  if (filters.due !== 'all') next.set('due', filters.due);
  if (filters.today !== null) next.set('today', filters.today ? '1' : '0');
  if (filters.horizon) next.set('horizon', filters.horizon);
  if (filters.completion !== 'open') next.set('completion', filters.completion);
  if (filters.sort !== 'default') next.set('sort', filters.sort);
  return next;
}
