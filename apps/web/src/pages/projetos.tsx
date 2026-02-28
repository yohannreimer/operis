import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  api,
  Project,
  ProjectScorecard,
  ProjectStatus,
  ProjectType,
  Task,
  TaskEnergy,
  TaskExecutionKind,
  TaskHorizon,
  TaskType,
  Workspace
} from '../api';
import { Modal } from '../components/modal';
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
import { useShellContext } from '../components/shell-context';
import { workspaceQuery } from '../utils/workspace';

type CreateEntity = 'project' | 'task';

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

function currentWeekStartIso() {
  const base = new Date();
  const day = base.getDay();
  const diff = (day + 6) % 7;
  base.setDate(base.getDate() - diff);
  base.setHours(0, 0, 0, 0);
  return base.toISOString().slice(0, 10);
}

function objective4dxIsValid(value: string) {
  return /de\s+.+\s+para\s+.+\s+em\s+.+/i.test(value.trim());
}

function parseOptionalNumberInput(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) {
    return {
      value: null as number | null,
      valid: true
    };
  }

  const numeric = Number(normalized);
  return {
    value: Number.isFinite(numeric) ? numeric : null,
    valid: Number.isFinite(numeric)
  };
}

function weekStartFromDate(date: Date) {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = normalized.getUTCDay();
  const diff = (weekday + 6) % 7;
  normalized.setUTCDate(normalized.getUTCDate() - diff);
  return normalized;
}

function weekKeyFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatWeekRange(start: Date) {
  const end = addUtcDays(start, 6);
  const startLabel = start.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC'
  });
  const endLabel = end.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC'
  });
  return `${startLabel} a ${endLabel}`;
}

const PROJECT_STATUS_HINTS: Record<ProjectStatus, string> = {
  ativo: 'Ativo: entra no ranking estratégico e recebe foco de execução.',
  latente: 'Latente: fica fora do foco ativo, mas mantém histórico e métricas.',
  encerrado: 'Encerrado: projeto finalizado; mantém histórico para consulta.',
  fantasma: 'Fantasma: sem tração recente; exige decisão de reativar ou encerrar.',
  pausado: 'Pausado: temporariamente sem execução ativa.',
  concluido: 'Concluído: resultado entregue.',
  arquivado: 'Arquivado: mantido só para histórico.'
};

const PROJECT_STATUS_CONFIRMATION: Partial<Record<ProjectStatus, string>> = {
  ativo:
    'Mudar para Ativo?\n\nO projeto volta para o foco estratégico e para os rankings.\n\nIsso NÃO apaga dados.',
  latente:
    'Mudar para Latente?\n\nO projeto sai do foco ativo e pode reduzir alertas/ranking.\n\nIsso NÃO apaga dados.',
  encerrado:
    'Mudar para Encerrado?\n\nUse quando o ciclo do projeto terminou.\n\nIsso NÃO apaga dados.'
};

export function ProjetosPage() {
  const navigate = useNavigate();
  const { projectId: projectRouteId } = useParams<{ projectId?: string }>();
  const isProjectRoute = Boolean(projectRouteId);
  const { activeWorkspaceId, refreshGlobal } = useShellContext();
  const scopedWorkspaceId = workspaceQuery(activeWorkspaceId);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [workspaceId, setWorkspaceId] = useState<'all' | string>('all');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('operacao');
  const [newProjectObjective, setNewProjectObjective] = useState('');
  const [newProjectMetric, setNewProjectMetric] = useState('');
  const [newProjectLeadMeasure1, setNewProjectLeadMeasure1] = useState('');
  const [newProjectLeadMeasure2, setNewProjectLeadMeasure2] = useState('');
  const [newProjectTimeHorizonEnd, setNewProjectTimeHorizonEnd] = useState('');
  const [newProjectResultStartValue, setNewProjectResultStartValue] = useState('');
  const [newProjectResultTargetValue, setNewProjectResultTargetValue] = useState('');
  const [newProjectCadenceDays, setNewProjectCadenceDays] = useState('7');
  const [newProjectStatus, setNewProjectStatus] = useState<ProjectStatus>('ativo');

  const [scorecardWeekStart, setScorecardWeekStart] = useState(() => currentWeekStartIso());
  const [projectScorecard, setProjectScorecard] = useState<ProjectScorecard | null>(null);
  const [newMetricName, setNewMetricName] = useState('');
  const [newMetricTargetValue, setNewMetricTargetValue] = useState('');
  const [newMetricUnit, setNewMetricUnit] = useState('');
  const [checkinValueByMetric, setCheckinValueByMetric] = useState<Record<string, string>>({});
  const [checkinNoteByMetric, setCheckinNoteByMetric] = useState<Record<string, string>>({});

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState(3);
  const [newTaskHorizon, setNewTaskHorizon] = useState<TaskHorizon>('active');
  const [newTaskDefinitionOfDone, setNewTaskDefinitionOfDone] = useState('');
  const [newTaskEstimatedMinutes, setNewTaskEstimatedMinutes] = useState('60');
  const [newTaskType, setNewTaskType] = useState<TaskType>('b');
  const [newTaskEnergy, setNewTaskEnergy] = useState<TaskEnergy>('media');
  const [newTaskExecutionKind, setNewTaskExecutionKind] = useState<TaskExecutionKind>('operacao');
  const [newTaskIsMultiBlock, setNewTaskIsMultiBlock] = useState(false);
  const [newTaskMultiBlockGoalMinutes, setNewTaskMultiBlockGoalMinutes] = useState('');
  const [createTaskProjectId, setCreateTaskProjectId] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [createEntity, setCreateEntity] = useState<CreateEntity>('project');

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(baseWorkspaceId?: string) {
    try {
      setError(null);
      const workspaceData = await api.getWorkspaces();
      const selectableWorkspaces = workspaceData.filter((workspace) => workspace.type !== 'geral');
      const selectableIds = new Set(selectableWorkspaces.map((workspace) => workspace.id));

      const preferredWorkspace: 'all' | string =
        baseWorkspaceId && selectableIds.has(baseWorkspaceId)
          ? baseWorkspaceId
          : scopedWorkspaceId && selectableIds.has(scopedWorkspaceId)
            ? scopedWorkspaceId
            : workspaceId !== 'all' && selectableIds.has(workspaceId)
              ? workspaceId
              : 'all';

      const forceGlobal = Boolean(projectRouteId);
      const queryWorkspaceId = forceGlobal || preferredWorkspace === 'all' ? undefined : preferredWorkspace;

      const [projectData, taskData] = await Promise.all([
        api.getProjects(queryWorkspaceId ? { workspaceId: queryWorkspaceId } : undefined),
        api.getTasks(queryWorkspaceId ? { workspaceId: queryWorkspaceId } : undefined)
      ]);

      setWorkspaces(selectableWorkspaces);
      setProjects(projectData);
      setTasks(taskData);

      const resolvedWorkspace = forceGlobal ? 'all' : preferredWorkspace;
      setWorkspaceId(resolvedWorkspace);

      const resolvedProject =
        projectRouteId
          ? projectData.some((project) => project.id === projectRouteId)
            ? projectRouteId
            : ''
          : selectedProjectId && projectData.some((project) => project.id === selectedProjectId)
            ? selectedProjectId
            : projectData[0]?.id ?? '';

      setSelectedProjectId(resolvedProject);
      setCreateTaskProjectId((current) =>
        current && projectData.some((project) => project.id === current) ? current : resolvedProject
      );
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    load(scopedWorkspaceId);
  }, [activeWorkspaceId, projectRouteId]);

  function openCreateModal(entity: CreateEntity) {
    setCreateEntity(entity);
    if (entity === 'task' && selectedProjectId) {
      setCreateTaskProjectId(selectedProjectId);
    }
    setCreateModalOpen(true);
  }

  function openProjectDetail(projectId: string) {
    setSelectedProjectId(projectId);
    setCreateTaskProjectId(projectId);
    navigate(`/projetos/${projectId}`);
  }

  async function loadProjectScorecard(projectId: string, weekStart = scorecardWeekStart) {
    try {
      const scorecard = await api.getProjectScorecard(projectId, {
        weekStart
      });
      setProjectScorecard(scorecard);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === selectedProjectId),
    [tasks, selectedProjectId]
  );
  const scorecardLeadMetrics = useMemo(
    () => projectScorecard?.metrics.filter((metric) => metric.kind === 'lead') ?? [],
    [projectScorecard]
  );
  const scorecardLagMetrics = useMemo(
    () => projectScorecard?.metrics.filter((metric) => metric.kind === 'lag') ?? [],
    [projectScorecard]
  );
  const activeATasksInProject = useMemo(
    () =>
      projectTasks.filter(
        (task) => (task.taskType ?? 'b') === 'a' && ['backlog', 'hoje', 'andamento'].includes(task.status)
      ).length,
    [projectTasks]
  );
  const projectTractionSignal = useMemo(() => {
    if (!projectScorecard) {
      return {
        label: 'Sem leitura',
        tone: 'backlog' as const,
        reason: 'Abra o scorecard para iniciar leitura de tração.'
      };
    }

    const compliance = projectScorecard.summary.weeklyLeadCompliancePercent;
    const missing = projectScorecard.summary.weeklyCheckinsMissing;

    if (compliance >= 80 && activeATasksInProject > 0) {
      return {
        label: 'Tração forte',
        tone: 'feito' as const,
        reason: `Lead compliance ${compliance}% e ${activeATasksInProject} tarefa(s) A ativa(s).`
      };
    }

    if (compliance >= 50 || activeATasksInProject > 0) {
      return {
        label: 'Tração parcial',
        tone: 'andamento' as const,
        reason: `Lead compliance ${compliance}% • ${missing} check-in(s) pendente(s).`
      };
    }

    return {
      label: 'Tração frágil',
      tone: 'backlog' as const,
      reason: 'Sem disciplina semanal de lead e sem tarefa A ativa no projeto.'
    };
  }, [projectScorecard, activeATasksInProject]);
  const primaryLagMetric = useMemo(
    () => scorecardLagMetrics[0] ?? null,
    [scorecardLagMetrics]
  );
  const scorecardWeekOptions = useMemo(() => {
    if (!selectedProject) {
      return [] as Array<{
        index: number;
        weekStart: string;
        weekRange: string;
      }>;
    }

    const historyWeekKeys = (projectScorecard?.metrics ?? [])
      .flatMap((metric) => metric.history.map((entry) => entry.weekStart))
      .sort((left, right) => left.localeCompare(right));

    const historyStart = historyWeekKeys[0] ? new Date(`${historyWeekKeys[0]}T00:00:00.000Z`) : null;
    const projectBaselineStart = projectScorecard?.project.weekStart
      ? new Date(`${projectScorecard.project.weekStart}T00:00:00.000Z`)
      : null;
    const currentStart = weekStartFromDate(new Date());

    const start = historyStart ?? projectBaselineStart ?? currentStart;
    const deadlineStart = selectedProject.timeHorizonEnd
      ? weekStartFromDate(new Date(selectedProject.timeHorizonEnd))
      : null;
    const lastHistoryStart = historyWeekKeys.length
      ? new Date(`${historyWeekKeys[historyWeekKeys.length - 1]}T00:00:00.000Z`)
      : null;

    const endCandidates = [deadlineStart, currentStart, lastHistoryStart].filter(
      (value): value is Date => Boolean(value)
    );
    const end = endCandidates.reduce((latest, candidate) => {
      return candidate.getTime() > latest.getTime() ? candidate : latest;
    }, start);

    const totalWeeks = Math.max(
      1,
      Math.min(104, Math.floor((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1)
    );

    return Array.from({ length: totalWeeks }, (_, index) => {
      const weekStartDate = addUtcDays(start, index * 7);
      return {
        index: index + 1,
        weekStart: weekKeyFromDate(weekStartDate),
        weekRange: formatWeekRange(weekStartDate)
      };
    });
  }, [selectedProject, projectScorecard?.metrics, projectScorecard?.project.weekStart]);
  const selectedScorecardWeek = useMemo(
    () => scorecardWeekOptions.find((week) => week.weekStart === scorecardWeekStart) ?? null,
    [scorecardWeekOptions, scorecardWeekStart]
  );
  const leadComplianceHistory = useMemo(() => {
    if (scorecardLeadMetrics.length === 0) {
      return [] as Array<{
        week: string;
        weekStart: string;
        compliance: number;
      }>;
    }

    const weekKeys =
      scorecardWeekOptions.length > 0
        ? scorecardWeekOptions.map((week) => week.weekStart)
        : Array.from(
            new Set(
              scorecardLeadMetrics.flatMap((metric) => metric.history.map((entry) => entry.weekStart))
            )
          ).sort((left, right) => left.localeCompare(right));

    return weekKeys.map((weekStart, index) => {
      const doneCount = scorecardLeadMetrics.reduce((total, metric) => {
        const checkin = metric.history.find((entry) => entry.weekStart === weekStart);
        if (!checkin) {
          return total;
        }
        return total + (checkin.value > 0 ? 1 : 0);
      }, 0);

      return {
        week: `S${index + 1}`,
        weekStart,
        compliance: Math.round((doneCount / Math.max(1, scorecardLeadMetrics.length)) * 100)
      };
    });
  }, [scorecardLeadMetrics, scorecardWeekOptions]);
  const lagProjectionData = useMemo(() => {
    if (!selectedProject || !primaryLagMetric) {
      return [] as Array<{
        week: string;
        weekRange: string;
        weekKey: string;
        real: number | null;
        projected: number | null;
        target: number | null;
      }>;
    }

    const sortedHistory = [...primaryLagMetric.history].sort((left, right) =>
      left.weekStart.localeCompare(right.weekStart)
    );
    const historyMap = new Map(sortedHistory.map((entry) => [entry.weekStart, entry.value]));

    const baseline =
      primaryLagMetric.baselineValue ??
      selectedProject.resultStartValue ??
      sortedHistory[0]?.value ??
      0;
    const target = primaryLagMetric.targetValue ?? selectedProject.resultTargetValue ?? null;

    const startWeekKey = sortedHistory[0]?.weekStart ?? projectScorecard?.project.weekStart ?? scorecardWeekStart;
    const startWeekDate = new Date(`${startWeekKey}T00:00:00.000Z`);
    const deadlineDate = selectedProject.timeHorizonEnd
      ? weekStartFromDate(new Date(selectedProject.timeHorizonEnd))
      : null;

    const totalWeeksToTarget = deadlineDate
      ? Math.max(1, Math.round((deadlineDate.getTime() - startWeekDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))
      : Math.max(4, sortedHistory.length + 2);

    const lastHistoryDate = sortedHistory.length
      ? new Date(`${sortedHistory[sortedHistory.length - 1].weekStart}T00:00:00.000Z`)
      : startWeekDate;
    const historyWeeks = Math.max(
      0,
      Math.round((lastHistoryDate.getTime() - startWeekDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
    );
    const horizonWeeks = Math.max(totalWeeksToTarget, historyWeeks + 2);

    return Array.from({ length: horizonWeeks + 1 }, (_, index) => {
      const weekDate = new Date(startWeekDate);
      weekDate.setUTCDate(weekDate.getUTCDate() + index * 7);
      const weekKey = weekKeyFromDate(weekDate);
      const projectedValue =
        target === null ? null : baseline + ((target - baseline) * index) / Math.max(1, totalWeeksToTarget);

      return {
        week: `S${index + 1}`,
        weekRange: formatWeekRange(weekDate),
        weekKey,
        real: historyMap.get(weekKey) ?? null,
        projected: projectedValue === null ? null : Number(projectedValue.toFixed(2)),
        target
      };
    });
  }, [selectedProject, primaryLagMetric, projectScorecard?.project.weekStart, scorecardWeekStart]);
  const projectRanking = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return projects
      .map((project) => {
        const scopedTasks = tasks.filter((task) => task.projectId === project.id && task.status !== 'arquivado');
        const openA = scopedTasks.filter(
          (task) => task.status !== 'feito' && task.status !== 'arquivado' && (task.taskType ?? 'b') === 'a'
        ).length;
        const doneAThisWeek = scopedTasks.filter((task) => {
          if ((task.taskType ?? 'b') !== 'a' || task.status !== 'feito' || !task.completedAt) {
            return false;
          }
          return new Date(task.completedAt).getTime() >= weekAgo;
        }).length;
        const disconnected = scopedTasks.filter((task) => !task.projectId).length;

        let strategicScore = doneAThisWeek * 5 + openA * 3 + scopedTasks.length;
        if (project.status === 'ativo') {
          strategicScore += 2;
        }
        if (project.status === 'latente' || project.status === 'pausado') {
          strategicScore -= 2;
        }

        return {
          project,
          totalTasks: scopedTasks.length,
          openA,
          doneAThisWeek,
          disconnected,
          strategicScore
        };
      })
      .sort((left, right) => right.strategicScore - left.strategicScore);
  }, [projects, tasks]);

  const strategicActiveLoad = useMemo(
    () => projectRanking.filter((entry) => entry.project.status === 'ativo' && entry.openA > 0).length,
    [projectRanking]
  );
  const projectSelectionCards = useMemo(() => {
    if (projectRanking.length > 0) {
      return projectRanking;
    }

    return projects.map((project) => {
      const scopedTasks = tasks.filter((task) => task.projectId === project.id && task.status !== 'arquivado');
      const openA = scopedTasks.filter(
        (task) => task.status !== 'feito' && task.status !== 'arquivado' && (task.taskType ?? 'b') === 'a'
      ).length;

      return {
        project,
        totalTasks: scopedTasks.length,
        openA,
        doneAThisWeek: 0,
        disconnected: 0,
        strategicScore: 0
      };
    });
  }, [projectRanking, projects, tasks]);

  async function createProject(event: FormEvent) {
    event.preventDefault();

    if (!workspaceId || workspaceId === 'all') {
      setError('Selecione uma frente antes de criar projeto.');
      return;
    }

    if (!objective4dxIsValid(newProjectObjective)) {
      setError('Objetivo claro deve seguir o formato 4DX: "de X para Y em Z tempo".');
      return;
    }

    if (!newProjectLeadMeasure1.trim() || !newProjectLeadMeasure2.trim()) {
      setError('Defina as duas medidas de direção (lead) antes de criar o projeto.');
      return;
    }

    const startValueInput = parseOptionalNumberInput(newProjectResultStartValue);
    const targetValueInput = parseOptionalNumberInput(newProjectResultTargetValue);
    if (!startValueInput.valid || !targetValueInput.valid) {
      setError('Medidas históricas devem ser numéricas (ex: 0, 300, 10000).');
      return;
    }

    const cadenceDays = Math.max(7, Number(newProjectCadenceDays) || 7);
    const resultStartValue = startValueInput.value;
    const resultTargetValue = targetValueInput.value;
    const resultCurrentValue = resultStartValue;
    const leadMetric1 = newProjectLeadMeasure1.trim();
    const leadMetric2 = newProjectLeadMeasure2.trim();
    const lagMetricName = newProjectMetric.trim();

    try {
      setBusy(true);
      const created = await api.createProject({
        workspaceId,
        title: newProjectTitle,
        description: newProjectDescription,
        type: newProjectType,
        objective: newProjectObjective.trim(),
        primaryMetric: lagMetricName,
        actionStatement: `Lead 1: ${leadMetric1}; Lead 2: ${leadMetric2}.`,
        timeHorizonEnd: newProjectTimeHorizonEnd
          ? new Date(`${newProjectTimeHorizonEnd}T23:59:00`).toISOString()
          : null,
        resultStartValue,
        resultCurrentValue,
        resultTargetValue,
        scorecardCadenceDays: cadenceDays,
        status: newProjectStatus,
        metrics: [
          {
            kind: 'lead',
            name: leadMetric1,
            unit: 'check-in semanal'
          },
          {
            kind: 'lead',
            name: leadMetric2,
            unit: 'check-in semanal'
          },
          ...(lagMetricName
            ? [
                {
                  kind: 'lag' as const,
                  name: lagMetricName,
                  targetValue: resultTargetValue,
                  baselineValue: resultStartValue,
                  currentValue: resultCurrentValue
                }
              ]
            : [])
        ]
      });
      setSelectedProjectId(created.id);
      setNewProjectTitle('');
      setNewProjectDescription('');
      setNewProjectType('operacao');
      setNewProjectObjective('');
      setNewProjectMetric('');
      setNewProjectLeadMeasure1('');
      setNewProjectLeadMeasure2('');
      setNewProjectTimeHorizonEnd('');
      setNewProjectResultStartValue('');
      setNewProjectResultTargetValue('');
      setNewProjectCadenceDays('7');
      setNewProjectStatus('ativo');
      setCreateModalOpen(false);
      await refreshGlobal();
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createProjectTask(event: FormEvent) {
    event.preventDefault();

    if (!workspaceId || workspaceId === 'all' || !createTaskProjectId) {
      setError('Selecione um projeto para adicionar tarefa.');
      return;
    }

    const estimatedMinutes = Number(newTaskEstimatedMinutes);
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
      setError('Informe um tempo estimado válido para a tarefa.');
      return;
    }

    const multiBlockGoalInput = parseOptionalNumberInput(newTaskMultiBlockGoalMinutes);
    if (!multiBlockGoalInput.valid) {
      setError('Meta multiblock deve ser numérica.');
      return;
    }
    if (newTaskIsMultiBlock && (multiBlockGoalInput.value ?? 0) <= 0) {
      setError('Para tarefa multiblock, informe uma meta total de minutos maior que zero.');
      return;
    }

    try {
      setBusy(true);
      await api.createTask({
        workspaceId,
        projectId: createTaskProjectId,
        title: newTaskTitle,
        definitionOfDone: newTaskDefinitionOfDone,
        estimatedMinutes,
        taskType: newTaskType,
        energyLevel: newTaskEnergy,
        executionKind: newTaskExecutionKind,
        priority: newTaskPriority,
        horizon: newTaskHorizon,
        isMultiBlock: newTaskIsMultiBlock,
        multiBlockGoalMinutes: newTaskIsMultiBlock
          ? Math.round(multiBlockGoalInput.value ?? estimatedMinutes)
          : null
      });
      setNewTaskTitle('');
      setNewTaskDefinitionOfDone('');
      setNewTaskEstimatedMinutes('60');
      setNewTaskType('b');
      setNewTaskEnergy('media');
      setNewTaskExecutionKind('operacao');
      setNewTaskIsMultiBlock(false);
      setNewTaskMultiBlockGoalMinutes('');
      setNewTaskPriority(3);
      setNewTaskHorizon('active');
      setCreateTaskProjectId(selectedProjectId);
      setCreateModalOpen(false);
      await load(workspaceId);
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
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProjectTask(taskId: string) {
    const task = tasks.find((entry) => entry.id === taskId);
    const shouldDelete = window.confirm(
      `Excluir a tarefa "${task?.title ?? 'selecionada'}"? Esta ação não pode ser desfeita.`
    );

    if (!shouldDelete) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteTask(taskId);
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createProjectMetric(event: FormEvent) {
    event.preventDefault();

    if (!selectedProject || !newMetricName.trim()) {
      return;
    }

    try {
      setBusy(true);
      await api.createProjectMetric(selectedProject.id, {
        kind: 'lag',
        name: newMetricName.trim(),
        targetValue: newMetricTargetValue ? Number(newMetricTargetValue) : null,
        unit: newMetricUnit.trim() || null
      });
      setNewMetricName('');
      setNewMetricTargetValue('');
      setNewMetricUnit('');
      await loadProjectScorecard(selectedProject.id, scorecardWeekStart);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProjectMetric(metricId: string) {
    if (!selectedProject) {
      return;
    }

    const shouldDelete = window.confirm('Excluir esta métrica do scorecard?');
    if (!shouldDelete) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteProjectMetric(metricId);
      await loadProjectScorecard(selectedProject.id, scorecardWeekStart);
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkinMetric(metricId: string) {
    if (!selectedProject) {
      return;
    }

    const rawValue = checkinValueByMetric[metricId];
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      setError('Informe um valor numérico válido para o check-in.');
      return;
    }

    try {
      setBusy(true);
      await api.createProjectMetricCheckin(metricId, {
        weekStart: scorecardWeekStart,
        value,
        note: checkinNoteByMetric[metricId]?.trim() || null,
        syncCurrentValue: true
      });
      setCheckinValueByMetric((current) => ({
        ...current,
        [metricId]: ''
      }));
      setCheckinNoteByMetric((current) => ({
        ...current,
        [metricId]: ''
      }));
      await loadProjectScorecard(selectedProject.id, scorecardWeekStart);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearMetricWeekValue(metricId: string) {
    if (!selectedProject) {
      return;
    }

    const shouldClear = window.confirm(
      'Limpar apenas o valor da semana selecionada? (a métrica histórica será mantida)'
    );
    if (!shouldClear) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteProjectMetricCheckin(metricId, {
        weekStart: scorecardWeekStart
      });
      setCheckinValueByMetric((current) => ({
        ...current,
        [metricId]: ''
      }));
      setCheckinNoteByMetric((current) => ({
        ...current,
        [metricId]: ''
      }));
      await loadProjectScorecard(selectedProject.id, scorecardWeekStart);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkinLeadMetricBinary(metricId: string, done: boolean) {
    if (!selectedProject) {
      return;
    }

    try {
      setBusy(true);
      await api.createProjectMetricCheckin(metricId, {
        weekStart: scorecardWeekStart,
        value: done ? 1 : 0,
        note: checkinNoteByMetric[metricId]?.trim() || null,
        syncCurrentValue: false
      });
      setCheckinNoteByMetric((current) => ({
        ...current,
        [metricId]: ''
      }));
      await loadProjectScorecard(selectedProject.id, scorecardWeekStart);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setProjectStatus(status: ProjectStatus) {
    if (!selectedProject) {
      return;
    }
    if (selectedProject.status === status) {
      return;
    }

    const confirmationMessage = PROJECT_STATUS_CONFIRMATION[status];
    if (confirmationMessage && !window.confirm(confirmationMessage)) {
      return;
    }

    try {
      setBusy(true);
      await api.updateProject(selectedProject.id, { status });
      await load(workspaceId);
      await loadProjectScorecard(selectedProject.id, scorecardWeekStart);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveGhostProject(action: 'reativar' | 'mover_latente' | 'encerrar') {
    if (!selectedProject) {
      return;
    }

    const actionLabel =
      action === 'reativar' ? 'reativar este projeto fantasma' : action === 'mover_latente' ? 'mover para latente' : 'encerrar projeto';
    if (!window.confirm(`Confirmar ação: ${actionLabel}?`)) {
      return;
    }

    try {
      setBusy(true);
      await api.resolveGhostProject(selectedProject.id, { action });
      await load(workspaceId);
      await loadProjectScorecard(selectedProject.id, scorecardWeekStart);
      await refreshGlobal();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedProject() {
    if (!selectedProject) {
      return;
    }

    const shouldDelete = window.confirm(
      `Excluir o projeto "${selectedProject.title}"?`
    );

    if (!shouldDelete) {
      return;
    }

    const cascadeTasks = window.confirm(
      'Também deseja excluir as tarefas vinculadas? OK = sim, Cancelar = manter tarefas sem projeto.'
    );

    try {
      setBusy(true);
      await api.deleteProject(selectedProject.id, {
        cascadeTasks
      });
      setSelectedProjectId('');
      setProjectScorecard(null);
      setProjectDetailOpen(false);
      await refreshGlobal();
      await load(workspaceId);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedWorkspaceMode =
    workspaces.find((workspace) => workspace.id === workspaceId)?.mode ?? 'manutencao';

  useEffect(() => {
    if (selectedWorkspaceMode === 'manutencao' && newTaskExecutionKind === 'construcao') {
      setNewTaskExecutionKind('operacao');
    }
  }, [selectedWorkspaceMode, newTaskExecutionKind]);

  useEffect(() => {
    if (!isProjectRoute || !selectedProjectId) {
      setProjectScorecard(null);
      return;
    }

    void loadProjectScorecard(selectedProjectId, scorecardWeekStart);
  }, [isProjectRoute, selectedProjectId, scorecardWeekStart]);

  useEffect(() => {
    if (!isProjectRoute || scorecardWeekOptions.length === 0) {
      return;
    }

    const currentWeekStillValid = scorecardWeekOptions.some((week) => week.weekStart === scorecardWeekStart);
    if (currentWeekStillValid) {
      return;
    }

    setScorecardWeekStart(scorecardWeekOptions[scorecardWeekOptions.length - 1].weekStart);
  }, [isProjectRoute, scorecardWeekOptions, scorecardWeekStart]);

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Entregas"
          title="Projetos"
          subtitle="Estruture metas por projeto e execute por tarefas vinculadas."
        />
        <PremiumCard title="Projetos da frente">
          <SkeletonBlock height={36} />
        </PremiumCard>
        <PremiumCard title="Tarefas do projeto">
          <SkeletonBlock lines={6} />
        </PremiumCard>
      </PremiumPage>
    );
  }

  if (isProjectRoute) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Projeto"
          title={selectedProject?.title ?? 'Projeto não encontrado'}
          subtitle={
            selectedProject
              ? `${selectedProject.workspace?.name ?? 'Sem frente'} • ${selectedProject.type ?? 'operacao'} • ${selectedProject.status ?? 'ativo'}`
              : 'Volte para a lista e selecione um projeto válido.'
          }
          actions={
            <div className="project-header-actions">
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => navigate('/projetos')}
                >
                  Voltar para projetos
                </button>
                {selectedProject && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreateEntity('task');
                      setWorkspaceId(selectedProject.workspaceId);
                      setCreateTaskProjectId(selectedProject.id);
                      setCreateModalOpen(true);
                    }}
                  >
                    Nova tarefa
                  </button>
                )}
              </div>
              {selectedProject && (
                <div className="inline-actions project-status-actions">
                  <button
                    type="button"
                    className={selectedProject.status === 'ativo' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                    disabled={busy}
                    title={PROJECT_STATUS_HINTS.ativo}
                    onClick={() => setProjectStatus('ativo')}
                  >
                    Ativo
                  </button>
                  <button
                    type="button"
                    className={selectedProject.status === 'latente' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                    disabled={busy}
                    title={PROJECT_STATUS_HINTS.latente}
                    onClick={() => setProjectStatus('latente')}
                  >
                    Latente
                  </button>
                  <button
                    type="button"
                    className={selectedProject.status === 'encerrado' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
                    disabled={busy}
                    title={PROJECT_STATUS_HINTS.encerrado}
                    onClick={() => setProjectStatus('encerrado')}
                  >
                    Encerrado
                  </button>
                  <button type="button" className="danger-button" disabled={busy} onClick={deleteSelectedProject}>
                    Excluir projeto
                  </button>
                </div>
              )}
            </div>
          }
        />

        {selectedProject?.status === 'fantasma' && (
          <PremiumCard
            title="Projeto fantasma detectado"
            subtitle="14+ dias sem tarefa A ativa ou Deep Work no projeto"
          >
            <div className="inline-actions">
              <button type="button" className="ghost-button" disabled={busy} onClick={() => resolveGhostProject('reativar')}>
                Reativar agora
              </button>
              <button type="button" className="ghost-button" disabled={busy} onClick={() => resolveGhostProject('mover_latente')}>
                Mover para latente
              </button>
              <button type="button" className="ghost-button" disabled={busy} onClick={() => resolveGhostProject('encerrar')}>
                Encerrar
              </button>
            </div>
          </PremiumCard>
        )}

        {!selectedProject ? (
          <PremiumCard title="Sem projeto">
            <EmptyState
              title="Projeto não encontrado"
              description="O projeto pode ter sido excluído ou o link está inválido."
              actionLabel="Voltar"
              onAction={() => navigate('/projetos')}
            />
          </PremiumCard>
        ) : (
          <>
            <PremiumCard
              title="Placar visível 4DX"
              subtitle="resultado final, medidas de direção e cadência semanal"
              actions={
                <div className="inline-actions">
                  <label>
                    Semana
                    {scorecardWeekOptions.length > 0 ? (
                      <select
                        value={scorecardWeekStart}
                        onChange={(event) => setScorecardWeekStart(event.target.value)}
                      >
                        {scorecardWeekOptions.map((week) => (
                          <option key={week.weekStart} value={week.weekStart}>
                            Semana {week.index} • {week.weekRange}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="date"
                        value={scorecardWeekStart}
                        onChange={(event) => setScorecardWeekStart(event.target.value)}
                      />
                    )}
                  </label>
                </div>
              }
            >
              <div className="premium-metric-grid mini">
                <div className="premium-metric tone-default">
                  <span>Objetivo 4DX</span>
                  <strong className="objective-metric-text">{selectedProject.objective ?? 'Objetivo pendente'}</strong>
                  <small>
                    {selectedProject.objective
                      ? 'Formato 4DX registrado no projeto.'
                      : 'Defina no formato: de X para Y em Z tempo.'}
                  </small>
                </div>
                <div className="premium-metric tone-default">
                  <span>Métrica histórica</span>
                  <strong>{selectedProject.primaryMetric ?? 'Pendente'}</strong>
                  <small>
                    Atual {selectedProject.resultCurrentValue ?? selectedProject.resultStartValue ?? 'n/d'} • Alvo{' '}
                    {selectedProject.resultTargetValue ?? 'n/d'}
                  </small>
                </div>
                <div className="premium-metric tone-default">
                  <span>Lead compliance (semana)</span>
                  <strong>{projectScorecard?.summary.weeklyLeadCompliancePercent ?? 0}%</strong>
                  <small>{projectTractionSignal.reason}</small>
                </div>
                <div className="premium-metric tone-default">
                  <span>Prazo final</span>
                  <strong>
                    {selectedProject.timeHorizonEnd
                      ? new Date(selectedProject.timeHorizonEnd).toLocaleDateString('pt-BR')
                      : 'Sem prazo'}
                  </strong>
                  <small>Check-in a cada {selectedProject.scorecardCadenceDays ?? 7} dias</small>
                </div>
              </div>
            </PremiumCard>

            <section className="premium-grid two">
              <PremiumCard
                title="Projeção da métrica histórica"
                subtitle={primaryLagMetric ? `${primaryLagMetric.name} • placar visível semanal` : 'Adicione uma métrica lag para habilitar projeção'}
              >
                {!primaryLagMetric ? (
                  <EmptyState
                    title="Sem métrica histórica"
                    description="Adicione ao menos 1 métrica lag no scorecard para visualizar projeção."
                  />
                ) : lagProjectionData.length === 0 ? (
                  <EmptyState
                    title="Sem dados para projeção"
                    description="Registre check-ins semanais para liberar o gráfico."
                  />
                ) : (
                  <div className="premium-chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={lagProjectionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                        <XAxis dataKey="week" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }}
                          formatter={(value) => (value == null ? '—' : String(value))}
                          labelFormatter={(label, payload) => {
                            const point = payload?.[0]?.payload as { weekRange?: string } | undefined;
                            return point?.weekRange ? `Semana ${label} • ${point.weekRange}` : `Semana ${label}`;
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="real"
                          name="Real"
                          stroke="#2563eb"
                          strokeWidth={2.6}
                          dot={{ r: 2.5 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="projected"
                          name="Projeção"
                          stroke="#7c3aed"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          dot={false}
                        />
                        {typeof lagProjectionData[0]?.target === 'number' && (
                          <Line
                            type="linear"
                            dataKey="target"
                            name="Meta"
                            stroke="#16a34a"
                            strokeWidth={1.6}
                            dot={false}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="lag-quick-panel">
                  <div className="section-title">
                    <h5>Métrica histórica da semana</h5>
                    <small>
                      {selectedScorecardWeek
                        ? `Semana ${selectedScorecardWeek.index}`
                        : `Semana ${scorecardWeekStart}`}
                    </small>
                  </div>

                  {primaryLagMetric ? (
                    <div className="lag-quick-row">
                      <input
                        type="number"
                        value={checkinValueByMetric[primaryLagMetric.id] ?? ''}
                        onChange={(event) =>
                          setCheckinValueByMetric((current) => ({
                            ...current,
                            [primaryLagMetric.id]: event.target.value
                          }))
                        }
                        placeholder={`Valor de ${primaryLagMetric.name}`}
                      />
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={busy}
                          onClick={() => checkinMetric(primaryLagMetric.id)}
                        >
                          Atualizar gráfico
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy || !primaryLagMetric.weekChecked}
                          onClick={() => clearMetricWeekValue(primaryLagMetric.id)}
                        >
                          Limpar valor da semana
                        </button>
                      </div>
                      <small>
                        atual {primaryLagMetric.currentValue ?? 'n/d'} • alvo {primaryLagMetric.targetValue ?? 'n/d'}{' '}
                        {primaryLagMetric.unit ?? ''}
                      </small>
                    </div>
                  ) : (
                    <form className="lag-quick-create" onSubmit={createProjectMetric}>
                      <input
                        value={newMetricName}
                        onChange={(event) => setNewMetricName(event.target.value)}
                        placeholder="Nome da métrica histórica (ex: Seguidores acumulados)"
                      />
                      <div className="row-2">
                        <input
                          type="number"
                          value={newMetricTargetValue}
                          onChange={(event) => setNewMetricTargetValue(event.target.value)}
                          placeholder="Meta (opcional)"
                        />
                        <input
                          value={newMetricUnit}
                          onChange={(event) => setNewMetricUnit(event.target.value)}
                          placeholder="Unidade (opcional)"
                        />
                      </div>
                      <button type="submit" disabled={busy || !newMetricName.trim()}>
                        Criar métrica histórica
                      </button>
                    </form>
                  )}
                </div>
              </PremiumCard>

              <PremiumCard
                title="Medidas de direção (binário)"
                subtitle={
                  selectedScorecardWeek
                    ? `Semana ${selectedScorecardWeek.index}: ${selectedScorecardWeek.weekRange}`
                    : 'check-in semanal: fez ou não fez'
                }
              >
                {scorecardLeadMetrics.length === 0 ? (
                  <EmptyState
                    title="Sem medidas lead"
                    description="Adicione medidas de direção para disciplinar execução semanal."
                  />
                ) : (
                  <>
                    {leadComplianceHistory.length > 1 && (
                      <div className="premium-chart-wrap">
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={leadComplianceHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                            <XAxis dataKey="week" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fill: '#60708a', fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }}
                              formatter={(value) => [`${value}%`, 'Compliance']}
                              labelFormatter={(label, payload) => {
                                const entry = payload?.[0]?.payload as { weekStart?: string } | undefined;
                                return entry?.weekStart ? `Semana ${label} • ${entry.weekStart}` : `Semana ${label}`;
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="compliance"
                              name="Compliance"
                              stroke="#2563eb"
                              strokeWidth={2.6}
                              dot={{ r: 2.5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <ul className="premium-list dense">
                      {scorecardLeadMetrics.map((metric) => {
                        const checkedValue = metric.weekCheckin?.value ?? null;
                        const isDone = checkedValue !== null ? checkedValue > 0 : false;
                        const isNotDone = checkedValue !== null ? checkedValue <= 0 : false;
                        return (
                          <li key={metric.id}>
                            <div>
                              <strong>{metric.name}</strong>
                              <small>
                                {selectedScorecardWeek
                                  ? `Semana ${selectedScorecardWeek.index}`
                                  : `Semana ${projectScorecard?.project.weekStart ?? scorecardWeekStart}`}{' '}
                                • {metric.weekChecked ? (isDone ? 'feito' : 'não feito') : 'sem check-in'}
                              </small>
                            </div>
                            <div className="inline-actions">
                              <input
                                value={checkinNoteByMetric[metric.id] ?? ''}
                                onChange={(event) =>
                                  setCheckinNoteByMetric((current) => ({
                                    ...current,
                                    [metric.id]: event.target.value
                                  }))
                                }
                                placeholder="Nota (opcional)"
                              />
                              <button
                                type="button"
                                className={isDone ? 'ghost-button task-filter active' : 'ghost-button'}
                                disabled={busy}
                                onClick={() => checkinLeadMetricBinary(metric.id, true)}
                              >
                                Sim
                              </button>
                              <button
                                type="button"
                                className={isNotDone ? 'ghost-button task-filter active' : 'ghost-button'}
                                disabled={busy}
                                onClick={() => checkinLeadMetricBinary(metric.id, false)}
                              >
                                Não
                              </button>
                              <button
                                type="button"
                                className="text-button"
                                disabled={busy}
                                onClick={() => clearMetricWeekValue(metric.id)}
                              >
                                Limpar semana
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </PremiumCard>
            </section>

            <PremiumCard title="Tarefas vinculadas ao projeto" subtitle={`${projectTasks.length} tarefas`}>
              {projectTasks.length === 0 ? (
                <EmptyState
                  title="Projeto sem tarefas"
                  description="Adicione tarefas para transformar estratégia em execução."
                />
              ) : (
                <ul className="premium-list dense">
                  {projectTasks.map((task) => (
                    <li key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          tipo {String(task.taskType ?? 'b').toUpperCase()} • prioridade P{task.priority} • status {task.status}
                        </small>
                      </div>
                      <div className="inline-actions">
                        <span className={`status-tag ${task.status}`}>{task.status}</span>
                        {task.status !== 'feito' && (
                          <button type="button" className="ghost-button" onClick={() => completeTask(task.id)}>
                            Concluir
                          </button>
                        )}
                        <button type="button" className="text-button" onClick={() => deleteProjectTask(task.id)}>
                          Excluir
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </PremiumCard>
          </>
        )}

        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title={createEntity === 'project' ? 'Criar projeto' : 'Criar tarefa no projeto'}
          subtitle={
            createEntity === 'project'
              ? 'Placar 4DX: resultado claro + medidas de direção semanais'
              : 'Adicione execução com prioridade clara'
          }
          size="lg"
        >
          <div className="inline-actions create-mode-switch">
            <button
              type="button"
              className={createEntity === 'project' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => setCreateEntity('project')}
            >
              Projeto
            </button>
            <button
              type="button"
              className={createEntity === 'task' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => setCreateEntity('task')}
            >
              Tarefa
            </button>
          </div>

          {createEntity === 'project' ? (
            <form className="minimal-form" onSubmit={createProject}>
              <select
                value={workspaceId}
                onChange={(event) => {
                  const nextWorkspace = event.target.value;
                  setWorkspaceId(nextWorkspace);
                  load(nextWorkspace);
                }}
              >
                <option value="">Selecione frente</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <input
                value={newProjectTitle}
                onChange={(event) => setNewProjectTitle(event.target.value)}
                placeholder="Nome do projeto"
                required
              />
              <div className="row-2">
                <select value={newProjectType} onChange={(event) => setNewProjectType(event.target.value as ProjectType)}>
                  <option value="construcao">Construção</option>
                  <option value="operacao">Operação</option>
                  <option value="crescimento">Crescimento</option>
                </select>
                <select
                  value={newProjectStatus}
                  onChange={(event) => setNewProjectStatus(event.target.value as ProjectStatus)}
                >
                  <option value="ativo">Ativo</option>
                  <option value="latente">Latente</option>
                  <option value="encerrado">Encerrado</option>
                </select>
              </div>
              <label>
                Objetivo claro (4DX)
                <input
                  value={newProjectObjective}
                  onChange={(event) => setNewProjectObjective(event.target.value)}
                  placeholder="de 0 para 10.000 seguidores no Instagram em 3 meses"
                  required
                />
              </label>
              <label>
                Métrica principal (histórica/lag)
                <input
                  value={newProjectMetric}
                  onChange={(event) => setNewProjectMetric(event.target.value)}
                  placeholder="Ex: seguidores no Instagram"
                  required
                />
              </label>
              <div className="row-2">
                <label>
                  Medida de direção 1 (lead)
                  <input
                    value={newProjectLeadMeasure1}
                    onChange={(event) => setNewProjectLeadMeasure1(event.target.value)}
                    placeholder="Ex: postar 2 reels por semana"
                    required
                  />
                </label>
                <label>
                  Medida de direção 2 (lead)
                  <input
                    value={newProjectLeadMeasure2}
                    onChange={(event) => setNewProjectLeadMeasure2(event.target.value)}
                    placeholder="Ex: analisar métricas dos reels 1x/semana"
                    required
                  />
                </label>
              </div>
              <div className="row-2">
                <label>
                  Cadência de check-in (dias)
                  <input
                    type="number"
                    min={7}
                    max={14}
                    step={7}
                    value={newProjectCadenceDays}
                    onChange={(event) => setNewProjectCadenceDays(event.target.value)}
                  />
                </label>
                <label>
                  Prazo final
                  <input
                    type="date"
                    value={newProjectTimeHorizonEnd}
                    onChange={(event) => setNewProjectTimeHorizonEnd(event.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="row-2">
                <label>
                  Medida histórica inicial (semana 0)
                  <input
                    type="number"
                    value={newProjectResultStartValue}
                    onChange={(event) => setNewProjectResultStartValue(event.target.value)}
                    placeholder="0"
                    required
                  />
                </label>
                <label>
                  Resultado alvo
                  <input
                    type="number"
                    value={newProjectResultTargetValue}
                    onChange={(event) => setNewProjectResultTargetValue(event.target.value)}
                    placeholder="10000"
                    required
                  />
                </label>
              </div>
              <textarea
                value={newProjectDescription}
                onChange={(event) => setNewProjectDescription(event.target.value)}
                placeholder="Descrição curta"
              />
              <button type="submit" disabled={busy}>
                Criar projeto
              </button>
            </form>
          ) : (
            <form className="minimal-form" onSubmit={createProjectTask}>
              <select
                value={workspaceId}
                onChange={(event) => {
                  const nextWorkspace = event.target.value;
                  setWorkspaceId(nextWorkspace);
                  load(nextWorkspace);
                }}
              >
                <option value="">Selecione frente</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>

              <select
                value={createTaskProjectId}
                onChange={(event) => setCreateTaskProjectId(event.target.value)}
                required
              >
                <option value="">Selecione projeto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>

              <input
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                placeholder="Verbo + objeto (ex: Revisar proposta comercial)"
                required
              />

              <input
                value={newTaskDefinitionOfDone}
                onChange={(event) => setNewTaskDefinitionOfDone(event.target.value)}
                placeholder="Definição de pronto"
                required
              />

              <div className="row-2">
                <label>
                  Tempo estimado (min)
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={newTaskEstimatedMinutes}
                    onChange={(event) => setNewTaskEstimatedMinutes(event.target.value)}
                    required
                  />
                </label>
                <select value={newTaskType} onChange={(event) => setNewTaskType(event.target.value as TaskType)}>
                  <option value="a">Tipo A</option>
                  <option value="b">Tipo B</option>
                  <option value="c">Tipo C</option>
                </select>
              </div>

              <button type="submit" disabled={busy || !createTaskProjectId}>
                Criar tarefa
              </button>
            </form>
          )}
        </Modal>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PremiumHeader
        eyebrow="Entregas"
        title="Projetos"
        subtitle="Estruture metas por projeto e execute por tarefas vinculadas."
        actions={
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={() => openCreateModal('task')}>
              Nova tarefa
            </button>
            <button type="button" onClick={() => openCreateModal('project')}>
              Criar
            </button>
          </div>
        }
      />

      {error && <p className="surface-error">{error}</p>}

      <PremiumCard
        title="Panorama da frente"
        subtitle={workspaceId === 'all' ? 'Visão geral' : workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? 'Sem frente'}
      >
        <div className="premium-metric-grid mini">
          <div className="premium-metric tone-default">
            <span>Projetos</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="premium-metric tone-default">
            <span>Tarefas vinculadas</span>
            <strong>{tasks.filter((task) => Boolean(task.projectId)).length}</strong>
          </div>
          <div className="premium-metric tone-default">
            <span>Tarefas abertas</span>
            <strong>{tasks.filter((task) => task.status !== 'feito').length}</strong>
          </div>
          <div className="premium-metric tone-default">
            <span>Concluídas</span>
            <strong>{tasks.filter((task) => task.status === 'feito').length}</strong>
          </div>
        </div>
      </PremiumCard>

      <PremiumCard title="Ranking estratégico de projetos" subtitle="trabalho com peso executivo nos últimos 7 dias">
        {strategicActiveLoad > 5 && (
          <p className="surface-error">
            Risco de fragmentação cognitiva: {strategicActiveLoad} projetos ativos com tarefas A abertas (recomendado: até 5).
          </p>
        )}

        {projectRanking.length === 0 ? (
          <EmptyState
            title="Sem projetos para ranquear"
            description="Crie projetos e tarefas A para visualizar tração estratégica."
          />
        ) : (
          <ul className="premium-list dense">
            {projectRanking.slice(0, 8).map((entry, index) => (
              <li key={entry.project.id}>
                <div>
                  <strong>
                    {index + 1}. {entry.project.title}
                  </strong>
                  <small>
                    score {entry.strategicScore} • A abertas {entry.openA} • A concluídas (7d) {entry.doneAThisWeek} • status{' '}
                    {entry.project.status ?? 'ativo'}
                  </small>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => openProjectDetail(entry.project.id)}
                >
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        )}
      </PremiumCard>

      <PremiumCard title="Projetos da frente">
        {projectSelectionCards.length === 0 ? (
          <EmptyState
            title="Sem projetos nesta frente"
            description="Crie o primeiro projeto para organizar entregas e backlog por escopo."
          />
        ) : (
          <div className="project-selector-grid">
            {projectSelectionCards.map((entry) => {
              const isActive = selectedProjectId === entry.project.id;

              return (
                <article
                  key={entry.project.id}
                  className={isActive ? 'project-selector-card active' : 'project-selector-card'}
                >
                  <button
                    type="button"
                    className="project-selector-select"
                    onClick={() => {
                      setSelectedProjectId(entry.project.id);
                      setCreateTaskProjectId(entry.project.id);
                    }}
                  >
                    <div className="project-selector-head">
                      <strong>{entry.project.title}</strong>
                      <span className={`status-tag ${entry.project.status ?? 'backlog'}`}>
                        {entry.project.status ?? 'ativo'}
                      </span>
                    </div>
                    <small>
                      {entry.project.type ?? 'operacao'} • score {entry.strategicScore}
                    </small>
                    <div className="project-selector-metrics">
                      <span>{entry.totalTasks} tarefas</span>
                      <span>A abertas {entry.openA}</span>
                      <span>A concluídas 7d {entry.doneAThisWeek}</span>
                    </div>
                  </button>
                  <div className="project-selector-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => openProjectDetail(entry.project.id)}
                    >
                      Abrir página do projeto
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PremiumCard>

      <Modal
        open={projectDetailOpen && Boolean(selectedProject)}
        onClose={() => setProjectDetailOpen(false)}
        title={selectedProject?.title ?? 'Detalhe do projeto'}
        subtitle={
          selectedProject
            ? `${projectTasks.length} tarefas • ${selectedProject.type ?? 'operacao'} • ${selectedProject.status ?? 'ativo'}`
            : 'Sem projeto selecionado'
        }
        size="xl"
      >
        {!selectedProject ? (
          <EmptyState
            title="Projeto não encontrado"
            description="Selecione outro projeto para continuar."
          />
        ) : (
          <div className="minimal-form">
            <div className="inline-actions">
              <button type="button" className="danger-button" disabled={busy} onClick={deleteSelectedProject}>
                Excluir projeto
              </button>
            </div>

            <div className="premium-metric-grid mini">
              <div className="premium-metric tone-default">
                <span>Objetivo</span>
                <strong>{selectedProject.objective ? 'Definido' : 'Pendente'}</strong>
                <small>{selectedProject.objective ?? 'Descreva o resultado final esperado.'}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>Métrica principal (lag)</span>
                <strong>{selectedProject.primaryMetric ? 'Definida' : 'Pendente'}</strong>
                <small>{selectedProject.primaryMetric ?? 'Defina um alvo mensurável.'}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>Medidas de direção</span>
                <strong>{scorecardLeadMetrics.length}/2 registradas</strong>
                <small>
                  {scorecardLeadMetrics.length
                    ? scorecardLeadMetrics.map((metric) => metric.name).join(' • ')
                    : 'Defina as duas medidas lead no scorecard.'}
                </small>
              </div>
              <div className="premium-metric tone-default">
                <span>Prazo 4DX</span>
                <strong>
                  {selectedProject.timeHorizonEnd
                    ? new Date(selectedProject.timeHorizonEnd).toLocaleDateString('pt-BR')
                    : 'Sem prazo'}
                </strong>
                <small>
                  Cadência semanal: {selectedProject.scorecardCadenceDays ?? 7} dias
                </small>
              </div>
              <div className="premium-metric tone-default">
                <span>Sinal de tração</span>
                <strong>{projectTractionSignal.label}</strong>
                <small>{projectTractionSignal.reason}</small>
              </div>
            </div>

            <section className="detail-extension-panel">
              <div className="inline-actions">
                <strong>Scorecard 4DX</strong>
                <label>
                  Semana
                  <input
                    type="date"
                    value={scorecardWeekStart}
                    onChange={(event) => setScorecardWeekStart(event.target.value)}
                  />
                </label>
              </div>

              {!projectScorecard ? (
                <SkeletonBlock lines={4} />
              ) : (
                <>
                  <div className="premium-metric-grid mini">
                    <div className="premium-metric tone-default">
                      <span>Compliance lead</span>
                      <strong>{projectScorecard.summary.weeklyLeadCompliancePercent}%</strong>
                      <small>
                        {projectScorecard.summary.weeklyCheckinsMissing} métrica(s) sem check-in nesta semana
                      </small>
                    </div>
                    <div className="premium-metric tone-default">
                      <span>Progresso lag</span>
                      <strong>
                        {projectScorecard.summary.lagProgressPercent === null
                          ? 'n/d'
                          : `${projectScorecard.summary.lagProgressPercent}%`}
                      </strong>
                      <small>
                        Atualização mais recente:{' '}
                        {projectScorecard.summary.lastScorecardCheckinAt
                          ? new Date(projectScorecard.summary.lastScorecardCheckinAt).toLocaleString('pt-BR')
                          : 'nenhuma'}
                      </small>
                    </div>
                  </div>

                  <form className="minimal-form" onSubmit={createProjectMetric}>
                    <p className="premium-empty">
                      Estrutura 4DX: 2 medidas de direção (lead) + 1 medida histórica (lag), com check-in semanal.
                    </p>
                    <div className="row-2">
                      <input value="Medida histórica (lag)" readOnly />
                      <input
                        value={newMetricName}
                        onChange={(event) => setNewMetricName(event.target.value)}
                        placeholder="Ex: Seguidores no Instagram"
                      />
                    </div>
                    <div className="row-2">
                      <input
                        type="number"
                        value={newMetricTargetValue}
                        onChange={(event) => setNewMetricTargetValue(event.target.value)}
                        placeholder="Meta (opcional)"
                      />
                      <input
                        value={newMetricUnit}
                        onChange={(event) => setNewMetricUnit(event.target.value)}
                        placeholder="Unidade (ex: %, reels, R$)"
                      />
                    </div>
                    <button type="submit" disabled={busy || !newMetricName.trim()}>
                      Adicionar métrica
                    </button>
                  </form>

                  {projectScorecard.metrics.length === 0 ? (
                    <EmptyState
                      title="Sem métricas no scorecard"
                      description="Crie medidas lead/lag para transformar o projeto em placar executável."
                    />
                  ) : (
                    <ul className="premium-list dense">
                      {projectScorecard.metrics.map((metric) => (
                        <li key={metric.id}>
                          <div>
                            <strong>
                              {metric.kind === 'lead' ? 'Direção' : 'Histórica'} • {metric.name}
                            </strong>
                            <small>
                              atual {metric.currentValue ?? 'n/d'} / alvo {metric.targetValue ?? 'n/d'}{' '}
                              {metric.unit ?? ''}
                            </small>
                            <small>
                              Semana {projectScorecard.project.weekStart}:{' '}
                              {metric.weekChecked
                                ? `check-in ${metric.weekCheckin?.value ?? 'n/d'}`
                                : 'sem check-in'}
                            </small>
                            {metric.kind === 'lag' && metric.history.length > 0 && (
                              <div className="lag-history-inline">
                                <span>Histórico semanal</span>
                                <div className="lag-history-bars">
                                  {metric.history.map((point) => {
                                    const maxValue = Math.max(
                                      1,
                                      ...metric.history.map((entry) => Math.abs(entry.value))
                                    );
                                    const ratio = Math.max(
                                      0.08,
                                      Math.min(1, Math.abs(point.value) / maxValue)
                                    );
                                    return (
                                      <div key={point.id} className="lag-history-bar-wrap">
                                        <div
                                          className="lag-history-bar"
                                          style={{ height: `${Math.round(ratio * 100)}%` }}
                                          title={`${point.weekStart}: ${point.value}`}
                                        />
                                        <small>{point.weekStart.slice(5)}</small>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="inline-actions">
                            <input
                              type="number"
                              value={checkinValueByMetric[metric.id] ?? ''}
                              onChange={(event) =>
                                setCheckinValueByMetric((current) => ({
                                  ...current,
                                  [metric.id]: event.target.value
                                }))
                              }
                              placeholder="Valor"
                            />
                            <input
                              value={checkinNoteByMetric[metric.id] ?? ''}
                              onChange={(event) =>
                                setCheckinNoteByMetric((current) => ({
                                  ...current,
                                  [metric.id]: event.target.value
                                }))
                              }
                              placeholder="Nota (opcional)"
                            />
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={busy}
                              onClick={() => checkinMetric(metric.id)}
                            >
                              Check-in
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy}
                              onClick={() => clearMetricWeekValue(metric.id)}
                            >
                              Limpar semana
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {projectTasks.length === 0 ? (
              <EmptyState
                title="Projeto sem tarefas"
                description="Adicione tarefas para iniciar a execução deste escopo."
              />
            ) : (
              <ul className="premium-list dense">
                {projectTasks.map((task) => (
                  <li key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>
                        tipo {String(task.taskType ?? 'b').toUpperCase()} • prioridade {task.priority} • horizonte{' '}
                        {task.horizon ?? 'active'}
                      </small>
                    </div>

                    <div className="inline-actions">
                      <span className={`status-tag ${task.status}`}>{task.status}</span>
                      {task.status !== 'feito' && (
                        <button type="button" className="ghost-button" onClick={() => completeTask(task.id)}>
                          Concluir
                        </button>
                      )}
                      <button type="button" className="text-button" onClick={() => deleteProjectTask(task.id)}>
                        Excluir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={createEntity === 'project' ? 'Criar projeto' : 'Criar tarefa no projeto'}
        subtitle={
          createEntity === 'project'
            ? 'Placar 4DX: resultado claro + medidas de direção semanais'
            : 'Adicione execução com prioridade clara'
        }
        size="lg"
      >
        <div className="inline-actions create-mode-switch">
          <button
            type="button"
            className={createEntity === 'project' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
            onClick={() => setCreateEntity('project')}
          >
            Projeto
          </button>
          <button
            type="button"
            className={createEntity === 'task' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
            onClick={() => setCreateEntity('task')}
          >
            Tarefa
          </button>
        </div>

        {createEntity === 'project' ? (
          <form className="minimal-form" onSubmit={createProject}>
            <select
              value={workspaceId}
              onChange={(event) => {
                const nextWorkspace = event.target.value;
                setWorkspaceId(nextWorkspace);
                load(nextWorkspace);
              }}
            >
              <option value="">Selecione frente</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <input
              value={newProjectTitle}
              onChange={(event) => setNewProjectTitle(event.target.value)}
              placeholder="Nome do projeto"
              required
            />
            <div className="row-2">
              <select value={newProjectType} onChange={(event) => setNewProjectType(event.target.value as ProjectType)}>
                <option value="construcao">Construção</option>
                <option value="operacao">Operação</option>
                <option value="crescimento">Crescimento</option>
              </select>
              <select
                value={newProjectStatus}
                onChange={(event) => setNewProjectStatus(event.target.value as ProjectStatus)}
              >
                <option value="ativo">Ativo</option>
                <option value="latente">Latente</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </div>
            <label>
              Objetivo claro (4DX)
              <input
                value={newProjectObjective}
                onChange={(event) => setNewProjectObjective(event.target.value)}
                placeholder="de 0 para 10.000 seguidores no Instagram em 3 meses"
                required
              />
            </label>
            <label>
              Métrica principal (histórica/lag)
              <input
                value={newProjectMetric}
                onChange={(event) => setNewProjectMetric(event.target.value)}
                placeholder="Ex: seguidores no Instagram"
                required
              />
            </label>
            <div className="row-2">
              <label>
                Medida de direção 1 (lead)
                <input
                  value={newProjectLeadMeasure1}
                  onChange={(event) => setNewProjectLeadMeasure1(event.target.value)}
                  placeholder="Ex: postar 2 reels por semana"
                  required
                />
              </label>
              <label>
                Medida de direção 2 (lead)
                <input
                  value={newProjectLeadMeasure2}
                  onChange={(event) => setNewProjectLeadMeasure2(event.target.value)}
                  placeholder="Ex: analisar métricas dos reels 1x/semana"
                  required
                />
              </label>
            </div>
            <div className="row-2">
              <label>
                Cadência de check-in (dias)
                <input
                  type="number"
                  min={7}
                  max={14}
                  step={7}
                  value={newProjectCadenceDays}
                  onChange={(event) => setNewProjectCadenceDays(event.target.value)}
                />
              </label>
              <label>
                Prazo final
                <input
                  type="date"
                  value={newProjectTimeHorizonEnd}
                  onChange={(event) => setNewProjectTimeHorizonEnd(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="row-2">
              <label>
                Medida histórica inicial (semana 0)
                <input
                  type="number"
                  value={newProjectResultStartValue}
                  onChange={(event) => setNewProjectResultStartValue(event.target.value)}
                  placeholder="0"
                  required
                />
              </label>
              <label>
                Resultado alvo
                <input
                  type="number"
                  value={newProjectResultTargetValue}
                  onChange={(event) => setNewProjectResultTargetValue(event.target.value)}
                  placeholder="10000"
                  required
                />
              </label>
            </div>
            <textarea
              value={newProjectDescription}
              onChange={(event) => setNewProjectDescription(event.target.value)}
              placeholder="Descrição curta"
            />
            <button type="submit" disabled={busy}>
              Criar projeto
            </button>
          </form>
        ) : (
          <form className="minimal-form" onSubmit={createProjectTask}>
            <select
              value={workspaceId}
              onChange={(event) => {
                const nextWorkspace = event.target.value;
                setWorkspaceId(nextWorkspace);
                load(nextWorkspace);
              }}
            >
              <option value="">Selecione frente</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>

            <select
              value={createTaskProjectId}
              onChange={(event) => setCreateTaskProjectId(event.target.value)}
              required
            >
              <option value="">Selecione projeto</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>

            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Verbo + objeto (ex: Revisar proposta comercial)"
              required
            />

            <input
              value={newTaskDefinitionOfDone}
              onChange={(event) => setNewTaskDefinitionOfDone(event.target.value)}
              placeholder="Definição de pronto"
              required
            />

            <div className="row-2">
              <label>
                Tempo estimado (min)
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={newTaskEstimatedMinutes}
                  onChange={(event) => setNewTaskEstimatedMinutes(event.target.value)}
                  required
                />
              </label>
              <select value={newTaskType} onChange={(event) => setNewTaskType(event.target.value as TaskType)}>
                <option value="a">Tipo A</option>
                <option value="b">Tipo B</option>
                <option value="c">Tipo C</option>
              </select>
            </div>

            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={newTaskIsMultiBlock}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setNewTaskIsMultiBlock(enabled);
                  if (!enabled) {
                    setNewTaskMultiBlockGoalMinutes('');
                  } else if (!newTaskMultiBlockGoalMinutes.trim()) {
                    setNewTaskMultiBlockGoalMinutes(newTaskEstimatedMinutes || '60');
                  }
                }}
              />
              Tarefa complexa multissessão (multiblock)
            </label>

            {newTaskIsMultiBlock && (
              <label>
                Meta total da tarefa multiblock (min)
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={newTaskMultiBlockGoalMinutes}
                  onChange={(event) => setNewTaskMultiBlockGoalMinutes(event.target.value)}
                  placeholder="240"
                  required
                />
              </label>
            )}

            <div className="row-2">
              <select value={newTaskEnergy} onChange={(event) => setNewTaskEnergy(event.target.value as TaskEnergy)}>
                <option value="alta">Energia alta</option>
                <option value="media">Energia média</option>
                <option value="baixa">Energia baixa</option>
              </select>
              <select
                value={newTaskExecutionKind}
                onChange={(event) => setNewTaskExecutionKind(event.target.value as TaskExecutionKind)}
              >
                <option value="construcao" disabled={selectedWorkspaceMode === 'manutencao'}>
                  Construção
                </option>
                <option value="operacao">Operação</option>
              </select>
            </div>

            {selectedWorkspaceMode === 'manutencao' && (
              <p className="premium-empty">
                Frente em manutenção: nova tarefa fica restrita a operação.
              </p>
            )}
            {selectedWorkspaceMode === 'standby' && (
              <p className="premium-empty">
                Frente em standby: permitido capturar backlog, mas evite execução até reativar.
              </p>
            )}

            <div className="priority-pill-grid">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === newTaskPriority ? `priority-pill active p${value}` : `priority-pill p${value}`}
                  onClick={() => setNewTaskPriority(value)}
                >
                  P{value} {priorityAlias(value)}
                </button>
              ))}
            </div>

            <select value={newTaskHorizon} onChange={(event) => setNewTaskHorizon(event.target.value as TaskHorizon)}>
              <option value="active">Ativo</option>
              <option value="future">Futuro</option>
            </select>

            <button type="submit" disabled={busy || !createTaskProjectId}>
              Criar tarefa
            </button>
          </form>
        )}
      </Modal>
    </PremiumPage>
  );
}
