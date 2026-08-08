import type { TaskBacklogItem, TaskHorizon } from '../../api';

export type TaskMovement = 'in_progress' | 'next' | 'waiting' | 'future';
export type TaskActionView = 'all' | 'waiting' | 'blocked' | 'overdue' | 'no_next_step';
export type TaskDueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';
export type TaskSort = 'default' | 'due' | 'priority' | 'project' | 'updated';
export type TaskCompletionFilter = 'open' | 'done' | 'archived' | 'all';

export type TaskBacklogFilters = {
  query: string;
  view: TaskActionView;
  workspaceId: string | null;
  projectId: string | null;
  priority: number | null;
  due: TaskDueFilter;
  today: boolean | null;
  horizon: TaskHorizon | null;
  completion: TaskCompletionFilter;
  sort: TaskSort;
};

export type TaskGroup = {
  id: TaskMovement;
  label: string;
  tasks: TaskBacklogItem[];
};

export const TASK_MOVEMENTS: Array<{ id: TaskMovement; label: string }> = [
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'next', label: 'Próximas' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'future', label: 'Futuro' }
];

export const DEFAULT_TASK_FILTERS: TaskBacklogFilters = {
  query: '',
  view: 'all',
  workspaceId: null,
  projectId: null,
  priority: null,
  due: 'all',
  today: null,
  horizon: null,
  completion: 'open',
  sort: 'default'
};
