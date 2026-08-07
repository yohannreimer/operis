import type {
  MethodologyData,
  Project,
  ProjectMethodology,
  ProjectMetricKind,
  ProjectStatus,
  Task,
  Workspace
} from '../../api';

export type ProjectRecommendation = {
  ruleKey: string;
  text: string;
  reason: string;
  severity: 'normal' | 'attention' | 'critical';
  sourceId?: string;
};

export type ProjectProgress =
  | { kind: 'percent'; value: number; label: string }
  | { kind: 'phase'; value: string; label: string };

export type ProjectOperationalState =
  | 'blocked'
  | 'at_risk'
  | 'moving'
  | 'stalled'
  | 'paused'
  | 'completed'
  | 'archived';

export type ProjectNextMove = {
  id: string;
  projectId: string;
  taskId?: string | null;
  text: string;
  source: 'manual' | 'recommendation';
  reason?: string | null;
  ruleKey?: string | null;
  status: 'active' | 'resolved';
  createdAt?: string;
  resolvedAt?: string | null;
};

export type ProjectCockpit = {
  id: string;
  title: string;
  description?: string | null;
  objective: string | null;
  workspace: Workspace;
  intentLabel: string;
  methodLabel: string;
  persistedStatus: ProjectStatus;
  operationalState: ProjectOperationalState;
  timeHorizonEnd: string | null;
  primaryMetric?: string | null;
  resultStartValue?: number | null;
  resultCurrentValue?: number | null;
  resultTargetValue?: number | null;
  progress: ProjectProgress;
  primaryBlocker: string | null;
  activeMove: ProjectNextMove | null;
  recommendation: ProjectRecommendation | null;
  engine: {
    key: string;
    methodology: ProjectMethodology;
    data: MethodologyData;
    recovered: boolean;
  };
  tasks: Task[];
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectExecutionListItem = ProjectCockpit;

export type FrontAttention = {
  kind: 'project' | 'responsibility';
  sourceId: string;
  severity: 'attention' | 'critical';
  title: string;
  reason: string;
};

export type FrontProjectSummary = {
  id: string;
  title: string;
  objective: string | null;
  methodology: ProjectMethodology;
  canonicalMethodology: ProjectMethodology;
  engine: string;
  status: ProjectStatus;
  operationalState: ProjectOperationalState;
  timeHorizonEnd: string | null;
  progress: ProjectProgress;
  primaryBlocker: string | null;
  activeMove: ProjectNextMove | null;
  recommendation: ProjectRecommendation | null;
};

export type ResponsibilityCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom';
export type ResponsibilityHealth = 'healthy' | 'attention' | 'critical';
export type ResponsibilityStatus = 'active' | 'paused' | 'archived';

export type Responsibility = {
  id: string;
  workspaceId: string;
  title: string;
  expectedStandard: string;
  cadence: ResponsibilityCadence;
  cadenceIntervalDays?: number | null;
  health: ResponsibilityHealth;
  nextCare: string;
  nextReviewAt: string;
  lastReviewedAt?: string | null;
  status: ResponsibilityStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};

export type ResponsibilityReview = {
  id: string;
  responsibilityId: string;
  createdTaskId?: string | null;
  health: ResponsibilityHealth;
  note?: string | null;
  nextCare: string;
  nextReviewAt: string;
  reviewedAt: string;
};

export type FrontOverviewListItem = {
  id: string;
  name: string;
  type: Workspace['type'];
  mode?: Workspace['mode'];
  color?: string;
  health: 'normal' | 'attention' | 'critical';
  attention: FrontAttention | null;
  activeProjects: number;
};

export type FrontOverview = FrontOverviewListItem & {
  category?: string;
  projects: FrontProjectSummary[];
  pausedProjects: FrontProjectSummary[];
  responsibilities: Responsibility[];
  capacity: { activeProjects: number; todayTasks: number };
};

export type CreateExecutionProjectInput = {
  workspaceId: string;
  methodology: ProjectMethodology;
  title: string;
  objective: string;
  timeHorizonEnd?: string | null;
  resultStartValue?: number | null;
  resultCurrentValue?: number | null;
  resultTargetValue?: number | null;
  primaryMetric?: string | null;
  methodologyData?: MethodologyData;
  metrics?: Array<{
    kind: ProjectMetricKind;
    name: string;
    description?: string | null;
    targetValue?: number | null;
    baselineValue?: number | null;
    currentValue?: number | null;
    unit?: string | null;
  }>;
  nextMove: string;
  nextMoveDestination: 'project' | 'backlog' | 'today';
};

export type CreateExecutionProjectResult = {
  project: Project;
  activeMove: ProjectNextMove;
  task: Task | null;
};
