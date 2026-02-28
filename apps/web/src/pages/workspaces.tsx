import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  api,
  CommitmentLevel,
  MonthlyReview,
  Project,
  StrategicReviewHistoryItem,
  StrategicReviewJournal,
  Task,
  WeeklyAllocation,
  WeeklyReview,
  WorkspacePortfolio,
  Workspace,
  WorkspaceMode,
  WorkspaceType
} from '../api';
import { Modal } from '../components/modal';
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock, TabSwitch } from '../components/premium-ui';
import { useShellContext } from '../components/shell-context';
import { TaskIntelligenceTable } from '../components/task-intelligence-table';

type ReviewDraft = {
  nextPriority: string;
  strategicDecision: string;
  commitmentLevel: CommitmentLevel;
  actionItemsText: string;
  reflection: string;
};

type WorkspaceSection = 'portfolio' | 'planejamento' | 'revisoes' | 'operacao';
type PortfolioPanel = 'workspaces' | 'executivo' | 'resumo';
type PlanningPanel = 'alocacao' | 'revisao';
type ReviewPanel = 'semanal' | 'mensal' | 'historico';

const WORKSPACE_EXPANSION_GRACE_HOURS = 72;

const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  nextPriority: '',
  strategicDecision: '',
  commitmentLevel: 'medio',
  actionItemsText: '',
  reflection: ''
};

function workspaceTypeLabel(type: Workspace['type']) {
  if (type === 'empresa') {
    return 'Empresa';
  }

  if (type === 'pessoal') {
    return 'Pessoal';
  }

  if (type === 'vida') {
    return 'Vida';
  }

  if (type === 'autoridade') {
    return 'Autoridade';
  }

  if (type === 'outro') {
    return 'Outro';
  }

  return 'Geral';
}

function workspaceTypeDefaultCategory(type: Exclude<WorkspaceType, 'geral'>) {
  return workspaceTypeLabel(type);
}

function workspaceModeLabel(mode?: WorkspaceMode) {
  if (mode === 'expansao') {
    return 'Expansão';
  }
  if (mode === 'standby') {
    return 'Standby';
  }
  return 'Manutenção';
}

function frontHealthTone(status: WorkspacePortfolio['rows'][number]['frontHealth']['status']) {
  if (status === 'forte') {
    return 'feito';
  }

  if (status === 'estavel' || status === 'standby') {
    return 'andamento';
  }

  return 'backlog';
}

function currentWeekStartIso() {
  const base = new Date();
  const day = base.getDay();
  const diff = (day + 6) % 7;
  base.setDate(base.getDate() - diff);
  base.setHours(0, 0, 0, 0);
  return base.toISOString().slice(0, 10);
}

function currentMonthStartIso() {
  const base = new Date();
  base.setDate(1);
  base.setHours(0, 0, 0, 0);
  return base.toISOString().slice(0, 10);
}

function draftFromJournal(journal: StrategicReviewJournal | null): ReviewDraft {
  if (!journal?.review) {
    return { ...EMPTY_REVIEW_DRAFT };
  }

  return {
    nextPriority: journal.review.nextPriority ?? '',
    strategicDecision: journal.review.strategicDecision ?? '',
    commitmentLevel: journal.review.commitmentLevel ?? 'medio',
    actionItemsText: journal.review.actionItems.join('\n'),
    reflection: journal.review.reflection ?? ''
  };
}

function parseActionItems(text: string) {
  return text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

export function WorkspacesPage() {
  const navigate = useNavigate();
  const { workspaceId: workspaceRouteId } = useParams<{ workspaceId?: string }>();
  const isWorkspaceRoute = Boolean(workspaceRouteId);

  const {
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaces: sharedWorkspaces,
    refreshGlobal
  } = useShellContext();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [weeklyAllocation, setWeeklyAllocation] = useState<WeeklyAllocation | null>(null);
  const [workspacePortfolioWeekly, setWorkspacePortfolioWeekly] = useState<WorkspacePortfolio | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const [monthlyReview, setMonthlyReview] = useState<MonthlyReview | null>(null);
  const [weeklyJournal, setWeeklyJournal] = useState<StrategicReviewJournal | null>(null);
  const [monthlyJournal, setMonthlyJournal] = useState<StrategicReviewJournal | null>(null);
  const [weeklyHistory, setWeeklyHistory] = useState<StrategicReviewHistoryItem[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<StrategicReviewHistoryItem[]>([]);

  const [weeklyDraft, setWeeklyDraft] = useState<ReviewDraft>({ ...EMPTY_REVIEW_DRAFT });
  const [monthlyDraft, setMonthlyDraft] = useState<ReviewDraft>({ ...EMPTY_REVIEW_DRAFT });

  const [allocationDraft, setAllocationDraft] = useState<Record<string, number>>({});
  const [allocationDirty, setAllocationDirty] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('all');
  const [weekStart, setWeekStart] = useState(() => currentWeekStartIso());
  const [monthStart, setMonthStart] = useState(() => currentMonthStartIso());

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<Exclude<WorkspaceType, 'geral'>>('empresa');
  const [newMode, setNewMode] = useState<WorkspaceMode>('manutencao');
  const [newColor, setNewColor] = useState('#2563EB');
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [editWorkspaceOpen, setEditWorkspaceOpen] = useState(false);
  const [editWorkspaceId, setEditWorkspaceId] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<Exclude<WorkspaceType, 'geral'>>('empresa');
  const [editMode, setEditMode] = useState<WorkspaceMode>('manutencao');
  const [editColor, setEditColor] = useState('#2563EB');
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('portfolio');
  const [portfolioPanel, setPortfolioPanel] = useState<PortfolioPanel>('workspaces');
  const [planningPanel, setPlanningPanel] = useState<PlanningPanel>('alocacao');
  const [reviewPanel, setReviewPanel] = useState<ReviewPanel>('semanal');
  const [selectedFrontTaskId, setSelectedFrontTaskId] = useState('');

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== 'geral'),
    [workspaces]
  );

  async function load() {
    try {
      setError(null);
      const routeWorkspaceId = workspaceRouteId && workspaceRouteId !== 'all' ? workspaceRouteId : undefined;
      const strategyWorkspaceId =
        routeWorkspaceId ?? (selectedWorkspaceId === 'all' ? undefined : selectedWorkspaceId);
      const [
        workspaceData,
        taskData,
        projectData,
        allocationData,
        reviewData,
        monthlyData,
        weeklyJournalData,
        monthlyJournalData,
        weeklyHistoryData,
        monthlyHistoryData,
        workspacePortfolioData
      ] = await Promise.all([
        api.getWorkspaces(),
        api.getTasks(),
        api.getProjects(),
        api.getWeeklyAllocation({
          weekStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getWeeklyReview({
          weekStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getMonthlyReview({
          monthStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getReviewJournal({
          periodType: 'weekly',
          periodStart: weekStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getReviewJournal({
          periodType: 'monthly',
          periodStart: monthStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getReviewHistory({
          periodType: 'weekly',
          workspaceId: strategyWorkspaceId,
          limit: 6
        }),
        api.getReviewHistory({
          periodType: 'monthly',
          workspaceId: strategyWorkspaceId,
          limit: 6
        }),
        api.getWorkspacePortfolio({
          weekStart
        })
      ]);

      setWorkspaces(workspaceData);
      setTasks(taskData);
      setProjects(projectData);
      setWeeklyAllocation(allocationData);
      setWorkspacePortfolioWeekly(workspacePortfolioData);
      setWeeklyReview(reviewData);
      setMonthlyReview(monthlyData);
      setWeeklyJournal(weeklyJournalData);
      setMonthlyJournal(monthlyJournalData);
      setWeeklyHistory(weeklyHistoryData);
      setMonthlyHistory(monthlyHistoryData);

      setWeeklyDraft(draftFromJournal(weeklyJournalData));
      setMonthlyDraft(draftFromJournal(monthlyJournalData));

      setAllocationDraft(
        Object.fromEntries(allocationData.rows.map((entry) => [entry.workspaceId, entry.plannedPercent]))
      );
      setAllocationDirty(false);

      const selectableWorkspaceIds = new Set(
        workspaceData.filter((workspace) => workspace.type !== 'geral').map((workspace) => workspace.id)
      );

      if (routeWorkspaceId) {
        const nextWorkspaceId = selectableWorkspaceIds.has(routeWorkspaceId) ? routeWorkspaceId : 'all';
        setSelectedWorkspaceId(nextWorkspaceId);
        if (nextWorkspaceId !== 'all' && activeWorkspaceId !== nextWorkspaceId) {
          setActiveWorkspaceId(nextWorkspaceId);
        }
      } else if (selectedWorkspaceId !== 'all' && !selectableWorkspaceIds.has(selectedWorkspaceId)) {
        setSelectedWorkspaceId('all');
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void load();
  }, [sharedWorkspaces.length, weekStart, monthStart, selectedWorkspaceId, workspaceRouteId]);

  useEffect(() => {
    if (isWorkspaceRoute) {
      return;
    }

    if (activeWorkspaceId === 'all') {
      setSelectedWorkspaceId('all');
      return;
    }

    const existsInVisibleList = visibleWorkspaces.some((workspace) => workspace.id === activeWorkspaceId);
    setSelectedWorkspaceId(existsInVisibleList ? activeWorkspaceId : 'all');
  }, [activeWorkspaceId, visibleWorkspaces, isWorkspaceRoute]);

  const scopedTasks = useMemo(() => {
    if (selectedWorkspaceId === 'all') {
      return tasks;
    }

    return tasks.filter((task) => task.workspaceId === selectedWorkspaceId);
  }, [tasks, selectedWorkspaceId]);

  const scopedProjects = useMemo(() => {
    if (selectedWorkspaceId === 'all') {
      return projects;
    }

    return projects.filter((project) => project.workspaceId === selectedWorkspaceId);
  }, [projects, selectedWorkspaceId]);

  const selectedWorkspace =
    selectedWorkspaceId === 'all'
      ? null
      : visibleWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  const workspacePortfolio = useMemo(
    () =>
      visibleWorkspaces.map((workspace) => {
        const workspaceTasks = tasks.filter((task) => task.workspaceId === workspace.id);
        const workspaceProjects = projects.filter((project) => project.workspaceId === workspace.id);
        const openA = workspaceTasks.filter(
          (task) => task.status !== 'feito' && task.status !== 'arquivado' && (task.taskType ?? 'b') === 'a'
        ).length;

        return {
          workspace,
          projects: workspaceProjects.length,
          activeTasks: workspaceTasks.filter((task) => task.status !== 'feito' && task.status !== 'arquivado').length,
          doneTasks: workspaceTasks.filter((task) => task.status === 'feito').length,
          openA
        };
      }),
    [visibleWorkspaces, projects, tasks]
  );

  const expansionGuard = useMemo(() => {
    if (!selectedWorkspace || selectedWorkspace.mode !== 'expansao') {
      return null;
    }

    const createdAtTime = selectedWorkspace.createdAt ? new Date(selectedWorkspace.createdAt).getTime() : Number.NaN;
    if (Number.isFinite(createdAtTime)) {
      const hoursSinceCreation = (Date.now() - createdAtTime) / 36e5;
      if (hoursSinceCreation < WORKSPACE_EXPANSION_GRACE_HOURS) {
        const hoursLeft = Math.max(1, Math.ceil(WORKSPACE_EXPANSION_GRACE_HOURS - hoursSinceCreation));
        return {
          level: 'setup' as const,
          message: `Frente recém-criada: guardrails de expansão ativam em ${hoursLeft}h para dar tempo de setup.`
        };
      }
    }

    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const hasStrategicA = scopedTasks.some((task) => {
      const createdAt = task.createdAt ? new Date(task.createdAt).getTime() : 0;
      return (task.taskType ?? 'b') === 'a' && createdAt >= threshold;
    });

    const messages: string[] = [];
    if (!hasStrategicA) {
      messages.push('sem tarefa A nos últimos 7 dias');
    }

    if ((weeklyReview?.summary.deepWorkMinutes ?? 0) < 45) {
      messages.push('sem Deep Work mínimo na semana');
    }

    if (!messages.length) {
      return null;
    }

    return {
      level: 'warning' as const,
      message: `Frente em expansão ${messages.join(' e ')}. Defina foco estratégico para evitar drift.`
    };
  }, [selectedWorkspace, scopedTasks, weeklyReview]);

  useEffect(() => {
    if (!selectedFrontTaskId) {
      return;
    }

    const exists = scopedTasks.some((task) => task.id === selectedFrontTaskId);
    if (!exists) {
      setSelectedFrontTaskId('');
    }
  }, [scopedTasks, selectedFrontTaskId]);

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();

    try {
      setBusy(true);
      await api.createWorkspace({
        name: newName,
        type: newType,
        category: workspaceTypeDefaultCategory(newType),
        mode: newMode,
        color: newColor
      });
      setNewName('');
      setNewType('empresa');
      setNewMode('manutencao');
      setNewColor('#2563EB');
      setCreateWorkspaceOpen(false);
      await Promise.all([load(), refreshGlobal()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openWorkspaceEditor(workspace: Workspace) {
    if (workspace.type === 'geral') {
      return;
    }

    setEditWorkspaceId(workspace.id);
    setEditName(workspace.name);
    setEditType(workspace.type as Exclude<WorkspaceType, 'geral'>);
    setEditMode(workspace.mode ?? 'manutencao');
    setEditColor(workspace.color ?? '#2563EB');
    setEditWorkspaceOpen(true);
  }

  async function saveWorkspaceEdit(event: FormEvent) {
    event.preventDefault();

    if (!editWorkspaceId) {
      return;
    }

    try {
      setBusy(true);
      await api.updateWorkspace(editWorkspaceId, {
        name: editName,
        type: editType,
        category: workspaceTypeDefaultCategory(editType),
        mode: editMode,
        color: editColor
      });
      setEditWorkspaceOpen(false);
      await Promise.all([load(), refreshGlobal()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkspace(workspace: Workspace) {
    if (workspace.type === 'geral') {
      return;
    }

    const shouldDelete = window.confirm(
      `Excluir frente "${workspace.name}"? Isso removerá tarefas e projetos vinculados.`
    );

    if (!shouldDelete) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteWorkspace(workspace.id, {
        force: true
      });

      if (selectedWorkspaceId === workspace.id) {
        setSelectedWorkspaceId('all');
      }

      if (activeWorkspaceId === workspace.id) {
        setActiveWorkspaceId('all');
      }

      setEditWorkspaceOpen(false);
      await Promise.all([load(), refreshGlobal()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateAllocation(workspaceId: string, value: string) {
    const numeric = Number(value);
    const nextValue = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;

    setAllocationDraft((current) => ({
      ...current,
      [workspaceId]: nextValue
    }));
    setAllocationDirty(true);
  }

  async function saveWeeklyAllocation() {
    if (!weeklyAllocation) {
      return;
    }

    try {
      setBusy(true);
      const allocations = weeklyAllocation.rows.map((row) => ({
        workspaceId: row.workspaceId,
        plannedPercent: allocationDraft[row.workspaceId] ?? 0
      }));

      const updated = await api.updateWeeklyAllocation(weekStart, {
        allocations
      });

      setWeeklyAllocation(updated);
      setAllocationDraft(
        Object.fromEntries(updated.rows.map((entry) => [entry.workspaceId, entry.plannedPercent]))
      );
      setAllocationDirty(false);
      const strategyWorkspaceId = selectedWorkspaceId === 'all' ? undefined : selectedWorkspaceId;
      setWeeklyReview(
        await api.getWeeklyReview({
          weekStart,
          workspaceId: strategyWorkspaceId
        })
      );
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveWeeklyJournal(event: FormEvent) {
    event.preventDefault();

    try {
      setBusy(true);
      const strategyWorkspaceId = selectedWorkspaceId === 'all' ? undefined : selectedWorkspaceId;
      await api.updateReviewJournal('weekly', weekStart, {
        workspaceId: strategyWorkspaceId,
        nextPriority: weeklyDraft.nextPriority,
        strategicDecision: weeklyDraft.strategicDecision,
        commitmentLevel: weeklyDraft.commitmentLevel,
        actionItems: parseActionItems(weeklyDraft.actionItemsText),
        reflection: weeklyDraft.reflection
      });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMonthlyJournal(event: FormEvent) {
    event.preventDefault();

    try {
      setBusy(true);
      const strategyWorkspaceId = selectedWorkspaceId === 'all' ? undefined : selectedWorkspaceId;
      await api.updateReviewJournal('monthly', monthStart, {
        workspaceId: strategyWorkspaceId,
        nextPriority: monthlyDraft.nextPriority,
        strategicDecision: monthlyDraft.strategicDecision,
        commitmentLevel: monthlyDraft.commitmentLevel,
        actionItems: parseActionItems(monthlyDraft.actionItemsText),
        reflection: monthlyDraft.reflection
      });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openWorkspaceDetail(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);
    setActiveWorkspaceId(workspaceId);
    navigate(`/workspaces/${workspaceId}`);
  }

  async function completeFrontTask(taskId: string) {
    try {
      setBusy(true);
      await api.completeTask(taskId);
      await Promise.all([load(), refreshGlobal()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteFrontTask(taskId: string) {
    const shouldDelete = window.confirm('Excluir esta tarefa da frente?');
    if (!shouldDelete) {
      return;
    }

    try {
      setBusy(true);
      await api.deleteTask(taskId);
      if (selectedFrontTaskId === taskId) {
        setSelectedFrontTaskId('');
      }
      await Promise.all([load(), refreshGlobal()]);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const weeklyAllocationRows = weeklyAllocation?.rows ?? [];
  const weeklyPlanConfigured =
    weeklyAllocationRows.length > 0 &&
    weeklyAllocationRows.some((entry) => (allocationDraft[entry.workspaceId] ?? entry.plannedPercent) > 0);
  const weeklyReviewSaved = Boolean(weeklyJournal?.review?.updatedAt);
  const monthlyReviewSaved = Boolean(monthlyJournal?.review?.updatedAt);
  const isCurrentWeekContext = weekStart === currentWeekStartIso();
  const currentScopeLabel = selectedWorkspace ? selectedWorkspace.name : 'Visão geral';

  const sectionTabOptions: Array<{ value: WorkspaceSection; label: string }> = [
    { value: 'portfolio', label: 'Portfólio' },
    { value: 'operacao', label: 'Tarefas' }
  ];
  const portfolioTabOptions: Array<{ value: PortfolioPanel; label: string }> = [
    { value: 'workspaces', label: 'Frentes' },
    { value: 'executivo', label: 'Executivo semanal' },
    { value: 'resumo', label: 'Resumo do contexto' }
  ];
  const planningTabOptions: Array<{ value: PlanningPanel; label: string }> = [
    { value: 'alocacao', label: 'Alocação' },
    { value: 'revisao', label: 'Revisão semanal' }
  ];
  const reviewTabOptions: Array<{ value: ReviewPanel; label: string }> = [
    { value: 'semanal', label: 'Revisão semanal' },
    { value: 'mensal', label: 'Fechamento mensal' },
    { value: 'historico', label: 'Histórico' }
  ];

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Contextos"
          title="Frentes"
          subtitle="Separe operação por contexto e mantenha foco local."
        />
        <section className="premium-grid two">
          <PremiumCard title="Visão geral">
            <SkeletonBlock lines={4} />
          </PremiumCard>
        </section>
        <PremiumCard title="Tarefas da frente">
          <SkeletonBlock lines={6} />
        </PremiumCard>
      </PremiumPage>
    );
  }

  if (isWorkspaceRoute) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Frente"
          title={selectedWorkspace?.name ?? 'Frente não encontrada'}
          subtitle={
            selectedWorkspace
              ? `${workspaceTypeLabel(selectedWorkspace.type)} • ${workspaceModeLabel(selectedWorkspace.mode)}`
              : 'Verifique se a frente ainda existe no portfólio.'
          }
          actions={
            <div className="inline-actions">
              <button type="button" className="ghost-button" onClick={() => navigate('/workspaces')}>
                Voltar para frentes
              </button>
              {selectedWorkspace && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveWorkspaceId(selectedWorkspace.id);
                    navigate('/tarefas?compose=1');
                  }}
                >
                  Nova tarefa
                </button>
              )}
            </div>
          }
        />

        {error && <p className="surface-error">{error}</p>}

        {!selectedWorkspace ? (
          <PremiumCard title="Sem frente">
            <EmptyState
              title="Frente não encontrada"
              description="A frente pode ter sido removida ou o link está inválido."
              actionLabel="Voltar"
              onAction={() => navigate('/workspaces')}
            />
          </PremiumCard>
        ) : (
          <>
            <section className="premium-grid two">
              <PremiumCard title="Visão executiva da frente" subtitle={`Semana ${weekStart}`}>
                <div className="premium-metric-grid mini">
                  <div className="premium-metric tone-default">
                    <span>Projetos (ativos + inativos)</span>
                    <strong>{scopedProjects.length}</strong>
                    <small>
                      ativos {scopedProjects.filter((project) => project.status === 'ativo').length} • latentes{' '}
                      {scopedProjects.filter((project) => project.status === 'latente').length}
                    </small>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Tarefas abertas</span>
                    <strong>{scopedTasks.filter((task) => !['feito', 'arquivado'].includes(task.status)).length}</strong>
                    <small>
                      hoje {scopedTasks.filter((task) => task.status === 'hoje').length} • backlog{' '}
                      {scopedTasks.filter((task) => task.status === 'backlog').length}
                    </small>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Deep Work na semana</span>
                    <strong>{weeklyReview?.summary.deepWorkHours ?? 0}h</strong>
                    <small>Tarefas A concluídas: {weeklyReview?.summary.completedA ?? 0}</small>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Saúde da frente</span>
                    <strong>
                      {workspacePortfolioWeekly?.rows.find((row) => row.workspaceId === selectedWorkspace.id)?.frontHealth.label ??
                        'Sem leitura'}
                    </strong>
                    <small>
                      {workspacePortfolioWeekly?.rows.find((row) => row.workspaceId === selectedWorkspace.id)?.frontHealth.reason ??
                        'Sem dados suficientes na semana.'}
                    </small>
                  </div>
                </div>
              </PremiumCard>

              <PremiumCard title="Contexto da frente" subtitle="estado operacional do backlog da frente">
                <div className="premium-metric-grid mini">
                  <div className="premium-metric tone-default">
                    <span>Backlog</span>
                    <strong>{scopedTasks.filter((task) => task.status === 'backlog').length}</strong>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Hoje</span>
                    <strong>{scopedTasks.filter((task) => task.status === 'hoje').length}</strong>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Em andamento</span>
                    <strong>{scopedTasks.filter((task) => task.status === 'andamento').length}</strong>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Concluídas</span>
                    <strong>{scopedTasks.filter((task) => task.status === 'feito').length}</strong>
                  </div>
                </div>
                <div className="inline-actions">
                  <button type="button" className="ghost-button" onClick={() => navigate('/hoje')}>
                    Ir para execução de hoje
                  </button>
                  <button type="button" className="ghost-button" onClick={() => navigate('/tarefas')}>
                    Ir para tarefas
                  </button>
                </div>
              </PremiumCard>
            </section>

            <PremiumCard title="Projetos da frente" subtitle={`${scopedProjects.length} projetos`}>
              {scopedProjects.length === 0 ? (
                <EmptyState
                  title="Sem projetos nesta frente"
                  description="Crie projetos para converter estratégia em entregas mensuráveis."
                />
              ) : (
                <ul className="premium-list dense">
                  {scopedProjects
                    .slice()
                    .sort((left, right) => left.title.localeCompare(right.title, 'pt-BR'))
                    .map((project) => {
                      const projectTaskCount = scopedTasks.filter((task) => task.projectId === project.id).length;
                      const openTaskCount = scopedTasks.filter(
                        (task) => task.projectId === project.id && !['feito', 'arquivado'].includes(task.status)
                      ).length;

                      return (
                        <li key={project.id}>
                          <div>
                            <strong>{project.title}</strong>
                            <small>
                              {project.type ?? 'operacao'} • {project.status ?? 'ativo'} • {projectTaskCount} tarefa(s)
                            </small>
                            <small>{project.objective ?? 'Sem objetivo 4DX definido.'}</small>
                          </div>
                          <div className="inline-actions">
                            <span className="priority-chip">Abertas {openTaskCount}</span>
                            <button type="button" className="ghost-button" onClick={() => navigate(`/projetos/${project.id}`)}>
                              Abrir projeto
                            </button>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </PremiumCard>

            <PremiumCard title="Tarefas da frente" subtitle={`${scopedTasks.length} registros`}>
              {scopedTasks.length === 0 ? (
                <EmptyState
                  title="Sem tarefas nesta frente"
                  description="Crie tarefas para transformar plano semanal em execução real."
                />
              ) : (
                <TaskIntelligenceTable
                  tasks={scopedTasks}
                  selectedTaskId={selectedFrontTaskId}
                  busy={busy}
                  onSelectTask={setSelectedFrontTaskId}
                  onCompleteTask={completeFrontTask}
                  onDeleteTask={deleteFrontTask}
                />
              )}
            </PremiumCard>
          </>
        )}
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PremiumHeader
        eyebrow="Contextos"
        title="Frentes"
        subtitle="Separe operação por contexto e mantenha foco local."
        actions={
          <button type="button" onClick={() => setCreateWorkspaceOpen(true)}>
            Criar frente
          </button>
        }
      />

      {error && <p className="surface-error">{error}</p>}
      {expansionGuard && (
        <p className={expansionGuard.level === 'setup' ? 'status-toast' : 'surface-error'}>
          {expansionGuard.message}
        </p>
      )}

      <PremiumCard title="Navegação interna">
        <TabSwitch value={workspaceSection} onChange={setWorkspaceSection} options={sectionTabOptions} />
      </PremiumCard>

      {workspaceSection === 'portfolio' && (
        <>
          <PremiumCard title="Portfólio">
            <TabSwitch value={portfolioPanel} onChange={setPortfolioPanel} options={portfolioTabOptions} />
          </PremiumCard>

          {portfolioPanel === 'workspaces' && (
            <PremiumCard title="Portfólio de frentes" subtitle="macro frentes com modo estratégico e capacidade ativa">
              {workspacePortfolio.length === 0 ? (
                <EmptyState
                  title="Sem frentes criadas"
                  description="Crie sua primeira frente para separar contextos estratégicos da sua operação."
                />
              ) : (
                <ul className="premium-list dense">
                  {workspacePortfolio.map((entry) => (
                    <li key={entry.workspace.id} style={{ borderLeft: `3px solid ${entry.workspace.color ?? '#2563EB'}` }}>
                      <div>
                        <div className="workspace-name-row">
                          <span
                            className="workspace-color-dot"
                            style={{ backgroundColor: entry.workspace.color ?? '#2563EB' }}
                          />
                          <strong>{entry.workspace.name}</strong>
                        </div>
                        <small>
                          {workspaceTypeLabel(entry.workspace.type)} • {workspaceModeLabel(entry.workspace.mode)} • A abertas {entry.openA}
                        </small>
                      </div>
                      <div className="inline-actions">
                        <span className="status-tag andamento">{entry.activeTasks} ativas</span>
                        <span className="status-tag feito">{entry.doneTasks} feitas</span>
                        <span className="priority-chip">Projetos {entry.projects}</span>
                        <button type="button" className="ghost-button" onClick={() => openWorkspaceDetail(entry.workspace.id)}>
                          Abrir frente
                        </button>
                        <button type="button" className="ghost-button" onClick={() => openWorkspaceEditor(entry.workspace)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => deleteWorkspace(entry.workspace)}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </PremiumCard>
          )}

          {portfolioPanel === 'executivo' && (
            <PremiumCard
              title="Portfólio executivo da semana"
              subtitle={
                workspacePortfolioWeekly
                  ? `${workspacePortfolioWeekly.weekStart} até ${workspacePortfolioWeekly.weekEnd}`
                  : 'métricas por frente'
              }
            >
              {!workspacePortfolioWeekly || workspacePortfolioWeekly.rows.length === 0 ? (
                <EmptyState
                  title="Sem dados estratégicos nesta semana"
                  description="Agende blocos e execute tarefas para ativar leitura de horas, tração e gargalo por frente."
                />
              ) : (
                <div className="executive-weekly-grid">
                  {workspacePortfolioWeekly.rows.map((row) => {
                    const workspaceColor =
                      visibleWorkspaces.find((workspace) => workspace.id === row.workspaceId)?.color ?? '#2563EB';

                    return (
                      <article key={row.workspaceId} className="executive-week-card" style={{ borderTopColor: workspaceColor }}>
                        <header className="executive-week-head">
                          <div className="workspace-name-row">
                            <span className="workspace-color-dot" style={{ backgroundColor: workspaceColor }} />
                            <div>
                              <strong>{row.workspaceName}</strong>
                              <small>{workspaceModeLabel(row.workspaceMode)}</small>
                            </div>
                          </div>
                          <div className="inline-actions">
                            <span className={`status-tag ${frontHealthTone(row.frontHealth.status)}`}>
                              {row.frontHealth.label}
                            </span>
                            <span className={`status-tag ${row.ghostProjects > 0 ? 'backlog' : 'feito'}`}>
                              {row.ghostProjects > 0 ? `${row.ghostProjects} fantasma` : 'sem fantasma'}
                            </span>
                          </div>
                        </header>

                        <div className="executive-week-metrics">
                          <div className="executive-week-metric">
                            <span>Horas</span>
                            <strong>{row.hoursInvested}h</strong>
                          </div>
                          <div className="executive-week-metric">
                            <span>Deep Work</span>
                            <strong>{row.deepWorkHours}h</strong>
                          </div>
                          <div className="executive-week-metric">
                            <span>A concluídas</span>
                            <strong>{row.completedA}</strong>
                          </div>
                          <div className="executive-week-metric">
                            <span>A abertas</span>
                            <strong>{row.openA}</strong>
                          </div>
                          <div className="executive-week-metric">
                            <span>Tração</span>
                            <strong>
                              {row.activeProjectsWithTraction}/{row.activeProjects} ({row.projectTractionPercent}%)
                            </strong>
                          </div>
                          <div className="executive-week-metric">
                            <span>Estagnados</span>
                            <strong>{row.stalledProjects}</strong>
                          </div>
                        </div>

                        <div className="executive-week-signals">
                          <p>
                            <span>Sinal</span>
                            {row.frontHealth.reason}
                          </p>
                          <p>
                            <span>Gargalo</span>
                            {row.dominantBottleneck
                              ? `${row.dominantBottleneck.label} (${row.dominantBottleneck.percent}%)`
                              : 'Sem padrão dominante'}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </PremiumCard>
          )}

          {portfolioPanel === 'resumo' && (
            <PremiumCard
              title={selectedWorkspace ? selectedWorkspace.name : 'Visão geral'}
              subtitle={
                selectedWorkspace
                  ? `${workspaceTypeLabel(selectedWorkspace.type)} • ${workspaceModeLabel(selectedWorkspace.mode)}`
                  : 'Todos os contextos'
              }
            >
              {selectedWorkspace && (
                <div className="workspace-overview-row">
                  <span className="workspace-color-dot" style={{ backgroundColor: selectedWorkspace.color ?? '#2563EB' }} />
                  <small>Cor estratégica aplicada na frente</small>
                </div>
              )}
              <div className="premium-metric-grid mini">
                <div className="premium-metric tone-default">
                  <span>Tarefas hoje</span>
                  <strong>{scopedTasks.filter((task) => task.status === 'hoje').length}</strong>
                </div>
                <div className="premium-metric tone-default">
                  <span>Backlog</span>
                  <strong>{scopedTasks.filter((task) => task.status === 'backlog').length}</strong>
                </div>
                <div className="premium-metric tone-default">
                  <span>Projetos</span>
                  <strong>{scopedProjects.length}</strong>
                </div>
                <div className="premium-metric tone-default">
                  <span>Concluídas</span>
                  <strong>{scopedTasks.filter((task) => task.status === 'feito').length}</strong>
                </div>
              </div>
            </PremiumCard>
          )}
        </>
      )}

      {workspaceSection === 'operacao' && (
        <PremiumCard title="Tarefas da frente" subtitle={`${scopedTasks.length} registros`}>
          {scopedTasks.length === 0 ? (
            <EmptyState
              title="Nenhuma tarefa nesta frente"
              description="Crie tarefas na aba Hoje/Tarefas para começar a operação desta frente."
              actionLabel={selectedWorkspaceId !== 'all' ? 'Ver todos os contextos' : undefined}
              onAction={
                selectedWorkspaceId !== 'all'
                  ? () => {
                      setSelectedWorkspaceId('all');
                      setActiveWorkspaceId('all');
                    }
                  : undefined
              }
            />
          ) : (
            <ul className="premium-list dense">
              {scopedTasks.slice(0, 24).map((task) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      prioridade {task.priority} • horizonte {task.horizon ?? 'active'}
                    </small>
                  </div>
                  <span className={`status-tag ${task.status}`}>{task.status}</span>
                </li>
              ))}
            </ul>
          )}
        </PremiumCard>
      )}

      <Modal
        open={createWorkspaceOpen}
        onClose={() => setCreateWorkspaceOpen(false)}
        title="Nova frente"
        subtitle="Crie um contexto limpo para organizar sua operação"
      >
        <form className="minimal-form" onSubmit={createWorkspace}>
          <label>
            Nome
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nome da frente"
              required
            />
          </label>
          <label>
            Tipo
            <select value={newType} onChange={(event) => setNewType(event.target.value as Exclude<WorkspaceType, 'geral'>)}>
              <option value="empresa">Empresa</option>
              <option value="pessoal">Pessoal</option>
              <option value="vida">Vida</option>
              <option value="autoridade">Autoridade</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label>
            Modo estratégico
            <select value={newMode} onChange={(event) => setNewMode(event.target.value as WorkspaceMode)}>
              <option value="expansao">Expansão</option>
              <option value="manutencao">Manutenção</option>
              <option value="standby">Standby</option>
            </select>
          </label>
          <label>
            Cor
            <div className="workspace-color-picker">
              <span className="workspace-color-dot" style={{ backgroundColor: newColor }} />
              <input
                type="color"
                value={newColor}
                onChange={(event) => setNewColor(event.target.value)}
              />
              <small>{newColor.toUpperCase()}</small>
            </div>
          </label>
          <button type="submit" disabled={busy}>
            Criar frente
          </button>
        </form>
      </Modal>

      <Modal
        open={editWorkspaceOpen}
        onClose={() => setEditWorkspaceOpen(false)}
        title="Editar frente"
        subtitle="Ajuste modo estratégico e identidade visual"
      >
        <form className="minimal-form" onSubmit={saveWorkspaceEdit}>
          <label>
            Nome
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Nome da frente"
              required
            />
          </label>
          <label>
            Tipo
            <select value={editType} onChange={(event) => setEditType(event.target.value as Exclude<WorkspaceType, 'geral'>)}>
              <option value="empresa">Empresa</option>
              <option value="pessoal">Pessoal</option>
              <option value="vida">Vida</option>
              <option value="autoridade">Autoridade</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label>
            Modo estratégico
            <select value={editMode} onChange={(event) => setEditMode(event.target.value as WorkspaceMode)}>
              <option value="expansao">Expansão</option>
              <option value="manutencao">Manutenção</option>
              <option value="standby">Standby</option>
            </select>
          </label>
          <label>
            Cor
            <div className="workspace-color-picker">
              <span className="workspace-color-dot" style={{ backgroundColor: editColor }} />
              <input type="color" value={editColor} onChange={(event) => setEditColor(event.target.value)} />
              <small>{editColor.toUpperCase()}</small>
            </div>
          </label>
          <button type="submit" disabled={busy}>
            Salvar alterações
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={() => {
              const target = workspaces.find((workspace) => workspace.id === editWorkspaceId);
              if (target) {
                void deleteWorkspace(target);
              }
            }}
          >
            Excluir frente
          </button>
        </form>
      </Modal>
    </PremiumPage>
  );
}
