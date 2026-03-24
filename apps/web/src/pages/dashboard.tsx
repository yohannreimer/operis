import { useEffect, useMemo, useState } from 'react';
import { Flame, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { axisProps, cartesianGridProps, chartTheme, tooltipStyle } from '../utils/chart-theme';
import {
  api,
  DayPlan,
  ExecutionBriefing,
  ExecutionEvolution,
  ExecutionScore,
  GamificationDetails,
  Project,
  Task,
  WeeklyAllocation,
  WeeklyPulse,
  WeeklyReview
} from '../api';
import { EmptyState, MetricCard, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock, TabSwitch } from '../components/premium-ui';
import { useShellContext } from '../components/shell-context';
import { formatIsoDate, todayIsoDate } from '../utils/date';
import { workspaceQuery } from '../utils/workspace';

type SignalTone = 'danger' | 'warning' | 'info' | 'success';
type SelfDeceptionTone = 'danger' | 'warning' | 'info' | 'success';
type DashboardSection = 'inteligencia' | 'ritual' | 'analitico';
type EvolutionPanel = 'resumo' | 'regras' | 'decisoes';

type DashboardData = {
  tasks: Task[];
  projects: Project[];
  todayPlan: DayPlan | null;
  gamification: GamificationDetails | null;
  briefing: ExecutionBriefing | null;
  weeklyPulse: WeeklyPulse | null;
  weeklyAllocation: WeeklyAllocation | null;
  weeklyReview: WeeklyReview | null;
  executionScore: ExecutionScore | null;
  evolution: ExecutionEvolution | null;
};

function currentWeekStartIso() {
  const base = new Date();
  const day = base.getDay();
  const diff = (day + 6) % 7;
  base.setDate(base.getDate() - diff);
  base.setHours(0, 0, 0, 0);
  return base.toISOString().slice(0, 10);
}

function formatDueDateLabel(value?: string | null) {
  if (!value) {
    return 'sem prazo';
  }

  return new Date(value).toLocaleDateString('pt-BR');
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { activeWorkspaceId } = useShellContext();
  const workspaceId = workspaceQuery(activeWorkspaceId);
  const weekStart = useMemo(() => currentWeekStartIso(), []);

  const [data, setData] = useState<DashboardData>({
    tasks: [],
    projects: [],
    todayPlan: null,
    gamification: null,
    briefing: null,
    weeklyPulse: null,
    weeklyAllocation: null,
    weeklyReview: null,
    executionScore: null,
    evolution: null
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghostActionBusyId, setGhostActionBusyId] = useState<string | null>(null);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('inteligencia');
  const [evolutionPanel, setEvolutionPanel] = useState<EvolutionPanel>('resumo');
  const [evolutionExpanded, setEvolutionExpanded] = useState(false);

  async function loadDashboard() {
    setReady(false);
    try {
      setError(null);
      const [
        tasks,
        projects,
        todayPlan,
        gamification,
        briefing,
        weeklyPulse,
        weeklyAllocation,
        weeklyReview,
        executionScore,
        evolution
      ] = await Promise.all([
        api.getTasks(workspaceId ? { workspaceId } : undefined),
        api.getProjects(workspaceId ? { workspaceId } : undefined),
        api.getDayPlan(todayIsoDate()),
        api.getGamificationDetails(),
        api.getExecutionBriefing(todayIsoDate(), {
          workspaceId
        }),
        api.getWeeklyPulse({
          workspaceId
        }),
        api.getWeeklyAllocation({
          workspaceId,
          weekStart
        }),
        api.getWeeklyReview({
          workspaceId,
          weekStart
        }),
        api.getExecutionScore(todayIsoDate(), {
          workspaceId
        }),
        api.getExecutionEvolution({
          workspaceId,
          windowDays: 30
        })
      ]);

      setData({
        tasks,
        projects,
        todayPlan,
        gamification,
        briefing,
        weeklyPulse,
        weeklyAllocation,
        weeklyReview,
        executionScore,
        evolution
      });
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [activeWorkspaceId, weekStart]);

  async function runGhostAction(workspaceIdToResolve: string, action: 'reativar' | 'standby' | 'criar_tarefa_a') {
    try {
      setGhostActionBusyId(workspaceIdToResolve);
      setError(null);
      await api.resolveGhostFront(workspaceIdToResolve, { action });
      await loadDashboard();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setGhostActionBusyId(null);
    }
  }

  async function moveProjectToLatent(projectId: string, title: string) {
    const confirmed = window.confirm(`Mover o projeto "${title}" para latente para reduzir fragmentação?`);
    if (!confirmed) {
      return;
    }

    try {
      setActionBusyKey(`project:${projectId}`);
      setError(null);
      await api.updateProject(projectId, {
        status: 'latente'
      });
      await loadDashboard();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setActionBusyKey(null);
    }
  }

  async function resolveGhostProject(projectId: string, action: 'reativar' | 'mover_latente' | 'encerrar') {
    try {
      setActionBusyKey(`ghost-project:${projectId}:${action}`);
      setError(null);
      await api.resolveGhostProject(projectId, { action });
      await loadDashboard();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setActionBusyKey(null);
    }
  }

  async function linkTaskToSuggestedProject(taskId: string, projectId: string) {
    try {
      setActionBusyKey(`task-link:${taskId}`);
      setError(null);
      await api.updateTask(taskId, {
        projectId
      });
      await loadDashboard();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setActionBusyKey(null);
    }
  }

  async function convertTaskToMicroAction(taskId: string, title: string) {
    const confirmed = window.confirm(
      `Converter "${title}" em microação de 15min e puxar para Hoje?`
    );
    if (!confirmed) {
      return;
    }

    try {
      setActionBusyKey(`task-micro:${taskId}`);
      setError(null);
      await api.updateTask(taskId, {
        estimatedMinutes: 15,
        status: 'hoje'
      });
      await loadDashboard();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setActionBusyKey(null);
    }
  }

  async function registerWaitingFollowup(taskId: string) {
    try {
      setActionBusyKey(`waiting-followup:${taskId}`);
      setError(null);
      await api.registerWaitingFollowup(taskId, {
        source: 'manual',
        triggerQueue: false
      });
      await loadDashboard();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setActionBusyKey(null);
    }
  }

  const activeTasks = data.tasks.filter((task) => task.status !== 'arquivado');
  const disconnectedActiveTasks = activeTasks.filter(
    (task) => task.status !== 'feito' && task.status !== 'arquivado' && !task.projectId
  ).length;

  const doneToday = data.gamification?.today.completed ?? 0;
  const todayFailures = (data.gamification?.today.failed ?? 0) + (data.gamification?.today.delayed ?? 0);
  const tracked = doneToday + todayFailures;
  const executionRate = tracked ? Math.round((doneToday / tracked) * 100) : 0;

  const top3 = data.briefing?.top3 ?? [];
  const fragmentationActions = data.briefing?.actionables.fragmentationProjects.slice(0, 5) ?? [];
  const disconnectedActions = data.briefing?.actionables.disconnectedTasks.slice(0, 6) ?? [];
  const evitationActions = data.briefing?.actionables.rescheduleRiskTasks.slice(0, 6) ?? [];
  const ghostProjectActions = data.briefing?.actionables.ghostProjects.slice(0, 6) ?? [];
  const waitingFollowupActions = data.briefing?.actionables.waitingFollowups.slice(0, 8) ?? [];
  const hasActionables =
    fragmentationActions.length > 0 ||
    disconnectedActions.length > 0 ||
    evitationActions.length > 0 ||
    ghostProjectActions.length > 0 ||
    waitingFollowupActions.length > 0;

  const statusDistribution = useMemo(() => {
    const map = new Map<string, number>([
      ['backlog', 0],
      ['hoje', 0],
      ['andamento', 0],
      ['feito', 0]
    ]);

    data.tasks.forEach((task) => {
      if (task.status === 'arquivado') {
        return;
      }
      map.set(task.status, (map.get(task.status) ?? 0) + 1);
    });

    return [
      { name: 'Backlog', value: map.get('backlog') ?? 0 },
      { name: 'Hoje', value: map.get('hoje') ?? 0 },
      { name: 'Andamento', value: map.get('andamento') ?? 0 },
      { name: 'Feito', value: map.get('feito') ?? 0 }
    ];
  }, [data.tasks]);

  const priorityDistribution = useMemo(() => {
    const map = new Map<number, number>();

    activeTasks.forEach((task) => {
      map.set(task.priority, (map.get(task.priority) ?? 0) + 1);
    });

    return Array.from({ length: 5 }, (_, index) => {
      const priority = index + 1;
      return {
        name: `P${priority}`,
        value: map.get(priority) ?? 0
      };
    });
  }, [activeTasks]);

  const weeklyTrend = useMemo(
    () =>
      (data.gamification?.history ?? []).map((entry) => ({
        semana: entry.label,
        score: entry.score,
        concluidas: entry.completed
      })),
    [data.gamification]
  );

  const weeklyExecutionLoad = useMemo(
    () =>
      (data.weeklyPulse?.days ?? []).map((day) => ({
        dia: new Date(`${day.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }),
        planejado: Math.round((day.plannedMinutes / 60) * 10) / 10,
        deepWork: Math.round((day.deepWorkMinutes / 60) * 10) / 10
      })),
    [data.weeklyPulse]
  );

  const weeklyWorkspaceHeatmap = useMemo(() => {
    if (!data.weeklyPulse || data.weeklyPulse.workspaceHeatmap.length === 0) {
      return null;
    }

    const rows = data.weeklyPulse.workspaceHeatmap.slice(0, 6);
    const dayLabels = rows[0]?.days.map((day) => ({
      date: day.date,
      label: new Date(`${day.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })
    })) ?? [];

    const maxMinutes = Math.max(
      1,
      ...rows.flatMap((row) => row.days.map((day) => day.minutes))
    );

    return {
      rows,
      dayLabels,
      maxMinutes
    };
  }, [data.weeklyPulse]);

  const projectMomentum = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return data.projects
      .map((project) => {
        const projectTasks = data.tasks.filter((task) => task.projectId === project.id && task.status !== 'arquivado');
        const openA = projectTasks.filter(
          (task) => task.status !== 'feito' && task.status !== 'arquivado' && (task.taskType ?? 'b') === 'a'
        ).length;
        const doneAThisWeek = projectTasks.filter((task) => {
          if ((task.taskType ?? 'b') !== 'a' || task.status !== 'feito' || !task.completedAt) {
            return false;
          }

          return new Date(task.completedAt).getTime() >= weekAgo;
        }).length;

        let score = doneAThisWeek * 5 + openA * 3 + projectTasks.length;
        if (project.status === 'ativo') {
          score += 2;
        }
        if (project.status === 'fantasma') {
          score -= 4;
        }
        if (project.status === 'latente') {
          score -= 2;
        }

        return {
          project,
          score,
          openA,
          doneAThisWeek,
          total: projectTasks.length
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
  }, [data.projects, data.tasks]);

  const ceoSignals = useMemo(() => {
    const signals: Array<{ id: string; title: string; message: string; tone: SignalTone }> = [];

    if (data.briefing?.alerts.fragmentationRisk) {
      signals.push({
        id: 'fragmentation',
        title: 'Fragmentação cognitiva',
        message: `${data.briefing.alerts.fragmentationCount} projetos estratégicos ativos com tarefa A na semana.`,
        tone: 'danger'
      });
    }

    if (data.briefing?.alerts.focusOverloadRisk) {
      signals.push({
        id: 'focus-overload',
        title: 'Foco ativo saturado',
        message: `${data.briefing.alerts.focusOverloadCount} projetos receberam Deep Work nesta semana (ideal: até 3).`,
        tone: 'warning'
      });
    }

    if (data.briefing?.alerts.maintenanceConstructionRisk) {
      signals.push({
        id: 'maintenance-drift',
        title: 'Deriva em frente de manutenção',
        message: `${data.briefing.alerts.maintenanceConstructionCount} tarefa(s) de construção em modo manutenção.`,
        tone: 'warning'
      });
    }

    if (data.briefing?.alerts.standbyExecutionRisk) {
      signals.push({
        id: 'standby-execution',
        title: 'Execução em frente standby',
        message: `${data.briefing.alerts.standbyExecutionCount} tarefa(s) em hoje/andamento dentro de frente standby.`,
        tone: 'danger'
      });
    }

    if ((data.weeklyPulse?.composition.disconnectedPercent ?? 0) >= 35) {
      signals.push({
        id: 'disconnected',
        title: 'Execução desconexa',
        message: `${data.weeklyPulse?.composition.disconnectedPercent ?? 0}% da semana sem conexão com projeto.`,
        tone: 'warning'
      });
    }

    if ((data.weeklyPulse?.composition.constructionPercent ?? 0) < 40) {
      signals.push({
        id: 'construction',
        title: 'Baixa construção de futuro',
        message: `Construção em ${(data.weeklyPulse?.composition.constructionPercent ?? 0).toFixed(0)}% da semana.`,
        tone: 'info'
      });
    }

    if ((data.weeklyReview?.summary.ghostProjectsCount ?? 0) > 0) {
      signals.push({
        id: 'ghost',
        title: 'Frentes fantasma detectadas',
        message: `${data.weeklyReview?.summary.ghostProjectsCount ?? 0} frente(s) sem tração estratégica recente.`,
        tone: 'danger'
      });
    }

    if (!signals.length) {
      signals.push({
        id: 'healthy',
        title: 'Sistema sob controle',
        message: 'Sem risco dominante agora. Mantenha ritmo com foco no Top 3 e Deep Work.',
        tone: 'success'
      });
    }

    return signals.slice(0, 6);
  }, [data.briefing, data.weeklyPulse, data.weeklyReview]);

  const quickActions = useMemo(() => {
    const actions: Array<{ id: string; label: string; detail: string; route: string }> = [];

    if (fragmentationActions.length > 0) {
      actions.push({
        id: 'fragmentation',
        label: 'Desfragmentar foco',
        detail: `${fragmentationActions.length} projeto(s) ativos demais`,
        route: '/projetos'
      });
    }

    if (disconnectedActions.length > 0) {
      actions.push({
        id: 'disconnected',
        label: 'Conectar tarefas',
        detail: `${disconnectedActions.length} tarefa(s) sem projeto`,
        route: '/tarefas'
      });
    }

    if (ghostProjectActions.length > 0) {
      actions.push({
        id: 'ghost',
        label: 'Resolver fantasmas',
        detail: `${ghostProjectActions.length} projeto(s) sem tração`,
        route: '/projetos'
      });
    }

    if (evitationActions.length > 0) {
      actions.push({
        id: 'evitation',
        label: 'Atacar evitação',
        detail: `${evitationActions.length} tarefa(s) reagendada(s)`,
        route: '/hoje'
      });
    }

    return actions.slice(0, 3);
  }, [fragmentationActions, disconnectedActions, ghostProjectActions, evitationActions]);

  const selfDeceptionGuards = useMemo(() => {
    const fragmentationCount = data.briefing?.alerts.fragmentationCount ?? 0;
    const evitationCount = data.briefing?.alerts.excessiveRescheduleA ?? 0;
    const vagueCount = data.briefing?.alerts.vagueTasks ?? 0;
    const modeDriftCount =
      (data.briefing?.alerts.maintenanceConstructionCount ?? 0) +
      (data.briefing?.alerts.standbyExecutionCount ?? 0);
    const disconnectedPercent = data.weeklyPulse?.composition.disconnectedPercent ?? 0;

    const disconnectedTone: SelfDeceptionTone =
      disconnectedActiveTasks >= 8 ? 'danger' : disconnectedActiveTasks >= 3 ? 'warning' : 'success';
    const fragmentationTone: SelfDeceptionTone =
      fragmentationCount > 5 ? 'danger' : fragmentationCount >= 4 ? 'warning' : 'success';
    const evitationTone: SelfDeceptionTone =
      evitationCount >= 2 ? 'danger' : evitationCount === 1 ? 'warning' : 'success';
    const vagueTone: SelfDeceptionTone =
      vagueCount >= 5 ? 'danger' : vagueCount >= 1 ? 'warning' : 'success';
    const modeDriftTone: SelfDeceptionTone =
      modeDriftCount >= 3 ? 'danger' : modeDriftCount >= 1 ? 'warning' : 'success';

    return [
      {
        id: 'disconnected',
        title: 'Sem projeto',
        value: disconnectedActiveTasks,
        note: `${disconnectedPercent}% das horas da semana sem vínculo com projeto.`,
        tone: disconnectedTone,
        actionLabel: 'Revisar tarefas',
        route: '/tarefas'
      },
      {
        id: 'fragmentation',
        title: 'Foco fragmentado',
        value: fragmentationCount,
        note: 'Projetos ativos estratégicos com tarefa A na semana (limite recomendado: 5).',
        tone: fragmentationTone,
        actionLabel: 'Rever projetos',
        route: '/projetos'
      },
      {
        id: 'evitation',
        title: 'Reagendado repetidamente',
        value: evitationCount,
        note: 'Tarefas A com 3+ reagendamentos nos últimos 30 dias.',
        tone: evitationTone,
        actionLabel: 'Atacar hoje',
        route: '/hoje'
      },
      {
        id: 'vague',
        title: 'Sem definição',
        value: vagueCount,
        note: 'Itens sem executabilidade completa (verbo+objeto, pronto e tempo).',
        tone: vagueTone,
        actionLabel: 'Limpar backlog',
        route: '/tarefas'
      },
      {
        id: 'mode-drift',
        title: 'Modo incompatível',
        value: modeDriftCount,
        note: 'Tarefas incompatíveis com o modo estratégico da frente (manutenção/standby).',
        tone: modeDriftTone,
        actionLabel: 'Corrigir modos',
        route: '/projetos'
      }
    ];
  }, [data.briefing, data.weeklyPulse, disconnectedActiveTasks]);

  const evolutionStageTone = useMemo(() => {
    if (!data.evolution) {
      return 'default';
    }

    if (data.evolution.stage.code === 'estrategista') {
      return 'success';
    }

    if (data.evolution.stage.code === 'construtor') {
      return 'accent';
    }

    if (data.evolution.stage.code === 'executor') {
      return 'warning';
    }

    return 'default';
  }, [data.evolution]);

  const evolutionTrendLabel = useMemo(() => {
    if (!data.evolution) {
      return 'Sem tendência';
    }

    if (data.evolution.trend === 'subindo') {
      return 'Subindo';
    }

    if (data.evolution.trend === 'caindo') {
      return 'Caindo';
    }

    return 'Estável';
  }, [data.evolution]);

  const dashboardTabOptions: Array<{ value: DashboardSection; label: string }> = [
    { value: 'inteligencia', label: 'Inteligência' },
    { value: 'ritual', label: 'Ritual' },
    { value: 'analitico', label: 'Analítico' }
  ];
  const evolutionTabOptions: Array<{ value: EvolutionPanel; label: string }> = [
    { value: 'resumo', label: 'Resumo' },
    { value: 'regras', label: 'Regras' },
    { value: 'decisoes', label: 'Decisões' }
  ];

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          title="Dashboard"
        />

        <div className="premium-card dashboard-score-hero">
          <SkeletonBlock height={28} />
          <SkeletonBlock height={6} />
        </div>

        <section className="premium-metric-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="premium-metric tone-default">
              <SkeletonBlock height={12} />
              <SkeletonBlock height={24} />
              <SkeletonBlock height={10} />
            </div>
          ))}
        </section>

        <section className="premium-grid two">
          <PremiumCard title="Sinais executivos">
            <SkeletonBlock lines={3} />
          </PremiumCard>
          <PremiumCard title="Próximas ações">
            <SkeletonBlock lines={3} />
          </PremiumCard>
        </section>

        <section className="premium-grid two">
          <PremiumCard title="Ritmo semanal">
            <SkeletonBlock height={160} />
          </PremiumCard>
          <PremiumCard title="Projetos em tração">
            <SkeletonBlock lines={5} />
          </PremiumCard>
        </section>
      </PremiumPage>
    );
  }

  const deepWorkHoursWeek = Math.round(
    ((data.weeklyPulse?.days ?? []).reduce((sum, day) => sum + day.deepWorkMinutes, 0) / 60) * 10
  ) / 10;
  const activeProjectsCount = data.projects.filter((p) => p.status === 'ativo').length;

  return (
    <PremiumPage>
      <PremiumHeader
        title="Dashboard"
      />

      {error && <p className="surface-error">{error}</p>}

      {/* Score Hero */}
      <div className="premium-card dashboard-score-hero">
        {(data.gamification?.scoreSemanal ?? 0) === 0 && (data.gamification?.streak ?? 0) === 0 && executionRate === 0 ? (
          <div className="score-hero-first-run">
            <strong>Seu primeiro dia de execução.</strong>
            <p>Complete uma tarefa prioritária para iniciar o streak e acumular pontos.</p>
          </div>
        ) : (
          <>
            <div className="score-hero-main">
              <div className="score-hero-pts">
                <Star size={14} className="score-hero-icon" />
                <span className="score-hero-number">{data.gamification?.scoreSemanal ?? data.executionScore?.score ?? 0}</span>
                <span className="score-hero-label">pts semanais</span>
              </div>
              <div className="score-hero-sep" />
              <div className="score-hero-streak">
                <Flame size={13} className="score-hero-streak-icon" />
                <span>{data.gamification?.streak ?? 0} dias de streak</span>
              </div>
              <div className="score-hero-sep" />
              <div className="score-hero-rate">
                <span>{executionRate}% execução hoje</span>
              </div>
            </div>
            <div className="score-hero-bar-track">
              <div className="score-hero-bar-fill" style={{ width: `${executionRate}%` }} />
            </div>
          </>
        )}
      </div>

      {/* 6 KPIs */}
      <section className="premium-metric-grid">
        <MetricCard label="Execução" value={`${executionRate}%`} tone="accent" hint="hoje" />
        <MetricCard label="Deep Work" value={deepWorkHoursWeek} hint="horas esta semana" />
        <MetricCard label="Foco ativo" value={top3.length} hint="de 3 prioridades" />
        <MetricCard label="Dívida" value={data.gamification?.dividaExecucao ?? 0} tone="warning" hint="penalidades" />
        <MetricCard label="Concluídas" value={doneToday} hint="hoje" />
        <MetricCard label="Projetos" value={activeProjectsCount} hint="em andamento" />
      </section>

      {/* Signals + Quick Actions */}
      <section className="premium-grid two">
        <PremiumCard title="Sinais executivos" subtitle="alertas com impacto imediato">
          <ul className="ceo-signal-list">
            {ceoSignals.slice(0, 3).map((signal) => (
              <li key={signal.id} className={`ceo-signal-card tone-${signal.tone}`}>
                <strong>{signal.title}</strong>
                <p>{signal.message}</p>
              </li>
            ))}
          </ul>
        </PremiumCard>

        <PremiumCard title="Próximas ações" subtitle="resolver riscos em 1 clique">
          {quickActions.length === 0 ? (
            <EmptyState
              title="Sem ação urgente"
              description="Sistema sob controle. Continue com o ritmo do Top 3."
            />
          ) : (
            <ul className="premium-list dense">
              {quickActions.map((action) => (
                <li key={action.id}>
                  <div>
                    <strong>{action.label}</strong>
                    <small>{action.detail}</small>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => navigate(action.route)}>
                    Resolver
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PremiumCard>
      </section>

      {/* Trend + Project Momentum */}
      <section className="premium-grid two">
        <PremiumCard title="Ritmo das últimas semanas" subtitle="score e entregas por semana">
          {weeklyTrend.length === 0 ? (
            <EmptyState
              title="Sem histórico ainda"
              description="Conforme executa, a curva de ritmo aparece aqui."
            />
          ) : (
            <div className="premium-chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weeklyTrend}>
                  <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                  <XAxis dataKey="semana" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                  <YAxis allowDecimals={false} tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                  <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} />
                  <Line type="monotone" dataKey="score" stroke={chartTheme.colors.primary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="concluidas" stroke={chartTheme.colors.success} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </PremiumCard>

        <PremiumCard title="Projetos em tração" subtitle="momentum por execução recente">
          {projectMomentum.length === 0 ? (
            <EmptyState
              title="Sem projetos com tração"
              description="Conecte tarefas a projetos para gerar ranking."
            />
          ) : (
            <ul className="premium-list dense">
              {projectMomentum.slice(0, 5).map((entry, index) => {
                const trend = entry.doneAThisWeek > 0 ? '↑' : entry.score < 5 ? '↓' : '→';
                const trendClass = entry.doneAThisWeek > 0 ? 'delta-positive' : entry.score < 5 ? 'delta-negative' : '';
                return (
                  <li key={entry.project.id}>
                    <div>
                      <strong>{index + 1}. {entry.project.title}</strong>
                      <small>A abertas {entry.openA} · concluídas (7d) {entry.doneAThisWeek}</small>
                    </div>
                    <span className={trendClass}>{trend}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </PremiumCard>
      </section>

      {/* Bottom tabs */}
      <PremiumCard title="Detalhes">
        <TabSwitch value={dashboardSection} onChange={setDashboardSection} options={dashboardTabOptions} />
      </PremiumCard>

      {dashboardSection === 'inteligencia' && (
        <>
          <PremiumCard title="Motor de evolução">
            {!data.evolution ? (
              <EmptyState
                title="Sem leitura evolutiva"
                description="Execute alguns ciclos para o motor calibrar o seu nível."
              />
            ) : (
              <div className="evolution-engine-panel">
                {/* Bloco A — Status compacto sempre visível */}
                <div className="evolution-compact-head">
                  <span className={`evolution-stage-chip tone-${evolutionStageTone}`}>{data.evolution.stage.label}</span>
                  <span className="evolution-compact-index">Índice: {data.evolution.index}</span>
                  <span className={data.evolution.deltaIndex >= 0 ? 'delta-positive' : 'delta-negative'}>
                    {data.evolution.deltaIndex >= 0 ? '↑' : '↓'} {evolutionTrendLabel}
                  </span>
                </div>

                <p className="evolution-compact-challenge">{data.evolution.challenge.title}</p>

                <div className="meter-track evolution-compact-meter">
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (data.evolution.challenge.current / Math.max(1, data.evolution.challenge.target)) * 100
                        )
                      )}%`
                    }}
                  />
                </div>
                <small className="evolution-compact-meter-label">
                  {data.evolution.challenge.current}{data.evolution.challenge.unit} de {data.evolution.challenge.target}{data.evolution.challenge.unit}
                </small>

                {/* Bloco B — Narrativa */}
                <p className="evolution-compact-summary">{data.evolution.narrative.summary}</p>

                {data.evolution.narrative.pressureMessage && (
                  <div className="evolution-compact-pressure">{data.evolution.narrative.pressureMessage}</div>
                )}

                {/* Bloco C — Próximas ações (até 3) */}
                {data.evolution.nextActions.length > 0 && (
                  <ul className="evolution-compact-actions">
                    {data.evolution.nextActions.slice(0, 3).map((action, index) => (
                      <li key={`${index}-${action}`}>→ {action}</li>
                    ))}
                  </ul>
                )}

                {/* Expansível */}
                <button
                  type="button"
                  className="evolution-expand-toggle"
                  onClick={() => setEvolutionExpanded((v) => !v)}
                >
                  {evolutionExpanded ? 'Ver menos ▲' : 'Ver mais ▼'}
                </button>

                {evolutionExpanded && (
                  <div className="evolution-expanded-section">
                    <TabSwitch value={evolutionPanel} onChange={setEvolutionPanel} options={evolutionTabOptions} />

                    {evolutionPanel === 'resumo' && (
                      <>
                        {data.evolution.narrative.riskIfIgnored && (
                          <p className="surface-error">{data.evolution.narrative.riskIfIgnored}</p>
                        )}

                        <div className="evolution-status-grid">
                          <p className={data.evolution.promotion.recommended ? 'status-toast' : 'premium-empty'}>
                            {data.evolution.promotion.reason}
                          </p>
                          {data.evolution.promotion.blockedBySelfAssessment && data.evolution.promotion.blockReason && (
                            <p className="surface-error">{data.evolution.promotion.blockReason}</p>
                          )}
                          <p className={data.evolution.regression.risk ? 'surface-error' : 'premium-empty'}>
                            {data.evolution.regression.reason}
                          </p>
                        </div>

                        {data.evolution.narrative.next7DaysPlan.length > 0 && (
                          <div className="evolution-next-actions">
                            <strong>Plano de 7 dias</strong>
                            <ul className="premium-list dense">
                              {data.evolution.narrative.next7DaysPlan.map((action, index) => (
                                <li key={`${index}-plan-${action}`}>
                                  <div><strong>{index + 1}. {action}</strong></div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                    {evolutionPanel === 'regras' && (
                      <ul className="evolution-rule-list">
                        {data.evolution.explainableRules.slice(0, 10).map((rule) => (
                          <li key={rule.id} className={`evolution-rule-item status-${rule.status}`}>
                            <div className="evolution-rule-head">
                              <strong>{rule.title}</strong>
                              <span className="priority-chip">Peso {rule.weight} • Impacto {rule.impact}</span>
                            </div>
                            <p>{rule.description}</p>
                            <small>
                              Atual {rule.current}{rule.unit} • Meta {rule.operator === 'gte' ? '>=' : '<='} {rule.target}{rule.unit} • Dados: {rule.dataUsed}
                            </small>
                            <small>Ação: {rule.recommendation}</small>
                          </li>
                        ))}
                      </ul>
                    )}

                    {evolutionPanel === 'decisoes' && (
                      <>
                        {data.evolution.decisionJournal.length > 0 ? (
                          <ul className="evolution-rule-list">
                            {data.evolution.decisionJournal.slice(0, 8).map((decision) => (
                              <li
                                key={decision.id}
                                className={`evolution-rule-item status-${decision.signal === 'risco' ? 'warning' : decision.signal === 'executiva' ? 'ok' : 'default'}`}
                              >
                                <div className="evolution-rule-head">
                                  <strong>{decision.decision}</strong>
                                  <span className="priority-chip">
                                    {decision.kind === 'review'
                                      ? `${decision.periodType === 'monthly' ? 'Mensal' : 'Semanal'} • ${decision.periodStart ? formatIsoDate(decision.periodStart) : '-'}`
                                      : `Evento • ${decision.eventCode}`}
                                  </span>
                                </div>
                                <small>
                                  Fonte: {decision.source} • Impacto {decision.impactScore >= 0 ? '+' : ''}
                                  {decision.impactScore} • Compromisso: {decision.commitmentLevel ?? 'sem_dados'} • Atualizado em{' '}
                                  {new Date(decision.updatedAt).toLocaleDateString('pt-BR')}
                                </small>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <EmptyState
                            title="Sem decisões registradas"
                            description="As decisões estratégicas aparecem aqui conforme você revisa e executa."
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </PremiumCard>

          <PremiumCard title="Saúde do sistema">
            {selfDeceptionGuards.every((g) => g.tone === 'success') ? (
              <div className="system-health-ok">Sistema saudável. Sem alertas.</div>
            ) : (
              <ul className="system-health-list">
                {selfDeceptionGuards
                  .filter((g) => g.tone !== 'success')
                  .map((guard) => (
                    <li key={guard.id} className="system-health-item">
                      <span className={`system-health-value ${guard.tone}`}>{guard.value}</span>
                      <span className="system-health-label">{guard.title}</span>
                      <button
                        type="button"
                        className="ghost-button system-health-action"
                        onClick={() => navigate(guard.route)}
                      >
                        {guard.actionLabel}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </PremiumCard>

          <PremiumCard title="Ações de maior alavanca" subtitle="resolver riscos críticos em 1 clique">
            {!hasActionables ? (
              <EmptyState
                title="Sem ação urgente agora"
                description="Os principais gatilhos estão sob controle. Mantenha a disciplina do Top 3."
              />
            ) : (
              <div className="dashboard-actionables">
                {fragmentationActions.length > 0 && (
                  <section>
                    <strong>Desfragmentar foco (projetos ativos demais)</strong>
                    <ul className="premium-list dense">
                      {fragmentationActions.map((entry) => (
                        <li key={entry.projectId}>
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.workspaceName} • {entry.openATasks} tarefa(s) A aberta(s) • P{entry.highestPriority}
                            </small>
                          </div>
                          <div className="inline-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={actionBusyKey === `project:${entry.projectId}`}
                              onClick={() => moveProjectToLatent(entry.projectId, entry.title)}
                            >
                              Mover para latente
                            </button>
                            <button type="button" className="ghost-button" onClick={() => navigate(`/projetos/${entry.projectId}`)}>
                              Abrir
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {disconnectedActions.length > 0 && (
                  <section>
                    <strong>Conectar tarefas sem projeto</strong>
                    <ul className="premium-list dense">
                      {disconnectedActions.map((entry) => (
                        <li key={entry.taskId}>
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.workspaceName} • P{entry.priority} • {entry.status} • prazo {formatDueDateLabel(entry.dueDate)}
                            </small>
                          </div>
                          <div className="inline-actions">
                            {entry.suggestedProjectId ? (
                              <button
                                type="button"
                                className="ghost-button"
                                disabled={actionBusyKey === `task-link:${entry.taskId}`}
                                onClick={() => linkTaskToSuggestedProject(entry.taskId, entry.suggestedProjectId as string)}
                              >
                                Vincular: {entry.suggestedProjectTitle ?? 'Projeto sugerido'}
                              </button>
                            ) : (
                              <button type="button" className="ghost-button" onClick={() => navigate('/projetos')}>
                                Criar projeto
                              </button>
                            )}
                            <button type="button" className="ghost-button" onClick={() => navigate('/tarefas?focus=1')}>
                              Abrir tabela
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {evitationActions.length > 0 && (
                  <section>
                    <strong>Atacar evitação (A reagendada 3x+)</strong>
                    <ul className="premium-list dense">
                      {evitationActions.map((entry) => (
                        <li key={entry.taskId}>
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.workspaceName}
                              {entry.projectTitle ? ` • ${entry.projectTitle}` : ''}
                              {' • '}
                              {entry.delayedCount} reagendamento(s) • P{entry.priority}
                            </small>
                          </div>
                          <div className="inline-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={actionBusyKey === `task-micro:${entry.taskId}`}
                              onClick={() => convertTaskToMicroAction(entry.taskId, entry.title)}
                            >
                              Quebrar em 15min hoje
                            </button>
                            <button type="button" className="ghost-button" onClick={() => navigate('/hoje')}>
                              Abrir Hoje
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {ghostProjectActions.length > 0 && (
                  <section>
                    <strong>Projetos fantasma (decisão obrigatória)</strong>
                    <ul className="premium-list dense">
                      {ghostProjectActions.map((entry) => (
                        <li key={entry.projectId}>
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.workspaceName} • {entry.idleDays} dias sem tração estratégica
                            </small>
                          </div>
                          <div className="inline-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={Boolean(actionBusyKey?.startsWith(`ghost-project:${entry.projectId}:`))}
                              onClick={() => resolveGhostProject(entry.projectId, 'reativar')}
                            >
                              Reativar
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={Boolean(actionBusyKey?.startsWith(`ghost-project:${entry.projectId}:`))}
                              onClick={() => resolveGhostProject(entry.projectId, 'mover_latente')}
                            >
                              Latente
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={Boolean(actionBusyKey?.startsWith(`ghost-project:${entry.projectId}:`))}
                              onClick={() => resolveGhostProject(entry.projectId, 'encerrar')}
                            >
                              Encerrar
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {waitingFollowupActions.length > 0 && (
                  <section>
                    <strong>Dependências externas críticas</strong>
                    <ul className="premium-list dense">
                      {waitingFollowupActions.map((entry) => (
                        <li key={entry.taskId}>
                          <div>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.workspaceName} • aguardando {entry.waitingOnPerson} •{' '}
                              {entry.overdueDays > 0
                                ? `${entry.overdueDays} dia(s) em atraso`
                                : entry.dueToday
                                  ? 'vence hoje'
                                  : 'no prazo'}
                            </small>
                          </div>
                          <div className="inline-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={actionBusyKey === `waiting-followup:${entry.taskId}`}
                              onClick={() => registerWaitingFollowup(entry.taskId)}
                            >
                              Registrar cobrança
                            </button>
                            <button type="button" className="ghost-button" onClick={() => navigate('/tarefas')}>
                              Abrir tarefa
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </PremiumCard>
        </>
      )}

      {dashboardSection === 'ritual' && (
        <>
          <section className="premium-grid two">
            <PremiumCard title="Alocação planejado vs real" subtitle={`semana iniciada em ${formatIsoDate(weekStart)}`}>
              {!data.weeklyAllocation || data.weeklyAllocation.rows.length === 0 ? (
                <EmptyState
                  title="Sem alocação registrada"
                  description="Defina o planejamento semanal por frente para liberar leitura de drift."
                />
              ) : (
                <ul className="allocation-drift-list">
                  {data.weeklyAllocation.rows
                    .slice()
                    .sort((left, right) => Math.abs(right.deltaPercent) - Math.abs(left.deltaPercent))
                    .slice(0, 6)
                    .map((row) => (
                      <li key={row.workspaceId} className="allocation-drift-item">
                        <div className="allocation-drift-head">
                          <strong>{row.workspaceName}</strong>
                          <small className={row.deltaPercent >= 0 ? 'delta-positive' : 'delta-negative'}>
                            {row.deltaPercent >= 0 ? '+' : ''}
                            {row.deltaPercent}%
                          </small>
                        </div>
                        <div className="allocation-row">
                          <span>Planejado {row.plannedPercent}%</span>
                          <div className="meter-track">
                            <div style={{ width: `${row.plannedPercent}%` }} />
                          </div>
                        </div>
                        <div className="allocation-row">
                          <span>Real {row.actualPercent}% ({row.actualHours}h)</span>
                          <div className="meter-track">
                            <div style={{ width: `${row.actualPercent}%` }} />
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </PremiumCard>

            <PremiumCard title="Construção vs operação" subtitle="pulso estratégico da semana">
              {data.weeklyPulse ? (
                <ul className="premium-kv-list compact">
                  <li>
                    <span>Construção</span>
                    <strong>{data.weeklyPulse.composition.constructionPercent}%</strong>
                  </li>
                  <li>
                    <span>Operação</span>
                    <strong>{data.weeklyPulse.composition.operationPercent}%</strong>
                  </li>
                  <li>
                    <span>Tarefas desconexas</span>
                    <strong>{data.weeklyPulse.composition.disconnectedPercent}%</strong>
                  </li>
                </ul>
              ) : (
                <SkeletonBlock lines={3} />
              )}
            </PremiumCard>
          </section>

          <section className="premium-grid two">
            <PremiumCard title="Risco estratégico semanal" subtitle="gargalo e direção da semana">
              {!data.weeklyReview ? (
                <SkeletonBlock lines={4} />
              ) : (
                <>
                  <ul className="premium-kv-list compact">
                    <li>
                      <span>Frente dominante</span>
                      <strong>{data.weeklyReview.summary.dominantWorkspace?.workspaceName ?? 'n/d'}</strong>
                    </li>
                    <li>
                      <span>Frente negligenciada</span>
                      <strong>{data.weeklyReview.summary.neglectedWorkspace?.workspaceName ?? 'n/d'}</strong>
                    </li>
                    <li>
                      <span>Gargalo dominante</span>
                      <strong>
                        {data.weeklyReview.summary.dominantBottleneck
                          ? `${data.weeklyReview.summary.dominantBottleneck.label} (${data.weeklyReview.summary.dominantBottleneck.percent}%)`
                          : 'Sem padrão dominante'}
                      </strong>
                    </li>
                  </ul>
                  <p className="premium-empty">{data.weeklyReview.question}</p>
                </>
              )}
            </PremiumCard>

            <PremiumCard title="Frentes fantasma" subtitle="frentes sem tração ativa e sem tarefa A">
              {!data.weeklyReview || data.weeklyReview.summary.ghostProjects.length === 0 ? (
                <EmptyState
                  title="Nenhuma frente fantasma"
                  description="Quando uma frente ficar sem tração e sem tarefa A, ela aparece aqui com prioridade de decisão."
                />
              ) : (
                <ul className="premium-list dense">
                  {data.weeklyReview.summary.ghostProjects.map((project) => (
                    <li key={project.id}>
                      <div>
                        <strong>{project.title}</strong>
                        <small>
                          {project.workspace.name}
                          {project.reason ? ` • ${project.reason}` : ''}
                        </small>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => navigate(`/projetos/${project.id}`)}
                          >
                            Abrir frente
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={ghostActionBusyId === project.id}
                            onClick={() => runGhostAction(project.id, 'criar_tarefa_a')}
                          >
                            Criar tarefa A
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={ghostActionBusyId === project.id}
                            onClick={() => runGhostAction(project.id, 'reativar')}
                          >
                            Reativar
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={ghostActionBusyId === project.id}
                            onClick={() => runGhostAction(project.id, 'standby')}
                          >
                            Standby
                          </button>
                        </div>
                      </div>
                      <span className="status-tag backlog">frente fantasma</span>
                    </li>
                  ))}
                </ul>
              )}
            </PremiumCard>
          </section>
        </>
      )}

      {dashboardSection === 'analitico' && (
        <>
          <section className="premium-grid two">
            <PremiumCard title="Tração semanal por dia" subtitle="planejado vs Deep Work em horas">
              {weeklyExecutionLoad.length === 0 ? (
                <EmptyState
                  title="Sem dados semanais ainda"
                  description="Ao preencher agenda e Deep Work, a curva semanal aparece aqui."
                />
              ) : (
                <div className="premium-chart-wrap">
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={weeklyExecutionLoad}>
                      <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                      <XAxis dataKey="dia" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} />
                      <Bar dataKey="planejado" fill={chartTheme.colors.secondary} name="Planejado (h)" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="deepWork" fill={chartTheme.colors.primary} name="Deep Work (h)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </PremiumCard>

            <PremiumCard title="Projetos em tração" subtitle="score por atividade executiva recente">
              {projectMomentum.length === 0 ? (
                <EmptyState
                  title="Sem projetos com tração"
                  description="Conecte tarefas a projetos para gerar ranking estratégico semanal."
                />
              ) : (
                <ul className="premium-list dense">
                  {projectMomentum.map((entry, index) => (
                    <li key={entry.project.id}>
                      <div>
                        <strong>
                          {index + 1}. {entry.project.title}
                        </strong>
                        <small>
                          score {entry.score} • A abertas {entry.openA} • A concluídas (7d) {entry.doneAThisWeek}
                        </small>
                      </div>
                      <span className={`status-tag ${entry.project.status ?? 'backlog'}`}>{entry.project.status ?? 'ativo'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PremiumCard>
          </section>

          <section className="premium-grid two">
            <PremiumCard title="Distribuição operacional" subtitle="status atual das tarefas">
              {statusDistribution.every((entry) => entry.value === 0) ? (
                <EmptyState
                  title="Sem dados de status"
                  description="As tarefas criadas no contexto passam a alimentar esta leitura automaticamente."
                />
              ) : (
                <div className="premium-chart-wrap">
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={statusDistribution}>
                      <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                      <XAxis dataKey="name" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <YAxis allowDecimals={false} tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <Tooltip
                        cursor={{ fill: 'rgba(224,124,74,0.06)' }}
                        contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={chartTheme.colors.primary} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </PremiumCard>

            <PremiumCard title="Ritmo semanal" subtitle="score e entregas por semana">
              {weeklyTrend.length === 0 ? (
                <EmptyState
                  title="Sem histórico semanal"
                  description="Conforme sua execução avança, esta curva mostra evolução de disciplina."
                />
              ) : (
                <div className="premium-chart-wrap">
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={weeklyTrend}>
                      <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                      <XAxis dataKey="semana" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <YAxis allowDecimals={false} tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} />
                      <Line type="monotone" dataKey="score" stroke={chartTheme.colors.primary} strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="concluidas" stroke={chartTheme.colors.success} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </PremiumCard>
          </section>

          <section className="premium-grid two">
            <PremiumCard title="Heatmap semanal por frente" subtitle="intensidade diária das horas executadas">
              {!weeklyWorkspaceHeatmap ? (
                <EmptyState
                  title="Sem horas lançadas na semana"
                  description="Planeje blocos no calendário para ver distribuição real por frente."
                />
              ) : (
                <div className="workspace-heatmap-wrap">
                  <div className="workspace-heatmap-head">
                    <span>Frente</span>
                    <div className="workspace-heatmap-days">
                      {weeklyWorkspaceHeatmap.dayLabels.map((day) => (
                        <small key={day.date}>{day.label}</small>
                      ))}
                    </div>
                    <span>Total</span>
                  </div>

                  <ul className="workspace-heatmap-list">
                    {weeklyWorkspaceHeatmap.rows.map((row) => (
                      <li key={row.workspaceId}>
                        <strong>{row.name}</strong>
                        <div className="workspace-heatmap-days">
                          {row.days.map((day) => {
                            const intensity = day.minutes / weeklyWorkspaceHeatmap.maxMinutes;
                            const alpha = day.minutes === 0 ? 0.04 : 0.14 + intensity * 0.72;
                            const color = intensity > 0.55 ? '#e8e4df' : '#1a1a1e';
                            return (
                              <span
                                key={`${row.workspaceId}-${day.date}`}
                                className="workspace-heatmap-cell"
                                style={{
                                  backgroundColor: `rgba(224, 124, 74, ${alpha})`,
                                  color
                                }}
                                title={`${row.name} • ${day.date} • ${day.hours}h`}
                              >
                                {day.hours > 0 ? day.hours : '-'}
                              </span>
                            );
                          })}
                        </div>
                        <small>{row.totalHours}h</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </PremiumCard>

            <PremiumCard title="Mix de prioridades" subtitle="distribuição do portfólio ativo">
              {priorityDistribution.every((entry) => entry.value === 0) ? (
                <EmptyState
                  title="Sem tarefas ativas no mix"
                  description="Adicione tarefas para visualizar equilíbrio de prioridade operacional."
                />
              ) : (
                <div className="premium-chart-wrap pie">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={priorityDistribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={4}>
                        {priorityDistribution.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={chartTheme.palette[index % chartTheme.palette.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="chart-legend">
                    {priorityDistribution.map((entry, index) => (
                      <span key={entry.name}>
                        <i style={{ background: chartTheme.palette[index % chartTheme.palette.length] }} />
                        {entry.name}: {entry.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </PremiumCard>
          </section>
        </>
      )}
    </PremiumPage>
  );
}
