export type WorkspaceType = 'empresa' | 'pessoal' | 'geral';
export type TaskStatus = 'backlog' | 'hoje' | 'andamento' | 'feito' | 'arquivado';
export type TaskHorizon = 'active' | 'future';
export type WaitingPriority = 'alta' | 'media' | 'baixa';

export type Workspace = {
  id: string;
  name: string;
  type: WorkspaceType;
  createdAt?: string;
};

export type Project = {
  id: string;
  title: string;
  description?: string | null;
  status?: 'ativo' | 'pausado' | 'concluido' | 'arquivado';
  workspaceId: string;
  workspace?: Workspace;
};

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  horizon?: TaskHorizon;
  priority: number;
  workspaceId: string;
  projectId?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  fixedTimeStart?: string | null;
  fixedTimeEnd?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  waitingOnPerson?: string | null;
  waitingPriority?: WaitingPriority | null;
  createdAt?: string;
  completedAt?: string | null;
  workspace?: Workspace;
  project?: Project | null;
};

export type DayPlanItem = {
  id: string;
  dayPlanId: string;
  taskId: string | null;
  startTime: string;
  endTime: string;
  orderIndex: number;
  blockType: 'task' | 'fixed';
  confirmationState: 'pending' | 'confirmed_done' | 'confirmed_not_done';
  task?: Task | null;
};

export type DayPlan = {
  id?: string;
  date: string;
  items: DayPlanItem[];
};

export type RecurringBlock = {
  id: string;
  title: string;
  weekday: number;
  startTime: string;
  endTime: string;
  active: boolean;
};

export type InboxItem = {
  id: string;
  content: string;
  source: 'app' | 'whatsapp';
  processed: boolean;
  createdAt: string;
};

export type Gamification = {
  scoreAtual: number;
  scoreSemanal: number;
  streak: number;
  dividaExecucao: number;
  atualizadoEm: string;
};

export type GamificationDetails = Gamification & {
  history: Array<{
    weekStart: string;
    label: string;
    completed: number;
    delayed: number;
    failed: number;
    score: number;
  }>;
  today: {
    completed: number;
    delayed: number;
    failed: number;
    pendingConfirmations: number;
  };
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function withQuery(path: string, params?: Record<string, string | number | boolean | undefined>) {
  if (!params) {
    return path;
  }

  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    query.append(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error ?? 'Erro desconhecido');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getWorkspaces: () => apiRequest<Workspace[]>('/workspaces'),
  createWorkspace: (input: { name: string; type: WorkspaceType }) =>
    apiRequest<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(input)
    }),

  getProjects: (query?: { workspaceId?: string }) =>
    apiRequest<Project[]>(withQuery('/projects', query)),
  createProject: (input: {
    workspaceId: string;
    title: string;
    description?: string;
    status?: Project['status'];
  }) =>
    apiRequest<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(input)
    }),

  getTasks: (query?: {
    workspaceId?: string;
    projectId?: string;
    status?: TaskStatus;
    horizon?: TaskHorizon;
    waitingOnly?: boolean;
  }) =>
    apiRequest<Task[]>(withQuery('/tasks', query)),
  createTask: (input: {
    workspaceId: string;
    projectId?: string | null;
    title: string;
    description?: string;
    horizon?: TaskHorizon;
    priority?: number;
    dueDate?: string | null;
    estimatedMinutes?: number | null;
    waitingOnPerson?: string | null;
    waitingPriority?: WaitingPriority | null;
  }) =>
    apiRequest<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateTask: (
    taskId: string,
    input: Partial<{
      workspaceId: string;
      projectId: string | null;
      title: string;
      description: string | null;
      status: TaskStatus;
      horizon: TaskHorizon;
      priority: number;
      dueDate: string | null;
      estimatedMinutes: number | null;
      fixedTimeStart: string | null;
      fixedTimeEnd: string | null;
      windowStart: string | null;
      windowEnd: string | null;
      waitingOnPerson: string | null;
      waitingPriority: WaitingPriority | null;
    }>
  ) =>
    apiRequest<Task>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  completeTask: (taskId: string) =>
    apiRequest<Task>(`/tasks/${taskId}/complete`, {
      method: 'POST'
    }),
  postponeTask: (taskId: string) =>
    apiRequest<Task>(`/tasks/${taskId}/postpone`, {
      method: 'POST'
    }),

  getDayPlan: (date: string) => apiRequest<DayPlan>(`/day-plans/${date}`),
  createDayPlanItem: (
    date: string,
    input: {
      taskId?: string;
      startTime: string;
      endTime: string;
      orderIndex?: number;
      blockType: 'task' | 'fixed';
    }
  ) =>
    apiRequest<DayPlanItem>(`/day-plans/${date}/items`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  confirmDayPlanItem: (id: string, action: 'done' | 'not_done' | 'postpone') =>
    apiRequest<DayPlanItem>(`/day-plan-items/${id}/confirmation`, {
      method: 'POST',
      body: JSON.stringify({ action })
    }),
  updateDayPlanItem: (
    id: string,
    input: Partial<{
      taskId: string | null;
      startTime: string;
      endTime: string;
      orderIndex: number;
      blockType: 'task' | 'fixed';
    }>
  ) =>
    apiRequest<DayPlanItem>(`/day-plan-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteDayPlanItem: (id: string) =>
    apiRequest<{ ok: boolean }>(`/day-plan-items/${id}`, {
      method: 'DELETE'
    }),

  getRecurringBlocks: () => apiRequest<RecurringBlock[]>('/recurring-blocks'),
  createRecurringBlock: (input: {
    title: string;
    weekday: number;
    startTime: string;
    endTime: string;
    active?: boolean;
  }) =>
    apiRequest<RecurringBlock>('/recurring-blocks', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  applyRecurringBlocks: (date: string) =>
    apiRequest<{ appliedBlocks: number; items: DayPlanItem[] }>(`/recurring-blocks/apply/${date}`, {
      method: 'POST'
    }),

  getInbox: () => apiRequest<InboxItem[]>('/inbox'),
  createInboxItem: (content: string, source: 'app' | 'whatsapp' = 'app') =>
    apiRequest<InboxItem>('/inbox', {
      method: 'POST',
      body: JSON.stringify({ content, source })
    }),
  processInboxItem: (
    id: string,
    payload: {
      action: 'task' | 'project' | 'discard';
      workspaceId?: string;
      projectId?: string;
      horizon?: TaskHorizon;
      title?: string;
    }
  ) =>
    apiRequest<{ ok: boolean }>(`/inbox/${id}/process`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getGamification: () => apiRequest<Gamification>('/gamification'),
  getGamificationDetails: () => apiRequest<GamificationDetails>('/gamification/details')
};
