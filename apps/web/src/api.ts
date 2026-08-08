import type {
  DailyExecutionResponse,
  RolloverAction,
  TodayEntry
} from './features/today/types';
import type {
  CreateExecutionProjectInput,
  CreateExecutionProjectResult,
  FrontOverview,
  FrontOverviewListItem,
  ProjectCockpit,
  ProjectExecutionListItem,
  ProjectNextMove,
  Responsibility,
  ResponsibilityCadence,
  ResponsibilityHealth,
  ResponsibilityReview
} from './features/projects/types';
import type {
  NoteArtifact,
  NoteArtifactKind,
  NoteArtifactSummary,
  NoteSummary
} from './features/notes/types';

export type { DailyExecutionResponse, RolloverAction, TodayEntry } from './features/today/types';
export type {
  CreateExecutionProjectInput,
  CreateExecutionProjectResult,
  FrontOverview,
  FrontOverviewListItem,
  ProjectCockpit,
  ProjectExecutionListItem,
  ProjectNextMove,
  Responsibility,
  ResponsibilityCadence,
  ResponsibilityHealth,
  ResponsibilityReview
} from './features/projects/types';
export type {
  NoteArtifact,
  NoteArtifactKind,
  NoteArtifactSummary,
  NoteSummary
} from './features/notes/types';

export type WorkspaceType = 'empresa' | 'pessoal' | 'vida' | 'autoridade' | 'geral' | 'outro';
export type WorkspaceMode = 'expansao' | 'manutencao' | 'standby';
export type ProjectType = 'construcao' | 'operacao' | 'crescimento';
export type ProjectMethodology =
  | 'fourdx' | 'delivery' | 'launch' | 'discovery' | 'growth'  // legacy
  | 'entrega' | 'exploracao' | 'pipeline' | 'captacao'
  | 'campanha' | 'processo' | 'okr' | 'decisao'
  | 'mentoria' | 'autoridade' | 'cenario' | 'runway' | 'sistema_receita' | 'funil';
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
export type TaskExecutionKind = 'construcao' | 'otimizacao' | 'operacao' | 'suporte';
export type NoteType =
  | 'inbox'
  | 'geral'
  | 'pessoas'
  | 'conteudo'
  | 'produto'
  | 'conclusao_tarefa'
  | 'referencia';
export type NoteContentBlock = Record<string, unknown>;
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

export type MethodologyData = {
  // Milestone engine (Entrega, Autoridade)
  milestones?: Array<{ id: string; title: string; done: boolean; critical?: boolean; doneAt?: string | null; order?: number }>;
  blockers?: Array<{ id: string; title: string; resolvedAt?: string | null }>;
  // Authority variant
  proofs?: Array<{ id: string; type: 'artigo' | 'palestra' | 'case' | 'mencao' | 'podcast' | 'outro'; title: string; link?: string | null; points: number; createdAt: string }>;
  // Pipeline engine (Pipeline, Captação, Sistema de Receita)
  stages?: Array<{ id: string; label: string; order: number }>;
  deals?: Array<{ id: string; name: string; stageId: string; amount?: number | null; probability?: number | null; notes?: string | null; createdAt: string; stageEnteredAt?: string | null }>;
  currency?: string;
  totalGoal?: number;
  // Sistema de Receita — per-stage criteria (separate from decision criteria)
  stageCriteria?: Array<{ id: string; stageId: string; text: string; done: boolean; doneAt?: string | null }>;
  // Log engine (Exploração)
  discoveries?: Array<{ id: string; text: string; type: 'confirms' | 'refutes' | 'inconclusive'; week: string; createdAt: string }>;
  decision?: { choice: 'follow' | 'pivot' | 'discard'; justification: string; decidedAt: string } | null;
  hypothesis?: string;
  hypothesisCriteria?: string;
  // Log engine (Mentoria)
  sessions?: Array<{ id: string; date: string; durationMin?: number | null; learned: string; commitments: Array<{ id: string; text: string; done: boolean; doneAt?: string | null }> }>;
  nextSessionDate?: string | null;
  mentoriaRole?: 'receiving' | 'giving';
  mentoriaWith?: string | null;
  // OKR engine
  krs?: Array<{ id: string; description: string; currentValue: number; targetValue: number; unit?: string | null; confidence: 'alta' | 'media' | 'baixa'; order: number }>;
  okrPeriod?: string;
  // Decision engine
  options?: Array<{ id: string; label: string; scores?: Record<string, number> }>;
  criteria?: Array<{ id: string; label: string; weight: number }>;
  decisionChoice?: string | null;
  decisionJustification?: string | null;
  decisionDate?: string | null;
  // Scenario variant
  scenarios?: Array<{ id: string; label: string }>;
  scenarioActions?: Array<{ id: string; text: string; done: boolean; scenarioIds: string[] }>;
  scenarioDecisionDate?: string | null;
  // Time engine (Campanha)
  launchDate?: string | null;
  campaignGoal?: number | null;
  campaignChannel?: string | null;
  campaignResult?: number | null;
  dailyTasks?: Array<{ id: string; date: string; text: string; done: boolean }>;
  // Time engine (Runway)
  availableCash?: number | null;
  burnRateMonthly?: number | null;
  runwayEvents?: Array<{ id: string; label: string; amount: number; date: string; confirmed: boolean }>;
  // Recurring engine
  frequency?: 'semanal' | 'mensal' | 'trimestral';
  cycleTemplate?: Array<{ id: string; text: string; order: number }>;
  cycles?: Array<{ id: string; periodLabel: string; startDate: string; items: Array<{ templateId: string; done: boolean }> }>;
  // Funil engine
  funilStages?: Array<{ id: string; label: string; value: number | null; order: number }>;
};

export type Project = {
  id: string;
  title: string;
  description?: string | null;
  status?: ProjectStatus;
  type?: ProjectType;
  methodology?: ProjectMethodology;
  objective?: string | null;
  primaryMetric?: string | null;
  actionStatement?: string | null;
  methodologyExtraOne?: string | null;
  methodologyExtraTwo?: string | null;
  methodologyData?: MethodologyData | null;
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
  nextStep?: string | null;
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

export type TaskBacklogItem = Task & {
  todayEntryId: string | null;
  stepSummary: { total: number; completed: number };
  openRestrictionCount: number;
};

export type TaskBacklogResponse = {
  date: string;
  items: TaskBacklogItem[];
};

export type Note = {
  id: string;
  title: string;
  content?: string | null;
  contentBlocks?: NoteContentBlock[] | null;
  contentText?: string | null;
  contentHtml?: string | null;
  contentVersion?: number;
  editVersion: number;
  type: NoteType;
  tags: string[];
  pinned: boolean;
  folderId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  folder?: NoteFolder | null;
  workspace?: Workspace | null;
  project?: Project | null;
  task?: Pick<Task, 'id' | 'title' | 'status'> | null;
  artifacts?: NoteArtifactSummary[];
};

export type NoteRevision = {
  id: string;
  noteId: string;
  title: string;
  content?: string | null;
  contentBlocks?: NoteContentBlock[] | null;
  contentText?: string | null;
  contentHtml?: string | null;
  contentVersion?: number;
  type: NoteType;
  tags: string[];
  pinned: boolean;
  folderId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  source: string;
  createdAt: string;
};

export type NoteFolder = {
  id: string;
  name: string;
  color?: string | null;
  parentId?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type NotesTranscriptionCapabilities = {
  enabled: boolean;
  provider: 'webhook' | 'disabled' | string;
  realtime?: boolean;
  model?: string;
  maxAudioBytes: number;
  maxAudioMB: number;
};

export type NotesDictationSession = {
  ok: boolean;
  provider: 'deepgram' | string;
  model: string;
  language: string;
  sessionId: string;
  expiresAt: string;
  wsPath: string;
  wsProtocols?: string[];
};

export type NotesAudioTranscriptionResult = {
  ok: boolean;
  provider: string;
  transcript: string | null;
  titleSuggestion?: string | null;
  structuredContent?: string | null;
  tags: string[];
  confidence?: number | null;
  durationMs?: number | null;
};

export type NotesDictationCleanupResult = {
  ok: boolean;
  provider: string;
  model: string;
  text: string;
  usage?: Record<string, unknown> | null;
};

// ── Phone ─────────────────────────────────────────────────────────────────

export type UserPhone = {
  phoneNumber: string | null;
};

// ── Canvas ────────────────────────────────────────────────────────────────

export interface DiagramData {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: { label: string; [key: string]: unknown };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
  viewport: { x: number; y: number; zoom: number };
}

export interface MindMapData {
  nodeData: {
    id: string;
    topic: string;
    children?: MindMapData['nodeData'][];
  };
}

export interface Diagram {
  id: string;
  noteId: string;
  title: string | null;
  data: DiagramData;
  createdAt: string;
  updatedAt: string;
}

export interface MindMap {
  id: string;
  noteId: string;
  title: string | null;
  data: MindMapData;
  createdAt: string;
  updatedAt: string;
}

// tldraw snapshot — opaque JSON preserved as-is
export type WhiteboardData = Record<string, unknown>;

export interface Whiteboard {
  id: string;
  noteId: string;
  title: string | null;
  data: WhiteboardData;
  createdAt: string;
  updatedAt: string;
}

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
  framework: {
    methodology: ProjectMethodology;
    guide: string;
    board: {
      chartFamily: 'line' | 'burndown' | 'launch' | 'validation' | 'momentum';
      xAxis: string;
      yAxis: string;
    };
    cards: Array<{
      id: string;
      title: string;
      value: string;
      hint: string;
      tone: 'ok' | 'risk' | 'neutral' | 'pending';
    }>;
    rituals: Array<{
      id: string;
      title: string;
      status: 'done' | 'pending' | 'risk';
      description: string;
    }>;
    weekly: {
      weekStart: string;
      leadOneDone: boolean;
      leadTwoDone: boolean;
      lagValue: number | null;
      note: string | null;
      extra: Record<string, string | number | boolean | null>;
    } | null;
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
  position: number;
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
  inboxItemId: string | null;
  startTime: string;
  endTime: string;
  completedAt: string | null;
  orderIndex: number;
  blockType: 'task' | 'fixed';
  confirmationState: 'pending' | 'confirmed_done' | 'confirmed_not_done';
  task?: Task | null;
  inboxItem?: InboxItem | null;
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

export type InboxItemStatus = 'pendente' | 'feito' | 'convertido' | 'agenda' | 'aguardando';

export type InboxContextRef = {
  id: string;
  name: string;
};

export type WorkspaceRef = {
  id: string;
  name: string;
  color: string;
};

export type InboxItem = {
  id: string;
  content: string;
  source: 'app' | 'whatsapp';
  status: InboxItemStatus;
  workspaceId: string | null;
  inboxContextId: string | null;
  position: number;
  waitingDate: string | null;
  waitingPerson: string | null;
  waitingNote: string | null;
  scheduledAt: string | null;
  convertedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  workspace: WorkspaceRef | null;
  inboxContext: InboxContextRef | null;
};

export type InboxContext = {
  id: string;
  clerkUserId: string;
  name: string;
  position: number;
  createdAt: string;
};

export type InboxListResponse = {
  items: InboxItem[];
  contexts: InboxContext[];
};

export type InboxTodayItem = {
  id: string;
  clerkUserId: string;
  inboxItemId: string;
  todayDate: string;
  position: number;
  completedAt: string | null;
  createdAt: string;
  inboxItem: InboxItem & {
    workspace: WorkspaceRef | null;
    inboxContext: InboxContextRef | null;
  };
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

export type CommitmentType = 'fixo' | 'variavel';
export type CommitmentStatus = 'ativo' | 'pausado' | 'encerrado';
export type RecurrenceDay = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';

export type CommitmentException = {
  id: string;
  commitmentId: string;
  date: string;
  action: 'cancelled' | 'rescheduled';
  newDate: string | null;
  newTime: string | null;
  note: string | null;
  createdAt: string;
};

export type Commitment = {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  type: CommitmentType;
  status: CommitmentStatus;
  startTime: string | null;
  durationMin: number | null;
  recurrenceDays: RecurrenceDay[];
  date: string | null;
  recurrenceEnd: string | null;
  createdAt: string;
  updatedAt: string;
  exceptions: CommitmentException[];
};

export type CommitmentWeekResult = Record<string, Commitment[]>;

export type CommitmentOccurrence = {
  id: string;
  commitmentId: string;
  date: string;
  title: string;
  startTime: string | null;
  durationMin: number | null;
  workspaceId: string | null;
  recurring: boolean;
  rescheduled: boolean;
};

export type AgendaBlock = {
  id: string;
  kind: 'task' | 'inbox';
  sourceId: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  completedAt: string | null;
  workspaceId: string | null;
  plannedMinutes: number;
};

export type AgendaTaskSource = {
  id: string;
  title: string;
  estimatedMinutes: number;
  plannedMinutes: number;
  remainingMinutes: number;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceColor: string | null;
  projectName: string | null;
};

export type AgendaInboxSource = {
  id: string;
  title: string;
  workspaceId: string | null;
  context: string | null;
};

export type AgendaWeek = {
  weekStart: string;
  resourceErrors: { commitments: string | null };
  days: Array<{
    date: string;
    intents: TodayEntry[];
    blocks: AgendaBlock[];
    commitments: CommitmentOccurrence[];
  }>;
  unscheduled: {
    tasks: AgendaTaskSource[];
    inbox: AgendaInboxSource[];
  };
};

export type StartExecutionInput = {
  sourceType: 'task' | 'inbox';
  sourceId: string;
  dayPlanItemId?: string | null;
  dailyExecutionItemId?: string | null;
};

export type ExecutionSession = {
  id: string;
  kind: 'task' | 'inbox';
  sourceId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  state: 'active' | 'completed' | 'cancelled';
  dayPlanItemId: string | null;
  dailyExecutionItemId: string | null;
};

export type HabitType = 'binary' | 'quantitative' | 'vice';
export type HabitLifeArea = 'corpo' | 'mente' | 'trabalho' | 'relacoes' | 'financas' | 'crescimento';
export type HabitFrequency = 'daily' | 'weekly' | 'monthly' | 'specific_days';
export type HabitStatus = 'ativo' | 'pausado' | 'arquivado';

export type Habit = {
  id: string; title: string; lifeArea: HabitLifeArea; type: HabitType;
  icon: string | null; color: string | null; frequencyType: HabitFrequency;
  frequencyTarget: number; specificDays: RecurrenceDay[];
  unit: string | null; dailyTarget: number | null; xpPerCompletion: number;
  status: HabitStatus; sortOrder: number; createdAt: string; updatedAt: string;
};

export type HabitLog = {
  id: string; habitId: string; date: string; value: number;
  note: string | null; createdAt: string;
};

export type HabitTodayStat = Habit & {
  currentLog: HabitLog | null; streak: number;
  periodProgress: { done: number; target: number } | null;
  isCompletedToday: boolean;
  isScheduledForDate: boolean;
};

export type HabitLevelInfo = {
  level: number; name: string; totalXp: number;
  progressPct: number; nextLevelXp: number | null;
};

export type HabitRadarStats = Record<HabitLifeArea, HabitLevelInfo>;

export type HabitEvolution = {
  startDate: string;
  endDate: string;
  expectedOccurrences: number;
  completedOccurrences: number;
  rhythmPct: number;
  areas: Array<HabitLevelInfo & { lifeArea: HabitLifeArea }>;
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
const PRYMEIRA_HUB_URL = (
  import.meta.env.VITE_PRYMEIRA_HUB_URL ?? 'https://hub.prymeiradigital.com.br'
).replace(/\/$/, '');
const PRYMEIRA_PRODUCT_KEY = import.meta.env.VITE_PRYMEIRA_PRODUCT_KEY ?? 'operis';
const REQUEST_TIMEOUT_MS = 12000;
const NOTES_TRANSCRIBE_TIMEOUT_MS = 180000;

// Token getter injected by AuthSync component so apiRequest stays a plain function
let _getToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  _getToken = getter;
}

export function productAccessDeniedUrl(reason = 'no_entitlement') {
  const params = new URLSearchParams({
    product_key: PRYMEIRA_PRODUCT_KEY,
    reason
  });

  if (typeof window !== 'undefined' && window.location?.href) {
    params.set('return_url', window.location.href);
  }

  return `${PRYMEIRA_HUB_URL}/acesso-negado?${params.toString()}`;
}

export function redirectToProductAccessPage(reason = 'no_entitlement', accessUrl?: string) {
  const targetUrl = accessUrl || productAccessDeniedUrl(reason);
  window.location.assign(targetUrl);
}

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

export function apiWebSocketUrl(path: string) {
  const runtimeOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  const baseUrl = new URL(API_BASE, runtimeOrigin);
  const pathUrl = new URL(path, 'http://operis.local');
  const basePath = baseUrl.pathname.replace(/\/$/, '');
  baseUrl.protocol =
    baseUrl.protocol === 'https:' || baseUrl.protocol === 'wss:' ? 'wss:' : 'ws:';
  baseUrl.pathname = `${basePath}${pathUrl.pathname}`;
  baseUrl.search = pathUrl.search;
  baseUrl.hash = '';
  return baseUrl.toString();
}

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

async function apiRequest<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const { timeoutMs: _ignoredTimeoutMs, ...fetchOptions } = options ?? {};
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(options?.headers ?? {});
    const hasBody = options?.body !== undefined;
    const isFormDataBody = typeof FormData !== 'undefined' && options?.body instanceof FormData;

    if (hasBody && !isFormDataBody && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (_getToken) {
      const token = await _getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      const reason = typeof payload.reason === 'string' ? payload.reason : 'no_entitlement';
      const accessUrl = typeof payload.accessUrl === 'string' ? payload.accessUrl : undefined;

      if (response.status === 403 && payload.productAccessRequired === true) {
        redirectToProductAccessPage(reason, accessUrl);
      }

      const detail = typeof payload.detail === 'string' ? payload.detail : '';
      const message =
        (typeof payload.error === 'string' && payload.error) ||
        (typeof payload.message === 'string' && payload.message) ||
        `Erro ${response.status} ao chamar API.`;
      throw new Error(detail ? `${message} ${detail}` : message);
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

  getFrontsOverview: () =>
    apiRequest<FrontOverviewListItem[]>('/workspaces/overview'),
  getFrontOverview: (workspaceId: string) =>
    apiRequest<FrontOverview>(`/workspaces/${workspaceId}/overview`),
  getResponsibilities: (workspaceId: string) =>
    apiRequest<Responsibility[]>(`/workspaces/${workspaceId}/responsibilities`),
  createResponsibility: (
    workspaceId: string,
    input: {
      title: string;
      expectedStandard: string;
      cadence: ResponsibilityCadence;
      cadenceIntervalDays?: number | null;
      health?: ResponsibilityHealth;
      nextCare: string;
      nextReviewAt: string;
    }
  ) => apiRequest<Responsibility>(`/workspaces/${workspaceId}/responsibilities`, {
    method: 'POST',
    body: JSON.stringify(input)
  }),
  updateResponsibility: (
    responsibilityId: string,
    input: Partial<{
      title: string;
      expectedStandard: string;
      cadence: ResponsibilityCadence;
      cadenceIntervalDays: number | null;
      health: ResponsibilityHealth;
      nextCare: string;
      nextReviewAt: string;
    }>
  ) => apiRequest<Responsibility>(`/responsibilities/${responsibilityId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  }),
  reviewResponsibility: (
    responsibilityId: string,
    input: {
      health: ResponsibilityHealth;
      note?: string;
      nextCare: string;
      nextReviewAt?: string;
      createTask?: 'backlog' | 'today';
    }
  ) => apiRequest<{ responsibility: Responsibility; review: ResponsibilityReview; task: Task | null }>(
    `/responsibilities/${responsibilityId}/reviews`,
    { method: 'POST', body: JSON.stringify(input) }
  ),
  getResponsibilityReviews: (responsibilityId: string) =>
    apiRequest<ResponsibilityReview[]>(`/responsibilities/${responsibilityId}/reviews`),
  pauseResponsibility: (responsibilityId: string, paused = true) =>
    apiRequest<Responsibility>(`/responsibilities/${responsibilityId}/pause`, {
      method: 'POST',
      body: JSON.stringify({ paused })
    }),
  archiveResponsibility: (responsibilityId: string) =>
    apiRequest<Responsibility>(`/responsibilities/${responsibilityId}/archive`, { method: 'POST' }),

  getProjects: (query?: { workspaceId?: string }) =>
    apiRequest<Project[]>(withQuery('/projects', query)),
  getProjectExecutionList: (query?: { workspaceId?: string; status?: ProjectStatus; search?: string }) =>
    apiRequest<ProjectExecutionListItem[]>(withQuery('/project-execution', query)),
  getProjectCockpit: (projectId: string) =>
    apiRequest<ProjectCockpit>(`/project-execution/${projectId}`),
  createExecutionProject: (input: CreateExecutionProjectInput, idempotencyKey: string) =>
    apiRequest<CreateExecutionProjectResult>('/project-execution', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input)
    }),
  createProjectNextMove: (
    projectId: string,
    input: { text: string; source: 'manual' | 'recommendation'; reason?: string; ruleKey?: string }
  ) => apiRequest<ProjectNextMove>(`/projects/${projectId}/next-moves`, {
    method: 'POST',
    body: JSON.stringify(input)
  }),
  sendProjectMoveToToday: (projectId: string, nextMoveId: string, idempotencyKey: string) =>
    apiRequest<{ move: ProjectNextMove; task: Task }>(
      `/projects/${projectId}/next-moves/${nextMoveId}/to-today`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }
    ),
  resolveProjectNextMove: (projectId: string, nextMoveId: string) =>
    apiRequest<ProjectNextMove>(`/projects/${projectId}/next-moves/${nextMoveId}/resolve`, {
      method: 'POST'
    }),
  createProject: (input: {
    workspaceId: string;
    title: string;
    description?: string | null;
    status?: ProjectStatus;
    type?: ProjectType;
    methodology?: ProjectMethodology;
    objective?: string | null;
    primaryMetric?: string | null;
    actionStatement?: string | null;
    methodologyExtraOne?: string | null;
    methodologyExtraTwo?: string | null;
    methodologyData?: MethodologyData | null;
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
      methodology: ProjectMethodology;
      objective: string | null;
      primaryMetric: string | null;
      actionStatement: string | null;
      methodologyExtraOne: string | null;
      methodologyExtraTwo: string | null;
      methodologyData: MethodologyData | null;
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
  createProjectFrameworkCheckin: (
    projectId: string,
    input: {
      weekStart?: string;
      leadOneDone: boolean;
      leadTwoDone: boolean;
      lagValue?: number | null;
      note?: string | null;
      extra?: Record<string, string | number | boolean | null>;
    }
  ) =>
    apiRequest<{
      ok: boolean;
      weekStart: string;
      leadOne: { id: string; value: number };
      leadTwo: { id: string; value: number };
      lag: { id: string; value: number } | null;
    }>(`/projects/${projectId}/framework-checkin`, {
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

  // Methodology items CRUD
  addMethodologyItem: (projectId: string, input: { arrayKey: string; item: Record<string, unknown> }) =>
    apiRequest<{ item: Record<string, unknown>; methodologyData: MethodologyData }>(`/projects/${projectId}/methodology-items`, { method: 'POST', body: JSON.stringify(input) }),

  updateMethodologyItem: (projectId: string, itemId: string, input: { arrayKey: string; item: Record<string, unknown> }) =>
    apiRequest<{ item: Record<string, unknown>; methodologyData: MethodologyData }>(`/projects/${projectId}/methodology-items/${itemId}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteMethodologyItem: (projectId: string, itemId: string, input: { arrayKey: string }) =>
    apiRequest<{ ok: boolean; deleted: boolean }>(`/projects/${projectId}/methodology-items/${itemId}`, { method: 'DELETE', body: JSON.stringify(input) }),

  getTasks: (query?: {
    workspaceId?: string;
    projectId?: string;
    status?: TaskStatus;
    horizon?: TaskHorizon;
    waitingOnly?: boolean;
    restrictedOnly?: boolean;
  }) =>
    apiRequest<Task[]>(withQuery('/tasks', query)),
  getTaskBacklog: (query: {
    date: string;
    workspaceId?: string;
    projectId?: string;
  }) => apiRequest<TaskBacklogResponse>(withQuery('/tasks/backlog', query)),
  createTask: (input: {
    workspaceId: string;
    projectId?: string | null;
    title: string;
    description?: string | null;
    definitionOfDone?: string | null;
    nextStep?: string | null;
    taskType?: TaskType;
    energyLevel?: TaskEnergy;
    executionKind?: TaskExecutionKind;
    horizon?: TaskHorizon;
    priority?: number;
    dueDate?: string | null;
    estimatedMinutes?: number | null;
    isMultiBlock?: boolean;
    multiBlockGoalMinutes?: number | null;
    waitingOnPerson?: string | null;
    waitingType?: WaitingType | null;
    waitingPriority?: WaitingPriority | null;
    waitingDueDate?: string | null;
    restrictions?: Array<{
      title: string;
      detail?: string | null;
    }>;
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
      nextStep: string | null;
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
  completeTask: (
    taskId: string,
    options?: {
      strictMode?: boolean;
      completionMode?: 'note' | 'no_note';
      completionNote?: string;
    }
  ) =>
    apiRequest<Task>(withQuery(`/tasks/${taskId}/complete`, { strictMode: options?.strictMode }), {
      method: 'POST',
      body: JSON.stringify({
        completionMode: options?.completionMode,
        completionNote: options?.completionNote
      })
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
  reorderTaskSubtasks: (taskId: string, orderedIds: string[]) =>
    apiRequest<void>(`/tasks/${taskId}/subtasks/order`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds })
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
  getNoteFolders: (query?: { includeArchived?: boolean }) =>
    apiRequest<NoteFolder[]>(withQuery('/note-folders', query)),
  createNoteFolder: (input: {
    name: string;
    color?: string | null;
    parentId?: string | null;
    sortOrder?: number;
  }) =>
    apiRequest<NoteFolder>('/note-folders', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateNoteFolder: (
    folderId: string,
    input: Partial<{
      name: string;
      color: string | null;
      parentId: string | null;
      sortOrder: number;
      archived: boolean;
    }>
  ) =>
    apiRequest<NoteFolder>(`/note-folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteNoteFolder: (folderId: string) =>
    apiRequest<{ ok: boolean }>(`/note-folders/${folderId}`, {
      method: 'DELETE'
    }),

  getNotes: (query?: {
    type?: NoteType;
    folderId?: string;
    workspaceId?: string;
    projectId?: string;
    taskId?: string;
    q?: string;
    limit?: number;
  }) => apiRequest<Note[]>(withQuery('/notes', query)),
  getNotesLibrary: (query?: {
    view?: 'inbox' | 'pinned' | 'recent';
    folderId?: string;
    q?: string;
    type?: NoteType;
    updatedAfter?: string;
    long?: boolean;
    workspaceId?: string;
    projectId?: string;
    taskId?: string;
  }) => apiRequest<NoteSummary[]>(withQuery('/notes/library', query)),
  getNote: (noteId: string) => apiRequest<Note>(`/notes/${noteId}`),
  getNoteArtifacts: (noteId: string) =>
    apiRequest<NoteArtifactSummary[]>(`/notes/${noteId}/artifacts`),
  getNoteArtifact: (noteId: string, artifactId: string) =>
    apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts/${artifactId}`),
  createNoteArtifact: (
    noteId: string,
    input: {
      kind: NoteArtifactKind;
      title?: string | null;
      data: Record<string, unknown>;
    }
  ) =>
    apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  generateNoteArtifact: (
    noteId: string,
    input: { kind: 'diagram' | 'mindmap'; title?: string }
  ) =>
    apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts/generate`, {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateNoteArtifact: (
    noteId: string,
    artifactId: string,
    input: {
      title?: string | null;
      data?: Record<string, unknown>;
      baseVersion: number;
    }
  ) =>
    apiRequest<NoteArtifact>(`/notes/${noteId}/artifacts/${artifactId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  deleteNoteArtifact: (noteId: string, artifactId: string) =>
    apiRequest<void>(`/notes/${noteId}/artifacts/${artifactId}`, { method: 'DELETE' }),
  createNote: (input: {
    title: string;
    content?: string | null;
    contentBlocks?: NoteContentBlock[] | null;
    contentText?: string | null;
    contentHtml?: string | null;
    contentVersion?: number;
    type?: NoteType;
    tags?: string[];
    pinned?: boolean;
    folderId?: string | null;
    workspaceId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
  }) =>
    apiRequest<Note>('/notes', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateNote: (
    noteId: string,
    input: Partial<{
      title: string;
      content: string | null;
      contentBlocks: NoteContentBlock[] | null;
      contentText: string | null;
      contentHtml: string | null;
      contentVersion: number;
      type: NoteType;
      tags: string[];
      pinned: boolean;
      folderId: string | null;
      workspaceId: string | null;
      projectId: string | null;
      taskId: string | null;
      archived: boolean;
      baseVersion: number;
      saveSource: 'manual' | 'autosave' | 'restore' | 'system';
    }>
  ) =>
    apiRequest<Note>(`/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    }),
  getNoteRevisions: (noteId: string, query?: { limit?: number }) =>
    apiRequest<NoteRevision[]>(withQuery(`/notes/${noteId}/revisions`, query)),
  createNoteRevision: (
    noteId: string,
    input?: {
      source?: string;
    }
  ) =>
    apiRequest<{ ok: boolean }>(`/notes/${noteId}/revisions`, {
      method: 'POST',
      body: JSON.stringify(input ?? {})
    }),
  restoreNoteRevision: (noteId: string, revisionId: string) =>
    apiRequest<Note>(`/notes/${noteId}/revisions/${revisionId}/restore`, {
      method: 'POST'
    }),
  deleteNote: (noteId: string) =>
    apiRequest<{ ok: boolean }>(`/notes/${noteId}`, {
      method: 'DELETE'
    }),
  getNotesTranscriptionCapabilities: () =>
    apiRequest<NotesTranscriptionCapabilities>('/notes/transcription-capabilities'),
  createNotesDictationSession: (input: {
    noteId?: string | null;
    language?: string;
    encoding?: 'linear16';
    sampleRate?: number;
  }) =>
    apiRequest<NotesDictationSession>('/notes/dictation-session', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  cleanupNoteDictation: (input: { text: string }) =>
    apiRequest<NotesDictationCleanupResult>('/notes/cleanup-dictation', {
      method: 'POST',
      body: JSON.stringify(input),
      timeoutMs: NOTES_TRANSCRIBE_TIMEOUT_MS
    }),
  transcribeNoteAudio: (input: {
    audioBase64: string;
    mimeType?: string;
    language?: string;
    mode?: 'transcript' | 'note';
    context?: string | null;
  }) =>
    apiRequest<NotesAudioTranscriptionResult>('/notes/transcribe-audio', {
      method: 'POST',
      body: JSON.stringify(input),
      timeoutMs: NOTES_TRANSCRIBE_TIMEOUT_MS
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
  getAgendaWeek: (weekStart: string) =>
    apiRequest<AgendaWeek>(`/agenda/week/${weekStart}`),
  createDayPlanItem: (
    date: string,
    input: {
      taskId?: string | null;
      inboxItemId?: string | null;
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
      date: string;
      taskId: string | null;
      inboxItemId: string | null;
      startTime: string;
      endTime: string;
      orderIndex: number;
      blockType: 'task' | 'fixed';
      completedAt: string | null;
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

  getActiveExecutionSession: () =>
    apiRequest<ExecutionSession | null>('/execution-sessions/active'),
  startExecutionSession: (input: StartExecutionInput) =>
    apiRequest<ExecutionSession>('/execution-sessions/start', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  stopExecutionSession: (id: string) =>
    apiRequest<ExecutionSession>(`/execution-sessions/${id}/stop`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  cancelExecutionSession: (id: string) =>
    apiRequest<ExecutionSession>(`/execution-sessions/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({})
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

  // ── Inbox Operacional ──────────────────────────────────────────────────
  getInbox: (
    input: 'hoje' | 'ontem' | 'semana' | 'tudo' | {
      filter?: 'hoje' | 'ontem' | 'semana' | 'tudo';
      view?: 'all' | 'unprocessed';
      date?: string;
    } = 'hoje'
  ) => {
    const query = typeof input === 'string' ? { filter: input } : input;
    return apiRequest<InboxListResponse>(withQuery('/inbox', {
      ...query,
      utcOffset: -new Date().getTimezoneOffset()
    }));
  },

  createInboxItem: (payload: {
    content: string;
    source?: 'app' | 'whatsapp';
    workspaceId?: string | null;
    inboxContextId?: string | null;
  }) =>
    apiRequest<InboxItem>('/inbox', {
      method: 'POST',
      body: JSON.stringify({ source: 'app', ...payload })
    }),

  updateInboxItem: (
    id: string,
    patch: Partial<{
      content: string;
      status: InboxItemStatus;
      workspaceId: string | null;
      inboxContextId: string | null;
      position: number;
      waitingDate: string | null;
      waitingPerson: string | null;
      waitingNote: string | null;
      scheduledAt: string | null;
      convertedTaskId: string | null;
    }>
  ) =>
    apiRequest<InboxItem>(`/inbox/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),

  deleteInboxItem: (id: string) =>
    apiRequest<void>(`/inbox/${id}`, { method: 'DELETE' }),

  convertInboxItem: (id: string, taskId: string) =>
    apiRequest<InboxItem>(`/inbox/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ taskId })
    }),

  scheduleInboxItem: (id: string, payload: { mode: 'now' | 'scheduled'; scheduledAt?: string }) =>
    apiRequest<InboxItem>(`/inbox/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  executeInboxItem: (id: string, payload?: { targetMinutes?: number }) =>
    apiRequest<{ session: DeepWorkSession; task: Task }>(`/inbox/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {})
    }),

  getInboxContexts: () =>
    apiRequest<InboxContext[]>('/inbox/contexts'),

  createInboxContext: (name: string) =>
    apiRequest<InboxContext>('/inbox/contexts', {
      method: 'POST',
      body: JSON.stringify({ name })
    }),

  updateInboxContext: (id: string, patch: { name?: string; position?: number }) =>
    apiRequest<InboxContext>(`/inbox/contexts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),

  deleteInboxContext: (id: string) =>
    apiRequest<void>(`/inbox/contexts/${id}`, { method: 'DELETE' }),

  getTodayItems: (todayDate: string) =>
    apiRequest<InboxTodayItem[]>(`/inbox/today?todayDate=${todayDate}`),

  addTodayItem: (payload: { inboxItemId: string; todayDate: string; position: number }) =>
    apiRequest<InboxTodayItem>('/inbox/today', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTodayItem: (id: string, patch: { position?: number; completedAt?: string | null }) =>
    apiRequest<InboxTodayItem>(`/inbox/today/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  removeTodayItem: (id: string) =>
    apiRequest<void>(`/inbox/today/${id}`, { method: 'DELETE' }),

  getDailyExecution: (date: string) =>
    apiRequest<DailyExecutionResponse>(`/daily-execution/${date}`),

  assignDailyExecution: (
    date: string,
    payload: { sourceType: 'inbox' | 'task'; sourceId: string }
  ) =>
    apiRequest<TodayEntry>(`/daily-execution/${date}/items`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  setDailyExecutionCompleted: (id: string, completed: boolean) =>
    apiRequest<TodayEntry>(`/daily-execution-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed })
    }),

  reorderDailyExecution: (date: string, orderedIds: string[]) =>
    apiRequest<void>(`/daily-execution/${date}/order`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds })
    }),

  removeDailyExecution: (id: string) =>
    apiRequest<void>(`/daily-execution-items/${id}`, { method: 'DELETE' }),

  resolveDailyRollover: (
    id: string,
    action: RolloverAction,
    targetDate: string
  ) =>
    apiRequest<TodayEntry | void>(`/daily-execution-items/${id}/rollover`, {
      method: 'POST',
      body: JSON.stringify({ action, targetDate })
    }),

  getGamification: () => apiRequest<Gamification>('/gamification'),
  getGamificationDetails: () => apiRequest<GamificationDetails>('/gamification/details'),

  // Commitments
  getCommitments: (params?: { workspaceId?: string; date?: string; type?: CommitmentType; status?: CommitmentStatus }) => {
    const q = new URLSearchParams();
    if (params?.workspaceId) q.set('workspaceId', params.workspaceId);
    if (params?.date) q.set('date', params.date);
    if (params?.type) q.set('type', params.type);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return apiRequest<Commitment[]>(`/commitments${qs ? '?' + qs : ''}`);
  },
  getCommitment: (id: string) => apiRequest<Commitment>(`/commitments/${id}`),
  getCommitmentsForWeek: (weekStart: string, workspaceId?: string) => {
    const q = workspaceId ? `?workspaceId=${workspaceId}` : '';
    return apiRequest<CommitmentWeekResult>(`/commitments/week/${weekStart}${q}`);
  },
  createCommitment: (input: {
    workspaceId?: string | null;
    projectId?: string | null;
    title: string;
    description?: string | null;
    type?: CommitmentType;
    status?: CommitmentStatus;
    startTime?: string | null;
    durationMin?: number | null;
    recurrenceDays?: RecurrenceDay[];
    date?: string | null;
    recurrenceEnd?: string | null;
  }) => apiRequest<Commitment>('/commitments', { method: 'POST', body: JSON.stringify(input) }),
  updateCommitment: (id: string, input: Partial<{
    workspaceId: string | null;
    projectId: string | null;
    title: string;
    description: string | null;
    type: CommitmentType;
    status: CommitmentStatus;
    startTime: string | null;
    durationMin: number | null;
    recurrenceDays: RecurrenceDay[];
    date: string | null;
    recurrenceEnd: string | null;
  }>) => apiRequest<Commitment>(`/commitments/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteCommitment: (id: string, hard = false) =>
    apiRequest<{ ok: boolean }>(`/commitments/${id}${hard ? '?hard=true' : ''}`, { method: 'DELETE' }),
  createCommitmentException: (id: string, input: {
    date: string;
    action: 'cancelled' | 'rescheduled';
    newDate?: string | null;
    newTime?: string | null;
    note?: string | null;
  }) => apiRequest<CommitmentException>(`/commitments/${id}/exceptions`, { method: 'POST', body: JSON.stringify(input) }),
  deleteCommitmentException: (id: string, date: string) =>
    apiRequest<{ ok: boolean }>(`/commitments/${id}/exceptions/${date}`, { method: 'DELETE' }),
  getHabits: (params?: { lifeArea?: HabitLifeArea; status?: HabitStatus }) =>
    apiRequest<Habit[]>(withQuery('/habits', params)),
  createHabit: (data: { title: string; lifeArea: HabitLifeArea; type: HabitType; frequencyType: HabitFrequency; frequencyTarget?: number; specificDays?: RecurrenceDay[]; unit?: string; dailyTarget?: number; icon?: string; color?: string; }) =>
    apiRequest<Habit>('/habits', { method: 'POST', body: JSON.stringify(data) }),
  updateHabit: (id: string, data: Partial<Omit<Habit, 'id'|'createdAt'|'updatedAt'>>) =>
    apiRequest<Habit>(`/habits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  archiveHabit: (id: string) =>
    apiRequest<{ ok: boolean }>(`/habits/${id}`, { method: 'DELETE' }),
  getHabitsTodayStats: (date: string, options: { includeUnscheduled?: boolean } = {}) =>
    apiRequest<HabitTodayStat[]>(withQuery('/habits/stats/today', {
      date,
      includeUnscheduled: options.includeUnscheduled || undefined
    })),
  getHabitsRadar: () =>
    apiRequest<HabitRadarStats>('/habits/stats/radar'),
  getHabitHeatmap: (id: string, days?: number) =>
    apiRequest<{ habitId: string; startDate: string; endDate: string; logs: HabitLog[] }>(
      withQuery(`/habits/stats/heatmap/${id}`, days ? { days } : undefined)),
  logHabit: (id: string, data: { date: string; value?: number; note?: string }) =>
    apiRequest<HabitLog>(`/habits/${id}/log`, { method: 'POST', body: JSON.stringify(data) }),
  setHabitTotal: (id: string, data: { date: string; value: number; note?: string | null }) =>
    apiRequest<HabitLog>(`/habits/${id}/log`, { method: 'PUT', body: JSON.stringify(data) }),
  getHabitEvolution: (days: 30 | 90 | 365) =>
    apiRequest<HabitEvolution>(withQuery('/habits/stats/evolution', { days })),
  deleteHabitLog: (id: string, date: string) =>
    apiRequest<{ ok: boolean }>(`/habits/${id}/log/${date}`, { method: 'DELETE' }),
  habitRecaiu: (id: string, date: string) =>
    apiRequest<{ ok: boolean; previousStreak: number }>(`/habits/${id}/recaiu`, { method: 'POST', body: JSON.stringify({ date }) }),

  // ── Canvas ──────────────────────────────────────────────────────────────
  getDiagram: (noteId: string) =>
    apiRequest<Diagram>(`/canvas/notes/${noteId}/diagram`),
  createDiagram: (noteId: string, data: DiagramData, title?: string) =>
    apiRequest<Diagram>(`/canvas/notes/${noteId}/diagram`, {
      method: 'POST',
      body: JSON.stringify({ data, title }),
    }),
  updateDiagram: (noteId: string, data: DiagramData) =>
    apiRequest<Diagram>(`/canvas/notes/${noteId}/diagram`, {
      method: 'PATCH',
      body: JSON.stringify({ data }),
    }),
  deleteDiagram: (noteId: string) =>
    apiRequest<void>(`/canvas/notes/${noteId}/diagram`, { method: 'DELETE' }),
  generateDiagram: (noteId: string, overwrite = false) =>
    apiRequest<Diagram>(`/canvas/notes/${noteId}/diagram/generate`, {
      method: 'POST',
      body: JSON.stringify({ overwrite }),
    }),

  getMindMap: (noteId: string) =>
    apiRequest<MindMap>(`/canvas/notes/${noteId}/mindmap`),
  createMindMap: (noteId: string, data: MindMapData, title?: string) =>
    apiRequest<MindMap>(`/canvas/notes/${noteId}/mindmap`, {
      method: 'POST',
      body: JSON.stringify({ data, title }),
    }),
  updateMindMap: (noteId: string, data: MindMapData) =>
    apiRequest<MindMap>(`/canvas/notes/${noteId}/mindmap`, {
      method: 'PATCH',
      body: JSON.stringify({ data }),
    }),
  deleteMindMap: (noteId: string) =>
    apiRequest<void>(`/canvas/notes/${noteId}/mindmap`, { method: 'DELETE' }),
  generateMindMap: (noteId: string, overwrite = false) =>
    apiRequest<MindMap>(`/canvas/notes/${noteId}/mindmap/generate`, {
      method: 'POST',
      body: JSON.stringify({ overwrite }),
    }),

  getWhiteboard: (noteId: string) =>
    apiRequest<Whiteboard>(`/canvas/notes/${noteId}/whiteboard`),
  createWhiteboard: (noteId: string, data: WhiteboardData, title?: string) =>
    apiRequest<Whiteboard>(`/canvas/notes/${noteId}/whiteboard`, {
      method: 'POST',
      body: JSON.stringify({ data, title }),
    }),
  updateWhiteboard: (noteId: string, data: WhiteboardData) =>
    apiRequest<Whiteboard>(`/canvas/notes/${noteId}/whiteboard`, {
      method: 'PATCH',
      body: JSON.stringify({ data }),
    }),
  deleteWhiteboard: (noteId: string) =>
    apiRequest<void>(`/canvas/notes/${noteId}/whiteboard`, { method: 'DELETE' }),

  getUserPhone: () =>
    apiRequest<UserPhone>('/user/phone'),
  linkPhone: (phoneNumber: string) =>
    apiRequest<{ ok: boolean }>('/user/phone', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  unlinkPhone: () =>
    apiRequest<{ ok: boolean }>('/user/phone', { method: 'DELETE' }),
};
