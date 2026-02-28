export type WorkspaceType = 'empresa' | 'pessoal' | 'vida' | 'autoridade' | 'geral' | 'outro';
export type WorkspaceMode = 'expansao' | 'manutencao' | 'standby';
export type ProjectType = 'construcao' | 'operacao' | 'crescimento';
export type ProjectMetricKind = 'lead' | 'lag';
export type ProjectStatus =
  | 'ativo'
  | 'latente'
  | 'encerrado'
  | 'fantasma'
  | 'pausado'
  | 'concluido'
  | 'arquivado';
export type TaskStatus = 'backlog' | 'hoje' | 'andamento' | 'feito' | 'arquivado';
export type TaskHorizon = 'active' | 'future';
export type WaitingPriority = 'alta' | 'media' | 'baixa';
export type WaitingType = 'resposta' | 'entrega';
export type TaskType = 'a' | 'b' | 'c';
export type TaskEnergy = 'alta' | 'media' | 'baixa';
export type TaskExecutionKind = 'construcao' | 'operacao';
export type DeepWorkState = 'active' | 'completed' | 'broken';
export type ReviewPeriodType = 'weekly' | 'monthly';
export type CommitmentLevel = 'baixo' | 'medio' | 'alto';
export type FailureReason =
  | 'energia'
  | 'medo'
  | 'distracao'
  | 'dependencia'
  | 'falta_clareza'
  | 'falta_habilidade';

export type Workspace = {
  id: string;
  name: string;
  type: WorkspaceType;
  category?: string;
  mode?: WorkspaceMode;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Project = {
  id: string;
  title: string;
  description?: string | null;
  status?: ProjectStatus;
  type?: ProjectType;
  objective?: string | null;
  primaryMetric?: string | null;
  actionStatement?: string | null;
  timeHorizonEnd?: string | null;
  resultStartValue?: number | null;
  resultCurrentValue?: number | null;
  resultTargetValue?: number | null;
  scorecardCadenceDays?: number;
  lastScorecardCheckinAt?: string | null;
  lastStrategicAt?: string;
  workspaceId: string;
  workspace?: Workspace;
};

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  definitionOfDone?: string | null;
  isMultiBlock?: boolean;
  multiBlockGoalMinutes?: number | null;
  status: TaskStatus;
  taskType?: TaskType;
  energyLevel?: TaskEnergy;
  executionKind?: TaskExecutionKind;
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
  waitingType?: WaitingType | null;
  waitingPriority?: WaitingPriority | null;
  waitingDueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  workspace?: Workspace;
  project?: Project | null;
  restrictions?: TaskRestriction[];
};

export type ProjectMetric = {
  id: string;
  projectId: string;
  kind: ProjectMetricKind;
  name: string;
  description?: string | null;
  targetValue?: number | null;
  baselineValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectMetricCheckin = {
  id: string;
  metricId: string;
  projectId: string;
  weekStart: string;
  value: number;
  note?: string | null;
  updatedAt: string;
};

export type ProjectScorecard = {
  project: Project & {
    weekStart: string;
  };
  metrics: Array<
    ProjectMetric & {
      weekChecked: boolean;
      weekCheckin: ProjectMetricCheckin | null;
      latestCheckin: ProjectMetricCheckin | null;
      history: ProjectMetricCheckin[];
    }
  >;
  summary: {
    leadMetricsCount: number;
    lagMetricsCount: number;
    weeklyLeadCompliancePercent: number;
    weeklyCheckinsMissing: number;
    lagProgressPercent: number | null;
    lastScorecardCheckinAt: string | null;
    cadenceDays: number;
    isWeeklyCheckinMissing: boolean;
  };
};

export type TaskMultiBlockProgress = {
  task: {
    id: string;
    title: string;
    status: TaskStatus;
    isMultiBlock: boolean;
    goalMinutes: number;
    estimatedMinutes?: number | null;
    completionCriteria?: string | null;
  };
  summary: {
    sessionsCount: number;
    completedSessions: number;
    brokenSessions: number;
    completedMinutes: number;
    goalMinutes: number;
    remainingMinutes: number;
    progressPercent: number;
    hasCompletionCriteria: boolean;
    activeSessionId: string | null;
    lastSessionAt: string | null;
  };
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    state: DeepWorkState;
    minutes: number;
    targetMinutes: number;
    interruptionCount: number;
    breakCount: number;
    notes: string | null;
  }>;
};

export type Subtask = {
  id: string;
  taskId: string;
  title: string;
  status: TaskStatus;
};

export type TaskRestriction = {
  id: string;
  taskId: string;
  title: string;
  detail?: string | null;
  status: 'aberta' | 'resolvida';
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
};

export type TaskHistoryEntry = {
  id: string;
  at: string;
  type:
    | 'created'
    | 'scheduled'
    | 'completed'
    | 'postponed'
    | 'not_confirmed'
    | 'updated'
    | 'whatsapp_in'
    | 'whatsapp_out';
  title: string;
  description?: string;
};

export type WaitingFollowupRadar = {
  generatedAt: string;
  counts: {
    total: number;
    urgent: number;
    dueToday: number;
  };
  rows: Array<{
    taskId: string;
    title: string;
    workspaceId: string;
    workspaceName: string;
    projectId: string | null;
    projectTitle: string | null;
    waitingOnPerson: string;
    waitingType: WaitingType | null;
    waitingPriority: WaitingPriority;
    waitingDueDate: string | null;
    daysWaiting: number;
    lastFollowupAt: string | null;
    nextFollowupAt: string;
    followupState: 'urgente' | 'hoje' | 'agendado';
    suggestedAction: string;
    suggestedMessage: string;
  }>;
};

export type DeepWorkSession = {
  id: string;
  taskId: string;
  workspaceId: string;
  projectId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  targetMinutes: number;
  actualMinutes: number;
  interruptionCount: number;
  breakCount: number;
  state: DeepWorkState;
  notes?: string | null;
  task?: Task;
  workspace?: Workspace;
  project?: Project | null;
};

export type DeepWorkSummary = {
  date: string;
  workspaceId?: string | null;
  sessions: DeepWorkSession[];
  sessionsCount: number;
  activeCount: number;
  completedCount: number;
  brokenCount: number;
  totalMinutes: number;
  totalTargetMinutes: number;
  totalInterruptions: number;
  totalBreaks: number;
  adherencePercent: number;
};

export type ExecutionBriefing = {
  date: string;
  top3: Task[];
  top3Meta: {
    locked: boolean;
    manual: boolean;
    committedAt: string | null;
    note: string | null;
    taskIds: string[];
    guidedSwapNeeded: boolean;
    missingSlots: number;
    droppedTaskIds: string[];
    swapTaskIds: string[];
    swapReason: string | null;
  };
  pendingA: number;
  strictModeBlocked: boolean;
  openCounts: {
    a: number;
    b: number;
    c: number;
  };
  capacity: {
    baseMinutes: number;
    fixedMinutes: number;
    availableMinutes: number;
    plannedTaskMinutes: number;
    overloadMinutes: number;
    isUnrealistic: boolean;
  };
  alerts: {
    expansionNeedsA: boolean;
    expansionNeedsDeepWork: boolean;
    fragmentationRisk: boolean;
    fragmentationCount: number;
    focusOverloadRisk: boolean;
    focusOverloadCount: number;
    excessiveRescheduleA: number;
    vagueTasks: number;
    maintenanceConstructionRisk: boolean;
    maintenanceConstructionCount: number;
    standbyExecutionRisk: boolean;
    standbyExecutionCount: number;
  };
  actionables: {
    fragmentationProjects: Array<{
      projectId: string;
      title: string;
      workspaceId: string;
      workspaceName: string;
      openATasks: number;
      highestPriority: number;
    }>;
    disconnectedTasks: Array<{
      taskId: string;
      title: string;
      workspaceId: string;
      workspaceName: string;
      priority: number;
      status: TaskStatus;
      dueDate: string | null;
      suggestedProjectId: string | null;
      suggestedProjectTitle: string | null;
    }>;
    rescheduleRiskTasks: Array<{
      taskId: string;
      title: string;
      workspaceId: string;
      workspaceName: string;
      projectId: string | null;
      projectTitle: string | null;
      priority: number;
      status: TaskStatus;
      dueDate: string | null;
      delayedCount: number;
    }>;
    ghostProjects: Array<{
      projectId: string;
      title: string;
      workspaceId: string;
      workspaceName: string;
      status: ProjectStatus;
      idleDays: number;
      staleSinceDays: number;
      suggestedAction: 'reativar';
    }>;
    waitingFollowups: Array<{
      taskId: string;
      title: string;
      workspaceId: string;
      workspaceName: string;
      waitingOnPerson: string;
      waitingType: WaitingType;
      waitingPriority: WaitingPriority;
      waitingDueDate: string | null;
      overdueDays: number;
      dueToday: boolean;
    }>;
  };
};

export type ExecutionTop3Commitment = {
  date: string;
  workspaceId?: string | null;
  locked: boolean;
  manual: boolean;
  committedAt: string | null;
  note: string | null;
  taskIds: string[];
  tasks: Task[];
};

export type ExecutionScore = {
  date: string;
  workspaceId?: string | null;
  score: number;
  components: {
    aCompletion: {
      weight: number;
      value: number;
      completed: number;
      total: number;
    };
    deepWork: {
      weight: number;
      value: number;
      minutes: number;
      targetMinutes: number;
    };
    punctuality: {
      weight: number;
      value: number;
      onTime: number;
      total: number;
    };
    nonReschedule: {
      weight: number;
      value: number;
      delayed: number;
      total: number;
    };
    projectConnection: {
      weight: number;
      value: number;
      connected: number;
      total: number;
    };
  };
};

export type ExecutionEvolution = {
  generatedAt: string;
  workspaceId?: string | null;
  windowDays: number;
  index: number;
  previousIndex: number;
  deltaIndex: number;
  trend: 'subindo' | 'estavel' | 'caindo';
  stage: {
    code: 'reativo' | 'executor' | 'construtor' | 'estrategista';
    label: string;
    minIndex: number;
    next:
      | {
          code: 'reativo' | 'executor' | 'construtor' | 'estrategista';
          label: string;
          minIndex: number;
        }
      | null;
  };
  confidence: number;
  systemMode: {
    focusLimit: number;
    deepWorkTargetMinutes: number;
    maxNewTasksPerDay: number;
    strictModeDefault: boolean;
    allowBCExecutionWhileAPending: boolean;
    reviewRhythm: 'weekly' | 'monthly';
    enforcement: string;
    workloadGuard: string;
  };
  challenge: {
    title: string;
    metric: string;
    target: number;
    current: number;
    unit: string;
    dueDate: string;
    reason: string;
  };
  narrative: {
    summary: string;
    pressureMessage: string;
    riskIfIgnored: string;
    next7DaysPlan: string[];
  };
  metrics: {
    aCompletionRate: number;
    deepWorkHoursPerWeek: number;
    rescheduleRate: number;
    projectConnectionRate: number;
    constructionPercent: number;
    disconnectedPercent: number;
    consistencyPercent: number;
    ghostProjects: number;
  };
  promotion: {
    recommended: boolean;
    blockedBySelfAssessment: boolean;
    blockReason?: string | null;
    daysConsistent: number;
    reason: string;
  };
  regression: {
    risk: boolean;
    daysDecline: number;
    reason: string;
  };
  perceptionAlignment: {
    status: 'alinhado' | 'superestimado' | 'subestimado' | 'sem_dados';
    perceivedLevel: 'alto' | 'medio' | 'baixo' | 'sem_dados';
    objectiveLevel: 'alto' | 'medio' | 'baixo';
    note: string;
    sourcePeriodStart?: string | null;
  };
  learningLoop: {
    stageStability: number;
    decisionQualityScore: number;
    commitmentSignal: 'alto' | 'medio' | 'baixo' | 'sem_dados';
    decisionsLast90Days: number;
    selfAssessmentBlock: boolean;
    weeklyTrajectory: Array<{
      label: string;
      index: number;
    }>;
  };
  decisionJournal: Array<{
    id: string;
    kind: 'review' | 'event';
    periodType: ReviewPeriodType | null;
    periodStart: string | null;
    updatedAt: string;
    decision: string;
    commitmentLevel: CommitmentLevel | null;
    signal: 'executiva' | 'risco' | 'neutra';
    source: string;
    eventCode: string;
    impactScore: number;
  }>;
  explainableRules: Array<{
    id: string;
    title: string;
    description: string;
    metric: string;
    operator: 'gte' | 'lte';
    current: number;
    target: number;
    unit: string;
    weight: number;
    status: 'ok' | 'warning' | 'critical';
    impact: number;
    dataUsed: string;
    recommendation: string;
  }>;
  nextActions: string[];
};

export type WeeklyPulse = {
  weekStart: string;
  weekEnd: string;
  days: Array<{
    date: string;
    plannedMinutes: number;
    fixedMinutes: number;
    deepWorkMinutes: number;
    constructionMinutes: number;
    operationMinutes: number;
    disconnectedMinutes: number;
  }>;
  workspaceHours: Array<{
    workspaceId: string;
    name: string;
    minutes: number;
    hours: number;
  }>;
  workspaceHeatmap: Array<{
    workspaceId: string;
    name: string;
    totalMinutes: number;
    totalHours: number;
    days: Array<{
      date: string;
      minutes: number;
      hours: number;
    }>;
  }>;
  composition: {
    constructionPercent: number;
    operationPercent: number;
    disconnectedPercent: number;
  };
};

export type WeeklyAllocation = {
  weekStart: string;
  weekEnd: string;
  rows: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceColor: string;
    workspaceMode: WorkspaceMode;
    plannedPercent: number;
    actualPercent: number;
    deltaPercent: number;
    actualHours: number;
  }>;
  totals: {
    plannedPercent: number;
    actualHours: number;
    disconnectedPercent: number;
  };
};

export type WorkspacePortfolio = {
  weekStart: string;
  weekEnd: string;
  rows: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceColor: string;
    workspaceMode: WorkspaceMode;
    hoursInvested: number;
    deepWorkHours: number;
    completedA: number;
    openA: number;
    activeProjects: number;
    activeProjectsWithTraction: number;
    projectTractionPercent: number;
    ghostProjects: number;
    stalledProjects: number;
    frontHealth: {
      status: 'forte' | 'estavel' | 'atencao' | 'negligenciada' | 'standby';
      label: string;
      reason: string;
    };
    dominantBottleneck:
      | {
          key: string;
          label: string;
          percent: number;
        }
      | null;
  }>;
};

export type WeeklyReview = {
  weekStart: string;
  weekEnd: string;
  summary: {
    completedA: number;
    deepWorkMinutes: number;
    deepWorkHours: number;
    dominantWorkspace: WeeklyAllocation['rows'][number] | null;
    neglectedWorkspace: WeeklyAllocation['rows'][number] | null;
    ghostProjectsCount: number;
    ghostProjects: Array<{ id: string; title: string; workspace: { name: string }; reason?: string }>;
    ghostFrontsCount?: number;
    ghostFronts?: Array<{ id: string; title: string; workspace: { name: string }; reason?: string }>;
    dominantBottleneck:
      | {
          key: string;
          label: string;
          percent: number;
        }
      | null;
  };
  question: string;
  autoDraft: {
    generatedAt: string;
    confidence: 'alta' | 'media';
    source: string;
    nextPriority: string;
    strategicDecision: string;
    commitmentLevel: CommitmentLevel;
    actionItems: string[];
    reflection: string;
    dataUsed: string[];
  };
};

export type StrategicReviewEntry = {
  id: string;
  nextPriority?: string | null;
  strategicDecision?: string | null;
  commitmentLevel?: CommitmentLevel | null;
  actionItems: string[];
  reflection?: string | null;
  reviewSnapshot?: unknown;
  updatedAt: string;
};

export type StrategicReviewJournal = {
  periodType: ReviewPeriodType;
  periodStart: string;
  workspaceId?: string | null;
  workspaceScope: string;
  review: StrategicReviewEntry | null;
};

export type StrategicReviewHistoryItem = {
  id: string;
  periodType: ReviewPeriodType;
  periodStart: string;
  workspaceId?: string | null;
  nextPriority?: string | null;
  strategicDecision?: string | null;
  commitmentLevel?: CommitmentLevel | null;
  actionItems: string[];
  reflection?: string | null;
  updatedAt: string;
};

export type MonthlyReview = {
  monthStart: string;
  monthEnd: string;
  rows: WeeklyAllocation['rows'];
  composition: {
    constructionPercent: number;
    operationPercent: number;
    disconnectedPercent: number;
  };
  summary: {
    completedA: number;
    deepWorkMinutes: number;
    deepWorkHours: number;
    dominantWorkspace: WeeklyAllocation['rows'][number] | null;
    neglectedWorkspace: WeeklyAllocation['rows'][number] | null;
    ghostProjectsCount: number;
    ghostProjects: Array<{ id: string; title: string; workspace: { name: string }; reason?: string }>;
    ghostFrontsCount?: number;
    ghostFronts?: Array<{ id: string; title: string; workspace: { name: string }; reason?: string }>;
    dominantBottleneck:
      | {
          key: string;
          label: string;
          percent: number;
        }
      | null;
    actualHours: number;
  };
  journal: StrategicReviewEntry | null;
  question: string;
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
  streakExecucaoA: number;
  streakDeepWork: number;
  commitmentBreaks: Array<{
    id: string;
    at: string;
    type: 'failed' | 'delayed' | 'not_confirmed';
    reason: string;
    taskId: string | null;
    taskTitle: string;
    workspaceName: string;
    projectTitle: string | null;
    afterTop3Commit: boolean;
    committedAt: string | null;
    severity: 'alta' | 'media';
    impactScore: number;
    recoverySuggestion: string;
  }>;
};

export type GhostFrontResolution = {
  ok: boolean;
  workspaceId: string;
  workspaceName: string;
  mode: WorkspaceMode;
  action: 'reativar' | 'standby' | 'criar_tarefa_a';
  createdTaskId: string | null;
};

export type GhostProjectResolution = Project;

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 12000;

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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = new Headers(options?.headers ?? {});
    const hasBody = options?.body !== undefined;
    const isFormDataBody = typeof FormData !== 'undefined' && options?.body instanceof FormData;

    if (hasBody && !isFormDataBody && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE}${path}`, {
      headers,
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(payload.error ?? `Erro ${response.status} ao chamar API.`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('A API demorou para responder. Verifique backend e conexão.');
    }

    if (error instanceof TypeError) {
      throw new Error('Não foi possível conectar com a API. Inicie o backend e tente novamente.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const api = {
  getWorkspaces: () => apiRequest<Workspace[]>('/workspaces'),
  createWorkspace: (input: {
    name: string;
    type: WorkspaceType;
    category?: string;
    mode?: WorkspaceMode;
    color?: string;
  }) =>
    apiRequest<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateWorkspace: (
    workspaceId: string,
    input: Partial<{
      name: string;
      type: WorkspaceType;
      category: string;
      mode: WorkspaceMode;
      color: string;
    }>
  ) =>
    apiRequest<Workspace>(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteWorkspace: (workspaceId: string, query?: { force?: boolean }) =>
    apiRequest<{ ok: boolean; projectsCount: number; tasksCount: number }>(
      withQuery(`/workspaces/${workspaceId}`, query),
      {
        method: 'DELETE'
      }
    ),

  getProjects: (query?: { workspaceId?: string }) =>
    apiRequest<Project[]>(withQuery('/projects', query)),
  createProject: (input: {
    workspaceId: string;
    title: string;
    description?: string | null;
    status?: ProjectStatus;
    type?: ProjectType;
    objective?: string | null;
    primaryMetric?: string | null;
    actionStatement?: string | null;
    timeHorizonEnd?: string | null;
    resultStartValue?: number | null;
    resultCurrentValue?: number | null;
    resultTargetValue?: number | null;
    scorecardCadenceDays?: number;
    metrics?: Array<{
      kind: ProjectMetricKind;
      name: string;
      description?: string | null;
      targetValue?: number | null;
      baselineValue?: number | null;
      currentValue?: number | null;
      unit?: string | null;
    }>;
  }) =>
    apiRequest<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateProject: (
    projectId: string,
    input: Partial<{
      title: string;
      description: string | null;
      status: ProjectStatus;
      type: ProjectType;
      objective: string | null;
      primaryMetric: string | null;
      actionStatement: string | null;
      timeHorizonEnd: string | null;
      resultStartValue: number | null;
      resultCurrentValue: number | null;
      resultTargetValue: number | null;
      scorecardCadenceDays: number;
    }>
  ) =>
    apiRequest<Project>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteProject: (projectId: string, query?: { cascadeTasks?: boolean }) =>
    apiRequest<{ ok: boolean; linkedTasks: number; deletedTasks: number }>(
      withQuery(`/projects/${projectId}`, query),
      {
        method: 'DELETE'
      }
    ),
  resolveGhostProject: (
    projectId: string,
    input: {
      action: 'reativar' | 'mover_latente' | 'encerrar';
    }
  ) =>
    apiRequest<GhostProjectResolution>(`/projects/${projectId}/ghost-action`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  getProjectScorecard: (projectId: string, query?: { weekStart?: string }) =>
    apiRequest<ProjectScorecard>(withQuery(`/projects/${projectId}/scorecard`, query)),
  createProjectMetric: (
    projectId: string,
    input: {
      kind: ProjectMetricKind;
      name: string;
      description?: string | null;
      targetValue?: number | null;
      baselineValue?: number | null;
      currentValue?: number | null;
      unit?: string | null;
    }
  ) =>
    apiRequest<ProjectMetric>(`/projects/${projectId}/metrics`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateProjectMetric: (
    metricId: string,
    input: Partial<{
      name: string;
      description: string | null;
      targetValue: number | null;
      baselineValue: number | null;
      currentValue: number | null;
      unit: string | null;
      archived: boolean;
    }>
  ) =>
    apiRequest<ProjectMetric>(`/project-metrics/${metricId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteProjectMetric: (metricId: string) =>
    apiRequest<{ ok: boolean }>(`/project-metrics/${metricId}`, {
      method: 'DELETE'
    }),
  createProjectMetricCheckin: (
    metricId: string,
    input: {
      weekStart?: string;
      value: number;
      note?: string | null;
      syncCurrentValue?: boolean;
    }
  ) =>
    apiRequest<ProjectMetricCheckin>(`/project-metrics/${metricId}/checkins`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  deleteProjectMetricCheckin: (metricId: string, query: { weekStart: string }) =>
    apiRequest<{ ok: boolean; deleted: boolean }>(
      withQuery(`/project-metrics/${metricId}/checkins`, query),
      {
        method: 'DELETE'
      }
    ),

  getTasks: (query?: {
    workspaceId?: string;
    projectId?: string;
    status?: TaskStatus;
    horizon?: TaskHorizon;
    waitingOnly?: boolean;
    restrictedOnly?: boolean;
  }) =>
    apiRequest<Task[]>(withQuery('/tasks', query)),
  createTask: (input: {
    workspaceId: string;
    projectId?: string | null;
    title: string;
    description?: string;
    definitionOfDone: string;
    taskType: TaskType;
    energyLevel: TaskEnergy;
    executionKind: TaskExecutionKind;
    horizon?: TaskHorizon;
    priority?: number;
    dueDate?: string | null;
    estimatedMinutes: number;
    isMultiBlock?: boolean;
    multiBlockGoalMinutes?: number | null;
    waitingOnPerson?: string | null;
    waitingType?: WaitingType | null;
    waitingPriority?: WaitingPriority | null;
    waitingDueDate?: string | null;
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
      definitionOfDone: string | null;
      taskType: TaskType;
      energyLevel: TaskEnergy;
      executionKind: TaskExecutionKind;
      status: TaskStatus;
      horizon: TaskHorizon;
      priority: number;
      dueDate: string | null;
      estimatedMinutes: number | null;
      isMultiBlock: boolean;
      multiBlockGoalMinutes: number | null;
      fixedTimeStart: string | null;
      fixedTimeEnd: string | null;
      windowStart: string | null;
      windowEnd: string | null;
      waitingOnPerson: string | null;
      waitingType: WaitingType | null;
      waitingPriority: WaitingPriority | null;
      waitingDueDate: string | null;
    }>
  ) =>
    apiRequest<Task>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  completeTask: (taskId: string, query?: { strictMode?: boolean }) =>
    apiRequest<Task>(withQuery(`/tasks/${taskId}/complete`, query), {
      method: 'POST'
    }),
  postponeTask: (taskId: string) =>
    apiRequest<Task>(`/tasks/${taskId}/postpone`, {
      method: 'POST'
    }),
  getTaskSubtasks: (taskId: string) => apiRequest<Subtask[]>(`/tasks/${taskId}/subtasks`),
  createTaskSubtask: (taskId: string, title: string) =>
    apiRequest<Subtask>(`/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title })
    }),
  updateTaskSubtask: (
    subtaskId: string,
    input: Partial<{
      title: string;
      status: 'backlog' | 'feito';
    }>
  ) =>
    apiRequest<Subtask>(`/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteTaskSubtask: (subtaskId: string) =>
    apiRequest<{ ok: boolean }>(`/subtasks/${subtaskId}`, {
      method: 'DELETE'
    }),
  getTaskRestrictions: (taskId: string) =>
    apiRequest<TaskRestriction[]>(`/tasks/${taskId}/restrictions`),
  createTaskRestriction: (
    taskId: string,
    input: {
      title: string;
      detail?: string | null;
    }
  ) =>
    apiRequest<TaskRestriction>(`/tasks/${taskId}/restrictions`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateTaskRestriction: (
    restrictionId: string,
    input: Partial<{
      title: string;
      detail: string | null;
      status: 'aberta' | 'resolvida';
    }>
  ) =>
    apiRequest<TaskRestriction>(`/task-restrictions/${restrictionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteTaskRestriction: (restrictionId: string) =>
    apiRequest<{ ok: boolean }>(`/task-restrictions/${restrictionId}`, {
      method: 'DELETE'
    }),
  deleteTask: (taskId: string) =>
    apiRequest<{ ok: boolean }>(`/tasks/${taskId}`, {
      method: 'DELETE'
    }),
  getTaskHistory: (taskId: string) => apiRequest<TaskHistoryEntry[]>(`/tasks/${taskId}/history`),
  getTaskMultiBlockProgress: (taskId: string) =>
    apiRequest<TaskMultiBlockProgress>(`/tasks/${taskId}/multiblock`),
  getWaitingFollowupRadar: (query?: { workspaceId?: string }) =>
    apiRequest<WaitingFollowupRadar>(withQuery('/tasks/waiting-radar', query)),
  registerWaitingFollowup: (
    taskId: string,
    input?: {
      note?: string;
      source?: 'manual' | 'auto';
      triggerQueue?: boolean;
    }
  ) =>
    apiRequest<WaitingFollowupRadar['rows'][number]>(`/tasks/${taskId}/waiting-followup`, {
      method: 'POST',
      body: JSON.stringify(input ?? {})
    }),

  getExecutionBriefing: (date: string, query?: { workspaceId?: string; strictMode?: boolean }) =>
    apiRequest<ExecutionBriefing>(withQuery(`/execution/briefing/${date}`, query)),
  getExecutionScore: (date: string, query?: { workspaceId?: string }) =>
    apiRequest<ExecutionScore>(withQuery(`/execution/score/${date}`, query)),
  getExecutionEvolution: (query?: { workspaceId?: string; windowDays?: number }) =>
    apiRequest<ExecutionEvolution>(withQuery('/execution/evolution', query)),
  getWeeklyPulse: (query?: { workspaceId?: string; weekStart?: string }) =>
    apiRequest<WeeklyPulse>(withQuery('/execution/weekly-pulse', query)),
  getExecutionTop3: (date: string, query?: { workspaceId?: string }) =>
    apiRequest<ExecutionTop3Commitment>(withQuery(`/execution/top3/${date}`, query)),
  commitExecutionTop3: (
    date: string,
    input: {
      taskIds: string[];
      note?: string;
    },
    query?: { workspaceId?: string }
  ) =>
    apiRequest<ExecutionTop3Commitment>(withQuery(`/execution/top3/${date}`, query), {
      method: 'PUT',
      body: JSON.stringify(input)
    }),
  clearExecutionTop3: (date: string, query?: { workspaceId?: string }) =>
    apiRequest<ExecutionTop3Commitment>(withQuery(`/execution/top3/${date}`, query), {
      method: 'DELETE'
    }),

  getWeeklyAllocation: (query?: { weekStart?: string; workspaceId?: string }) =>
    apiRequest<WeeklyAllocation>(withQuery('/strategy/weekly-allocation', query)),
  getWorkspacePortfolio: (query?: { weekStart?: string }) =>
    apiRequest<WorkspacePortfolio>(withQuery('/strategy/workspace-portfolio', query)),
  updateWeeklyAllocation: (
    weekStart: string,
    input: { allocations: Array<{ workspaceId: string; plannedPercent: number }> }
  ) =>
    apiRequest<WeeklyAllocation>(`/strategy/weekly-allocation/${weekStart}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    }),
  getWeeklyReview: (query?: { weekStart?: string; workspaceId?: string }) =>
    apiRequest<WeeklyReview>(withQuery('/strategy/weekly-review', query)),
  getMonthlyReview: (query?: { monthStart?: string; workspaceId?: string }) =>
    apiRequest<MonthlyReview>(withQuery('/strategy/monthly-review', query)),
  getReviewJournal: (query: { periodType: ReviewPeriodType; periodStart?: string; workspaceId?: string }) =>
    apiRequest<StrategicReviewJournal>(withQuery('/strategy/review-journal', query)),
  updateReviewJournal: (
    periodType: ReviewPeriodType,
    periodStart: string,
    input: Partial<{
      workspaceId: string;
      nextPriority: string;
      strategicDecision: string;
      commitmentLevel: CommitmentLevel;
      actionItems: string[];
      reflection: string;
    }>
  ) =>
    apiRequest<StrategicReviewJournal>(`/strategy/review-journal/${periodType}/${periodStart}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    }),
  getReviewHistory: (query: { periodType: ReviewPeriodType; workspaceId?: string; limit?: number }) =>
    apiRequest<StrategicReviewHistoryItem[]>(withQuery('/strategy/review-history', query)),
  resolveGhostFront: (
    workspaceId: string,
    input: {
      action: 'reativar' | 'standby' | 'criar_tarefa_a';
    }
  ) =>
    apiRequest<GhostFrontResolution>(`/strategy/ghost-fronts/${workspaceId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),

  getActiveDeepWork: (query?: { workspaceId?: string }) =>
    apiRequest<DeepWorkSession | null>(withQuery('/deep-work/active', query)),
  getDeepWorkSummary: (date: string, query?: { workspaceId?: string }) =>
    apiRequest<DeepWorkSummary>(withQuery(`/deep-work/summary/${date}`, query)),
  startDeepWork: (input: { taskId: string; targetMinutes?: number; minimumBlockMinutes?: number }) =>
    apiRequest<DeepWorkSession>('/deep-work/start', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  registerDeepWorkInterruption: (sessionId: string) =>
    apiRequest<DeepWorkSession>(`/deep-work/${sessionId}/interruption`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  registerDeepWorkBreak: (sessionId: string) =>
    apiRequest<DeepWorkSession>(`/deep-work/${sessionId}/break`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  stopDeepWork: (sessionId: string, input?: { switchedTask?: boolean; notes?: string }) =>
    apiRequest<DeepWorkSession>(`/deep-work/${sessionId}/stop`, {
      method: 'POST',
      body: JSON.stringify(input ?? {})
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
  confirmDayPlanItem: (
    id: string,
    action: 'done' | 'not_done' | 'postpone',
    reason?: FailureReason
  ) =>
    apiRequest<DayPlanItem>(`/day-plan-items/${id}/confirmation`, {
      method: 'POST',
      body: JSON.stringify({ action, reason })
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
