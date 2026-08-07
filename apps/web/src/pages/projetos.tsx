import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  PICKER_TYPES,
  computeAuthorityScore,
  computeOkrScore,
  computePipelineForecast,
  computeRunwayMonths,
  daysRemaining,
  getEngine,
  getEngineVariant,
  getProjectTypeConfig,
  methodologyDisplayLabel,
} from '../project-engines';
import type { WizardField } from '../project-engines';
import {
  BadgeDollarSign,
  Funnel,
  GitBranch,
  Globe2,
  GraduationCap,
  Megaphone,
  PackageCheck,
  Repeat2,
  Scale,
  SearchCheck,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  type LucideIcon
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { axisProps, cartesianGridProps, chartTheme, tooltipStyle } from '../utils/chart-theme';
import {
  api,
  Project,
  ProjectMethodology,
  ProjectScorecard,
  ProjectStatus,
  ProjectType,
  Task,
  TaskEnergy,
  TaskExecutionKind,
  TaskHorizon,
  TaskType,
  Workspace,
  type MethodologyData
} from '../api';
import { Modal } from '../components/modal';
import { TaskCompletionModal } from '../components/task-completion-modal';
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
import { useShellContext } from '../components/shell-context';
import { formatIsoDate, formatIsoDateDayMonth } from '../utils/date';
import { workspaceQuery } from '../utils/workspace';
import { ProjectList, type ProjectListFilters } from '../features/projects/project-list';
import { ProjectWizard } from '../features/projects/project-wizard';
import { isFrontsProjectsV2Enabled } from '../features/projects/project-feature-flag';
import type { ProjectExecutionListItem } from '../features/projects/types';

type CreateEntity = 'project' | 'task';
type ProjectCreateStep = 1 | 2 | 3;

const PROJECT_METHODOLOGY_ICONS: Partial<Record<ProjectMethodology, LucideIcon>> = {
  fourdx: Target,
  entrega: PackageCheck,
  exploracao: SearchCheck,
  pipeline: GitBranch,
  captacao: BadgeDollarSign,
  campanha: Megaphone,
  processo: Repeat2,
  okr: Trophy,
  decisao: Scale,
  mentoria: GraduationCap,
  autoridade: ShieldCheck,
  cenario: Globe2,
  runway: Timer,
  sistema_receita: TrendingUp,
  funil: Funnel,
  delivery: PackageCheck,
  launch: Megaphone,
  discovery: SearchCheck,
  growth: TrendingUp
};

const PROJECT_REDESIGN_PREVIEW = false;

function ProjectMethodologyIcon({
  methodology,
  className = 'project-methodology-icon',
  size = 18
}: {
  methodology?: ProjectMethodology | null;
  className?: string;
  size?: number;
}) {
  const Icon = (methodology ? PROJECT_METHODOLOGY_ICONS[methodology] : null) ?? Target;
  return <Icon className={className} size={size} strokeWidth={2} aria-hidden="true" />;
}

type FrameworkExtraFieldConfig = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'checkbox';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};
const TASK_TYPE_PRIORITY_SUGGESTION: Record<TaskType, number> = {
  a: 5,
  b: 3,
  c: 1
};

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

function suggestedPriorityFromTaskType(type: TaskType) {
  return TASK_TYPE_PRIORITY_SUGGESTION[type];
}

function isStrategicExecutionKind(kind?: TaskExecutionKind) {
  return kind === 'construcao' || kind === 'otimizacao';
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

const PROJECT_METHODOLOGY_META: Partial<Record<
  ProjectMethodology,
  {
    label: string;
    subtitle: string;
    deepDive: string;
    leadLabel: string;
    lagLabel: string;
    objectivePlaceholder: string;
    leadOnePlaceholder: string;
    leadTwoPlaceholder: string;
    lagPlaceholder: string;
  }
>> = {
  fourdx: {
    label: '4DX',
    subtitle: 'Resultado + 2 MDDs + cadência semanal',
    deepDive:
      'Ideal para metas claras com linha de chegada definida. Foco em disciplina semanal de execução e placar visível de progresso.',
    leadLabel: 'MDD',
    lagLabel: 'Métrica histórica',
    objectivePlaceholder: 'de 0 para 10.000 seguidores no Instagram em 3 meses',
    leadOnePlaceholder: 'Ex: postar 2 reels por semana',
    leadTwoPlaceholder: 'Ex: analisar métricas 1x/semana',
    lagPlaceholder: 'Ex: seguidores no Instagram'
  },
  delivery: {
    label: 'Delivery',
    subtitle: 'Marcos, riscos e escopo entregue',
    deepDive:
      'Ideal para entregar algo concreto (módulo, projeto, operação crítica). Foco em marcos concluídos e bloqueios removidos.',
    leadLabel: 'Marcos',
    lagLabel: 'Escopo',
    objectivePlaceholder: 'Entregar módulo X em produção com qualidade até data Y',
    leadOnePlaceholder: 'Ex: marcos críticos concluídos',
    leadTwoPlaceholder: 'Ex: bloqueios críticos resolvidos',
    lagPlaceholder: 'Ex: escopo entregue (%)'
  },
  launch: {
    label: 'Launch',
    subtitle: 'Janela de lançamento e readiness',
    deepDive:
      'Ideal para campanhas e janelas de execução com data crítica. Foco em readiness dos ativos e checkpoint de execução.',
    leadLabel: 'Readiness',
    lagLabel: 'Resultado de lançamento',
    objectivePlaceholder: 'Lançar oferta/campanha em D e atingir meta até D+30',
    leadOnePlaceholder: 'Ex: ativos críticos prontos',
    leadTwoPlaceholder: 'Ex: checkpoints de lançamento concluídos',
    lagPlaceholder: 'Ex: receita/leads do lançamento'
  },
  discovery: {
    label: 'Discovery',
    subtitle: 'Hipóteses, testes e aprendizado',
    deepDive:
      'Ideal para incerteza alta (produto, mercado, posicionamento). Foco em experimentos, evidências e hipóteses validadas.',
    leadLabel: 'Experimentos',
    lagLabel: 'Hipóteses validadas',
    objectivePlaceholder: 'Validar hipótese-chave com evidência em X semanas',
    leadOnePlaceholder: 'Ex: entrevistas/insights validados',
    leadTwoPlaceholder: 'Ex: experimentos executados',
    lagPlaceholder: 'Ex: hipóteses validadas (%)'
  },
  growth: {
    label: 'Growth',
    subtitle: 'Loops de aquisição, ativação e retenção',
    deepDive:
      'Ideal para crescimento contínuo e otimização de funil. Foco em ciclos curtos de experimento com impacto mensurável.',
    leadLabel: 'Loops',
    lagLabel: 'Métrica norte',
    objectivePlaceholder: 'Aumentar métrica norte de X para Y em Z semanas',
    leadOnePlaceholder: 'Ex: experimentos de growth executados',
    leadTwoPlaceholder: 'Ex: otimizações de funil concluídas',
    lagPlaceholder: 'Ex: crescimento da métrica norte (%)'
  }
};

function methodologyLabel(methodology?: ProjectMethodology | null) {
  return methodologyDisplayLabel(methodology);
}

const PROJECT_CREATE_STEP_LABELS: Array<{ step: ProjectCreateStep; label: string }> = [
  { step: 1, label: '1. Metodologia' },
  { step: 2, label: '2. Dados essenciais' },
  { step: 3, label: '3. Preview e criação' }
];

const PROJECT_METHOD_PANEL_PREVIEW: Partial<Record<
  ProjectMethodology,
  {
    chart: string;
    focus: string;
  }
>> = {
  fourdx: {
    chart: 'Projeção linear de lag + compliance semanal de MDD',
    focus: 'disciplina semanal e avanço consistente da meta'
  },
  delivery: {
    chart: 'Burndown de escopo restante + marcos/bloqueios',
    focus: 'entrega concreta com redução de risco operacional'
  },
  launch: {
    chart: 'Readiness da janela + resultado real vs ritmo esperado',
    focus: 'execução da janela crítica com contingência'
  },
  discovery: {
    chart: 'Curva de hipóteses validadas + backlog de experimentos',
    focus: 'aprendizado verificável e decisão clara do ciclo'
  },
  growth: {
    chart: 'Momentum semanal (delta) + compliance de loops',
    focus: 'aceleração contínua da métrica norte'
  }
};

function frameworkExtraFieldsForMethodology(methodology: ProjectMethodology): FrameworkExtraFieldConfig[] {
  if (methodology === 'delivery') {
    return [
      { key: 'milestonesPlanned', label: 'Marcos planejados', kind: 'number', placeholder: 'Ex: 4' },
      { key: 'blockersOpen', label: 'Bloqueios abertos', kind: 'number', placeholder: 'Ex: 1' }
    ];
  }
  if (methodology === 'launch') {
    return [
      {
        key: 'windowPhase',
        label: 'Fase da janela',
        kind: 'select',
        options: [
          { value: 'pre_launch', label: 'Pré-launch' },
          { value: 'launch', label: 'Launch' },
          { value: 'post_launch', label: 'Pós-launch' }
        ]
      },
      { key: 'contingencyReady', label: 'Contingência pronta', kind: 'checkbox' }
    ];
  }
  if (methodology === 'discovery') {
    return [
      {
        key: 'cycleDecision',
        label: 'Decisão do ciclo',
        kind: 'select',
        options: [
          { value: 'seguir', label: 'Seguir' },
          { value: 'pivotar', label: 'Pivotar' },
          { value: 'encerrar', label: 'Encerrar' }
        ]
      },
      {
        key: 'evidenceQuality',
        label: 'Qualidade da evidência',
        kind: 'select',
        options: [
          { value: 'baixa', label: 'Baixa' },
          { value: 'media', label: 'Média' },
          { value: 'alta', label: 'Alta' }
        ]
      }
    ];
  }
  if (methodology === 'growth') {
    return [
      {
        key: 'bottleneckArea',
        label: 'Gargalo dominante',
        kind: 'select',
        options: [
          { value: 'acquisicao', label: 'Aquisição' },
          { value: 'ativacao', label: 'Ativação' },
          { value: 'retencao', label: 'Retenção' },
          { value: 'monetizacao', label: 'Monetização' }
        ]
      },
      { key: 'experimentsVelocity', label: 'Velocidade de experimentos', kind: 'number', placeholder: 'Ex: 3' }
    ];
  }
  return [
    {
      key: 'disciplineLevel',
      label: 'Disciplina da semana',
      kind: 'select',
      options: [
        { value: 'baixa', label: 'Baixa' },
        { value: 'media', label: 'Média' },
        { value: 'alta', label: 'Alta' }
      ]
    },
    { key: 'focusSignal', label: 'Sinal de foco', kind: 'text', placeholder: 'Ex: foco alto nas MDDs' }
  ];
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

function calculateLagProgressPercent(project: Project) {
  const start = project.resultStartValue;
  const current = project.resultCurrentValue;
  const target = project.resultTargetValue;
  if (
    typeof start !== 'number' ||
    typeof current !== 'number' ||
    typeof target !== 'number' ||
    target === start
  ) {
    return null;
  }

  const raw = ((current - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function daysSinceTimestamp(iso?: string | null) {
  if (!iso) {
    return null;
  }
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
}

function formatLastCheckinLabel(iso?: string | null) {
  if (!iso) {
    return 'sem check-in';
  }
  return new Date(iso).toLocaleDateString('pt-BR');
}

function getProjectCardMetrics(project: Project, totalTasks: number, lagProgress: number | null): string[] {
  const engine = getEngine(project.methodology);
  const variant = getEngineVariant(project.methodology);
  const md = project.methodologyData;
  const tasksLabel = `${totalTasks} tarefa${totalTasks !== 1 ? 's' : ''}`;

  if (engine === 'metric') {
    const lagPct = lagProgress ?? 0;
    return [`Lag ${lagPct}%`, tasksLabel, formatLastCheckinLabel(project.lastScorecardCheckinAt)];
  }

  if (engine === 'milestone') {
    const daysLeft = daysRemaining(project.timeHorizonEnd);
    const daysLabel = daysLeft === null ? 'sem prazo' : daysLeft >= 0 ? `D-${daysLeft}` : `${Math.abs(daysLeft)}d atraso`;
    if (variant === 'authority') {
      const pts = computeAuthorityScore(md?.proofs);
      return [`${pts} pts autoridade`, tasksLabel, daysLabel];
    }
    const milestones = md?.milestones ?? [];
    const done = milestones.filter((m) => m.done).length;
    return [`${done}/${milestones.length} marcos`, tasksLabel, daysLabel];
  }

  if (engine === 'log') {
    if (variant === 'coaching') {
      const sessions = md?.sessions ?? [];
      const nextSession = md?.nextSessionDate
        ? new Date(md.nextSessionDate).toLocaleDateString('pt-BR')
        : 'sem próxima sessão';
      return [`${sessions.length} sessões`, tasksLabel, nextSession];
    }
    // discovery (default log variant)
    const discoveries = md?.discoveries ?? [];
    const decisionStatus = md?.decision ? 'decidido' : 'em análise';
    return [`${discoveries.length} descobertas`, tasksLabel, decisionStatus];
  }

  if (engine === 'pipeline') {
    const deals = md?.deals ?? [];
    const stages = md?.stages ?? [];
    const stagesLabel = `${deals.length} deals / ${stages.length} estágios`;
    if (variant === 'financial' || variant === 'linear') {
      const closedStage = stages.find((s) => s.order === Math.max(...stages.map((st) => st.order)));
      const forecast = computePipelineForecast(deals, closedStage?.id);
      const forecastLabel = `R$ ${Math.round(forecast).toLocaleString('pt-BR')}`;
      return [stagesLabel, tasksLabel, forecastLabel];
    }
    return [stagesLabel, tasksLabel];
  }

  if (engine === 'composite') {
    const okrPct = computeOkrScore(md?.krs);
    const periodLabel = md?.okrPeriod ?? 'sem período';
    return [`OKR ${okrPct}%`, tasksLabel, periodLabel];
  }

  if (engine === 'decision') {
    const options = md?.options ?? [];
    const criteria = md?.criteria ?? [];
    const daysLeft = daysRemaining(md?.decisionDate);
    const deadlineLabel = daysLeft === null ? 'sem prazo' : daysLeft >= 0 ? `D-${daysLeft}` : 'prazo vencido';
    return [`${options.length} opções / ${criteria.length} critérios`, tasksLabel, deadlineLabel];
  }

  if (engine === 'time') {
    if (variant === 'runway') {
      const months = computeRunwayMonths(md?.availableCash, md?.burnRateMonthly);
      const runwayLabel = months !== null ? `${months} meses runway` : 'runway n/d';
      const burnLabel = md?.burnRateMonthly != null ? `R$ ${Math.round(md.burnRateMonthly).toLocaleString('pt-BR')}/mês` : 'burn n/d';
      return [runwayLabel, burnLabel, tasksLabel];
    }
    // campaign
    const launchDays = daysRemaining(md?.launchDate);
    const launchLabel = launchDays !== null ? `D-${launchDays} para lançamento` : (md?.campaignChannel ?? 'campanha');
    return [launchLabel, tasksLabel];
  }

  if (engine === 'recurring') {
    const freq = md?.frequency ?? 'mensal';
    const cycles = md?.cycles ?? [];
    const currentCycle = cycles[cycles.length - 1]?.periodLabel ?? 'sem ciclo';
    return [`Freq: ${freq}`, tasksLabel, currentCycle];
  }

  if (engine === 'funnel') {
    const stages = (md?.funilStages ?? []).sort((a, b) => a.order - b.order);
    const topVal = stages[0]?.value;
    const bottomVal = stages[stages.length - 1]?.value;
    const overallConv = topVal && bottomVal && topVal > 0
      ? `${Math.round((bottomVal / topVal) * 100)}% conv. geral`
      : `${stages.length} etapas`;
    return [`${stages.length} etapas`, overallConv, tasksLabel];
  }

  // fallback
  const lagPct = lagProgress ?? 0;
  return [`Lag ${lagPct}%`, tasksLabel, formatLastCheckinLabel(project.lastScorecardCheckinAt)];
}

function daysUntilDate(iso?: string | null) {
  if (!iso) {
    return null;
  }
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) {
    return null;
  }
  const diff = end - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
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

const PROJECT_METHODOLOGY_DETAIL_META: Partial<Record<
  ProjectMethodology,
  {
    scoreboardTitle: string;
    scoreboardSubtitle: string;
    objectiveLabel: string;
    objectiveHint: string;
    objectiveHintMissing: string;
    leadComplianceLabel: string;
    leadPanelTitle: string;
    leadPanelMissing: string;
    lagProjectionTitle: string;
    lagProjectionMissing: string;
    lagWeeklyLabel: string;
    lagProgressLabel: string;
    deadlineLabel: string;
  }
>> = {
  fourdx: {
    scoreboardTitle: 'Placar visível 4DX',
    scoreboardSubtitle: 'resultado final, medidas de direção e cadência semanal',
    objectiveLabel: 'Objetivo 4DX',
    objectiveHint: 'Formato 4DX registrado no projeto.',
    objectiveHintMissing: 'Defina no formato: de X para Y em Z tempo.',
    leadComplianceLabel: 'Lead compliance',
    leadPanelTitle: 'Medidas de direção (binário)',
    leadPanelMissing: 'Adicione medidas de direção para disciplinar execução semanal.',
    lagProjectionTitle: 'Projeção da métrica histórica',
    lagProjectionMissing: 'Adicione ao menos 1 métrica lag no scorecard para visualizar projeção.',
    lagWeeklyLabel: 'Métrica histórica da semana',
    lagProgressLabel: 'Progresso lag',
    deadlineLabel: 'Prazo 4DX'
  },
  delivery: {
    scoreboardTitle: 'Painel de delivery',
    scoreboardSubtitle: 'marcos semanais, bloqueios e escopo entregue',
    objectiveLabel: 'Objetivo de entrega',
    objectiveHint: 'Escopo e resultado de entrega definidos no projeto.',
    objectiveHintMissing: 'Defina claramente o escopo que precisa ser entregue.',
    leadComplianceLabel: 'Ritmo de marcos',
    leadPanelTitle: 'Marcos e bloqueios (binário)',
    leadPanelMissing: 'Defina marcos críticos e bloqueios para acompanhar a execução.',
    lagProjectionTitle: 'Projeção de escopo entregue',
    lagProjectionMissing: 'Adicione a métrica de escopo entregue para visualizar evolução.',
    lagWeeklyLabel: 'Escopo entregue na semana',
    lagProgressLabel: 'Progresso de entrega',
    deadlineLabel: 'Prazo de entrega'
  },
  launch: {
    scoreboardTitle: 'Painel de launch',
    scoreboardSubtitle: 'readiness, checkpoints e métrica de lançamento',
    objectiveLabel: 'Objetivo de lançamento',
    objectiveHint: 'Janela e meta de lançamento definidas no projeto.',
    objectiveHintMissing: 'Defina resultado esperado e janela de lançamento.',
    leadComplianceLabel: 'Readiness semanal',
    leadPanelTitle: 'Readiness e checkpoints (binário)',
    leadPanelMissing: 'Defina readiness e checkpoints para reduzir risco de lançamento.',
    lagProjectionTitle: 'Projeção da métrica de lançamento',
    lagProjectionMissing: 'Adicione uma métrica de lançamento para projetar resultado.',
    lagWeeklyLabel: 'Métrica de lançamento da semana',
    lagProgressLabel: 'Tração de lançamento',
    deadlineLabel: 'Data de lançamento'
  },
  discovery: {
    scoreboardTitle: 'Painel de discovery',
    scoreboardSubtitle: 'hipóteses, experimentos e validação',
    objectiveLabel: 'Hipótese/objetivo principal',
    objectiveHint: 'Hipótese central registrada para validação.',
    objectiveHintMissing: 'Defina a hipótese principal que será validada.',
    leadComplianceLabel: 'Ritmo de experimentos',
    leadPanelTitle: 'Experimentos executados (binário)',
    leadPanelMissing: 'Adicione experimentos e rotinas de validação semanal.',
    lagProjectionTitle: 'Projeção de hipóteses validadas',
    lagProjectionMissing: 'Adicione a métrica de validação para acompanhar aprendizado.',
    lagWeeklyLabel: 'Validação da semana',
    lagProgressLabel: 'Progresso de validação',
    deadlineLabel: 'Janela de discovery'
  },
  growth: {
    scoreboardTitle: 'Painel de growth',
    scoreboardSubtitle: 'loops de crescimento e métrica norte',
    objectiveLabel: 'Objetivo de crescimento',
    objectiveHint: 'Meta de crescimento e alavancas definidas no projeto.',
    objectiveHintMissing: 'Defina a métrica norte e o resultado de crescimento esperado.',
    leadComplianceLabel: 'Ritmo de loops',
    leadPanelTitle: 'Experimentos de growth (binário)',
    leadPanelMissing: 'Adicione loops e experimentos para manter cadência de growth.',
    lagProjectionTitle: 'Projeção da métrica norte',
    lagProjectionMissing: 'Adicione a métrica norte para visualizar tendência de crescimento.',
    lagWeeklyLabel: 'Métrica norte da semana',
    lagProgressLabel: 'Progresso da métrica norte',
    deadlineLabel: 'Janela de growth'
  }
};

const PROJECT_METHODOLOGY_CREATE_META: Partial<Record<
  ProjectMethodology,
  {
    objectiveLabel: string;
    objectiveHint: string;
    lagMetricLabel: string;
    leadOneLabel: string;
    leadTwoLabel: string;
    leadPairHint: string;
    extraOneLabel: string;
    extraOnePlaceholder: string;
    extraOneHint: string;
    extraTwoLabel: string;
    extraTwoPlaceholder: string;
    extraTwoHint: string;
    requireObjectiveRegex4dx: boolean;
    requireDeadline: boolean;
    requireLagStart: boolean;
    requireLagTarget: boolean;
    requireLeadPair: boolean;
    requireLagMetric: boolean;
    extraOneRequired: boolean;
    extraTwoRequired: boolean;
    cadenceSuggestion: number;
    cadenceHint: string;
  }
>> = {
  fourdx: {
    objectiveLabel: 'Objetivo 4DX',
    objectiveHint: 'Formato recomendado: de X para Y em Z tempo.',
    lagMetricLabel: 'Métrica histórica (lag)',
    leadOneLabel: 'MDD 1',
    leadTwoLabel: 'MDD 2',
    leadPairHint: 'As duas MDDs são a disciplina executável da semana.',
    extraOneLabel: 'Compromisso semanal',
    extraOnePlaceholder: 'Ex: revisão toda sexta às 17h',
    extraOneHint: 'Compromisso explícito para manter cadência.',
    extraTwoLabel: 'Critério de disciplina',
    extraTwoPlaceholder: 'Ex: 0 semanas sem check-in',
    extraTwoHint: 'Regra mínima para evitar semana sem placar.',
    requireObjectiveRegex4dx: true,
    requireDeadline: true,
    requireLagStart: true,
    requireLagTarget: true,
    requireLeadPair: true,
    requireLagMetric: true,
    extraOneRequired: false,
    extraTwoRequired: false,
    cadenceSuggestion: 7,
    cadenceHint: 'Ritmo clássico 4DX: check-in semanal.'
  },
  delivery: {
    objectiveLabel: 'Escopo de entrega',
    objectiveHint: 'Descreva claramente o que será entregue e em que estado.',
    lagMetricLabel: 'Métrica de escopo',
    leadOneLabel: 'Marco crítico 1',
    leadTwoLabel: 'Marco crítico 2',
    leadPairHint: 'Marcos críticos e remoção de bloqueios sustentam a entrega.',
    extraOneLabel: 'Critério de aceite',
    extraOnePlaceholder: 'Ex: deploy em produção + QA aprovado',
    extraOneHint: 'Sem aceite claro, o projeto fica subjetivo.',
    extraTwoLabel: 'Risco principal',
    extraTwoPlaceholder: 'Ex: dependência de fornecedor externo',
    extraTwoHint: 'Risco executivo que precisa ser monitorado toda semana.',
    requireObjectiveRegex4dx: false,
    requireDeadline: true,
    requireLagStart: false,
    requireLagTarget: true,
    requireLeadPair: true,
    requireLagMetric: true,
    extraOneRequired: true,
    extraTwoRequired: true,
    cadenceSuggestion: 7,
    cadenceHint: 'Delivery pede revisão semanal com foco em gargalos.'
  },
  launch: {
    objectiveLabel: 'Objetivo de lançamento',
    objectiveHint: 'Defina a meta da janela e o resultado esperado após o launch.',
    lagMetricLabel: 'Métrica do lançamento',
    leadOneLabel: 'Readiness 1',
    leadTwoLabel: 'Readiness 2',
    leadPairHint: 'Readiness mede se o lançamento está pronto para ir ao ar.',
    extraOneLabel: 'Canal principal do launch',
    extraOnePlaceholder: 'Ex: tráfego pago + email',
    extraOneHint: 'Canal dominante onde o lançamento vai concentrar energia.',
    extraTwoLabel: 'Plano de contingência',
    extraTwoPlaceholder: 'Ex: fallback de oferta/canal em D-1',
    extraTwoHint: 'Plano claro caso a janela principal falhe.',
    requireObjectiveRegex4dx: false,
    requireDeadline: true,
    requireLagStart: false,
    requireLagTarget: true,
    requireLeadPair: true,
    requireLagMetric: true,
    extraOneRequired: true,
    extraTwoRequired: true,
    cadenceSuggestion: 3,
    cadenceHint: 'Launch exige ritmo mais curto durante a janela.'
  },
  discovery: {
    objectiveLabel: 'Hipótese principal',
    objectiveHint: 'Descreva a hipótese que será validada com evidências.',
    lagMetricLabel: 'Métrica de validação',
    leadOneLabel: 'Experimento 1',
    leadTwoLabel: 'Experimento 2',
    leadPairHint: 'Experimentos precisam produzir aprendizado verificável.',
    extraOneLabel: 'Critério de evidência',
    extraOnePlaceholder: 'Ex: 10 entrevistas + padrão recorrente',
    extraOneHint: 'Define quando a hipótese realmente foi validada/refutada.',
    extraTwoLabel: 'Decisão esperada',
    extraTwoPlaceholder: 'Ex: pivotar / manter / descartar hipótese',
    extraTwoHint: 'Qual decisão será tomada ao fim do ciclo de discovery.',
    requireObjectiveRegex4dx: false,
    requireDeadline: true,
    requireLagStart: false,
    requireLagTarget: false,
    requireLeadPair: true,
    requireLagMetric: true,
    extraOneRequired: true,
    extraTwoRequired: true,
    cadenceSuggestion: 7,
    cadenceHint: 'Discovery com checkpoints semanais evita experimentação solta.'
  },
  growth: {
    objectiveLabel: 'Objetivo de crescimento',
    objectiveHint: 'Defina crescimento esperado para a métrica norte no período.',
    lagMetricLabel: 'Métrica norte',
    leadOneLabel: 'Loop de growth 1',
    leadTwoLabel: 'Loop de growth 2',
    leadPairHint: 'Dois loops ativos forçam iteração contínua de crescimento.',
    extraOneLabel: 'Alavanca principal',
    extraOnePlaceholder: 'Ex: aquisição orgânica por conteúdo',
    extraOneHint: 'Alavanca com maior potencial de escala no ciclo atual.',
    extraTwoLabel: 'Gargalo atual',
    extraTwoPlaceholder: 'Ex: ativação baixa na etapa de onboarding',
    extraTwoHint: 'Ponto de estrangulamento que limita o crescimento.',
    requireObjectiveRegex4dx: false,
    requireDeadline: true,
    requireLagStart: true,
    requireLagTarget: true,
    requireLeadPair: true,
    requireLagMetric: true,
    extraOneRequired: true,
    extraTwoRequired: true,
    cadenceSuggestion: 7,
    cadenceHint: 'Growth ganha tração com ciclos semanais de iteração.'
  }
};

function buildMethodologyActionStatement(input: {
  methodology: ProjectMethodology;
  leadOne: string;
  leadTwo: string;
  extraOne: string;
  extraTwo: string;
}) {
  const { methodology, leadOne, leadTwo, extraOne, extraTwo } = input;

  if (methodology === 'delivery') {
    return `Aceite: ${extraOne || 'pendente'} • Risco crítico: ${extraTwo || 'pendente'} • Marcos: ${leadOne} | ${leadTwo}`;
  }
  if (methodology === 'launch') {
    return `Canal foco: ${extraOne || 'pendente'} • Contingência: ${extraTwo || 'pendente'} • Readiness: ${leadOne} | ${leadTwo}`;
  }
  if (methodology === 'discovery') {
    return `Evidência mínima: ${extraOne || 'pendente'} • Decisão alvo: ${extraTwo || 'pendente'} • Experimentos: ${leadOne} | ${leadTwo}`;
  }
  if (methodology === 'growth') {
    return `Alavanca principal: ${extraOne || 'pendente'} • Gargalo atual: ${extraTwo || 'pendente'} • Loops: ${leadOne} | ${leadTwo}`;
  }
  return `Compromisso: ${extraOne || 'pendente'} • Disciplina: ${extraTwo || 'pendente'} • MDD: ${leadOne} | ${leadTwo}`;
}

function splitActionStatementLines(actionStatement?: string | null) {
  if (!actionStatement) {
    return [] as string[];
  }
  return actionStatement
    .split('•')
    .map((part) => part.trim())
    .filter(Boolean);
}

function methodologyOperationalPillars(project: Project) {
  const methodology = project.methodology ?? 'fourdx';
  const createMeta = PROJECT_METHODOLOGY_CREATE_META[methodology] ?? PROJECT_METHODOLOGY_CREATE_META['fourdx']!;
  const actionLines = splitActionStatementLines(project.actionStatement);

  return [
    {
      label: createMeta.extraOneLabel,
      value: project.methodologyExtraOne ?? 'pendente'
    },
    {
      label: createMeta.extraTwoLabel,
      value: project.methodologyExtraTwo ?? 'pendente'
    },
    {
      label: 'Plano operacional',
      value: actionLines[0] ?? 'pendente'
    }
  ];
}

function methodologyCardSummary(input: {
  project: Project;
  lagProgress: number | null;
  cadenceOnTrack: boolean;
  daysSinceCheckin: number | null;
}) {
  const methodology = input.project.methodology ?? 'fourdx';
  const lagValue = input.lagProgress === null ? 'n/d' : `${input.lagProgress}%`;

  if (methodology === 'delivery') {
    return {
      lineOne: `Escopo entregue ${lagValue}`,
      lineTwo: input.cadenceOnTrack ? 'Marcos em dia' : 'Marcos atrasados'
    };
  }
  if (methodology === 'launch') {
    const daysToWindow = daysUntilDate(input.project.timeHorizonEnd);
    return {
      lineOne:
        daysToWindow === null
          ? `Resultado launch ${lagValue}`
          : daysToWindow < 0
            ? `Janela vencida D+${Math.abs(daysToWindow)}`
            : `Janela launch D-${daysToWindow}`,
      lineTwo: input.cadenceOnTrack ? 'Readiness em dia' : 'Readiness atrasada'
    };
  }
  if (methodology === 'discovery') {
    return {
      lineOne: `Hipóteses validadas ${lagValue}`,
      lineTwo: input.cadenceOnTrack ? 'Experimentos em dia' : 'Experimentos atrasados'
    };
  }
  if (methodology === 'growth') {
    return {
      lineOne: `Métrica norte ${lagValue}`,
      lineTwo: input.cadenceOnTrack ? 'Loops em dia' : 'Loops atrasados'
    };
  }

  return {
    lineOne: `Lag ${lagValue}`,
    lineTwo: input.cadenceOnTrack ? 'MDD em dia' : 'MDD atrasada'
  };
}

export function LegacyProjetosPage() {
  const navigate = useNavigate();
  const { projectId: projectRouteId } = useParams<{ projectId?: string }>();
  const isProjectRoute = Boolean(projectRouteId);
  const { activeWorkspaceId, refreshGlobal } = useShellContext();
  const scopedWorkspaceId = workspaceQuery(activeWorkspaceId);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completionTaskId, setCompletionTaskId] = useState('');

  const [workspaceId, setWorkspaceId] = useState<'all' | string>('all');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('operacao');
  const [newProjectMethodology, setNewProjectMethodology] = useState<ProjectMethodology>('fourdx');
  const [newProjectObjective, setNewProjectObjective] = useState('');
  const [newProjectMetric, setNewProjectMetric] = useState('');
  const [newProjectLeadMeasure1, setNewProjectLeadMeasure1] = useState('');
  const [newProjectLeadMeasure2, setNewProjectLeadMeasure2] = useState('');
  const [newProjectExtraOne, setNewProjectExtraOne] = useState('');
  const [newProjectExtraTwo, setNewProjectExtraTwo] = useState('');
  const [newProjectTimeHorizonEnd, setNewProjectTimeHorizonEnd] = useState('');
  const [newProjectResultStartValue, setNewProjectResultStartValue] = useState('');
  const [newProjectResultTargetValue, setNewProjectResultTargetValue] = useState('');
  const [newProjectCadenceDays, setNewProjectCadenceDays] = useState('7');
  const [newProjectStatus, setNewProjectStatus] = useState<ProjectStatus>('ativo');
  // Generic wizard state for engine-specific fields (new methodology types)
  const [wizardDraft, setWizardDraft] = useState<Record<string, string | string[]>>({});

  const [scorecardWeekStart, setScorecardWeekStart] = useState(() => currentWeekStartIso());
  const [projectScorecard, setProjectScorecard] = useState<ProjectScorecard | null>(null);
  const [newMetricName, setNewMetricName] = useState('');
  const [newMetricTargetValue, setNewMetricTargetValue] = useState('');
  const [newMetricUnit, setNewMetricUnit] = useState('');
  const [checkinValueByMetric, setCheckinValueByMetric] = useState<Record<string, string>>({});
  // Engine quick-add inline forms (replaces window.prompt)
  const [engineQuickAdd, setEngineQuickAdd] = useState<{
    type: 'milestone' | 'proof' | 'event' | 'deal' | 'cycle' | 'step' | 'session' | 'action' | 'blocker' | 'kr' | null;
    draft: Record<string, string>;
  }>({ type: null, draft: {} });
  const openQuickAdd = (type: typeof engineQuickAdd.type, draft: Record<string, string> = {}) =>
    setEngineQuickAdd({ type, draft });
  const closeQuickAdd = () => setEngineQuickAdd({ type: null, draft: {} });
  const setQuickDraft = (key: string, value: string) =>
    setEngineQuickAdd(prev => ({ ...prev, draft: { ...prev.draft, [key]: value } }));
  const [checkinNoteByMetric, setCheckinNoteByMetric] = useState<Record<string, string>>({});
  // Mentoria — controlled session form state
  const [mentoriaDate, setMentoriaDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mentoriaLearned, setMentoriaLearned] = useState('');
  const [mentoriaCommitments, setMentoriaCommitments] = useState<string[]>(['']);
  // Exploração — controlled discovery form state
  const [discoveryText, setDiscoveryText] = useState('');
  const [discoveryType, setDiscoveryType] = useState<'confirms' | 'refutes' | 'inconclusive'>('confirms');
  const [discoveryDecision, setDiscoveryDecision] = useState<'follow' | 'pivot' | 'discard' | null>(null);
  // Mentoria — extra form fields and UI state
  const [mentoriaDuration, setMentoriaDuration] = useState('');
  const [showAllSessions, setShowAllSessions] = useState(false);
  // Pipeline (standard) — controlled add deal input
  const [newDealName, setNewDealName] = useState('');
  // 4DX — lag metric setup form
  const [fourdxLagName, setFourdxLagName] = useState('');
  const [fourdxLagUnit, setFourdxLagUnit] = useState('');
  const [fourdxLead1, setFourdxLead1] = useState('');
  const [fourdxLead2, setFourdxLead2] = useState('');
  const [fourdxSetupUnit, setFourdxSetupUnit] = useState('');
  // Decisão — inline score editing + controlled weight inputs
  const [decisionNewOption, setDecisionNewOption] = useState('');
  const [decisionNewCriteria, setDecisionNewCriteria] = useState('');
  const [decisionEditScores, setDecisionEditScores] = useState<Record<string, string>>({});
  const [decisionWeightValues, setDecisionWeightValues] = useState<Record<string, string>>({});
  // Cenário — scenario selection when adding actions
  const [scenarioDraftIds, setScenarioDraftIds] = useState<string[]>([]);
  // OKR — KR update inputs (controlled, keyed by KR id)
  const [krUpdateValues, setKrUpdateValues] = useState<Record<string, string>>({});
  const [newKrDesc, setNewKrDesc] = useState('');
  const [newKrTarget, setNewKrTarget] = useState('');
  const [newKrUnit, setNewKrUnit] = useState('');
  // Campanha — controlled task input + result editing
  const [campaignNewTask, setCampaignNewTask] = useState('');
  const [campaignResultEdit, setCampaignResultEdit] = useState<string | null>(null);
  // Captação (financial pipeline) — controlled deal input + amount/prob
  const [financialNewDealName, setFinancialNewDealName] = useState('');
  const [financialNewDealAmount, setFinancialNewDealAmount] = useState('');
  const [financialNewDealProb, setFinancialNewDealProb] = useState('50');
  // Runway — inline editing of cash and burn rate
  const [runwayEditCash, setRunwayEditCash] = useState('');
  const [runwayEditBurn, setRunwayEditBurn] = useState('');
  const [runwayEditingField, setRunwayEditingField] = useState<'cash' | 'burn' | null>(null);
  // Funil engine
  const [funilValueEditing, setFunilValueEditing] = useState<Record<string, string>>({});
  const [funilNewStageLabel, setFunilNewStageLabel] = useState('');
  const [frameworkLeadOneDone, setFrameworkLeadOneDone] = useState(false);
  const [frameworkLeadTwoDone, setFrameworkLeadTwoDone] = useState(false);
  const [frameworkLagValue, setFrameworkLagValue] = useState('');
  const [frameworkNote, setFrameworkNote] = useState('');
  const [frameworkExtraDraft, setFrameworkExtraDraft] = useState<Record<string, string | boolean>>({});

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
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [createTaskProjectId, setCreateTaskProjectId] = useState('');
  const [methodologyPickerOpen, setMethodologyPickerOpen] = useState(false);
  const [methodologyGuideOpen, setMethodologyGuideOpen] = useState<ProjectMethodology | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [createEntity, setCreateEntity] = useState<CreateEntity>('project');
  const [projectCreateStep, setProjectCreateStep] = useState<ProjectCreateStep>(1);
  const [showProjectGuide, setShowProjectGuide] = useState(() => {
    try {
      return window.localStorage.getItem('operis_project_guide_hidden') !== '1';
    } catch (_error) {
      return true;
    }
  });
  const [showProjectsOverviewGuide, setShowProjectsOverviewGuide] = useState(() => {
    try {
      return window.localStorage.getItem('operis_projects_overview_guide_hidden') !== '1';
    } catch (_error) {
      return true;
    }
  });
  const [guideManuallyOpen, setGuideManuallyOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [projectOverflowOpen, setProjectOverflowOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completionTask = tasks.find((task) => task.id === completionTaskId) ?? null;

  function resetProjectDraft(methodology: ProjectMethodology) {
    setNewProjectTitle('');
    setNewProjectDescription('');
    setNewProjectType(methodology === 'delivery' || methodology === 'discovery' || methodology === 'entrega' || methodology === 'exploracao' ? 'construcao' : 'crescimento');
    setNewProjectMethodology(methodology);
    setNewProjectObjective('');
    setNewProjectMetric('');
    setNewProjectLeadMeasure1('');
    setNewProjectLeadMeasure2('');
    setNewProjectExtraOne('');
    setNewProjectExtraTwo('');
    setNewProjectTimeHorizonEnd('');
    setNewProjectResultStartValue('');
    setNewProjectResultTargetValue('');
    const legacyMeta = PROJECT_METHODOLOGY_CREATE_META[methodology as keyof typeof PROJECT_METHODOLOGY_CREATE_META];
    setNewProjectCadenceDays(String(legacyMeta?.cadenceSuggestion ?? 7));
    setNewProjectStatus('ativo');
    setWizardDraft({});
    setProjectCreateStep(2);
  }

  async function load(baseWorkspaceId?: string) {
    try {
      setError(null);
      const workspaceData = await api.getWorkspaces();
      const selectableWorkspaces = workspaceData.filter((workspace) => workspace.type !== 'geral');
      const selectableIds = new Set(selectableWorkspaces.map((workspace) => workspace.id));

      const preferredWorkspace: 'all' | string =
        baseWorkspaceId === 'all'
          ? 'all'
          : baseWorkspaceId && selectableIds.has(baseWorkspaceId)
            ? baseWorkspaceId
            : scopedWorkspaceId && selectableIds.has(scopedWorkspaceId)
              ? scopedWorkspaceId
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
    load(scopedWorkspaceId ?? 'all');
  }, [activeWorkspaceId, projectRouteId]);

  function openCreateModal(entity: CreateEntity) {
    setCreateEntity(entity);
    if (entity === 'task' && selectedProjectId) {
      setCreateTaskProjectId(selectedProjectId);
    }
    if (entity === 'project') {
      setProjectCreateStep(1);
      setMethodologyGuideOpen(null);
      setMethodologyPickerOpen(true);
      return;
    }
    setCreateModalOpen(true);
  }

  function startCreateProjectWithMethodology(methodology: ProjectMethodology) {
    resetProjectDraft(methodology);
    setMethodologyGuideOpen(null);
    setMethodologyPickerOpen(false);
    setCreateEntity('project');
    setCreateModalOpen(true);
  }

  function openProjectDetail(projectId: string) {
    setSelectedProjectId(projectId);
    setCreateTaskProjectId(projectId);
    navigate(`/projetos/${projectId}`);
  }

  function dismissProjectGuide() {
    setShowProjectGuide(false);
    try {
      window.localStorage.setItem('operis_project_guide_hidden', '1');
    } catch (_error) {
      // no-op
    }
  }

  function dismissProjectsOverviewGuide() {
    setShowProjectsOverviewGuide(false);
    try {
      window.localStorage.setItem('operis_projects_overview_guide_hidden', '1');
    } catch (_error) {
      // no-op
    }
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
  const selectedProjectMethodology = (selectedProject?.methodology ?? 'fourdx') as keyof typeof PROJECT_METHODOLOGY_META;
  const legacyMethodologyKey = (Object.keys(PROJECT_METHODOLOGY_META) as ProjectMethodology[]).includes(selectedProject?.methodology ?? 'fourdx')
    ? (selectedProject?.methodology ?? 'fourdx') as keyof typeof PROJECT_METHODOLOGY_META
    : 'fourdx' as const;
  const selectedProjectMethodologyMeta = PROJECT_METHODOLOGY_META[legacyMethodologyKey] ?? PROJECT_METHODOLOGY_META['fourdx']!;
  const selectedProjectDetailMeta = PROJECT_METHODOLOGY_DETAIL_META[legacyMethodologyKey] ?? PROJECT_METHODOLOGY_DETAIL_META['fourdx']!;
  const frameworkExtraFields = useMemo(
    () => frameworkExtraFieldsForMethodology(legacyMethodologyKey),
    [legacyMethodologyKey]
  );
  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === selectedProjectId),
    [tasks, selectedProjectId]
  );
  const projectOpsSnapshot = useMemo(() => {
    const now = Date.now();
    const openTasks = projectTasks.filter((task) => task.status !== 'feito');
    const doneTasks = projectTasks.filter((task) => task.status === 'feito');
    const inProgressTasks = projectTasks.filter((task) => task.status === 'andamento');
    const overdueTasks = openTasks.filter((task) => {
      if (!task.dueDate) {
        return false;
      }
      const due = new Date(task.dueDate).getTime();
      return Number.isFinite(due) && due < now;
    });
    const restrictedTasks = openTasks.filter((task) =>
      (task.restrictions ?? []).some((restriction) => restriction.status === 'aberta')
    );

    return {
      total: projectTasks.length,
      open: openTasks.length,
      done: doneTasks.length,
      inProgress: inProgressTasks.length,
      overdue: overdueTasks.length,
      restricted: restrictedTasks.length
    };
  }, [projectTasks]);
  const scorecardLeadMetrics = useMemo(
    () => projectScorecard?.metrics.filter((metric) => metric.kind === 'lead') ?? [],
    [projectScorecard]
  );
  const scorecardLagMetrics = useMemo(
    () => projectScorecard?.metrics.filter((metric) => metric.kind === 'lag') ?? [],
    [projectScorecard]
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

    if (compliance >= 80 && missing === 0) {
      return {
        label: 'Tração forte',
        tone: 'feito' as const,
        reason: `Lead compliance ${compliance}% com check-ins da semana em dia.`
      };
    }

    if (compliance >= 50) {
      return {
        label: 'Tração parcial',
        tone: 'andamento' as const,
        reason: `Lead compliance ${compliance}% • ${missing} check-in(s) pendente(s).`
      };
    }

    return {
      label: 'Tração frágil',
      tone: 'backlog' as const,
      reason: 'Sem disciplina semanal de lead registrada no scorecard.'
    };
  }, [projectScorecard]);
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
  const leadWeeklySeries = useMemo(() => {
    if (scorecardLeadMetrics.length === 0) {
      return [] as Array<{
        week: string;
        weekStart: string;
        done: number;
        missed: number;
        total: number;
        compliance: number;
      }>;
    }

    const weekKeys =
      scorecardWeekOptions.length > 0
        ? scorecardWeekOptions.map((week) => week.weekStart)
        : Array.from(
            new Set(scorecardLeadMetrics.flatMap((metric) => metric.history.map((entry) => entry.weekStart)))
          ).sort((left, right) => left.localeCompare(right));

    return weekKeys.map((weekStart, index) => {
      let done = 0;
      let missed = 0;
      scorecardLeadMetrics.forEach((metric) => {
        const checkin = metric.history.find((entry) => entry.weekStart === weekStart);
        if (!checkin) {
          return;
        }
        if (checkin.value > 0) {
          done += 1;
        } else {
          missed += 1;
        }
      });

      const total = scorecardLeadMetrics.length;
      return {
        week: `S${index + 1}`,
        weekStart,
        done,
        missed,
        total,
        compliance: Math.round((done / Math.max(1, total)) * 100)
      };
    });
  }, [scorecardLeadMetrics, scorecardWeekOptions]);
  const leadDoneInWeek = useMemo(
    () =>
      scorecardLeadMetrics.reduce((total, metric) => {
        const checkedValue = metric.weekCheckin?.value ?? null;
        return total + (checkedValue !== null && checkedValue > 0 ? 1 : 0);
      }, 0),
    [scorecardLeadMetrics]
  );
  const leadMissingInWeek = Math.max(0, scorecardLeadMetrics.length - leadDoneInWeek);
  const lagRecentVelocity = useMemo(() => {
    if (!primaryLagMetric || primaryLagMetric.history.length < 2) {
      return null;
    }

    const sorted = [...primaryLagMetric.history].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
    const current = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    return Number((current.value - previous.value).toFixed(2));
  }, [primaryLagMetric]);
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
  const lagBurndownSeries = useMemo(() => {
    return lagProjectionData.map((point) => {
      const remaining =
        typeof point.target === 'number' && typeof point.real === 'number'
          ? Math.max(0, Number((point.target - point.real).toFixed(2)))
          : null;
      return {
        week: point.week,
        weekRange: point.weekRange,
        remaining,
        real: point.real,
        target: point.target
      };
    });
  }, [lagProjectionData]);
  const lagMomentumSeries = useMemo(() => {
    if (!primaryLagMetric) {
      return [] as Array<{ week: string; weekStart: string; delta: number; value: number }>;
    }

    const sorted = [...primaryLagMetric.history].sort((left, right) =>
      left.weekStart.localeCompare(right.weekStart)
    );

    return sorted.map((entry, index) => {
      const previous = sorted[index - 1];
      return {
        week: `S${index + 1}`,
        weekStart: entry.weekStart,
        delta: Number((entry.value - (previous?.value ?? entry.value)).toFixed(2)),
        value: entry.value
      };
    });
  }, [primaryLagMetric]);
  const projectRanking = useMemo(() => {
    return projects
      .map((project) => {
        const scopedTasks = tasks.filter((task) => task.projectId === project.id && task.status !== 'arquivado');
        const lagProgress = calculateLagProgressPercent(project);
        const cadenceDays = Math.max(1, project.scorecardCadenceDays ?? 7);
        const daysSinceCheckin = daysSinceTimestamp(project.lastScorecardCheckinAt);
        const cadenceOnTrack = daysSinceCheckin !== null && daysSinceCheckin <= cadenceDays;
        const disconnected = scopedTasks.filter((task) => !task.projectId).length;

        let strategicScore = (lagProgress ?? 0) + scopedTasks.length;
        strategicScore += cadenceOnTrack ? 30 : 0;

        if (project.status === 'ativo') {
          strategicScore += 12;
        }
        if (project.status === 'fantasma') {
          strategicScore -= 20;
        }
        if (project.status === 'latente' || project.status === 'pausado') {
          strategicScore -= 8;
        }

        const summary = methodologyCardSummary({
          project,
          lagProgress,
          cadenceOnTrack,
          daysSinceCheckin
        });

        return {
          project,
          totalTasks: scopedTasks.length,
          lagProgress,
          cadenceDays,
          daysSinceCheckin,
          cadenceOnTrack,
          disconnected,
          summary,
          strategicScore: Math.max(0, Math.round(strategicScore))
        };
      })
      .sort((left, right) => right.strategicScore - left.strategicScore);
  }, [projects, tasks]);

  const strategicActiveLoad = useMemo(
    () =>
      projectRanking.filter(
        (entry) =>
          entry.project.status === 'ativo' &&
          !entry.cadenceOnTrack &&
          (entry.daysSinceCheckin ?? Number.MAX_SAFE_INTEGER) > entry.cadenceDays
      ).length,
    [projectRanking]
  );
  const projectSelectionCards = useMemo(() => {
    if (projectRanking.length > 0) {
      return projectRanking;
    }

    return projects.map((project) => {
      const scopedTasks = tasks.filter((task) => task.projectId === project.id && task.status !== 'arquivado');

      const lagProgress = calculateLagProgressPercent(project);
      const cadenceDays = Math.max(1, project.scorecardCadenceDays ?? 7);
      const daysSinceCheckin = daysSinceTimestamp(project.lastScorecardCheckinAt);
      const cadenceOnTrack = false;

      return {
        project,
        totalTasks: scopedTasks.length,
        lagProgress,
        cadenceDays,
        daysSinceCheckin,
        cadenceOnTrack,
        disconnected: 0,
        summary: methodologyCardSummary({
          project,
          lagProgress,
          cadenceOnTrack,
          daysSinceCheckin
        }),
        strategicScore: 0
      };
    });
  }, [projectRanking, projects, tasks]);

  // ── Constants & helpers for new engine wizard ────────────────────────
  const LEGACY_WIZARD_KEYS: ProjectMethodology[] = ['fourdx', 'delivery', 'launch', 'discovery', 'growth'];

  function buildMethodologyDataFromDraft(draft: Record<string, string | string[]>, typeConfig: ReturnType<typeof getProjectTypeConfig>): import('../api').MethodologyData {
    if (!typeConfig) return {};
    const { engine, engineVariant: variant } = typeConfig;
    const str = (k: string): string => (draft[k] as string) ?? '';
    const arr = (k: string): string[] => (draft[k] as string[]) ?? [];
    const num = (k: string): number => Number(draft[k] ?? 0);
    const uid = () => crypto.randomUUID();

    if (engine === 'milestone' && variant === 'authority') {
      return { proofs: [] };
    }
    if (engine === 'milestone') {
      return {
        milestones: arr('milestones').filter(Boolean).map((title, i) => ({
          id: uid(),
          title,
          done: false,
          critical: false,
          order: i,
        })),
      };
    }
    if (engine === 'log' && variant === 'discovery') {
      return {
        hypothesis: str('hypothesis'),
        hypothesisCriteria: str('hypothesisCriteria'),
        discoveries: [],
        decision: null,
      };
    }
    if (engine === 'log' && variant === 'coaching') {
      return { sessions: [] };
    }
    if (engine === 'pipeline') {
      const defaultStages = variant === 'linear'
        ? ['Ideia', 'Validação', '1° Cliente', 'Escala']
        : variant === 'financial'
          ? ['Prospecção', 'Reunião', 'Term Sheet', 'Fechado']
          : ['Prospecção', 'Qualificação', 'Proposta', 'Fechado'];
      const stageLabels = arr('stages').filter(Boolean);
      const stages = (stageLabels.length > 0 ? stageLabels : defaultStages)
        .map((label, i) => ({ id: uid(), label, order: i }));
      return {
        stages,
        deals: [],
        totalGoal: str('resultTargetValue') ? num('resultTargetValue') : undefined,
      };
    }
    if (engine === 'composite') {
      return {
        okrPeriod: str('okrPeriod'),
        krs: arr('krs').filter(Boolean).map((description, i) => ({
          id: uid(),
          description,
          currentValue: 0,
          targetValue: 100,
          unit: null,
          confidence: 'media' as const,
          order: i,
        })),
      };
    }
    if (engine === 'decision' && variant === 'scenario') {
      return {
        scenarios: arr('scenarios').filter(Boolean).map((label) => ({ id: uid(), label })),
        scenarioActions: [],
        scenarioDecisionDate: str('timeHorizonEnd') || null,
      };
    }
    if (engine === 'decision') {
      return {
        options: arr('options').filter(Boolean).map((label) => ({ id: uid(), label, scores: {} })),
        criteria: arr('criteria').filter(Boolean).map((label) => ({ id: uid(), label, weight: 1 })),
        decisionChoice: null,
      };
    }
    if (engine === 'time' && variant === 'campaign') {
      return {
        campaignChannel: str('campaignChannel') || null,
        campaignGoal: str('resultTargetValue') ? num('resultTargetValue') : null,
        campaignResult: 0,
        dailyTasks: [],
        launchDate: str('launchDate') || null,
      };
    }
    if (engine === 'time' && variant === 'runway') {
      return {
        availableCash: num('availableCash'),
        burnRateMonthly: num('burnRateMonthly'),
        runwayEvents: [],
      };
    }
    if (engine === 'recurring') {
      return {
        frequency: (str('frequency') as 'semanal' | 'mensal' | 'trimestral') || 'mensal',
        cycleTemplate: arr('cycleTemplate').filter(Boolean).map((text, i) => ({ id: uid(), text, order: i })),
        cycles: [],
      };
    }
    if (engine === 'funnel') {
      return {
        funilStages: arr('stages').filter(Boolean).map((label, i) => ({ id: uid(), label, value: null, order: i })),
      };
    }
    return {};
  }

  function validateProjectDraftForWizard() {
    if (!workspaceId || workspaceId === 'all') {
      return 'Selecione uma frente antes de criar projeto.';
    }

    if (!newProjectTitle.trim()) {
      return 'Defina o nome do projeto.';
    }

    // New engine types — validate from wizardDraft using wizardFields config
    if (!LEGACY_WIZARD_KEYS.includes(newProjectMethodology)) {
      const typeConfig = getProjectTypeConfig(newProjectMethodology);
      if (typeConfig) {
        for (const field of typeConfig.wizardFields) {
          if (!field.required) continue;
          const val = wizardDraft[field.key];
          const isEmpty = !val || (typeof val === 'string' && !val.trim()) || (Array.isArray(val) && val.filter(Boolean).length === 0);
          if (isEmpty) {
            return `Preencha "${field.label}" para continuar.`;
          }
        }
      }
      return null;
    }

    const methodologyCreateMeta = PROJECT_METHODOLOGY_CREATE_META[newProjectMethodology] ?? PROJECT_METHODOLOGY_CREATE_META['fourdx']!;
    const objectiveInput = newProjectObjective.trim();
    const leadMeasureOneInput = newProjectLeadMeasure1.trim();
    const leadMeasureTwoInput = newProjectLeadMeasure2.trim();
    const lagMetricInput = newProjectMetric.trim();
    const extraOneInput = newProjectExtraOne.trim();
    const extraTwoInput = newProjectExtraTwo.trim();

    if (!objectiveInput) {
      return `Preencha "${methodologyCreateMeta.objectiveLabel}" para criar o projeto.`;
    }

    if (methodologyCreateMeta.requireObjectiveRegex4dx && !objective4dxIsValid(objectiveInput)) {
      return 'Objetivo claro deve seguir o formato 4DX: "de X para Y em Z tempo".';
    }

    if (methodologyCreateMeta.requireLeadPair && (!leadMeasureOneInput || !leadMeasureTwoInput)) {
      return `Defina ${methodologyCreateMeta.leadOneLabel} e ${methodologyCreateMeta.leadTwoLabel} antes de avançar.`;
    }

    if (methodologyCreateMeta.requireLagMetric && !lagMetricInput) {
      return `Preencha "${methodologyCreateMeta.lagMetricLabel}" para fechar o placar do projeto.`;
    }

    if (methodologyCreateMeta.extraOneRequired && !extraOneInput) {
      return `Preencha "${methodologyCreateMeta.extraOneLabel}" para avançar.`;
    }

    if (methodologyCreateMeta.extraTwoRequired && !extraTwoInput) {
      return `Preencha "${methodologyCreateMeta.extraTwoLabel}" para avançar.`;
    }

    if (methodologyCreateMeta.requireDeadline && !newProjectTimeHorizonEnd) {
      return 'Defina o prazo final para iniciar este projeto com clareza.';
    }

    const startValueInput = parseOptionalNumberInput(newProjectResultStartValue);
    const targetValueInput = parseOptionalNumberInput(newProjectResultTargetValue);
    if (!startValueInput.valid || !targetValueInput.valid) {
      return 'Medidas históricas devem ser numéricas (ex: 0, 300, 10000).';
    }

    if (methodologyCreateMeta.requireLagStart && startValueInput.value === null) {
      return `Informe o valor inicial para "${methodologyCreateMeta.lagMetricLabel}".`;
    }

    if (methodologyCreateMeta.requireLagTarget && targetValueInput.value === null) {
      return `Informe a meta alvo para "${methodologyCreateMeta.lagMetricLabel}".`;
    }

    if (
      methodologyCreateMeta.requireLagStart &&
      methodologyCreateMeta.requireLagTarget &&
      startValueInput.value !== null &&
      targetValueInput.value !== null &&
      startValueInput.value === targetValueInput.value
    ) {
      return 'Valor inicial e meta alvo não podem ser iguais.';
    }

    return null;
  }

  function moveProjectCreateToPreview() {
    const validationError = validateProjectDraftForWizard();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setProjectCreateStep(3);
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();

    if (projectCreateStep !== 3) {
      moveProjectCreateToPreview();
      return;
    }

    const wizardValidationError = validateProjectDraftForWizard();
    if (wizardValidationError) {
      setError(wizardValidationError);
      setProjectCreateStep(2);
      return;
    }

    if (!workspaceId || workspaceId === 'all') {
      setError('Selecione uma frente antes de criar projeto.');
      return;
    }

    // ── NEW ENGINE TYPES: build from wizardDraft ──────────────────────────
    if (!LEGACY_WIZARD_KEYS.includes(newProjectMethodology)) {
      const typeConfig = getProjectTypeConfig(newProjectMethodology);
      if (!typeConfig) {
        setError('Tipo de projeto não reconhecido.');
        return;
      }
      const methodologyData = buildMethodologyDataFromDraft(wizardDraft, typeConfig);
      const objectiveFromDraft = (wizardDraft.objective as string ?? '').trim() || `${typeConfig.label}: objetivo pendente`;
      const deadlineFromDraft = (wizardDraft.timeHorizonEnd as string) || (wizardDraft.launchDate as string) || null;
      const targetFromDraft = wizardDraft.resultTargetValue ? Number(wizardDraft.resultTargetValue) : null;
      const startFromDraft = wizardDraft.resultStartValue ? Number(wizardDraft.resultStartValue) : 0;
      try {
        setBusy(true);
        const selectedMethodology = newProjectMethodology;
        const extraOne = (wizardDraft.methodologyExtraOne as string)?.trim() || null;
        const created = await api.createProject({
          workspaceId,
          title: newProjectTitle,
          description: newProjectDescription.trim() || null,
          type: newProjectType,
          methodology: newProjectMethodology,
          objective: objectiveFromDraft,
          methodologyData,
          methodologyExtraOne: extraOne,
          timeHorizonEnd: deadlineFromDraft ? new Date(`${deadlineFromDraft}T23:59:00`).toISOString() : null,
          resultStartValue: startFromDraft,
          resultCurrentValue: startFromDraft,
          resultTargetValue: targetFromDraft,
          scorecardCadenceDays: 7,
          status: newProjectStatus,
        });
        setSelectedProjectId(created.id);
        resetProjectDraft(selectedMethodology);
        setCreateModalOpen(false);
        await refreshGlobal();
        await load(workspaceId);
        return;
      } catch (requestError) {
        setError((requestError as Error).message);
        return;
      } finally {
        setBusy(false);
      }
    }

    const methodologyMeta = PROJECT_METHODOLOGY_META[newProjectMethodology] ?? PROJECT_METHODOLOGY_META['fourdx']!;
    const methodologyCreateMeta = PROJECT_METHODOLOGY_CREATE_META[newProjectMethodology] ?? PROJECT_METHODOLOGY_CREATE_META['fourdx']!;
    const objectiveInput = newProjectObjective.trim();
    const leadMeasureOneInput = newProjectLeadMeasure1.trim();
    const leadMeasureTwoInput = newProjectLeadMeasure2.trim();
    const lagMetricInput = newProjectMetric.trim();
    const extraOneInput = newProjectExtraOne.trim();
    const extraTwoInput = newProjectExtraTwo.trim();

    if (!objectiveInput) {
      setError(`Preencha "${methodologyCreateMeta.objectiveLabel}" para criar o projeto.`);
      return;
    }

    if (methodologyCreateMeta.requireObjectiveRegex4dx && !objective4dxIsValid(objectiveInput)) {
      setError('Objetivo claro deve seguir o formato 4DX: "de X para Y em Z tempo".');
      return;
    }

    if (
      methodologyCreateMeta.requireLeadPair &&
      (!leadMeasureOneInput || !leadMeasureTwoInput)
    ) {
      setError(
        `Defina ${methodologyCreateMeta.leadOneLabel} e ${methodologyCreateMeta.leadTwoLabel} antes de criar o projeto.`
      );
      return;
    }

    if (methodologyCreateMeta.requireLagMetric && !lagMetricInput) {
      setError(`Preencha "${methodologyCreateMeta.lagMetricLabel}" para fechar o placar do projeto.`);
      return;
    }

    if (methodologyCreateMeta.extraOneRequired && !extraOneInput) {
      setError(`Preencha "${methodologyCreateMeta.extraOneLabel}" para criar este tipo de projeto.`);
      return;
    }

    if (methodologyCreateMeta.extraTwoRequired && !extraTwoInput) {
      setError(`Preencha "${methodologyCreateMeta.extraTwoLabel}" para criar este tipo de projeto.`);
      return;
    }

    if (methodologyCreateMeta.requireDeadline && !newProjectTimeHorizonEnd) {
      setError('Defina o prazo final para iniciar este projeto com clareza.');
      return;
    }

    const startValueInput = parseOptionalNumberInput(newProjectResultStartValue);
    const targetValueInput = parseOptionalNumberInput(newProjectResultTargetValue);
    if (!startValueInput.valid || !targetValueInput.valid) {
      setError('Medidas históricas devem ser numéricas (ex: 0, 300, 10000).');
      return;
    }

    if (methodologyCreateMeta.requireLagStart && startValueInput.value === null) {
      setError(`Informe o valor inicial para "${methodologyCreateMeta.lagMetricLabel}".`);
      return;
    }

    if (methodologyCreateMeta.requireLagTarget && targetValueInput.value === null) {
      setError(`Informe a meta alvo para "${methodologyCreateMeta.lagMetricLabel}".`);
      return;
    }

    if (
      methodologyCreateMeta.requireLagStart &&
      methodologyCreateMeta.requireLagTarget &&
      startValueInput.value !== null &&
      targetValueInput.value !== null &&
      startValueInput.value === targetValueInput.value
    ) {
      setError('Valor inicial e meta alvo não podem ser iguais.');
      return;
    }

    const cadenceDays = Math.max(1, Math.min(14, Number(newProjectCadenceDays) || methodologyCreateMeta.cadenceSuggestion));
    const resultStartValue =
      startValueInput.value ?? (methodologyCreateMeta.requireLagStart ? null : 0);
    const resultTargetValue = targetValueInput.value;
    const resultCurrentValue = resultStartValue;
    const leadMetric1 = leadMeasureOneInput || methodologyMeta.leadOnePlaceholder.replace(/^Ex:\s*/i, '');
    const leadMetric2 = leadMeasureTwoInput || methodologyMeta.leadTwoPlaceholder.replace(/^Ex:\s*/i, '');
    const lagMetricName = lagMetricInput || methodologyMeta.lagPlaceholder.replace(/^Ex:\s*/i, '');
    const objective = objectiveInput || `${methodologyMeta.label}: objetivo pendente de refinamento`;
    const actionStatement = buildMethodologyActionStatement({
      methodology: newProjectMethodology,
      leadOne: leadMetric1,
      leadTwo: leadMetric2,
      extraOne: extraOneInput,
      extraTwo: extraTwoInput
    });
    if (actionStatement.length > 240) {
      setError('Plano operacional ficou longo demais. Resuma os campos extras em até 240 caracteres totais.');
      return;
    }
    try {
      setBusy(true);
      const selectedMethodology = newProjectMethodology;
      const created = await api.createProject({
        workspaceId,
        title: newProjectTitle,
        description: newProjectDescription.trim() || null,
        type: newProjectType,
        methodology: newProjectMethodology,
        objective,
        primaryMetric: lagMetricName,
        actionStatement,
        methodologyExtraOne: extraOneInput || null,
        methodologyExtraTwo: extraTwoInput || null,
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
      resetProjectDraft(selectedMethodology);
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
        dueDate: newTaskDueDate
          ? new Date(`${newTaskDueDate}T12:00:00.000Z`).toISOString()
          : null,
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
      setNewTaskDueDate('');
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

  function requestTaskCompletion(taskId: string) {
    setCompletionTaskId(taskId);
  }

  async function confirmTaskCompletion(input: {
    completionMode: 'note' | 'no_note';
    completionNote?: string;
  }) {
    if (!completionTaskId) {
      return;
    }

    try {
      setBusy(true);
      await api.completeTask(completionTaskId, {
        completionMode: input.completionMode,
        completionNote: input.completionNote
      });
      await load(workspaceId);
      setCompletionTaskId('');
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

  async function submitFrameworkWeeklyCheckin() {
    if (!selectedProject) {
      return;
    }

    const leadMetrics = scorecardLeadMetrics;
    if (leadMetrics.length < 2 || !primaryLagMetric) {
      setError('Scorecard incompleto: defina 2 métricas lead e 1 lag para usar o check-in guiado.');
      return;
    }

    const lagValueNormalized = frameworkLagValue.trim().replace(',', '.');
    const lagValue =
      lagValueNormalized.length > 0
        ? Number(lagValueNormalized)
        : null;

    if (lagValueNormalized.length > 0 && !Number.isFinite(lagValue)) {
      setError('Valor da métrica da semana precisa ser numérico.');
      return;
    }

    const extraPayload: Record<string, string | number | boolean | null> = {};
    frameworkExtraFields.forEach((field) => {
      const raw = frameworkExtraDraft[field.key];
      if (field.kind === 'checkbox') {
        extraPayload[field.key] = raw === true;
        return;
      }
      const stringValue = typeof raw === 'string' ? raw.trim() : '';
      if (!stringValue) {
        extraPayload[field.key] = null;
        return;
      }
      if (field.kind === 'number') {
        const numeric = Number(stringValue.replace(',', '.'));
        extraPayload[field.key] = Number.isFinite(numeric) ? numeric : null;
        return;
      }
      extraPayload[field.key] = stringValue;
    });

    try {
      setBusy(true);
      setError(null);
      await api.createProjectFrameworkCheckin(selectedProject.id, {
        weekStart: scorecardWeekStart,
        leadOneDone: frameworkLeadOneDone,
        leadTwoDone: frameworkLeadTwoDone,
        lagValue,
        note: frameworkNote.trim() || null,
        extra: extraPayload
      });
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
    if (selectedWorkspaceMode === 'manutencao' && isStrategicExecutionKind(newTaskExecutionKind)) {
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

  useEffect(() => {
    if (!projectScorecard) {
      return;
    }

    const weekly = projectScorecard.framework.weekly;
    const leadMetrics = projectScorecard.metrics.filter((metric) => metric.kind === 'lead');
    const lagMetric = projectScorecard.metrics.find((metric) => metric.kind === 'lag') ?? null;
    const leadOneMetricWeekValue = (leadMetrics[0]?.weekCheckin?.value ?? 0) > 0;
    const leadTwoMetricWeekValue = (leadMetrics[1]?.weekCheckin?.value ?? 0) > 0;
    const lagMetricWeekValue = lagMetric?.weekCheckin?.value;

    setFrameworkLeadOneDone(weekly?.leadOneDone ?? leadOneMetricWeekValue);
    setFrameworkLeadTwoDone(weekly?.leadTwoDone ?? leadTwoMetricWeekValue);
    setFrameworkLagValue(
      weekly?.lagValue !== null && weekly?.lagValue !== undefined
        ? String(weekly.lagValue)
        : lagMetricWeekValue !== undefined && lagMetricWeekValue !== null
          ? String(lagMetricWeekValue)
          : ''
    );
    setFrameworkNote(weekly?.note ?? '');

    const extras: Record<string, string | boolean> = {};
    const source = weekly?.extra ?? {};
    frameworkExtraFields.forEach((field) => {
      const raw = source[field.key];
      if (field.kind === 'checkbox') {
        extras[field.key] = raw === true;
      } else if (raw === null || raw === undefined) {
        extras[field.key] = '';
      } else {
        extras[field.key] = String(raw);
      }
    });
    setFrameworkExtraDraft(extras);
  }, [projectScorecard, frameworkExtraFields]);

  const methodologyKeys = Object.keys(PROJECT_METHODOLOGY_META) as ProjectMethodology[];

  function reopenMethodologyPickerFromForm() {
    setCreateModalOpen(false);
    setProjectCreateStep(1);
    setMethodologyGuideOpen(null);
    setMethodologyPickerOpen(true);
  }

  // ── Wizard field renderer for new engine types ─────────────────────────
  function renderWizardField(field: WizardField) {
    const strVal = (wizardDraft[field.key] as string) ?? '';
    const arrVal = (wizardDraft[field.key] as string[]) ?? [];
    const setStr = (v: string) => setWizardDraft(d => ({ ...d, [field.key]: v }));
    const setArr = (v: string[]) => setWizardDraft(d => ({ ...d, [field.key]: v }));

    if (field.type === 'text' || field.type === 'structured-goal') {
      return (
        <label key={field.key}>
          {field.label}
          <input
            value={strVal}
            onChange={e => setStr(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
          {field.hint && <small>{field.hint}</small>}
        </label>
      );
    }
    if (field.type === 'textarea') {
      return (
        <label key={field.key}>
          {field.label}
          <textarea
            value={strVal}
            onChange={e => setStr(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
          {field.hint && <small>{field.hint}</small>}
        </label>
      );
    }
    if (field.type === 'number') {
      return (
        <label key={field.key}>
          {field.label}
          <input
            type="number"
            value={strVal}
            onChange={e => setStr(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
          {field.hint && <small>{field.hint}</small>}
        </label>
      );
    }
    if (field.type === 'date') {
      return (
        <label key={field.key}>
          {field.label}
          <input
            type="date"
            value={strVal}
            onChange={e => setStr(e.target.value)}
            required={field.required}
          />
        </label>
      );
    }
    if (field.type === 'select') {
      return (
        <label key={field.key}>
          {field.label}
          <select value={strVal} onChange={e => setStr(e.target.value)}>
            {(field.options ?? []).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {field.hint && <small>{field.hint}</small>}
        </label>
      );
    }
    if (field.type === 'dynamic-list' || field.type === 'dynamic-stages') {
      const isStage = field.type === 'dynamic-stages';
      return (
        <div key={field.key} className="wizard-dynamic-list">
          <label className="wizard-dynamic-label">{field.label}</label>
          {arrVal.map((item, i) => (
            <div key={i} className="wizard-dynamic-item">
              <input
                value={item}
                onChange={e => {
                  const next = [...arrVal];
                  next[i] = e.target.value;
                  setArr(next);
                }}
                placeholder={field.placeholder}
              />
              <button
                type="button"
                className="text-button wizard-dynamic-remove"
                onClick={() => setArr(arrVal.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ghost-button wizard-dynamic-add"
            onClick={() => setArr([...arrVal, ''])}
          >
            + {isStage ? 'Estágio' : 'Item'}
          </button>
          {field.hint && <small className="wizard-dynamic-hint">{field.hint}</small>}
        </div>
      );
    }
    return null;
  }

  function renderProjectCreateForm() {
    const isLegacy = LEGACY_WIZARD_KEYS.includes(newProjectMethodology);
    const typeConfig = getProjectTypeConfig(newProjectMethodology);
    const methodologyMeta = PROJECT_METHODOLOGY_META[newProjectMethodology] ?? PROJECT_METHODOLOGY_META['fourdx']!;
    const createMeta = PROJECT_METHODOLOGY_CREATE_META[newProjectMethodology] ?? PROJECT_METHODOLOGY_CREATE_META['fourdx']!;
    const methodPreview = PROJECT_METHOD_PANEL_PREVIEW[newProjectMethodology] ?? PROJECT_METHOD_PANEL_PREVIEW['fourdx']!;

    // Header badge for both legacy and new types
    const typeLabel = typeConfig ? typeConfig.label : methodologyMeta.label;
    const typeTagline = typeConfig?.tagline ?? methodologyMeta.subtitle;

    return (
      <form className="minimal-form" onSubmit={createProject}>
        {/* Step progress */}
        <div className="project-create-steps">
          {PROJECT_CREATE_STEP_LABELS.map((entry) => (
            <span
              key={entry.step}
              className={
                entry.step === projectCreateStep
                  ? 'project-create-step active'
                  : entry.step < projectCreateStep
                    ? 'project-create-step done'
                    : 'project-create-step'
              }
            >
              {entry.label}
            </span>
          ))}
        </div>

        {/* Current type badge */}
        <div className="project-methodology-current compact">
          <div className="project-methodology-current-head">
            <div className="project-methodology-title">
              <ProjectMethodologyIcon methodology={newProjectMethodology} size={17} />
              <strong>{typeLabel}</strong>
            </div>
            <small>{typeTagline}</small>
          </div>
          <button type="button" className="ghost-button" onClick={reopenMethodologyPickerFromForm}>
            Trocar tipo
          </button>
        </div>

        {projectCreateStep === 2 ? (
          <>
            {/* ── Common fields (both paths) ── */}
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
              <select value={newProjectStatus} onChange={(event) => setNewProjectStatus(event.target.value as ProjectStatus)}>
                <option value="ativo">Ativo</option>
                <option value="latente">Latente</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </div>

            {/* ── Engine-specific fields ── */}
            {!isLegacy && typeConfig ? (
              <>
                {typeConfig.wizardFields.map(field => renderWizardField(field))}
                <textarea
                  value={newProjectDescription}
                  onChange={(event) => setNewProjectDescription(event.target.value)}
                  placeholder="Descrição curta (opcional)"
                />
              </>
            ) : (
              <>
                {/* Legacy 4DX-style wizard */}
                <label>
                  {createMeta.objectiveLabel}
                  <input
                    value={newProjectObjective}
                    onChange={(event) => setNewProjectObjective(event.target.value)}
                    placeholder={methodologyMeta.objectivePlaceholder}
                    required
                  />
                  <small>{createMeta.objectiveHint}</small>
                </label>

                <label>
                  {createMeta.lagMetricLabel}
                  <input
                    value={newProjectMetric}
                    onChange={(event) => setNewProjectMetric(event.target.value)}
                    placeholder={methodologyMeta.lagPlaceholder}
                    required={createMeta.requireLagMetric}
                  />
                </label>

                <div className="row-2">
                  <label>
                    {createMeta.leadOneLabel}
                    <input
                      value={newProjectLeadMeasure1}
                      onChange={(event) => setNewProjectLeadMeasure1(event.target.value)}
                      placeholder={methodologyMeta.leadOnePlaceholder}
                      required={createMeta.requireLeadPair}
                    />
                  </label>
                  <label>
                    {createMeta.leadTwoLabel}
                    <input
                      value={newProjectLeadMeasure2}
                      onChange={(event) => setNewProjectLeadMeasure2(event.target.value)}
                      placeholder={methodologyMeta.leadTwoPlaceholder}
                      required={createMeta.requireLeadPair}
                    />
                  </label>
                </div>

                <p className="premium-empty">{createMeta.leadPairHint}</p>

                <div className="row-2">
                  <label>
                    {createMeta.extraOneLabel}
                    <input
                      value={newProjectExtraOne}
                      onChange={(event) => setNewProjectExtraOne(event.target.value)}
                      placeholder={createMeta.extraOnePlaceholder}
                      required={createMeta.extraOneRequired}
                    />
                    <small>{createMeta.extraOneHint}</small>
                  </label>
                  <label>
                    {createMeta.extraTwoLabel}
                    <input
                      value={newProjectExtraTwo}
                      onChange={(event) => setNewProjectExtraTwo(event.target.value)}
                      placeholder={createMeta.extraTwoPlaceholder}
                      required={createMeta.extraTwoRequired}
                    />
                    <small>{createMeta.extraTwoHint}</small>
                  </label>
                </div>

                <div className="row-2">
                  <label>
                    Cadência de check-in (dias)
                    <input
                      type="number"
                      min={1}
                      max={14}
                      step={1}
                      value={newProjectCadenceDays}
                      onChange={(event) => setNewProjectCadenceDays(event.target.value)}
                    />
                    <small>{createMeta.cadenceHint}</small>
                  </label>
                  <label>
                    Prazo final
                    <input
                      type="date"
                      value={newProjectTimeHorizonEnd}
                      onChange={(event) => setNewProjectTimeHorizonEnd(event.target.value)}
                      required={createMeta.requireDeadline}
                    />
                  </label>
                </div>

                <div className="row-2">
                  <label>
                    Valor inicial ({createMeta.requireLagStart ? createMeta.lagMetricLabel.toLowerCase() : 'opcional'})
                    <input
                      type="number"
                      value={newProjectResultStartValue}
                      onChange={(event) => setNewProjectResultStartValue(event.target.value)}
                      placeholder="0"
                      required={createMeta.requireLagStart}
                    />
                  </label>
                  <label>
                    Meta alvo
                    <input
                      type="number"
                      value={newProjectResultTargetValue}
                      onChange={(event) => setNewProjectResultTargetValue(event.target.value)}
                      placeholder={createMeta.requireLagTarget ? '10000' : 'opcional'}
                      required={createMeta.requireLagTarget}
                    />
                  </label>
                </div>

                <textarea
                  value={newProjectDescription}
                  onChange={(event) => setNewProjectDescription(event.target.value)}
                  placeholder="Descrição curta"
                />
              </>
            )}

            <div className="inline-actions">
              <button type="button" className="ghost-button" onClick={reopenMethodologyPickerFromForm}>
                Voltar
              </button>
              <button type="submit" disabled={busy}>
                Continuar para preview
              </button>
            </div>
          </>
        ) : (
          /* ── Step 3: Preview ── */
          <PremiumCard
            title={`Resumo — ${typeLabel}`}
            subtitle="Confirme antes de criar"
          >
            <div className="premium-metric-grid mini">
              <div className="premium-metric tone-default">
                <span>Frente</span>
                <strong>{workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? '—'}</strong>
                <small>{newProjectTitle || 'Nome pendente'}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>Objetivo</span>
                <strong className="objective-metric-text">
                  {(!isLegacy ? (wizardDraft.objective as string) : newProjectObjective) || 'Pendente'}
                </strong>
                <small>{typeTagline}</small>
              </div>
              {isLegacy && (
                <>
                  <div className="premium-metric tone-default">
                    <span>Ações semanais</span>
                    <strong>{newProjectLeadMeasure1 || '—'} + {newProjectLeadMeasure2 || '—'}</strong>
                    <small>{createMeta.leadPairHint}</small>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Painel</span>
                    <strong>{methodPreview.chart}</strong>
                    <small>foco: {methodPreview.focus}</small>
                  </div>
                </>
              )}
              {!isLegacy && typeConfig && typeConfig.wizardFields.slice(1, 3).map(field => {
                const val = wizardDraft[field.key];
                const display = Array.isArray(val) ? `${(val as string[]).filter(Boolean).length} items` : (val as string || '—');
                return (
                  <div key={field.key} className="premium-metric tone-default">
                    <span>{field.label}</span>
                    <strong>{display}</strong>
                  </div>
                );
              })}
            </div>
            <div className="inline-actions">
              <button type="button" className="ghost-button" onClick={() => setProjectCreateStep(2)}>
                Voltar para edição
              </button>
              <button type="submit" disabled={busy}>
                Criar projeto
              </button>
            </div>
          </PremiumCard>
        )}
      </form>
    );
  }

  const methodologyPickerModal = (
    <Modal
      open={methodologyPickerOpen}
      onClose={() => {
        setMethodologyPickerOpen(false);
        setMethodologyGuideOpen(null);
      }}
      title="Que tipo de frente é essa?"
      subtitle="Cada tipo tem uma lógica de acompanhamento diferente"
      size="xl"
    >
      <div className="project-picker-grid">
        {PICKER_TYPES.map((typeConfig) => (
          <button
            key={typeConfig.key}
            type="button"
            className={`project-type-card${newProjectMethodology === typeConfig.key ? ' selected' : ''}`}
            onClick={() => startCreateProjectWithMethodology(typeConfig.key)}
          >
            <span className="project-type-card-icon">
              <ProjectMethodologyIcon methodology={typeConfig.key} size={19} />
            </span>
            <strong className="project-type-card-label">{typeConfig.label}</strong>
            <span className="project-type-card-tagline">{typeConfig.tagline}</span>
            <span className="project-type-card-example">{typeConfig.example}</span>
          </button>
        ))}
      </div>
    </Modal>
  );

  function renderLagProjectionCard(config: {
    title: string;
    subtitle: string;
    weeklyLabel: string;
    emptyTitle?: string;
    emptyDescription?: string;
    updateButtonLabel?: string;
    chartMode?: 'line' | 'burndown' | 'launch' | 'momentum' | 'validation';
  }) {
    const chartMode = config.chartMode ?? 'line';

    return (
      <PremiumCard
        title={config.title}
        subtitle={primaryLagMetric ? config.subtitle : 'Adicione uma métrica lag para habilitar projeção'}
      >
        {!primaryLagMetric ? (
          <EmptyState
            title={config.emptyTitle ?? 'Sem métrica histórica'}
            description={config.emptyDescription ?? selectedProjectDetailMeta.lagProjectionMissing}
          />
        ) : lagProjectionData.length === 0 ? (
          <EmptyState
            title="Sem dados para projeção"
            description="Registre check-ins semanais para liberar o gráfico."
          />
        ) : chartMode === 'burndown' ? (
          <div className="premium-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={lagBurndownSeries}>
                <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                  formatter={(value) => (value == null ? '—' : String(value))}
                  labelFormatter={(label, payload) => {
                    const point = payload?.[0]?.payload as { weekRange?: string } | undefined;
                    return point?.weekRange ? `Semana ${label} • ${point.weekRange}` : `Semana ${label}`;
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="remaining"
                  name="Escopo restante"
                  stroke={chartTheme.colors.danger}
                  fill="rgba(212,100,100,0.2)"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="real"
                  name="Escopo entregue"
                  stroke={chartTheme.colors.primary}
                  strokeWidth={2.4}
                  dot={{ r: 2.5 }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : chartMode === 'launch' ? (
          <div className="premium-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={lagProjectionData}>
                <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                  formatter={(value) => (value == null ? '—' : String(value))}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="real"
                  name="Resultado real"
                  stroke={chartTheme.colors.primary}
                  fill={chartTheme.colors.primary}
                  strokeWidth={2.2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Ritmo esperado"
                  stroke={chartTheme.colors.warning}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : chartMode === 'momentum' ? (
          <div className="premium-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={lagMomentumSeries}>
                <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                  formatter={(value) => (value == null ? '—' : String(value))}
                  labelFormatter={(label, payload) => {
                    const point = payload?.[0]?.payload as { weekStart?: string; value?: number } | undefined;
                    return point?.weekStart
                      ? `Semana ${label} • ${formatIsoDate(point.weekStart)} • valor ${point.value ?? 'n/d'}`
                      : `Semana ${label}`;
                  }}
                />
                <ReferenceLine y={0} stroke={chartTheme.axis.fill} strokeDasharray="4 4" />
                <Bar dataKey="delta" name="Delta semanal" fill={chartTheme.colors.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : chartMode === 'validation' ? (
          <div className="premium-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={lagProjectionData}>
                <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                  formatter={(value) => (value == null ? '—' : String(value))}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="real"
                  name="Hipóteses validadas"
                  stroke={chartTheme.colors.success}
                  fill="rgba(91,185,140,0.2)"
                  strokeWidth={2.2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Meta de validação"
                  stroke={chartTheme.colors.success}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="premium-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={lagProjectionData}>
                <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                <Tooltip
                  contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
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
                  stroke={chartTheme.colors.primary}
                  strokeWidth={2.6}
                  dot={{ r: 2.5 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projeção"
                  stroke={chartTheme.colors.warning}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
                {typeof lagProjectionData[0]?.target === 'number' && (
                  <Line
                    type="linear"
                    dataKey="target"
                    name="Meta"
                    stroke={chartTheme.colors.success}
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
            <h5>{config.weeklyLabel}</h5>
            <small>
              {selectedScorecardWeek
                ? `Semana ${selectedScorecardWeek.index}`
                : `Semana de ${formatIsoDate(scorecardWeekStart)}`}
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
                  {config.updateButtonLabel ?? 'Atualizar gráfico'}
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
    );
  }

  function renderLeadCadenceCard(config: {
    title: string;
    subtitle: string;
    emptyTitle?: string;
    emptyDescription?: string;
    yesLabel?: string;
    noLabel?: string;
    chartMode?: 'line' | 'stacked' | 'area';
  }) {
    const chartMode = config.chartMode ?? 'line';

    return (
      <PremiumCard title={config.title} subtitle={config.subtitle}>
        {scorecardLeadMetrics.length === 0 ? (
          <EmptyState
            title={config.emptyTitle ?? 'Sem medidas lead'}
            description={config.emptyDescription ?? selectedProjectDetailMeta.leadPanelMissing}
          />
        ) : (
          <>
            {chartMode === 'stacked' && leadWeeklySeries.length > 0 ? (
              <div className="premium-chart-wrap">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={leadWeeklySeries}>
                    <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                    <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                    <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                    <Tooltip
                      contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                      formatter={(value) => (value == null ? '—' : String(value))}
                      labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload as { weekStart?: string } | undefined;
                        return point?.weekStart
                          ? `Semana ${label} • ${formatIsoDate(point.weekStart)}`
                          : `Semana ${label}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="done" name="Feito" stackId="a" fill={chartTheme.colors.primary} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="missed" name="Não feito" stackId="a" fill={chartTheme.colors.warning} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : chartMode === 'area' && leadWeeklySeries.length > 1 ? (
              <div className="premium-chart-wrap">
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={leadWeeklySeries}>
                    <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                    <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                    <YAxis domain={[0, 100]} tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                    <Tooltip
                      contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                      formatter={(value) => [`${value}%`, 'Compliance']}
                    />
                    <Area
                      type="monotone"
                      dataKey="compliance"
                      name="Compliance"
                      stroke={chartTheme.colors.primary}
                      fill={chartTheme.colors.primary}
                      strokeWidth={2.2}
                    />
                    <ReferenceLine y={80} stroke={chartTheme.colors.success} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : leadComplianceHistory.length > 1 && (
              <div className="premium-chart-wrap">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={leadComplianceHistory}>
                    <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                    <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                    <YAxis
                      domain={[0, 100]}
                      tick={axisProps.tick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                      formatter={(value) => [`${value}%`, 'Compliance']}
                      labelFormatter={(label, payload) => {
                        const entry = payload?.[0]?.payload as { weekStart?: string } | undefined;
                        return entry?.weekStart
                          ? `Semana ${label} • ${formatIsoDate(entry.weekStart)}`
                          : `Semana ${label}`;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="compliance"
                      name="Compliance"
                      stroke={chartTheme.colors.primary}
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
                          : `Semana de ${formatIsoDate(projectScorecard?.project.weekStart ?? scorecardWeekStart)}`}{' '}
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
                        {config.yesLabel ?? 'Sim'}
                      </button>
                      <button
                        type="button"
                        className={isNotDone ? 'ghost-button task-filter active' : 'ghost-button'}
                        disabled={busy}
                        onClick={() => checkinLeadMetricBinary(metric.id, false)}
                      >
                        {config.noLabel ?? 'Não'}
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
    );
  }

  function renderMethodologyExecutionPanels() {
    const weekSubtitle = selectedScorecardWeek
      ? `Semana ${selectedScorecardWeek.index}: ${selectedScorecardWeek.weekRange}`
      : 'check-in semanal';

    if (selectedProjectMethodology === 'delivery') {
      return (
        <section className="premium-grid two">
          {renderLeadCadenceCard({
            title: 'Ritmo de marcos e desbloqueios',
            subtitle: `${weekSubtitle} • feche marcos e destrave gargalos`,
            yesLabel: 'Concluído',
            noLabel: 'Bloqueado',
            chartMode: 'stacked'
          })}
          {renderLagProjectionCard({
            title: 'Escopo entregue vs meta',
            subtitle: primaryLagMetric ? `${primaryLagMetric.name} • evolução semanal de entrega` : 'defina escopo para projetar',
            weeklyLabel: 'Entrega acumulada da semana',
            updateButtonLabel: 'Atualizar escopo',
            chartMode: 'burndown'
          })}
        </section>
      );
    }

    if (selectedProjectMethodology === 'launch') {
      const daysToLaunch = daysUntilDate(selectedProject?.timeHorizonEnd);
      return (
        <section className="premium-grid two">
          {renderLeadCadenceCard({
            title: 'Go-live readiness',
            subtitle: `${weekSubtitle} • ${
              daysToLaunch === null
                ? 'defina data para iniciar janela'
                : daysToLaunch < 0
                  ? `janela vencida em ${Math.abs(daysToLaunch)} dia(s)`
                  : `janela ativa D-${daysToLaunch}`
            } • risco ${leadMissingInWeek > 0 ? 'alto' : 'baixo'}`,
            yesLabel: 'Pronto',
            noLabel: 'Pendente',
            chartMode: 'stacked'
          })}
          {renderLagProjectionCard({
            title: 'Resultado do launch',
            subtitle: primaryLagMetric ? `${primaryLagMetric.name} • resultado real vs meta de lançamento` : 'defina métrica de resultado',
            weeklyLabel: 'Resultado da janela',
            updateButtonLabel: 'Atualizar resultado',
            chartMode: 'launch'
          })}
        </section>
      );
    }

    if (selectedProjectMethodology === 'discovery') {
      return (
        <section className="premium-grid two">
          {renderLeadCadenceCard({
            title: 'Backlog de experimentos',
            subtitle: `${weekSubtitle} • validar ou refutar hipóteses`,
            yesLabel: 'Validou',
            noLabel: 'Refutou',
            chartMode: 'stacked'
          })}
          {renderLagProjectionCard({
            title: 'Curva de aprendizado validado',
            subtitle: primaryLagMetric ? `${primaryLagMetric.name} • evolução do aprendizado` : 'defina a métrica de validação',
            weeklyLabel: 'Validação da semana',
            updateButtonLabel: 'Registrar validação',
            chartMode: 'validation'
          })}
        </section>
      );
    }

    if (selectedProjectMethodology === 'growth') {
      return (
        <section className="premium-grid two">
          {renderLagProjectionCard({
            title: 'Métrica norte e tendência',
            subtitle: primaryLagMetric ? `${primaryLagMetric.name} • tração semanal de crescimento` : 'defina a métrica norte',
            weeklyLabel: 'Leitura da métrica norte',
            updateButtonLabel: 'Atualizar métrica norte',
            chartMode: 'momentum'
          })}
          {renderLeadCadenceCard({
            title: 'Loops de crescimento',
            subtitle: `${weekSubtitle} • ciclos curtos de aquisição/ativação/retenção`,
            yesLabel: 'Rodou',
            noLabel: 'Não rodou',
            chartMode: 'area'
          })}
        </section>
      );
    }

    return (
      <section className="premium-grid two">
        {renderLagProjectionCard({
          title: selectedProjectDetailMeta.lagProjectionTitle,
          subtitle: primaryLagMetric ? `${primaryLagMetric.name} • placar visível semanal` : 'Adicione uma métrica lag para habilitar projeção',
          weeklyLabel: selectedProjectDetailMeta.lagWeeklyLabel
        })}
        {renderLeadCadenceCard({
          title: selectedProjectDetailMeta.leadPanelTitle,
          subtitle: weekSubtitle
        })}
      </section>
    );
  }

  function renderMethodologyScoreboardSummary() {
    if (!selectedProject) {
      return null;
    }

    const commonCompliance = projectScorecard?.summary.weeklyLeadCompliancePercent ?? 0;
    const currentLag = selectedProject.resultCurrentValue ?? selectedProject.resultStartValue ?? null;
    const targetLag = selectedProject.resultTargetValue ?? null;
    const daysToDeadline = daysUntilDate(selectedProject.timeHorizonEnd);

    if (selectedProjectMethodology === 'delivery') {
      const delivered = typeof currentLag === 'number' ? currentLag : 0;
      const target = typeof targetLag === 'number' ? targetLag : null;
      const remaining = target === null ? 'n/d' : Math.max(0, target - delivered);
      return (
        <div className="premium-metric-grid mini">
          <div className="premium-metric tone-default">
            <span>Escopo entregue</span>
            <strong>{delivered}</strong>
            <small>{target === null ? 'meta pendente' : `meta ${target}`}</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Escopo restante</span>
            <strong>{remaining}</strong>
            <small>restante para fechar entrega</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Marcos semanais</span>
            <strong>
              {leadDoneInWeek}/{Math.max(2, scorecardLeadMetrics.length)}
            </strong>
            <small>{leadMissingInWeek} marco(s) sem check-in</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Prazo</span>
            <strong>{daysToDeadline === null ? 'sem data' : daysToDeadline < 0 ? 'vencido' : `D-${daysToDeadline}`}</strong>
            <small>{selectedProject.timeHorizonEnd ? formatIsoDate(selectedProject.timeHorizonEnd) : 'defina prazo final'}</small>
          </div>
        </div>
      );
    }

    if (selectedProjectMethodology === 'launch') {
      return (
        <div className="premium-metric-grid mini">
          <div className="premium-metric tone-default">
            <span>Janela de lançamento</span>
            <strong>{daysToDeadline === null ? 'sem data' : daysToDeadline < 0 ? 'janela vencida' : `D-${daysToDeadline}`}</strong>
            <small>{selectedProject.timeHorizonEnd ? formatIsoDate(selectedProject.timeHorizonEnd) : 'defina data de launch'}</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Readiness</span>
            <strong>{commonCompliance}%</strong>
            <small>{leadDoneInWeek} checkpoint(s) prontos</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Resultado acumulado</span>
            <strong>{typeof currentLag === 'number' ? currentLag : 'n/d'}</strong>
            <small>{typeof targetLag === 'number' ? `meta ${targetLag}` : 'meta pendente'}</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Risco de launch</span>
            <strong>{projectOpsSnapshot.restricted + projectOpsSnapshot.overdue}</strong>
            <small>restrições + atrasos críticos</small>
          </div>
        </div>
      );
    }

    if (selectedProjectMethodology === 'discovery') {
      return (
        <div className="premium-metric-grid mini">
          <div className="premium-metric tone-default">
            <span>Hipóteses validadas</span>
            <strong>{typeof currentLag === 'number' ? currentLag : 'n/d'}</strong>
            <small>{selectedProject.primaryMetric ?? 'métrica de validação pendente'}</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Experimentos da semana</span>
            <strong>
              {leadDoneInWeek}/{Math.max(2, scorecardLeadMetrics.length)}
            </strong>
            <small>{leadMissingInWeek} experimento(s) sem leitura</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Aprendizado recente</span>
            <strong>{lagRecentVelocity === null ? 'n/d' : `${lagRecentVelocity > 0 ? '+' : ''}${lagRecentVelocity}`}</strong>
            <small>delta entre últimas semanas</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Decisão do ciclo</span>
            <strong>{selectedProject.methodologyExtraTwo ?? 'pendente'}</strong>
            <small>decisão esperada ao fim da janela</small>
          </div>
        </div>
      );
    }

    if (selectedProjectMethodology === 'growth') {
      return (
        <div className="premium-metric-grid mini">
          <div className="premium-metric tone-default">
            <span>Métrica norte</span>
            <strong>{typeof currentLag === 'number' ? currentLag : 'n/d'}</strong>
            <small>{typeof targetLag === 'number' ? `meta ${targetLag}` : 'meta pendente'}</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Momentum semanal</span>
            <strong>{lagRecentVelocity === null ? 'n/d' : `${lagRecentVelocity > 0 ? '+' : ''}${lagRecentVelocity}`}</strong>
            <small>aceleração recente do crescimento</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Loops rodando</span>
            <strong>{commonCompliance}%</strong>
            <small>compliance dos loops na semana</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Gargalo atual</span>
            <strong>{selectedProject.methodologyExtraTwo ?? 'pendente'}</strong>
            <small>travamento principal da escala</small>
          </div>
        </div>
      );
    }

    return (
      <div className="premium-metric-grid mini">
        <div className="premium-metric tone-default">
          <span>{selectedProjectDetailMeta.objectiveLabel}</span>
          <strong className="objective-metric-text">{selectedProject.objective ?? 'Objetivo pendente'}</strong>
          <small>
            {selectedProject.objective
              ? selectedProjectDetailMeta.objectiveHint
              : selectedProjectDetailMeta.objectiveHintMissing}
          </small>
        </div>
        <div className="premium-metric tone-default">
          <span>{selectedProjectMethodologyMeta.lagLabel}</span>
          <strong>{selectedProject.primaryMetric ?? 'Pendente'}</strong>
          <small>
            Atual {selectedProject.resultCurrentValue ?? selectedProject.resultStartValue ?? 'n/d'} • Alvo{' '}
            {selectedProject.resultTargetValue ?? 'n/d'}
          </small>
        </div>
        <div className="premium-metric tone-default">
          <span>{selectedProjectDetailMeta.leadComplianceLabel} (semana)</span>
          <strong>{projectScorecard?.summary.weeklyLeadCompliancePercent ?? 0}%</strong>
          <small>{projectTractionSignal.reason}</small>
        </div>
        <div className="premium-metric tone-default">
          <span>{selectedProjectDetailMeta.deadlineLabel}</span>
          <strong>
            {selectedProject.timeHorizonEnd
              ? new Date(selectedProject.timeHorizonEnd).toLocaleDateString('pt-BR')
              : 'Sem prazo'}
          </strong>
          <small>Check-in a cada {selectedProject.scorecardCadenceDays ?? 7} dias</small>
        </div>
      </div>
    );
  }

  function renderMethodologyCockpit() {
    if (!selectedProject) {
      return null;
    }

    const commonKpis = (
      <div className="premium-metric-grid mini">
        <div className="premium-metric tone-default">
          <span>Tarefas abertas</span>
          <strong>{projectOpsSnapshot.open}</strong>
          <small>{projectOpsSnapshot.inProgress} em andamento agora</small>
        </div>
        <div className="premium-metric tone-default">
          <span>Tarefas concluídas</span>
          <strong>{projectOpsSnapshot.done}</strong>
          <small>{projectOpsSnapshot.total} tarefas totais no projeto</small>
        </div>
        <div className="premium-metric tone-default">
          <span>Restrições abertas</span>
          <strong>{projectOpsSnapshot.restricted}</strong>
          <small>bloqueios que afetam execução da semana</small>
        </div>
      </div>
    );

    if (selectedProjectMethodology === 'delivery') {
      return (
        <PremiumCard
          title="Cockpit Delivery"
          subtitle="foco em escopo entregue, marcos e remoção de bloqueios"
        >
          {commonKpis}
          <div className="premium-metric-grid mini">
            <div className="premium-metric tone-default">
              <span>Marcos da semana</span>
              <strong>
                {leadDoneInWeek}/{Math.max(2, scorecardLeadMetrics.length)}
              </strong>
              <small>{leadMissingInWeek} marco(s) sem check-in nesta semana</small>
            </div>
            <div className="premium-metric tone-default">
              <span>Atrasos de entrega</span>
              <strong>{projectOpsSnapshot.overdue}</strong>
              <small>tarefa(s) vencidas no cronograma atual</small>
            </div>
            <div className="premium-metric tone-default">
              <span>Velocidade de escopo</span>
              <strong>{lagRecentVelocity === null ? 'n/d' : `${lagRecentVelocity > 0 ? '+' : ''}${lagRecentVelocity}`}</strong>
              <small>variação da última leitura lag</small>
            </div>
          </div>
        </PremiumCard>
      );
    }

    if (selectedProjectMethodology === 'launch') {
      const daysToLaunch = daysUntilDate(selectedProject.timeHorizonEnd);
      return (
        <PremiumCard
          title="Cockpit Launch"
          subtitle="readiness de ativos, checkpoints e janela de lançamento"
        >
          <div className="premium-metric-grid mini">
            <div className="premium-metric tone-default">
              <span>Janela de lançamento</span>
              <strong>
                {daysToLaunch === null ? 'sem data' : daysToLaunch < 0 ? 'janela vencida' : `D-${daysToLaunch}`}
              </strong>
              <small>
                {daysToLaunch === null
                  ? 'defina uma data para o launch'
                  : daysToLaunch < 0
                    ? `${Math.abs(daysToLaunch)} dia(s) após o prazo`
                    : `${daysToLaunch} dia(s) até o prazo`}
              </small>
            </div>
            <div className="premium-metric tone-default">
              <span>Readiness da semana</span>
              <strong>{projectScorecard?.summary.weeklyLeadCompliancePercent ?? 0}%</strong>
              <small>{leadDoneInWeek} checkpoint(s) completos</small>
            </div>
            <div className="premium-metric tone-default">
              <span>Risco operacional</span>
              <strong>{projectOpsSnapshot.restricted + projectOpsSnapshot.overdue}</strong>
              <small>restrições + atrasos ativos</small>
            </div>
          </div>
          {commonKpis}
        </PremiumCard>
      );
    }

    if (selectedProjectMethodology === 'discovery') {
      return (
        <PremiumCard
          title="Cockpit Discovery"
          subtitle="hipóteses, ciclos de experimento e qualidade de evidência"
        >
          <div className="premium-metric-grid mini">
            <div className="premium-metric tone-default">
              <span>Experimentos semanais</span>
              <strong>{leadDoneInWeek}</strong>
              <small>{leadMissingInWeek} experimento(s) ainda sem check-in</small>
            </div>
            <div className="premium-metric tone-default">
              <span>Hipóteses validadas</span>
              <strong>{primaryLagMetric?.currentValue ?? 'n/d'}</strong>
              <small>{selectedProject.primaryMetric ?? 'métrica de validação pendente'}</small>
            </div>
            <div className="premium-metric tone-default">
              <span>Aprendizado recente</span>
              <strong>{lagRecentVelocity === null ? 'n/d' : `${lagRecentVelocity > 0 ? '+' : ''}${lagRecentVelocity}`}</strong>
              <small>delta entre as últimas duas semanas</small>
            </div>
          </div>
          {commonKpis}
        </PremiumCard>
      );
    }

    if (selectedProjectMethodology === 'growth') {
      const lastWeeks = leadComplianceHistory.slice(-4);
      const averageCompliance =
        lastWeeks.length > 0
          ? Math.round(lastWeeks.reduce((total, entry) => total + entry.compliance, 0) / lastWeeks.length)
          : projectScorecard?.summary.weeklyLeadCompliancePercent ?? 0;

      return (
        <PremiumCard
          title="Cockpit Growth"
          subtitle="loops de crescimento, cadência de teste e tração da métrica norte"
        >
          <div className="premium-metric-grid mini">
            <div className="premium-metric tone-default">
              <span>Loop compliance (4 semanas)</span>
              <strong>{averageCompliance}%</strong>
              <small>média de disciplina dos ciclos recentes</small>
            </div>
            <div className="premium-metric tone-default">
              <span>Experimentos em aberto</span>
              <strong>{projectOpsSnapshot.open}</strong>
              <small>{projectOpsSnapshot.inProgress} experimento(s) em execução</small>
            </div>
            <div className="premium-metric tone-default">
              <span>Tração da métrica norte</span>
              <strong>{lagRecentVelocity === null ? 'n/d' : `${lagRecentVelocity > 0 ? '+' : ''}${lagRecentVelocity}`}</strong>
              <small>variação na última semana registrada</small>
            </div>
          </div>
          {commonKpis}
        </PremiumCard>
      );
    }

    return (
      <PremiumCard
        title="Cockpit 4DX"
        subtitle="disciplina semanal de MDD + evolução da métrica histórica"
      >
        <div className="premium-metric-grid mini">
          <div className="premium-metric tone-default">
            <span>MDD em dia</span>
            <strong>
              {leadDoneInWeek}/{Math.max(2, scorecardLeadMetrics.length)}
            </strong>
            <small>{leadMissingInWeek} medida(s) sem check-in esta semana</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Lag progressivo</span>
            <strong>
              {projectScorecard?.summary.lagProgressPercent === null ||
              projectScorecard?.summary.lagProgressPercent === undefined
                ? 'n/d'
                : `${projectScorecard.summary.lagProgressPercent}%`}
            </strong>
            <small>progresso entre baseline e alvo</small>
          </div>
          <div className="premium-metric tone-default">
            <span>Risco de execução</span>
            <strong>{projectOpsSnapshot.restricted + projectOpsSnapshot.overdue}</strong>
            <small>bloqueios + atrasos ativos no projeto</small>
          </div>
        </div>
        {commonKpis}
      </PremiumCard>
    );
  }

  // ── Helper: refresh project from server ───────────────────────────────
  async function refetchProject() {
    await load(workspaceId === 'all' ? undefined : workspaceId);
    if (selectedProjectId) {
      await loadProjectScorecard(selectedProjectId);
    }
  }

  function renderDeliveryPreviewStudio(md: MethodologyData) {
    if (!selectedProject) return null;
    const milestones = [...(md.milestones ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const blockers = md.blockers ?? [];
    const openBlockers = blockers.filter((blocker) => !blocker.resolvedAt);
    const done = milestones.filter((milestone) => milestone.done).length;
    const total = milestones.length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const daysLeft = daysRemaining(selectedProject.timeHorizonEnd);
    const nextMilestone =
      milestones.find((milestone) => !milestone.done && milestone.critical) ??
      milestones.find((milestone) => !milestone.done) ??
      null;
    const statusLabel =
      total === 0
        ? 'Sem plano de entrega'
        : progress === 100
          ? 'Entrega concluída'
          : openBlockers.length > 0
            ? 'Com bloqueios ativos'
            : nextMilestone?.critical
              ? 'Marco crítico pendente'
              : 'Em execução';

    return (
      <div className="project-redesign-shell delivery-os-preview">
        <section className="project-redesign-hero">
          <div className="project-redesign-hero-copy">
            <span className="project-redesign-kicker">Entrega OS · preview</span>
            <h3>{statusLabel}</h3>
            <p>
              {selectedProject.objective ||
                'Transforme a entrega em marcos claros, bloqueios visíveis e uma definição de pronto que evita ambiguidade.'}
            </p>
          </div>
          <div className="project-redesign-hero-metrics">
            <div>
              <span>Progresso</span>
              <strong>{progress}%</strong>
            </div>
            <div>
              <span>Marcos</span>
              <strong>{done}/{total}</strong>
            </div>
            <div className={openBlockers.length > 0 ? 'is-warn' : ''}>
              <span>Bloqueios</span>
              <strong>{openBlockers.length}</strong>
            </div>
            <div className={daysLeft !== null && daysLeft < 7 ? 'is-warn' : ''}>
              <span>Prazo</span>
              <strong>{daysLeft === null ? 'sem' : daysLeft >= 0 ? `D-${daysLeft}` : `+${Math.abs(daysLeft)}d`}</strong>
            </div>
          </div>
        </section>

        <section className="project-redesign-next">
          <div>
            <span className="project-redesign-section-label">Próximo avanço</span>
            <strong>
              {nextMilestone
                ? nextMilestone.title
                : total === 0
                  ? 'Definir o primeiro marco da entrega'
                  : 'Revisar e encerrar a entrega'}
            </strong>
            <p>
              {openBlockers.length > 0
                ? `${openBlockers.length} bloqueio(s) ainda travando a execução.`
                : nextMilestone?.critical
                  ? 'Este é o ponto crítico que decide se a entrega anda ou atrasa.'
                  : 'A tela sempre deixa claro qual peça precisa andar agora.'}
            </p>
          </div>
          <div className="project-redesign-actions">
            <button type="button" onClick={() => openQuickAdd('milestone')}>
              + Marco
            </button>
            <button type="button" className="secondary" onClick={() => openQuickAdd('blocker')}>
              + Bloqueio
            </button>
          </div>
        </section>

        {engineQuickAdd.type === 'milestone' && (
          <div className="project-redesign-inline-form">
            <input
              autoFocus
              placeholder="Novo marco da entrega..."
              value={engineQuickAdd.draft.title ?? ''}
              onChange={e => setQuickDraft('title', e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && engineQuickAdd.draft.title?.trim()) {
                  setBusy(true);
                  try {
                    await api.addMethodologyItem(selectedProject.id, {
                      arrayKey: 'milestones',
                      item: { title: engineQuickAdd.draft.title.trim(), done: false, critical: engineQuickAdd.draft.critical === '1', order: milestones.length }
                    });
                    closeQuickAdd();
                    await refetchProject();
                  } finally { setBusy(false); }
                }
                if (e.key === 'Escape') closeQuickAdd();
              }}
            />
            <label>
              <input
                type="checkbox"
                checked={engineQuickAdd.draft.critical === '1'}
                onChange={e => setQuickDraft('critical', e.target.checked ? '1' : '')}
              />
              crítico
            </label>
            <button
              type="button"
              disabled={busy || !engineQuickAdd.draft.title?.trim()}
              onClick={async () => {
                if (!engineQuickAdd.draft.title?.trim()) return;
                setBusy(true);
                try {
                  await api.addMethodologyItem(selectedProject.id, {
                    arrayKey: 'milestones',
                    item: { title: engineQuickAdd.draft.title.trim(), done: false, critical: engineQuickAdd.draft.critical === '1', order: milestones.length }
                  });
                  closeQuickAdd();
                  await refetchProject();
                } finally { setBusy(false); }
              }}
            >
              Adicionar
            </button>
          </div>
        )}

        {engineQuickAdd.type === 'blocker' && (
          <div className="project-redesign-inline-form">
            <input
              autoFocus
              placeholder="O que está bloqueando a entrega?"
              value={engineQuickAdd.draft.title ?? ''}
              onChange={e => setQuickDraft('title', e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && engineQuickAdd.draft.title?.trim()) {
                  setBusy(true);
                  try {
                    await api.addMethodologyItem(selectedProject.id, {
                      arrayKey: 'blockers',
                      item: { title: engineQuickAdd.draft.title.trim(), resolvedAt: null }
                    });
                    closeQuickAdd();
                    await refetchProject();
                  } finally { setBusy(false); }
                }
                if (e.key === 'Escape') closeQuickAdd();
              }}
            />
            <button
              type="button"
              disabled={busy || !engineQuickAdd.draft.title?.trim()}
              onClick={async () => {
                if (!engineQuickAdd.draft.title?.trim()) return;
                setBusy(true);
                try {
                  await api.addMethodologyItem(selectedProject.id, {
                    arrayKey: 'blockers',
                    item: { title: engineQuickAdd.draft.title.trim(), resolvedAt: null }
                  });
                  closeQuickAdd();
                  await refetchProject();
                } finally { setBusy(false); }
              }}
            >
              Registrar
            </button>
          </div>
        )}

        <section className="delivery-os-grid">
          <article className="project-redesign-panel delivery-os-plan">
            <header>
              <div>
                <span className="project-redesign-section-label">Plano de entrega</span>
                <h4>Marcos</h4>
              </div>
              <span>{done}/{total}</span>
            </header>

            {milestones.length === 0 ? (
              <div className="project-redesign-empty">
                Crie 3 a 7 marcos que definam a entrega em linguagem concreta.
              </div>
            ) : (
              <div className="delivery-os-milestones">
                {milestones.map((milestone, index) => (
                  <div key={milestone.id} className={`delivery-os-milestone ${milestone.done ? 'done' : ''} ${milestone.critical ? 'critical' : ''}`}>
                    <button
                      type="button"
                      className="delivery-os-check"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.updateMethodologyItem(selectedProject.id, milestone.id, {
                            arrayKey: 'milestones',
                            item: { done: !milestone.done, doneAt: !milestone.done ? new Date().toISOString() : null }
                          });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >
                      {milestone.done ? '✓' : index + 1}
                    </button>
                    <div>
                      <strong>{milestone.title}</strong>
                      <small>{milestone.critical ? 'Marco crítico' : milestone.done ? 'Concluído' : 'Pendente'}</small>
                    </div>
                    <button
                      type="button"
                      className="item-delete-btn"
                      disabled={busy}
                      title="Excluir marco"
                      onClick={async () => {
                        if (!window.confirm(`Excluir marco "${milestone.title}"?`)) return;
                        setBusy(true);
                        try {
                          await api.deleteMethodologyItem(selectedProject.id, milestone.id, { arrayKey: 'milestones' });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </article>

          <aside className="project-redesign-side">
            <article className="project-redesign-panel">
              <header>
                <div>
                  <span className="project-redesign-section-label">Definição de pronto</span>
                  <h4>Critério de aceite</h4>
                </div>
              </header>
              <p className="delivery-os-dod">
                {selectedProject.methodologyExtraOne || 'Defina como saber que isso realmente está entregue.'}
              </p>
            </article>

            <article className="project-redesign-panel">
              <header>
                <div>
                  <span className="project-redesign-section-label">Riscos</span>
                  <h4>Bloqueios</h4>
                </div>
                <span>{openBlockers.length} ativos</span>
              </header>

              {blockers.length === 0 ? (
                <div className="project-redesign-empty compact">Nenhum bloqueio registrado.</div>
              ) : (
                <div className="delivery-os-blockers">
                  {blockers.map((blocker) => (
                    <div key={blocker.id} className={`delivery-os-blocker ${blocker.resolvedAt ? 'resolved' : ''}`}>
                      <span>{blocker.resolvedAt ? '✓' : '!'}</span>
                      <strong>{blocker.title}</strong>
                      {!blocker.resolvedAt && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await api.updateMethodologyItem(selectedProject.id, blocker.id, {
                                arrayKey: 'blockers',
                                item: { resolvedAt: new Date().toISOString() }
                              });
                              await refetchProject();
                            } finally { setBusy(false); }
                          }}
                        >
                          resolver
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </aside>
        </section>
      </div>
    );
  }

  function renderPipelinePreviewStudio(md: MethodologyData) {
    if (!selectedProject) return null;
    const stages = [...(md.stages ?? [])].sort((a, b) => a.order - b.order);
    const deals = md.deals ?? [];
    const lastStage = stages[stages.length - 1] ?? null;
    const closedDeals = lastStage ? deals.filter((deal) => deal.stageId === lastStage.id).length : 0;
    const conversion = deals.length > 0 ? Math.round((closedDeals / deals.length) * 100) : 0;
    const stageStats = stages.map((stage) => {
      const stageDeals = deals.filter((deal) => deal.stageId === stage.id);
      const avgDays = stageDeals.length
        ? Math.round(stageDeals.reduce((sum, deal) => sum + (deal.stageEnteredAt ? Math.floor((Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86400000) : 0), 0) / stageDeals.length)
        : 0;
      return { stage, deals: stageDeals, avgDays };
    });
    const stuckStage = stageStats
      .filter((entry) => entry.stage.id !== lastStage?.id && entry.deals.length > 0)
      .sort((a, b) => b.avgDays - a.avgDays)[0];
    const nextDeal = deals
      .filter((deal) => deal.stageId !== lastStage?.id)
      .sort((a, b) => {
        const left = a.stageEnteredAt ? new Date(a.stageEnteredAt).getTime() : Date.now();
        const right = b.stageEnteredAt ? new Date(b.stageEnteredAt).getTime() : Date.now();
        return left - right;
      })[0] ?? null;
    const nextDealStage = nextDeal ? stages.find((stage) => stage.id === nextDeal.stageId) : null;
    const nextDealStageIndex = nextDealStage ? stages.findIndex((stage) => stage.id === nextDealStage.id) : -1;
    const nextStageForDeal = nextDealStageIndex >= 0 ? stages[nextDealStageIndex + 1] : null;

    return (
      <div className="project-redesign-shell pipeline-os-preview">
        <section className="project-redesign-hero">
          <div className="project-redesign-hero-copy">
            <span className="project-redesign-kicker">Pipeline OS · preview</span>
            <h3>{deals.length > 0 ? 'Pipeline em movimento' : 'Pipeline vazio'}</h3>
            <p>
              {selectedProject.objective ||
                'Gerencie oportunidades como fluxo: estágio atual, idade, gargalo e próxima ação sempre visíveis.'}
            </p>
          </div>
          <div className="project-redesign-hero-metrics">
            <div>
              <span>Deals</span>
              <strong>{deals.length}</strong>
            </div>
            <div>
              <span>Estágios</span>
              <strong>{stages.length}</strong>
            </div>
            <div>
              <span>Fechados</span>
              <strong>{closedDeals}</strong>
            </div>
            <div className={conversion < 20 && deals.length > 0 ? 'is-warn' : ''}>
              <span>Conversão</span>
              <strong>{deals.length > 0 ? `${conversion}%` : 'n/d'}</strong>
            </div>
          </div>
        </section>

        <section className="project-redesign-next">
          <div>
            <span className="project-redesign-section-label">Próximo avanço</span>
            <strong>{nextDeal ? nextDeal.name : 'Adicionar a primeira oportunidade'}</strong>
            <p>
              {nextDeal && nextStageForDeal
                ? `Mover de ${nextDealStage?.label ?? 'estágio atual'} para ${nextStageForDeal.label}, ou registrar a próxima ação.`
                : stuckStage
                  ? `Gargalo em ${stuckStage.stage.label}: ${stuckStage.deals.length} deal(s), média de ${stuckStage.avgDays}d.`
                  : 'A interface precisa deixar claro qual oportunidade merece atenção agora.'}
            </p>
          </div>
          <div className="project-redesign-actions">
            {nextDeal && nextStageForDeal && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.updateMethodologyItem(selectedProject.id, nextDeal.id, {
                      arrayKey: 'deals',
                      item: { stageId: nextStageForDeal.id, stageEnteredAt: new Date().toISOString() }
                    });
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              >
                Avançar deal
              </button>
            )}
            <button type="button" className="secondary" onClick={() => document.querySelector<HTMLInputElement>('.pipeline-os-add input')?.focus()}>
              + Deal
            </button>
          </div>
        </section>

        <section className="pipeline-os-board">
          {stages.length === 0 ? (
            <div className="project-redesign-empty">Configure os estágios para transformar este projeto em um pipeline operacional.</div>
          ) : (
            stageStats.map(({ stage, deals: stageDeals, avgDays }, index) => {
              const prevStage = stages[index - 1] ?? null;
              const nextStage = stages[index + 1] ?? null;
              return (
                <article key={stage.id} className="pipeline-os-column">
                  <header>
                    <div>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{stage.label}</strong>
                    </div>
                    <em>{stageDeals.length}</em>
                  </header>

                  {stageDeals.length > 0 && (
                    <div className="pipeline-os-column-meta">
                      média {avgDays}d neste estágio
                    </div>
                  )}

                  <div className="pipeline-os-deals">
                    {stageDeals.length === 0 ? (
                      <div className="pipeline-os-empty-stage">sem oportunidades</div>
                    ) : (
                      stageDeals.map((deal) => {
                        const daysInStage = deal.stageEnteredAt
                          ? Math.floor((Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86400000)
                          : null;
                        return (
                          <div key={deal.id} className="pipeline-os-deal-card">
                            <div className="pipeline-os-deal-main">
                              <strong>{deal.name}</strong>
                              <small>
                                {daysInStage === null
                                  ? 'sem data de entrada'
                                  : daysInStage === 0
                                    ? 'entrou hoje'
                                    : `${daysInStage}d neste estágio`}
                              </small>
                            </div>
                            <div className="pipeline-os-deal-actions">
                              {prevStage && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    setBusy(true);
                                    try {
                                      await api.updateMethodologyItem(selectedProject.id, deal.id, {
                                        arrayKey: 'deals',
                                        item: { stageId: prevStage.id, stageEnteredAt: new Date().toISOString() }
                                      });
                                      await refetchProject();
                                    } finally { setBusy(false); }
                                  }}
                                >
                                  ←
                                </button>
                              )}
                              {nextStage && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    setBusy(true);
                                    try {
                                      await api.updateMethodologyItem(selectedProject.id, deal.id, {
                                        arrayKey: 'deals',
                                        item: { stageId: nextStage.id, stageEnteredAt: new Date().toISOString() }
                                      });
                                      await refetchProject();
                                    } finally { setBusy(false); }
                                  }}
                                >
                                  {nextStage.label} →
                                </button>
                              )}
                              <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                title="Excluir deal"
                                onClick={async () => {
                                  if (!window.confirm(`Excluir "${deal.name}"?`)) return;
                                  setBusy(true);
                                  try {
                                    await api.deleteMethodologyItem(selectedProject.id, deal.id, { arrayKey: 'deals' });
                                    await refetchProject();
                                  } finally { setBusy(false); }
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>

        <div className="pipeline-os-add">
          <input
            placeholder="Nova oportunidade, lead ou parceria..."
            value={newDealName}
            onChange={e => setNewDealName(e.target.value)}
            onKeyDown={async e => {
              if (e.key !== 'Enter' || !newDealName.trim() || stages.length === 0) return;
              setBusy(true);
              try {
                await api.addMethodologyItem(selectedProject.id, {
                  arrayKey: 'deals',
                  item: { name: newDealName.trim(), stageId: stages[0].id, stageEnteredAt: new Date().toISOString(), amount: null, probability: 50 }
                });
                setNewDealName('');
                await refetchProject();
              } finally { setBusy(false); }
            }}
          />
          <button
            type="button"
            disabled={busy || !newDealName.trim() || stages.length === 0}
            onClick={async () => {
              if (!newDealName.trim() || stages.length === 0) return;
              setBusy(true);
              try {
                await api.addMethodologyItem(selectedProject.id, {
                  arrayKey: 'deals',
                  item: { name: newDealName.trim(), stageId: stages[0].id, stageEnteredAt: new Date().toISOString(), amount: null, probability: 50 }
                });
                setNewDealName('');
                await refetchProject();
              } finally { setBusy(false); }
            }}
          >
            Adicionar
          </button>
        </div>
      </div>
    );
  }

  // ── ENGINE ZONE A: header with progress ───────────────────────────────
  function renderEngineHeader() {
    if (!selectedProject) return null;
    const engine = getEngine(selectedProject.methodology);
    const variant = getEngineVariant(selectedProject.methodology);
    const md = selectedProject.methodologyData;
    const days = daysRemaining(selectedProject.timeHorizonEnd);

    // Determine engine class for theming
    let engineClass = 'engine-metric';
    if (engine === 'milestone' && variant === 'authority') engineClass = 'engine-milestone-authority';
    else if (engine === 'milestone') engineClass = 'engine-milestone';
    else if (engine === 'log' && variant === 'discovery') engineClass = 'engine-log-discovery';
    else if (engine === 'log' && variant === 'coaching') engineClass = 'engine-log-coaching';
    else if (engine === 'pipeline' && variant === 'financial') engineClass = 'engine-pipeline-financial';
    else if (engine === 'pipeline' && variant === 'linear') engineClass = 'engine-pipeline-linear';
    else if (engine === 'pipeline') engineClass = 'engine-pipeline';
    else if (engine === 'composite') engineClass = 'engine-composite';
    else if (engine === 'decision' && variant === 'scenario') engineClass = 'engine-decision-scenario';
    else if (engine === 'decision') engineClass = 'engine-decision';
    else if (engine === 'time' && variant === 'campaign') engineClass = 'engine-time-campaign';
    else if (engine === 'time' && variant === 'runway') engineClass = 'engine-time-runway';
    else if (engine === 'recurring') engineClass = 'engine-recurring';
    else if (engine === 'funnel') engineClass = 'engine-funnel';

    return (
      <div className={`engine-zone-header ${engineClass}`}>
        <div className="engine-header-top">
          <span className="engine-type-badge">
            <ProjectMethodologyIcon methodology={selectedProject.methodology} size={13} />
            {methodologyDisplayLabel(selectedProject.methodology)}
          </span>
          <span className={`engine-status-tag status-tag ${selectedProject.status}`}>{selectedProject.status}</span>
          {/* 4DX: week badge in header top */}
          {engine === 'metric' && selectedScorecardWeek && (
            <span className="header-week-badge">
              Sem. {selectedScorecardWeek.index}
            </span>
          )}
          {/* Campaign: countdown D-X */}
          {engine === 'time' && variant === 'campaign' && md?.launchDate && (() => {
            const d = daysRemaining(md.launchDate);
            return d != null && d > 0
              ? <span className="campaign-d-label" style={{ fontSize: '1rem', fontWeight: 800 }}>D-{d}</span>
              : null;
          })()}
        </div>

        {/* ── 4DX: lag metric mini progress + week ── */}
        {engine === 'metric' && selectedProject.resultTargetValue != null && (selectedProject.resultTargetValue ?? 0) > 0 && (() => {
          const pct = Math.min(100, Math.round(((selectedProject.resultCurrentValue ?? 0) / (selectedProject.resultTargetValue ?? 1)) * 100));
          return (
            <div className="header-scoreboard-row engine-metric">
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <span>{selectedProject.primaryMetric}: {selectedProject.resultCurrentValue ?? 0} / {selectedProject.resultTargetValue}</span>
                  <span>meta lag</span>
                </div>
                <div className="header-lag-mini-bar">
                  <div className="header-lag-mini-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="header-lag-pct">{pct}%</span>
            </div>
          );
        })()}

        {/* ── Entrega: deadline countdown + completion ring ── */}
        {engine === 'milestone' && variant !== 'authority' && (() => {
          const milestones = md?.milestones ?? [];
          const done = milestones.filter(m => m.done).length;
          const total = milestones.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const r = 26; const circ = 2 * Math.PI * r;
          return (
            <div className="engine-milestone engine-meta-row" style={{ marginTop: '12px' }}>
              {days != null && (
                <div className="header-deadline-big">
                  <span className="header-deadline-num">{Math.abs(days)}</span>
                  <span className="header-deadline-unit">{days >= 0 ? 'dias' : 'atrasado'}</span>
                </div>
              )}
              {total > 0 && (
                <div className="engine-progress-arc-wrap">
                  <svg className="engine-progress-arc-svg" viewBox="0 0 64 64">
                    <circle className="engine-progress-arc-bg" cx="32" cy="32" r={r} />
                    <circle
                      className="engine-progress-arc-fill"
                      cx="32" cy="32" r={r}
                      strokeDasharray={circ}
                      strokeDashoffset={circ - (circ * pct) / 100}
                    />
                  </svg>
                  <div className="engine-progress-arc-text">{pct}%</div>
                </div>
              )}
              {total > 0 && (
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)' }}>{done}/{total} marcos</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>concluídos</div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Autoridade: score display ── */}
        {engine === 'milestone' && variant === 'authority' && (() => {
          const score = computeAuthorityScore(md?.proofs);
          return (
            <div className="engine-meta-row" style={{ marginTop: '12px' }}>
              <div>
                <span className="engine-big-number" style={{ fontSize: '2.4rem', color: '#fbbf24' }}>{score}</span>
                <div className="engine-big-label">pontos de autoridade</div>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.7' }}>
                <div>Artigo ×1</div>
                <div>Menção ×1</div>
                <div>Case ×2</div>
                <div>Palestra ×3</div>
              </div>
            </div>
          );
        })()}

        {/* ── OKR: score ring ── */}
        {engine === 'composite' && (() => {
          const score = computeOkrScore(md?.krs);
          const r = 26; const circ = 2 * Math.PI * r;
          return (
            <div className="engine-meta-row" style={{ marginTop: '12px' }}>
              <div className="okr-score-ring" style={{ width: 64, height: 64, flexShrink: 0 }}>
                <svg viewBox="0 0 64 64" style={{ width: 64, height: 64, transform: 'rotate(-90deg)' }}>
                  <circle className="okr-score-ring-bg" cx="32" cy="32" r={r} strokeWidth="7" fill="none" stroke="var(--bg-3)" />
                  <circle
                    className="okr-score-ring-fill"
                    cx="32" cy="32" r={r}
                    strokeWidth="7" fill="none" stroke="#e07c4a"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ - (circ * Math.min(score, 100)) / 100}
                  />
                </svg>
                <div className="okr-score-ring-text">
                  <span className="okr-score-pct">{score}%</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>Score OKR</div>
                {md?.okrPeriod && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{md.okrPeriod}</div>}
              </div>
            </div>
          );
        })()}

        {/* ── Runway: compact chip in header (hero lives in Zone B) ── */}
        {engine === 'time' && variant === 'runway' && (() => {
          const months = computeRunwayMonths(md?.availableCash, md?.burnRateMonthly);
          const cls = months == null ? 'runway-warn' : months > 3 ? 'runway-safe' : months >= 1 ? 'runway-warn' : 'runway-danger';
          // Compute esgota date
          const esgotaLabel = (() => {
            if (months == null) return 'n/d';
            const d = new Date();
            d.setMonth(d.getMonth() + Math.floor(months));
            return d.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
          })();
          return (
            <div className="engine-meta-row" style={{ marginTop: '10px', gap: '10px', flexWrap: 'wrap' }}>
              <span className={`runway-header-chip ${cls}`}>
                ⏱ {months != null ? `${months.toFixed(1)} meses` : 'n/d'} · esgota {esgotaLabel}
              </span>
              {md?.burnRateMonthly != null && (
                <span className="runway-burn-chip">
                  Burn {md.burnRateMonthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês
                </span>
              )}
            </div>
          );
        })()}

        {/* ── Campaign: D-X + channel ── */}
        {engine === 'time' && variant === 'campaign' && (() => {
          const d = md?.launchDate ? daysRemaining(md.launchDate) : null;
          return (
            <div className="engine-meta-row" style={{ marginTop: '12px' }}>
              {d != null && d > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f43f5e' }}>D-</span>
                  <span className="header-campaign-d">{d}</span>
                  <span className="header-campaign-label" style={{ marginLeft: '4px' }}>para lançamento</span>
                </div>
              )}
              {md?.campaignChannel && (
                <span className="campaign-channel-tag">{md.campaignChannel}</span>
              )}
            </div>
          );
        })()}

        {/* ── Processo Recorrente: frequency + cycle progress ── */}
        {engine === 'recurring' && (() => {
          const template = (md?.cycleTemplate ?? []) as Array<{ id: string; text: string }>;
          const cycles = (md?.cycles ?? []) as Array<{ id: string; periodLabel: string; items: Array<{ templateId: string; done: boolean }> }>;
          const current = cycles[cycles.length - 1];
          const doneCount = current?.items.filter(i => i.done).length ?? 0;
          const total = template.length;
          const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
          const histRate = cycles.length > 0 && total > 0
            ? Math.round(cycles.reduce((sum, c) => sum + (c.items.filter(i => i.done).length / total), 0) / cycles.length * 100)
            : null;
          return (
            <div className="engine-meta-row" style={{ marginTop: '10px', gap: '8px', flexWrap: 'wrap' }}>
              <span className="recurring-header-chip">{md?.frequency ?? 'mensal'}</span>
              {current ? (
                <>
                  <span className="recurring-header-chip">Ciclo: {current.periodLabel}</span>
                  <span className={`recurring-header-chip ${pct === 100 ? 'complete' : pct > 0 ? 'in-progress' : ''}`}>
                    {doneCount}/{total} passos {pct > 0 ? `· ${pct}%` : ''}
                  </span>
                </>
              ) : (
                <span className="recurring-header-chip">Sem ciclo ativo</span>
              )}
              {histRate != null && cycles.length > 1 && (
                <span className="recurring-header-chip" style={{ color: 'var(--text-muted)' }}>
                  {histRate}% histórico · {cycles.length} ciclos
                </span>
              )}
            </div>
          );
        })()}

        {/* ── Funil: stages + overall conversion ── */}
        {engine === 'funnel' && (() => {
          const fStages = ((md?.funilStages ?? []) as Array<{ id: string; label: string; value: number | null; order: number }>).sort((a, b) => a.order - b.order);
          const topVal = fStages[0]?.value;
          const bottomVal = fStages[fStages.length - 1]?.value;
          const overallConv = topVal && bottomVal != null && topVal > 0
            ? Math.round((bottomVal / topVal) * 100)
            : null;
          return (
            <div className="engine-meta-row" style={{ marginTop: '10px', gap: '8px', flexWrap: 'wrap' }}>
              <span className="decision-header-chip">{fStages.length} etapas</span>
              {topVal != null && <span className="decision-header-chip">Topo: {topVal.toLocaleString('pt-BR')}</span>}
              {overallConv !== null && (
                <span className={`decision-header-chip ${overallConv >= 20 ? 'decided' : 'pending'}`}>
                  Conv. geral: {overallConv}%
                </span>
              )}
            </div>
          );
        })()}

        {/* ── Decisão: options × criteria + decision status ── */}
        {engine === 'decision' && variant !== 'scenario' && (() => {
          const opts = (md?.options ?? []) as Array<{ id: string; label: string }>;
          const crits = (md?.criteria ?? []) as Array<{ id: string; label: string }>;
          const choiceId = md?.decisionChoice as string | null | undefined;
          const chosenLabel = choiceId ? (opts.find(o => o.id === choiceId)?.label ?? 'Decidido') : null;
          return (
            <div className="engine-meta-row" style={{ marginTop: '10px', gap: '8px', flexWrap: 'wrap' }}>
              <span className="decision-header-chip">{opts.length} opções</span>
              <span className="decision-header-chip">{crits.length} critérios</span>
              {chosenLabel ? (
                <span className="decision-header-chip decided">✓ {chosenLabel}</span>
              ) : (
                <span className="decision-header-chip pending">Decisão pendente</span>
              )}
            </div>
          );
        })()}

        {/* ── Cenário: scenario pills + action summary ── */}
        {engine === 'decision' && variant === 'scenario' && (() => {
          const scenarios = (md?.scenarios ?? []) as Array<{ id: string; label: string }>;
          const actions = (md?.scenarioActions ?? []) as Array<{ id: string; scenarioIds: string[]; done: boolean }>;
          const noRegret = scenarios.length > 0 ? actions.filter(a => a.scenarioIds.length >= scenarios.length).length : 0;
          return (
            <div className="engine-meta-row" style={{ marginTop: '10px', gap: '6px', flexWrap: 'wrap' }}>
              {scenarios.map(s => (
                <span key={s.id} className="scenario-pill">{s.label}</span>
              ))}
              {actions.length > 0 && (
                <span className="decision-header-chip" style={{ marginLeft: '4px' }}>
                  {noRegret} no-regret · {actions.length - noRegret} específicas
                </span>
              )}
            </div>
          );
        })()}

        {/* ── Generic: days remaining (shown for engines without special header) ── */}
        {!['metric', 'milestone', 'composite', 'time'].includes(engine) && days != null && (
          <div className="engine-meta-row" style={{ marginTop: '8px' }}>
            <span className={`project-deadline-badge${days < 14 ? ' urgent' : ''}`}>
              {days > 0 ? `${days} dias restantes` : 'Prazo encerrado'}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── ENGINE ZONE B: action zone ─────────────────────────────────────────
  function renderEngineActionZone() {
    if (!selectedProject) return null;
    const engine = getEngine(selectedProject.methodology);
    const variant = getEngineVariant(selectedProject.methodology);
    const md: MethodologyData = (selectedProject.methodologyData as MethodologyData | null) ?? {};

    if (PROJECT_REDESIGN_PREVIEW && engine === 'milestone' && variant !== 'authority') {
      return renderDeliveryPreviewStudio(md);
    }

    if (PROJECT_REDESIGN_PREVIEW && engine === 'pipeline' && variant === 'standard') {
      return renderPipelinePreviewStudio(md);
    }

    // ── METRIC engine (4DX) — Scoreboard UI ────────────────────────────
    if (engine === 'metric') {
      const alreadyDone = projectScorecard?.framework?.weekly != null;
      const leadOne = scorecardLeadMetrics[0] ?? null;
      const leadTwo = scorecardLeadMetrics[1] ?? null;
      const lagPct = selectedProject.resultTargetValue && (selectedProject.resultTargetValue ?? 0) > 0
        ? Math.min(100, Math.round(((selectedProject.resultCurrentValue ?? 0) / (selectedProject.resultTargetValue ?? 1)) * 100))
        : null;

      return (
        <div className="engine-metric scoreboard-outer">
          {/* Scoreboard header bar — week selector embedded */}
          <div className="scoreboard-header-bar">
            <div className="scoreboard-week-selector">
              <span className="scoreboard-week-badge">
                {selectedScorecardWeek ? `Semana ${selectedScorecardWeek.index} · ${selectedScorecardWeek.weekRange}` : 'Esta semana'}
              </span>
              {scorecardWeekOptions.length > 0 ? (
                <select
                  className="scoreboard-week-select"
                  value={scorecardWeekStart}
                  onChange={e => setScorecardWeekStart(e.target.value)}
                >
                  {scorecardWeekOptions.map(w => (
                    <option key={w.weekStart} value={w.weekStart}>
                      Semana {w.index} · {w.weekRange}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  className="scoreboard-week-date"
                  value={scorecardWeekStart}
                  onChange={e => setScorecardWeekStart(e.target.value)}
                />
              )}
            </div>
            <span className="scoreboard-status">
              {alreadyDone ? '✓ semana registrada' : '● aguardando check-in'}
            </span>
          </div>

          {/* Lead measure toggle buttons — or setup form if no metrics yet */}
          {leadOne && leadTwo ? (
            <>
              <div className="scoreboard-lead-grid">
                {/* Lead 1 */}
                <button
                  type="button"
                  className={`scoreboard-lead-btn${frameworkLeadOneDone ? ' done' : ''}`}
                  onClick={() => setFrameworkLeadOneDone(v => !v)}
                >
                  <div className="scoreboard-lead-icon" />
                  <span className="scoreboard-lead-label">{leadOne.name}</span>
                  <span className="scoreboard-lead-status">
                    {frameworkLeadOneDone ? 'FEITO' : 'PENDENTE'}
                  </span>
                </button>
                {/* Lead 2 */}
                <button
                  type="button"
                  className={`scoreboard-lead-btn${frameworkLeadTwoDone ? ' done' : ''}`}
                  onClick={() => setFrameworkLeadTwoDone(v => !v)}
                >
                  <div className="scoreboard-lead-icon" />
                  <span className="scoreboard-lead-label">{leadTwo.name}</span>
                  <span className="scoreboard-lead-status">
                    {frameworkLeadTwoDone ? 'FEITO' : 'PENDENTE'}
                  </span>
                </button>
              </div>

              {/* Lag metric progress bar */}
              {lagPct != null && primaryLagMetric && (
                <div className="scoreboard-lag-section">
                  <div className="scoreboard-lag-title">
                    {primaryLagMetric.name}
                    <span className="scoreboard-lag-values">
                      {selectedProject.resultCurrentValue ?? 0} → {selectedProject.resultTargetValue ?? '?'} {selectedProject.primaryMetric ?? ''}
                    </span>
                  </div>
                  <div className="scoreboard-lag-bar-wrap">
                    <div className="scoreboard-lag-bar">
                      <div className="scoreboard-lag-bar-fill" style={{ width: `${lagPct}%` }} />
                    </div>
                    <span className="scoreboard-lag-pct">{lagPct}%</span>
                  </div>
                </div>
              )}

              {/* Inline check-in form — lag value + note + save. Single flow, no duplication */}
              <div className="scoreboard-checkin-inline">
                {primaryLagMetric ? (
                  <div className="scoreboard-inline-lag">
                    <label className="scoreboard-inline-label">
                      Valor desta semana — {primaryLagMetric.name}
                    </label>
                    <input
                      type="number"
                      className="scoreboard-inline-input"
                      value={frameworkLagValue}
                      onChange={e => setFrameworkLagValue(e.target.value)}
                      placeholder={`ex: ${selectedProject.resultCurrentValue ?? 0}`}
                    />
                  </div>
                ) : (
                  <div className="scoreboard-inline-lag">
                    <label className="scoreboard-inline-label">Adicionar métrica lag</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        className="scoreboard-setup-input"
                        style={{ flex: 2 }}
                        placeholder="Nome da métrica lag (ex: seguidores)"
                        value={fourdxLagName}
                        onChange={e => setFourdxLagName(e.target.value)}
                      />
                      <input
                        className="scoreboard-setup-input"
                        style={{ flex: 1 }}
                        placeholder="Unidade"
                        value={fourdxLagUnit}
                        onChange={e => setFourdxLagUnit(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={busy || !fourdxLagName.trim()}
                        style={{ padding: '8px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                        onClick={async () => {
                          if (!fourdxLagName.trim()) return;
                          setBusy(true);
                          try {
                            await api.createProjectMetric(selectedProject.id, { kind: 'lag', name: fourdxLagName.trim(), unit: fourdxLagUnit.trim() || null });
                            setFourdxLagName(''); setFourdxLagUnit('');
                            await refetchProject();
                          } finally { setBusy(false); }
                        }}
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                )}
                <div className="scoreboard-inline-note">
                  <label className="scoreboard-inline-label">Nota da semana (opcional)</label>
                  <textarea
                    className="scoreboard-inline-textarea"
                    rows={2}
                    value={frameworkNote}
                    onChange={e => setFrameworkNote(e.target.value)}
                    placeholder="O que funcionou, riscos, decisão para próxima semana..."
                  />
                </div>
                <div className="scoreboard-inline-footer">
                  <button
                    type="button"
                    className="scoreboard-save-btn"
                    disabled={busy}
                    onClick={submitFrameworkWeeklyCheckin}
                  >
                    {alreadyDone ? 'Atualizar semana' : 'Registrar semana'}
                  </button>
                  {alreadyDone && (
                    <span className="scoreboard-saved-hint">✓ check-in registrado para esta semana</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="scoreboard-setup-zone">
              <div className="scoreboard-setup-title">Configure as ações semanais</div>
              <p className="scoreboard-setup-hint">Defina as 2 ações que você controla e que movem a métrica principal. Você também pode definir a métrica agora.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  className="scoreboard-setup-input"
                  placeholder="Ação semanal 1 (ex: postar 2 reels por semana)"
                  value={fourdxLead1}
                  onChange={e => setFourdxLead1(e.target.value)}
                />
                <input
                  className="scoreboard-setup-input"
                  placeholder="Ação semanal 2 (ex: analisar métricas toda sexta)"
                  value={fourdxLead2}
                  onChange={e => setFourdxLead2(e.target.value)}
                />
                <input
                  className="scoreboard-setup-input"
                  placeholder="Métrica de resultado (ex: seguidores no Instagram)"
                  value={fourdxLagName}
                  onChange={e => setFourdxLagName(e.target.value)}
                />
                <input
                  className="scoreboard-setup-input"
                  placeholder="Unidade (ex: seguidores, R$, leads)"
                  value={fourdxSetupUnit}
                  onChange={e => setFourdxSetupUnit(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || !fourdxLead1.trim() || !fourdxLead2.trim()}
                  style={{ alignSelf: 'flex-start', padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}
                  onClick={async () => {
                    if (!fourdxLead1.trim() || !fourdxLead2.trim()) return;
                    setBusy(true);
                    try {
                      const unit = fourdxSetupUnit.trim() || null;
                      const calls: Promise<unknown>[] = [
                        api.createProjectMetric(selectedProject.id, { kind: 'lead', name: fourdxLead1.trim(), unit }),
                        api.createProjectMetric(selectedProject.id, { kind: 'lead', name: fourdxLead2.trim(), unit }),
                      ];
                      if (fourdxLagName.trim()) {
                        calls.push(api.createProjectMetric(selectedProject.id, { kind: 'lag', name: fourdxLagName.trim(), unit }));
                      }
                      await Promise.all(calls);
                      setFourdxLead1(''); setFourdxLead2(''); setFourdxLagName(''); setFourdxSetupUnit('');
                      await refetchProject();
                    } finally { setBusy(false); }
                  }}
                >
                  Salvar configuração 4DX
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ── MILESTONE engine (Entrega) — Timeline UI ────────────────────────
    if (engine === 'milestone' && variant !== 'authority') {
      const milestones = md.milestones ?? [];
      const blockers = md.blockers ?? [];
      const done = milestones.filter(m => m.done).length;
      const critical = milestones.find(m => !m.done && m.critical);
      return (
        <div className="engine-milestone entrega-zone">
          <div className="entrega-zone-header">
            <div>
              <span className="entrega-zone-title">Marcos do projeto</span>
              {milestones.length > 0 && (
                <div className="entrega-zone-sub">{done}/{milestones.length} concluídos</div>
              )}
            </div>
            <button
              type="button"
              className="entrega-add-btn"
              onClick={() => openQuickAdd('milestone')}
            >
              + Marco
            </button>
          </div>

          {critical && (
            <div style={{ padding: '8px 20px', background: 'rgba(224,80,80,0.08)', borderBottom: '1px solid var(--border)', fontSize: '0.82rem', color: '#e05050', fontWeight: 600 }}>
              ⚠ Marco crítico pendente: {critical.title}
            </div>
          )}

          {/* Inline add milestone form */}
          {engineQuickAdd.type === 'milestone' && (
            <div className="quick-add-form">
              <input
                autoFocus
                placeholder="Nome do marco..."
                value={engineQuickAdd.draft.title ?? ''}
                onChange={e => setQuickDraft('title', e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && engineQuickAdd.draft.title?.trim()) {
                    setBusy(true);
                    try {
                      await api.addMethodologyItem(selectedProject.id, {
                        arrayKey: 'milestones',
                        item: { title: engineQuickAdd.draft.title.trim(), done: false, critical: engineQuickAdd.draft.critical === '1', order: milestones.length }
                      });
                      closeQuickAdd();
                      await refetchProject();
                    } finally { setBusy(false); }
                  }
                  if (e.key === 'Escape') closeQuickAdd();
                }}
              />
              <label className="quick-add-check">
                <input type="checkbox" checked={engineQuickAdd.draft.critical === '1'} onChange={e => setQuickDraft('critical', e.target.checked ? '1' : '')} />
                Marco crítico
              </label>
              <div className="quick-add-actions">
                <button type="button" className="ghost-button" onClick={closeQuickAdd}>Cancelar</button>
                <button
                  type="button"
                  disabled={busy || !engineQuickAdd.draft.title?.trim()}
                  onClick={async () => {
                    if (!engineQuickAdd.draft.title?.trim()) return;
                    setBusy(true);
                    try {
                      await api.addMethodologyItem(selectedProject.id, {
                        arrayKey: 'milestones',
                        item: { title: engineQuickAdd.draft.title.trim(), done: false, critical: engineQuickAdd.draft.critical === '1', order: milestones.length }
                      });
                      closeQuickAdd();
                      await refetchProject();
                    } finally { setBusy(false); }
                  }}
                >
                  Adicionar marco
                </button>
              </div>
            </div>
          )}

          {milestones.length === 0 ? (
            <div style={{ padding: '20px' }}>
              <EmptyState title="Nenhum marco definido" description="Clique em + Marco para começar." />
            </div>
          ) : (
            <div className="timeline-track" style={{ position: 'relative' }}>
              <div className="timeline-track-line" />
              {milestones.map((milestone) => {
                const nodeClass = milestone.done ? 'done' : milestone.critical ? 'critical' : '';
                const itemClass = milestone.done ? 'done' : milestone.critical ? 'critical-pending' : '';
                return (
                  <div key={milestone.id} className={`timeline-item ${itemClass}`} style={{ position: 'relative' }}>
                    <div
                      className={`timeline-node ${nodeClass}`}
                      onClick={async () => {
                        await api.updateMethodologyItem(selectedProject.id, milestone.id, {
                          arrayKey: 'milestones',
                          item: { done: !milestone.done, doneAt: !milestone.done ? new Date().toISOString() : null }
                        });
                        refetchProject();
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <div className="timeline-content">
                      <div className="timeline-item-title">{milestone.title}</div>
                      {milestone.critical && !milestone.done && (
                        <div className="timeline-critical-badge">crítico</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="item-delete-btn"
                      title="Excluir marco"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`Excluir marco "${milestone.title}"?`)) return;
                        setBusy(true);
                        try {
                          await api.deleteMethodologyItem(selectedProject.id, milestone.id, { arrayKey: 'milestones' });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Padrão de conclusão */}
          {selectedProject.methodologyExtraOne && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-2)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Padrão de conclusão</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{selectedProject.methodologyExtraOne}</div>
            </div>
          )}

          {/* Bloqueios */}
          <div className="entrega-blockers">
            <div className="entrega-blockers-header">
              <div className="entrega-blockers-title">Bloqueios{blockers.length > 0 ? ` (${blockers.filter(b => !b.resolvedAt).length} ativos)` : ''}</div>
              <button
                type="button"
                className="entrega-add-btn"
                style={{ fontSize: '0.75rem' }}
                onClick={() => openQuickAdd('blocker')}
              >+ Bloqueio</button>
            </div>
            {engineQuickAdd.type === 'blocker' && (
              <div className="quick-add-form" style={{ margin: '8px 16px' }}>
                <input
                  autoFocus
                  placeholder="Descreva o bloqueio..."
                  value={engineQuickAdd.draft.title ?? ''}
                  onChange={e => setQuickDraft('title', e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && engineQuickAdd.draft.title?.trim()) {
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'blockers',
                          item: { title: engineQuickAdd.draft.title.trim(), resolvedAt: null }
                        });
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }
                    if (e.key === 'Escape') closeQuickAdd();
                  }}
                />
                <div className="quick-add-actions">
                  <button type="button" className="ghost-button" onClick={closeQuickAdd}>Cancelar</button>
                  <button
                    type="button"
                    disabled={busy || !engineQuickAdd.draft.title?.trim()}
                    onClick={async () => {
                      if (!engineQuickAdd.draft.title?.trim()) return;
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'blockers',
                          item: { title: engineQuickAdd.draft.title.trim(), resolvedAt: null }
                        });
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >Adicionar bloqueio</button>
                </div>
              </div>
            )}
            {blockers.length === 0 ? (
              <div style={{ padding: '10px 20px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Nenhum bloqueio registrado.</div>
            ) : (
              blockers.map(b => (
                <div key={b.id} className={`entrega-blocker-item ${b.resolvedAt ? 'resolved' : 'active'}`} style={{ position: 'relative' }}>
                  <span>{b.resolvedAt ? '✓' : '⚡'} {b.title}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                    {!b.resolvedAt && (
                      <button
                        type="button"
                        className="blocker-resolve-btn"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api.updateMethodologyItem(selectedProject.id, b.id, {
                              arrayKey: 'blockers',
                              item: { resolvedAt: new Date().toISOString() }
                            });
                            await refetchProject();
                          } finally { setBusy(false); }
                        }}
                      >✓ Resolver</button>
                    )}
                    <button
                      type="button"
                      className="item-delete-btn"
                      title="Excluir bloqueio"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`Excluir bloqueio "${b.title}"?`)) return;
                        setBusy(true);
                        try {
                          await api.deleteMethodologyItem(selectedProject.id, b.id, { arrayKey: 'blockers' });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // ── MILESTONE (Autoridade) — Proof Gallery ───────────────────────────
    if (engine === 'milestone' && variant === 'authority') {
      const proofs = md.proofs ?? [];
      const score = computeAuthorityScore(proofs);
      const typeIcon = (t: string) => t === 'palestra' ? '🎤' : t === 'artigo' ? '📝' : t === 'case' ? '📋' : '💬';
      return (
        <div className="engine-milestone-authority autoridade-zone">
          {/* Authority score hero */}
          <div className="authority-score-display">
            <span className="authority-score-number">{score}</span>
            <div className="authority-score-info">
              <div className="authority-score-label">Score de autoridade</div>
              <div className="authority-score-breakdown">
                <span>Artigo ×1</span>
                <span>Menção ×1</span>
                <span>Case ×2</span>
                <span>Palestra ×3</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {proofs.length} prova{proofs.length !== 1 ? 's' : ''} registrada{proofs.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {proofs.length === 0 ? (
            <div style={{ padding: '20px' }}>
              <EmptyState title="Nenhuma prova registrada" description="Registre artigos, palestras, cases e menções." />
            </div>
          ) : (
            <div className="proof-gallery">
              {proofs.map(proof => (
                <div key={proof.id} className="proof-card">
                  <div className="proof-card-type">{typeIcon(proof.type)} {proof.type}</div>
                  <div className="proof-card-title">{proof.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                    <span className="proof-points-badge">+{proof.points} pts</span>
                    <button
                      type="button"
                      className="text-button"
                      style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const updated = proofs.filter(p => p.id !== proof.id);
                          await api.updateProject(selectedProject.id, { methodologyData: { ...md, proofs: updated } });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {engineQuickAdd.type === 'proof' ? (
            <div className="quick-add-form">
              <select
                value={engineQuickAdd.draft.type ?? 'artigo'}
                onChange={e => setQuickDraft('type', e.target.value)}
              >
                <option value="artigo">📝 Artigo (1 pt)</option>
                <option value="mencao">💬 Menção (1 pt)</option>
                <option value="podcast">🎙 Podcast (1 pt)</option>
                <option value="case">📋 Case (2 pts)</option>
                <option value="palestra">🎤 Palestra (3 pts)</option>
              </select>
              <input
                autoFocus
                placeholder="Título da prova de autoridade..."
                value={engineQuickAdd.draft.title ?? ''}
                onChange={e => setQuickDraft('title', e.target.value)}
              />
              <div className="quick-add-actions">
                <button type="button" className="ghost-button" onClick={closeQuickAdd}>Cancelar</button>
                <button
                  type="button"
                  disabled={busy || !engineQuickAdd.draft.title?.trim()}
                  onClick={async () => {
                    const proofType = engineQuickAdd.draft.type ?? 'artigo';
                    const title = engineQuickAdd.draft.title?.trim();
                    if (!title) return;
                    const pointsMap: Record<string, number> = { palestra: 3, case: 2, artigo: 1, mencao: 1, podcast: 1, outro: 1 };
                    setBusy(true);
                    try {
                      await api.addMethodologyItem(selectedProject.id, {
                        arrayKey: 'proofs',
                        item: { type: proofType, title, points: pointsMap[proofType] ?? 1, createdAt: new Date().toISOString() }
                      });
                      closeQuickAdd();
                      await refetchProject();
                    } finally { setBusy(false); }
                  }}
                >
                  Registrar prova
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="autoridade-add-btn" onClick={() => openQuickAdd('proof', { type: 'artigo' })}>
              + Adicionar prova de autoridade
            </button>
          )}
        </div>
      );
    }

    // ── LOG engine (Exploração) — Research Journal ──────────────────────
    if (engine === 'log' && variant === 'discovery') {
      const discoveries = md.discoveries ?? [];
      const hypothesis = md.hypothesis ?? selectedProject.objective;
      const criteria = md.hypothesisCriteria ?? selectedProject.methodologyExtraOne;
      const decisionData = md.decision;
      const badgeLabel = (t: string) => t === 'confirms' ? '✓' : t === 'refutes' ? '✗' : '?';
      const confirmsCount = discoveries.filter(d => d.type === 'confirms').length;
      const refutesCount = discoveries.filter(d => d.type === 'refutes').length;
      return (
        <div className="engine-log-discovery discovery-zone">
          {/* ── Hypothesis card ── */}
          {hypothesis && (
            <div className="hypothesis-card">
              <div className="hypothesis-card-header">
                <div className="hypothesis-card-label">Hipótese</div>
                {discoveries.length > 0 && (
                  <div className="discovery-stats">
                    <span className="discovery-stat confirms">✓ {confirmsCount}</span>
                    <span className="discovery-stat refutes">✗ {refutesCount}</span>
                    <span className="discovery-stat total">{discoveries.length} total</span>
                    <span className={`discovery-decision-badge ${decisionData ? 'decided' : 'pending'}`}>
                      {decisionData
                        ? (decisionData.choice === 'follow' ? '→ Seguir' : decisionData.choice === 'pivot' ? '↻ Pivotar' : '✕ Descartar')
                        : '· em análise'}
                    </span>
                  </div>
                )}
              </div>
              <div className="hypothesis-card-text">"{hypothesis}"</div>
              {criteria && <span className="hypothesis-criteria-badge">critério: {criteria}</span>}
            </div>
          )}

          {/* ── Evidence input ── */}
          {!decisionData && (
            <div className="evidence-input-wrap">
              <div className="evidence-input-label">O que você aprendeu?</div>
              <textarea
                className="evidence-textarea"
                placeholder="Descreva a descoberta desta semana..."
                rows={2}
                value={discoveryText}
                onChange={e => setDiscoveryText(e.target.value)}
              />
              <div className="evidence-type-pills">
                {(['confirms', 'refutes', 'inconclusive'] as const).map((type) => {
                  const labels = { confirms: '✓ Confirma', refutes: '✗ Refuta', inconclusive: '? Inconclusivo' };
                  return (
                    <label key={type} className={`evidence-type-pill ${type}${discoveryType === type ? ' selected' : ''}`}>
                      <input type="radio" name="dtype" value={type} checked={discoveryType === type} onChange={() => setDiscoveryType(type)} style={{ display: 'none' }} />
                      {labels[type]}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="evidence-submit-btn"
                disabled={busy || !discoveryText.trim()}
                onClick={async () => {
                  if (!discoveryText.trim()) return;
                  setBusy(true);
                  try {
                    await api.addMethodologyItem(selectedProject.id, {
                      arrayKey: 'discoveries',
                      item: { text: discoveryText.trim(), type: discoveryType, week: new Date().toISOString().slice(0, 10) }
                    });
                    setDiscoveryText('');
                    setDiscoveryType('confirms');
                    await refetchProject();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Registrar descoberta
              </button>
            </div>
          )}

          {/* ── Evidence feed ── */}
          {discoveries.length > 0 ? (
            <div className="evidence-feed">
              {[...discoveries].reverse().map(d => (
                <div key={d.id} className={`evidence-item ${d.type}`}>
                  <span className="evidence-badge">{badgeLabel(d.type)}</span>
                  <span className="evidence-text">{d.text}</span>
                  <span className="evidence-date">{d.week}</span>
                  <button
                    type="button"
                    className="item-delete-btn"
                    title="Excluir descoberta"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm('Excluir esta descoberta?')) return;
                      setBusy(true);
                      try {
                        await api.deleteMethodologyItem(selectedProject.id, d.id, { arrayKey: 'discoveries' });
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Nenhuma descoberta registrada ainda. Comece registrando o que aprendeu esta semana.
            </div>
          )}

          {/* ── Decision verdict ── */}
          {!decisionData ? (
            <div className="verdict-zone">
              <div className="verdict-zone-title">Veredicto final</div>
              <div className="verdict-options">
                {(['Seguir', 'Pivotar', 'Descartar'] as const).map((label, i) => {
                  const choices = ['follow', 'pivot', 'discard'] as const;
                  const choice = choices[i];
                  return (
                    <label key={label} className={`verdict-option${discoveryDecision === choice ? ' selected' : ''}`}>
                      <input type="radio" name={`decision-${selectedProject.id}`} value={choice}
                        checked={discoveryDecision === choice}
                        onChange={() => setDiscoveryDecision(choice)} style={{ display: 'none' }} />
                      {label}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="verdict-confirm-btn"
                disabled={busy || !discoveryDecision}
                onClick={async () => {
                  if (!discoveryDecision) return;
                  setBusy(true);
                  try {
                    await api.updateProject(selectedProject.id, {
                      methodologyData: { ...md, decision: { choice: discoveryDecision, justification: '', decidedAt: new Date().toISOString() } }
                    });
                    setDiscoveryDecision(null);
                    await refetchProject();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Encerrar com esta decisão
              </button>
            </div>
          ) : (
            <div className="verdict-recorded">
              <div className="verdict-recorded-icon">
                {decisionData.choice === 'follow' ? '→' : decisionData.choice === 'pivot' ? '↻' : '✕'}
              </div>
              <div>
                <div className="verdict-recorded-label">Decisão registrada</div>
                <div className="verdict-recorded-choice">
                  {decisionData.choice === 'follow' ? 'Seguir com a hipótese' : decisionData.choice === 'pivot' ? 'Pivotar a abordagem' : 'Descartar esta linha'}
                </div>
              </div>
              <button
                type="button"
                className="ghost-button"
                style={{ fontSize: '0.75rem', marginLeft: 'auto' }}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.updateProject(selectedProject.id, {
                      methodologyData: { ...md, decision: null }
                    });
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              >Reabrir</button>
            </div>
          )}
        </div>
      );
    }

    // ── LOG engine (Mentoria) — Session Journal ──────────────────────────
    if (engine === 'log' && variant === 'coaching') {
      const sessions = md.sessions ?? [];
      const role = md.mentoriaRole ?? 'receiving';
      const isGiving = role === 'giving';
      const openCommits = sessions.flatMap(s => s.commitments.filter(c => !c.done));
      const totalCommits = sessions.flatMap(s => s.commitments).length;
      const completionRate = totalCommits > 0 ? Math.round(((totalCommits - openCommits.length) / totalCommits) * 100) : 0;
      const learnedLabel = isGiving ? 'O que discutimos' : 'O que aprendi';
      const commitsLabel = isGiving ? 'Compromissos do mentorado' : 'Compromissos que assumi';
      const withLabel = isGiving ? 'Mentorado' : 'Mentor';
      const visibleSessions = showAllSessions ? [...sessions].reverse() : [...sessions].reverse().slice(0, 3);

      const toggleCommitDone = async (session: NonNullable<typeof md.sessions>[number], commitId: string) => {
        setBusy(true);
        try {
          const updatedCommitments = session.commitments.map(c =>
            c.id === commitId ? { ...c, done: !c.done, doneAt: !c.done ? new Date().toISOString() : null } : c
          );
          await api.updateMethodologyItem(selectedProject.id, session.id, {
            arrayKey: 'sessions',
            item: { ...session, commitments: updatedCommitments }
          });
          await refetchProject();
        } finally { setBusy(false); }
      };

      const deleteCommit = async (session: NonNullable<typeof md.sessions>[number], commitId: string) => {
        if (!window.confirm('Excluir este compromisso?')) return;
        setBusy(true);
        try {
          const updatedCommitments = session.commitments.filter(c => c.id !== commitId);
          await api.updateMethodologyItem(selectedProject.id, session.id, {
            arrayKey: 'sessions',
            item: { ...session, commitments: updatedCommitments }
          });
          await refetchProject();
        } finally { setBusy(false); }
      };

      return (
        <div className="engine-log-coaching mentoria-zone">
          {/* ── Stats header ── */}
          <div className="mentoria-stats-bar">
            <div className="mentoria-stats-left">
              <span className={`mentoria-role-badge ${role}`}>
                {isGiving ? '↑ Dando mentoria' : '↓ Recebendo mentoria'}
              </span>
              {md.mentoriaWith && (
                <span className="mentoria-with-chip">{withLabel}: {md.mentoriaWith}</span>
              )}
            </div>
            <div className="mentoria-stats-right">
              <span className="mentoria-stat">{sessions.length} sessões</span>
              {openCommits.length > 0 && (
                <span className="mentoria-stat warn">{openCommits.length} compromisso{openCommits.length !== 1 ? 's' : ''} aberto{openCommits.length !== 1 ? 's' : ''}</span>
              )}
              {totalCommits > 0 && openCommits.length === 0 && (
                <span className="mentoria-stat ok">✓ {completionRate}% concluído</span>
              )}
            </div>
          </div>

          {/* ── Role toggle ── */}
          <div className="mentoria-role-toggle-row">
            <button
              type="button"
              className={`mentoria-role-btn${!isGiving ? ' active' : ''}`}
              disabled={busy}
              onClick={async () => {
                if (role === 'receiving') return;
                setBusy(true);
                try {
                  await api.updateProject(selectedProject.id, { methodologyData: { ...md, mentoriaRole: 'receiving' } });
                  await refetchProject();
                } finally { setBusy(false); }
              }}
            >↓ Recebendo</button>
            <button
              type="button"
              className={`mentoria-role-btn${isGiving ? ' active' : ''}`}
              disabled={busy}
              onClick={async () => {
                if (role === 'giving') return;
                setBusy(true);
                try {
                  await api.updateProject(selectedProject.id, { methodologyData: { ...md, mentoriaRole: 'giving' } });
                  await refetchProject();
                } finally { setBusy(false); }
              }}
            >↑ Dando</button>
          </div>

          {/* ── Next session ── */}
          {md.nextSessionDate && (
            <div className="mentoria-next-session">
              <span className="mentoria-next-label">Próxima sessão</span>
              <span className="mentoria-next-date">{md.nextSessionDate}</span>
              <button
                type="button"
                className="ghost-button"
                style={{ fontSize: '0.72rem', marginLeft: 'auto' }}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.updateProject(selectedProject.id, { methodologyData: { ...md, nextSessionDate: null } });
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              >Limpar</button>
            </div>
          )}

          {/* ── Sessions list ── */}
          {sessions.length === 0 ? (
            <EmptyState
              title="Nenhuma sessão registrada"
              description={isGiving ? 'Registre o que discutiu em cada sessão e os compromissos do mentorado.' : 'Registre o que aprendeu em cada sessão e os compromissos que assumiu.'}
            />
          ) : (
            <div className="mentoria-sessions-list">
              {visibleSessions.map(session => (
                <div key={session.id} className="session-card">
                  <div className="session-header">
                    <span className="session-date">{session.date}</span>
                    {session.durationMin && <span className="session-duration">{session.durationMin}min</span>}
                    <button
                      type="button"
                      className="item-delete-btn"
                      title="Excluir sessão"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`Excluir sessão de ${session.date}?`)) return;
                        setBusy(true);
                        try {
                          await api.deleteMethodologyItem(selectedProject.id, session.id, { arrayKey: 'sessions' });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                  <div className="session-learned">{session.learned}</div>
                  {session.commitments.length > 0 && (
                    <>
                      <div className="session-commitments-label">{commitsLabel}</div>
                      <div className="session-commitments">
                        {session.commitments.map(c => (
                          <div key={c.id} className={`commitment-item${c.done ? ' done' : ''}`}>
                            <button
                              type="button"
                              className="commitment-check-btn"
                              disabled={busy}
                              title={c.done ? 'Marcar como pendente' : 'Marcar como feito'}
                              onClick={() => toggleCommitDone(session, c.id)}
                            >
                              {c.done ? '✓' : '○'}
                            </button>
                            <span className="commitment-text">{c.text}</span>
                            <button
                              type="button"
                              className="commitment-delete-btn"
                              disabled={busy}
                              title="Excluir compromisso"
                              onClick={() => deleteCommit(session, c.id)}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {sessions.length > 3 && (
                <button
                  type="button"
                  className="ghost-button"
                  style={{ width: '100%', padding: '8px', fontSize: '0.78rem', marginTop: '4px' }}
                  onClick={() => setShowAllSessions(v => !v)}
                >
                  {showAllSessions ? '↑ Ver menos' : `↓ Ver todas as ${sessions.length} sessões`}
                </button>
              )}
            </div>
          )}

          {/* ── Add session form ── */}
          <div className="mentoria-add-form">
            <div className="mentoria-add-title">+ Nova sessão</div>
            <div className="mentoria-form-row">
              <div style={{ flex: 1 }}>
                <label className="mentoria-add-label">Data</label>
                <input
                  type="date"
                  value={mentoriaDate}
                  onChange={e => setMentoriaDate(e.target.value)}
                  className="mentoria-form-input"
                />
              </div>
              <div style={{ width: '100px' }}>
                <label className="mentoria-add-label">Duração (min)</label>
                <input
                  type="number"
                  placeholder="60"
                  min="1"
                  value={mentoriaDuration}
                  onChange={e => setMentoriaDuration(e.target.value)}
                  className="mentoria-form-input"
                />
              </div>
            </div>
            <label className="mentoria-add-label" style={{ marginTop: '10px' }}>{learnedLabel}</label>
            <textarea
              className="mentoria-add-textarea"
              placeholder={isGiving ? 'O que discutiu com o mentorado...' : 'Principais aprendizados da sessão...'}
              rows={3}
              value={mentoriaLearned}
              onChange={e => setMentoriaLearned(e.target.value)}
            />
            <label className="mentoria-add-label" style={{ marginTop: '10px' }}>
              {commitsLabel}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '6px' }}>↵ adicionar mais</span>
            </label>
            {mentoriaCommitments.map((c, i) => (
              <div key={i} className="mentoria-commit-row">
                <input
                  className="mentoria-form-input"
                  placeholder={`Compromisso ${i + 1}...`}
                  value={c}
                  onChange={e => {
                    const next = [...mentoriaCommitments];
                    next[i] = e.target.value;
                    setMentoriaCommitments(next);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); setMentoriaCommitments(prev => [...prev, '']); }
                  }}
                />
                {mentoriaCommitments.length > 1 && (
                  <button type="button" className="ghost-button" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                    onClick={() => setMentoriaCommitments(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                )}
              </div>
            ))}
            <div className="mentoria-form-footer">
              <div style={{ flex: 1 }}>
                <label className="mentoria-add-label">Próxima sessão (opcional)</label>
                <input
                  type="date"
                  className="mentoria-form-input"
                  onChange={async e => {
                    if (!e.target.value) return;
                    setBusy(true);
                    try {
                      await api.updateProject(selectedProject.id, { methodologyData: { ...md, nextSessionDate: e.target.value } });
                      await refetchProject();
                    } finally { setBusy(false); }
                  }}
                />
              </div>
              <button
                type="button"
                className="mentoria-submit-btn"
                disabled={busy || !mentoriaLearned.trim()}
                onClick={async () => {
                  if (!mentoriaLearned.trim()) return;
                  setBusy(true);
                  try {
                    const validCommitments = mentoriaCommitments.filter(c => c.trim());
                    await api.addMethodologyItem(selectedProject.id, {
                      arrayKey: 'sessions',
                      item: {
                        date: mentoriaDate,
                        durationMin: mentoriaDuration ? parseInt(mentoriaDuration) : null,
                        learned: mentoriaLearned.trim(),
                        commitments: validCommitments.map((text, i) => ({ id: `c${Date.now()}-${i}`, text, done: false }))
                      }
                    });
                    setMentoriaLearned('');
                    setMentoriaCommitments(['']);
                    setMentoriaDuration('');
                    setMentoriaDate(new Date().toISOString().slice(0, 10));
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              >Salvar sessão</button>
            </div>
          </div>
        </div>
      );
    }

    // ── PIPELINE engine ──────────────────────────────────────────────────
    if (engine === 'pipeline') {
      const stages = md.stages ?? [];
      const deals = md.deals ?? [];

      // Financial pipeline (Captação) — Sales Dashboard with forecast bar
      if (variant === 'financial') {
        const totalGoal = selectedProject.resultTargetValue ?? md.totalGoal;
        const closedStage = stages.reduce((max, s) => s.order > max.order ? s : max, stages[0] ?? { id: '', order: -1 });
        const committed = deals.filter(d => d.stageId === closedStage.id).reduce((sum, d) => sum + (d.amount ?? 0), 0);
        const forecast = computePipelineForecast(deals, closedStage.id);
        const pct = totalGoal && totalGoal > 0 ? Math.min(100, Math.round((committed / totalGoal) * 100)) : 0;
        return (
          <div className="engine-pipeline-financial" style={{ background: 'var(--bg-2)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)', padding: '16px' }}>
            {/* Forecast hero */}
            {totalGoal && totalGoal > 0 && (
              <div className="pipeline-forecast-wrap">
                <div className="pipeline-forecast-total">
                  {committed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div className="pipeline-forecast-label-row">
                  <span style={{ color: '#10b981', fontWeight: 600 }}>fechado · {pct}% da meta</span>
                  <span>meta: {totalGoal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="pipeline-forecast-bar">
                  <div className="pipeline-forecast-fill" style={{ width: `${pct}%` }} />
                </div>
                {forecast > committed && (
                  <div className="pipeline-forecast-label-row" style={{ marginTop: '6px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      forecast ponderado: {forecast.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {stages.length === 0 ? (
              <EmptyState title="Configure o pipeline" description="Edite o projeto para adicionar estágios." />
            ) : (
              <div className="kanban-wrap">
                {stages.map(stage => {
                  const stageDeals = deals.filter(d => d.stageId === stage.id);
                  const stageIdx = stages.findIndex(s => s.id === stage.id);
                  const prevStage = stageIdx > 0 ? stages[stageIdx - 1] : null;
                  const nextStage = stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null;
                  return (
                    <div key={stage.id} className="kanban-col">
                      <div className="kanban-col-header">
                        <span>{stage.label}</span>
                        <span className="kanban-col-count">{stageDeals.length}</span>
                      </div>
                      <div className="kanban-col-body">
                        {stageDeals.length === 0 ? (
                          <div className="kanban-col-empty">sem deals</div>
                        ) : stageDeals.map(deal => (
                          <div key={deal.id} className="kanban-deal-card">
                            <div className="kanban-deal-top">
                              <span className="kanban-deal-name">{deal.name}</span>
                              <button
                                type="button"
                                className="item-delete-btn"
                                disabled={busy}
                                title="Remover deal"
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await api.deleteMethodologyItem(selectedProject.id, deal.id, { arrayKey: 'deals' });
                                    await refetchProject();
                                  } finally { setBusy(false); }
                                }}
                              >✕</button>
                            </div>
                            {deal.amount != null && (
                              <div className="kanban-deal-meta">
                                {deal.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · {deal.probability ?? 50}%
                              </div>
                            )}
                            <div className="kanban-deal-actions">
                              {prevStage && (
                                <button
                                  type="button"
                                  className="kanban-back-btn"
                                  disabled={busy}
                                  onClick={async () => {
                                    setBusy(true);
                                    try {
                                      await api.updateMethodologyItem(selectedProject.id, deal.id, { arrayKey: 'deals', item: { stageId: prevStage.id, stageEnteredAt: new Date().toISOString() } });
                                      await refetchProject();
                                    } finally { setBusy(false); }
                                  }}
                                >← {prevStage.label}</button>
                              )}
                              {nextStage && (
                                <button
                                  type="button"
                                  className="kanban-advance-btn"
                                  disabled={busy}
                                  onClick={async () => {
                                    setBusy(true);
                                    try {
                                      await api.updateMethodologyItem(selectedProject.id, deal.id, { arrayKey: 'deals', item: { stageId: nextStage.id, stageEnteredAt: new Date().toISOString() } });
                                      await refetchProject();
                                    } finally { setBusy(false); }
                                  }}
                                >{nextStage.label} →</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add deal — controlled inputs */}
            <div className="kanban-add-row financial-add-row">
              <input
                className="kanban-add-input"
                placeholder="Nome do deal ou investidor..."
                value={financialNewDealName}
                onChange={e => setFinancialNewDealName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && financialNewDealName.trim() && stages.length > 0) {
                    setBusy(true);
                    try {
                      const amt = parseFloat(financialNewDealAmount) || null;
                      const prob = parseInt(financialNewDealProb) || 50;
                      await api.addMethodologyItem(selectedProject.id, {
                        arrayKey: 'deals',
                        item: { name: financialNewDealName.trim(), stageId: stages[0].id, amount: amt, probability: prob, stageEnteredAt: new Date().toISOString() }
                      });
                      setFinancialNewDealName(''); setFinancialNewDealAmount(''); setFinancialNewDealProb('50');
                      await refetchProject();
                    } finally { setBusy(false); }
                  }
                }}
              />
              <input
                type="number"
                className="kanban-add-input"
                style={{ maxWidth: '120px' }}
                placeholder="Valor (R$)"
                value={financialNewDealAmount}
                onChange={e => setFinancialNewDealAmount(e.target.value)}
              />
              <select
                className="kanban-add-input"
                style={{ maxWidth: '80px' }}
                value={financialNewDealProb}
                onChange={e => setFinancialNewDealProb(e.target.value)}
              >
                {[10,20,30,40,50,60,70,80,90,100].map(p => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
              <button
                type="button"
                className="kanban-add-btn"
                disabled={busy || !financialNewDealName.trim() || stages.length === 0}
                onClick={async () => {
                  if (!financialNewDealName.trim() || stages.length === 0) return;
                  setBusy(true);
                  try {
                    const amt = parseFloat(financialNewDealAmount) || null;
                    const prob = parseInt(financialNewDealProb) || 50;
                    await api.addMethodologyItem(selectedProject.id, {
                      arrayKey: 'deals',
                      item: { name: financialNewDealName.trim(), stageId: stages[0].id, amount: amt, probability: prob, stageEnteredAt: new Date().toISOString() }
                    });
                    setFinancialNewDealName(''); setFinancialNewDealAmount(''); setFinancialNewDealProb('50');
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              >
                + Deal
              </button>
            </div>
          </div>
        );
      }

      // Linear pipeline (Sistema de Receita) — Horizontal Stepper + Per-stage Criteria
      if (variant === 'linear') {
        const systemStages = stages.length > 0 ? stages : [
          { id: 'ideia', label: 'Ideia', order: 0 },
          { id: 'validacao', label: 'Validação', order: 1 },
          { id: 'primeiro_cliente', label: '1° Cliente', order: 2 },
          { id: 'escala', label: 'Escala', order: 3 },
        ];
        const currentDeal = deals[0];
        const currentStageOrder = currentDeal ? (systemStages.find(s => s.id === currentDeal.stageId)?.order ?? 0) : 0;
        const currentStage = systemStages.find(s => s.order === currentStageOrder);
        const nextStage = systemStages.find(s => s.order === currentStageOrder + 1);

        // Per-stage criteria (stageCriteria — separate from decision engine's criteria)
        const allCriteria = md.stageCriteria ?? [];
        const stageCriteria = allCriteria.filter(c => c.stageId === currentStage?.id);
        const doneCriteria = stageCriteria.filter(c => c.done).length;

        // Suggested criteria per stage — keyed by normalized label (lowercase, no accents)
        const normLabel = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        const suggestedCriteria: Record<string, string[]> = {
          'ideia': ['Modelo de receita definido (assinatura, serviço, produto)', 'Cliente-alvo mapeado com clareza', 'Problema central que você resolve articulado em 1 frase', 'Hipótese de preço inicial definida'],
          'validacao': ['Conversei com ≥ 5 potenciais clientes sobre o problema', 'Alguém demonstrou disposição real de pagar', 'Canal de aquisição identificado', 'Proposta de valor testada e refinada'],
          '1cliente': ['Primeiro cliente pagante fechado', 'Contrato ou acordo formal assinado', 'Entrega realizada e aprovada', 'Feedback coletado e documentado'],
          'escala': ['Processo de aquisição replicável documentado', 'Entrega sistematizada sem depender só de mim', 'Meta de crescimento mensal definida', 'Equipe ou ferramentas para suportar crescimento'],
        };
        const getSuggestions = (label: string) => suggestedCriteria[normLabel(label)] ?? [];

        // Days in current stage
        const stageEnteredAt = currentDeal?.stageEnteredAt ? new Date(currentDeal.stageEnteredAt) : null;
        const daysInStage = stageEnteredAt ? Math.floor((Date.now() - stageEnteredAt.getTime()) / 86400000) : null;

        const stageFocus: Record<string, string> = {
          'Ideia': 'Defina claramente o modelo de receita e o cliente-alvo. Qual problema você resolve?',
          'Validação': 'Valide que alguém pagaria pelo que você oferece. Busque conversas, não opiniões.',
          '1° Cliente': 'Feche o primeiro cliente pagante. Isso prova que o modelo funciona na prática.',
          'Escala': 'Sistematize aquisição e entrega para crescer sem depender de você.',
        };

        return (
          <div className="engine-pipeline-linear">
            {/* ── Journey stepper ── */}
            <div className="journey-track">
              {systemStages.map((stage) => {
                const stepClass = stage.order < currentStageOrder ? 'done' : stage.order === currentStageOrder ? 'current' : 'pending';
                return (
                  <div
                    key={stage.id}
                    className={`journey-step ${stepClass}`}
                    title={stage.order !== currentStageOrder ? `Ir para: ${stage.label}` : 'Etapa atual'}
                    style={{ cursor: stage.order !== currentStageOrder ? 'pointer' : 'default' }}
                    onClick={async () => {
                      if (stage.order === currentStageOrder || busy) return;
                      setBusy(true);
                      try {
                        if (currentDeal) {
                          await api.updateMethodologyItem(selectedProject.id, currentDeal.id, { arrayKey: 'deals', item: { stageId: stage.id, stageEnteredAt: new Date().toISOString() } });
                        } else {
                          await api.addMethodologyItem(selectedProject.id, { arrayKey: 'deals', item: { name: selectedProject.title, stageId: stage.id, stageEnteredAt: new Date().toISOString(), amount: null, probability: 50 } });
                        }
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >
                    <div className="journey-step-node">
                      {stage.order < currentStageOrder ? '✓' : stage.order + 1}
                    </div>
                    <div className="journey-step-label">{stage.label}</div>
                  </div>
                );
              })}
            </div>

            {/* ── Current stage hero ── */}
            {currentStage && (
              <div className="journey-stage-hero">
                <div className="journey-stage-meta">
                  <span className="journey-stage-name">{currentStage.label}</span>
                  {daysInStage !== null && (
                    <span className="journey-stage-days">{daysInStage === 0 ? 'Iniciou hoje' : `${daysInStage} dia${daysInStage !== 1 ? 's' : ''} nesta etapa`}</span>
                  )}
                </div>
                <p className="journey-stage-focus">{stageFocus[currentStage.label] ?? `Complete os critérios de "${currentStage.label}" antes de avançar.`}</p>
              </div>
            )}

            {/* ── Criteria for current stage ── */}
            {currentStage && (
              <div className="journey-criteria">
                <div className="journey-criteria-header">
                  <div className="journey-criteria-title">
                    Para avançar para <strong>{nextStage?.label ?? 'conclusão'}</strong>
                    {stageCriteria.length > 0 && (
                      <span className="journey-criteria-badge">{doneCriteria}/{stageCriteria.length}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="entrega-add-btn"
                    onClick={() => openQuickAdd('action', { stageId: currentStage.id })}
                  >+ Critério</button>
                </div>

                {/* Progress bar */}
                {stageCriteria.length > 0 && (
                  <div className="journey-progress-bar">
                    <div className="journey-progress-fill" style={{ width: `${Math.round((doneCriteria / stageCriteria.length) * 100)}%` }} />
                  </div>
                )}

                {/* Inline add form */}
                {engineQuickAdd.type === 'action' && engineQuickAdd.draft.stageId === currentStage.id && (
                  <div className="quick-add-form" style={{ margin: '8px 0 0' }}>
                    <input
                      autoFocus
                      placeholder="Descreva o critério..."
                      value={engineQuickAdd.draft.text ?? ''}
                      onChange={e => setQuickDraft('text', e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && engineQuickAdd.draft.text?.trim()) {
                          setBusy(true);
                          try {
                            await api.addMethodologyItem(selectedProject.id, {
                              arrayKey: 'stageCriteria',
                              item: { stageId: currentStage.id, text: engineQuickAdd.draft.text.trim(), done: false }
                            });
                            closeQuickAdd();
                            await refetchProject();
                          } finally { setBusy(false); }
                        }
                        if (e.key === 'Escape') closeQuickAdd();
                      }}
                    />
                    <div className="quick-add-actions">
                      <button type="button" className="ghost-button" onClick={closeQuickAdd}>Cancelar</button>
                      <button
                        type="button"
                        disabled={busy || !engineQuickAdd.draft.text?.trim()}
                        onClick={async () => {
                          if (!engineQuickAdd.draft.text?.trim()) return;
                          setBusy(true);
                          try {
                            await api.addMethodologyItem(selectedProject.id, {
                              arrayKey: 'stageCriteria',
                              item: { stageId: currentStage.id, text: engineQuickAdd.draft.text.trim(), done: false }
                            });
                            closeQuickAdd();
                            await refetchProject();
                          } finally { setBusy(false); }
                        }}
                      >Adicionar</button>
                    </div>
                  </div>
                )}

                {/* Criteria list */}
                {stageCriteria.length > 0 && (
                  <ul className="journey-criteria-list">
                    {stageCriteria.map(criterion => (
                      <li key={criterion.id} className={`journey-criterion-item ${criterion.done ? 'done' : ''}`}>
                        <button
                          type="button"
                          className="journey-criterion-check"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await api.updateMethodologyItem(selectedProject.id, criterion.id, {
                                arrayKey: 'stageCriteria',
                                item: { done: !criterion.done, doneAt: !criterion.done ? new Date().toISOString() : null }
                              });
                              await refetchProject();
                            } finally { setBusy(false); }
                          }}
                        >
                          {criterion.done ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          ) : null}
                        </button>
                        <span className="journey-criterion-text">{criterion.text}</span>
                        <button
                          type="button"
                          className="item-delete-btn"
                          title="Excluir critério"
                          disabled={busy}
                          onClick={async () => {
                            if (!window.confirm(`Excluir critério "${criterion.text}"?`)) return;
                            setBusy(true);
                            try {
                              await api.deleteMethodologyItem(selectedProject.id, criterion.id, { arrayKey: 'stageCriteria' });
                              await refetchProject();
                            } finally { setBusy(false); }
                          }}
                        ><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                      </li>
                    ))}
                  </ul>
                )}
                {(() => {
                  const addedSet = new Set(stageCriteria.map(c => c.text.toLowerCase().trim()));
                  const remaining = getSuggestions(currentStage.label).filter(s => !addedSet.has(s.toLowerCase().trim()));
                  if (remaining.length === 0) return null;
                  return (
                    <div className="journey-criteria-empty" style={stageCriteria.length > 0 ? { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' } : {}}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {stageCriteria.length === 0 ? <>Nenhum critério definido. Sugestões para <em>{currentStage.label}</em>:</> : 'Adicionar sugestão:'}
                      </p>
                      <ul>
                        {remaining.map((s, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              className="journey-suggestion-btn"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await api.addMethodologyItem(selectedProject.id, {
                                    arrayKey: 'stageCriteria',
                                    item: { stageId: currentStage.id, text: s, done: false }
                                  });
                                  await refetchProject();
                                } finally { setBusy(false); }
                              }}
                            >+ {s}</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Stage advance controls ── */}
            <div className="journey-footer">
              {!currentDeal ? (
                <button
                  type="button"
                  className="journey-advance-btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.addMethodologyItem(selectedProject.id, {
                        arrayKey: 'deals',
                        item: { name: selectedProject.title, stageId: systemStages[0].id, stageEnteredAt: new Date().toISOString(), amount: null, probability: 50 }
                      });
                      await refetchProject();
                    } finally { setBusy(false); }
                  }}
                >
                  Iniciar jornada →
                </button>
              ) : currentStageOrder < systemStages.length - 1 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {stageCriteria.length > 0 && doneCriteria < stageCriteria.length && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {stageCriteria.length - doneCriteria} critério{stageCriteria.length - doneCriteria !== 1 ? 's' : ''} restante{stageCriteria.length - doneCriteria !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    className="journey-advance-btn"
                    disabled={busy}
                    onClick={async () => {
                      if (!nextStage || !currentDeal) return;
                      setBusy(true);
                      try {
                        await api.updateMethodologyItem(selectedProject.id, currentDeal.id, {
                          arrayKey: 'deals',
                          item: { stageId: nextStage.id, stageEnteredAt: new Date().toISOString() }
                        });
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >
                    Avançar → {nextStage?.label}
                  </button>
                  {currentStageOrder > 0 && (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      style={{ fontSize: '0.78rem' }}
                      onClick={async () => {
                        const prevStage = systemStages.find(s => s.order === currentStageOrder - 1);
                        if (!prevStage || !currentDeal) return;
                        setBusy(true);
                        try {
                          await api.updateMethodologyItem(selectedProject.id, currentDeal.id, {
                            arrayKey: 'deals',
                            item: { stageId: prevStage.id, stageEnteredAt: new Date().toISOString() }
                          });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >
                      ← Voltar
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.88rem' }}>🎉 Jornada concluída!</span>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    style={{ fontSize: '0.78rem' }}
                    onClick={async () => {
                      const prevStage = systemStages.find(s => s.order === currentStageOrder - 1);
                      if (!prevStage || !currentDeal) return;
                      setBusy(true);
                      try {
                        await api.updateMethodologyItem(selectedProject.id, currentDeal.id, { arrayKey: 'deals', item: { stageId: prevStage.id, stageEnteredAt: new Date().toISOString() } });
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >← Voltar para Escala</button>
                </div>
              )}
            </div>
          </div>
        );
      }

      // Standard pipeline (CRM) — Kanban
      return (() => {
        // Stats
        const lastStage = stages.reduce((max, s) => s.order > max.order ? s : max, stages[0] ?? { id: '', order: -1, label: '' });
        const closedDeals = deals.filter(d => d.stageId === lastStage.id).length;
        const convRate = deals.length > 0 ? Math.round((closedDeals / deals.length) * 100) : 0;
        // Most stuck stage: stage (not last) with most deals & longest avg time
        const stuckStage = stages.slice(0, -1).map(s => {
          const sd = deals.filter(d => d.stageId === s.id);
          const avgDays = sd.length > 0
            ? Math.round(sd.reduce((sum, d) => sum + (d.stageEnteredAt ? Math.floor((Date.now() - new Date(d.stageEnteredAt).getTime()) / 86400000) : 0), 0) / sd.length)
            : 0;
          return { label: s.label, count: sd.length, avgDays };
        }).filter(s => s.count > 0).sort((a, b) => b.avgDays - a.avgDays)[0];

        return (
          <div className="engine-pipeline">
            {/* ── Stats header ── */}
            <div className="pipeline-stats-row">
              <span className="pipeline-stat-chip">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
              {deals.length > 0 && (
                <span className="pipeline-stat-chip">Conversão {convRate}%</span>
              )}
              {stuckStage && (
                <span className="pipeline-stat-chip warn">
                  Parado em: {stuckStage.label} · {stuckStage.count} deal{stuckStage.count !== 1 ? 's' : ''}, ~{stuckStage.avgDays}d
                </span>
              )}
            </div>

            {/* ── Kanban board ── */}
            {stages.length === 0 ? (
              <EmptyState title="Configure os estágios" description="Edite o projeto para adicionar estágios ao pipeline." />
            ) : (
              <div className="kanban-wrap">
                {stages.map(stage => {
                  const stageDeals = deals.filter(d => d.stageId === stage.id);
                  const nextStage = stages.find(s => s.order === stage.order + 1);
                  const prevStage = stages.find(s => s.order === stage.order - 1);
                  return (
                    <div key={stage.id} className="kanban-col">
                      <div className="kanban-col-header">
                        <span>{stage.label}</span>
                        <span className="kanban-col-count">{stageDeals.length}</span>
                      </div>
                      <div className="kanban-col-body">
                        {stageDeals.length === 0 && (
                          <div className="kanban-col-empty">vazio</div>
                        )}
                        {stageDeals.map(deal => {
                          const daysInStage = deal.stageEnteredAt
                            ? Math.floor((Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86400000)
                            : null;
                          return (
                            <div key={deal.id} className="kanban-deal-card">
                              <div className="kanban-deal-top">
                                <div className="kanban-deal-name">{deal.name}</div>
                                <button
                                  type="button"
                                  className="item-delete-btn"
                                  title="Excluir deal"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (!window.confirm(`Excluir "${deal.name}"?`)) return;
                                    setBusy(true);
                                    try {
                                      await api.deleteMethodologyItem(selectedProject.id, deal.id, { arrayKey: 'deals' });
                                      await refetchProject();
                                    } finally { setBusy(false); }
                                  }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                                  </svg>
                                </button>
                              </div>
                              {deal.amount != null && (
                                <div className="kanban-deal-meta">{deal.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                              )}
                              {daysInStage !== null && (
                                <div className="kanban-deal-days">{daysInStage === 0 ? 'Entrou hoje' : `${daysInStage}d neste estágio`}</div>
                              )}
                              <div className="kanban-deal-actions">
                                {prevStage && (
                                  <button
                                    type="button"
                                    className="kanban-back-btn"
                                    disabled={busy}
                                    onClick={async () => {
                                      setBusy(true);
                                      try {
                                        await api.updateMethodologyItem(selectedProject.id, deal.id, { arrayKey: 'deals', item: { stageId: prevStage.id, stageEnteredAt: new Date().toISOString() } });
                                        await refetchProject();
                                      } finally { setBusy(false); }
                                    }}
                                  >← {prevStage.label}</button>
                                )}
                                {nextStage && (
                                  <button
                                    type="button"
                                    className="kanban-advance-btn"
                                    disabled={busy}
                                    onClick={async () => {
                                      setBusy(true);
                                      try {
                                        await api.updateMethodologyItem(selectedProject.id, deal.id, { arrayKey: 'deals', item: { stageId: nextStage.id, stageEnteredAt: new Date().toISOString() } });
                                        await refetchProject();
                                      } finally { setBusy(false); }
                                    }}
                                  >→ {nextStage.label}</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Add deal ── */}
            <div className="kanban-add-row">
              <input
                className="kanban-add-input"
                placeholder="Nome do deal..."
                value={newDealName}
                onChange={e => setNewDealName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key !== 'Enter' || !newDealName.trim() || stages.length === 0) return;
                  setBusy(true);
                  try {
                    await api.addMethodologyItem(selectedProject.id, { arrayKey: 'deals', item: { name: newDealName.trim(), stageId: stages[0].id, stageEnteredAt: new Date().toISOString(), amount: null, probability: 50 } });
                    setNewDealName('');
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              />
              <button
                type="button"
                className="kanban-add-btn"
                disabled={busy || !newDealName.trim()}
                onClick={async () => {
                  if (!newDealName.trim() || stages.length === 0) return;
                  setBusy(true);
                  try {
                    await api.addMethodologyItem(selectedProject.id, { arrayKey: 'deals', item: { name: newDealName.trim(), stageId: stages[0].id, stageEnteredAt: new Date().toISOString(), amount: null, probability: 50 } });
                    setNewDealName('');
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              >+ Deal</button>
            </div>
          </div>
        );
      })()
    }

    // ── COMPOSITE engine (OKR) — Strategic Dashboard ─────────────────────
    if (engine === 'composite') {
      const krs = md.krs ?? [];
      const confidenceLevels = ['alta', 'média', 'baixa'] as const;
      const confidenceColors: Record<string, string> = { alta: '#4ac478', 'média': '#e07c4a', baixa: '#ef4444' };

      return (
        <div className="engine-composite okr-zone">
          {/* KR list */}
          {krs.length === 0 ? (
            <div style={{ padding: '16px 0' }}>
              <EmptyState title="Nenhum KR definido" description="Adicione key results abaixo para rastrear o progresso do objetivo." />
            </div>
          ) : (
            <div className="okr-kr-list">
              {krs.map(kr => {
                const pct = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
                const confColor = confidenceColors[kr.confidence ?? 'média'] ?? '#e07c4a';
                return (
                  <div key={kr.id} className="okr-kr-item">
                    <div className="okr-kr-header-row">
                      <span className="okr-kr-desc">{kr.description}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {/* Confidence toggle */}
                        <select
                          className={`okr-confidence-select conf-${(kr.confidence ?? 'media').replace('é', 'e')}`}
                          value={kr.confidence ?? 'média'}
                          disabled={busy}
                          onChange={async e => {
                            setBusy(true);
                            try {
                              await api.updateMethodologyItem(selectedProject.id, kr.id, { arrayKey: 'krs', item: { confidence: e.target.value } });
                              await refetchProject();
                            } finally { setBusy(false); }
                          }}
                        >
                          {confidenceLevels.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        {/* Delete KR */}
                        <button
                          type="button"
                          className="item-delete-btn"
                          disabled={busy}
                          title="Remover KR"
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await api.deleteMethodologyItem(selectedProject.id, kr.id, { arrayKey: 'krs' });
                              await refetchProject();
                            } finally { setBusy(false); }
                          }}
                        >✕</button>
                      </div>
                    </div>
                    <div className="okr-kr-progress" title={`${pct}%`}>
                      <div className="okr-kr-progress-fill" style={{ width: `${pct}%`, background: confColor }} />
                    </div>
                    <div className="okr-kr-values">
                      <span>{kr.currentValue} / {kr.targetValue} {kr.unit ?? ''}</span>
                      <span style={{ fontWeight: 700, color: confColor }}>{pct}%</span>
                    </div>
                    {/* Controlled inline update — shows on hover or when typing */}
                    <div className={`okr-kr-update-row${krUpdateValues[kr.id] ? ' active' : ''}`}>
                      <input
                        type="number"
                        className="okr-kr-update-input"
                        placeholder={`Novo valor (atual: ${kr.currentValue})`}
                        value={krUpdateValues[kr.id] ?? ''}
                        onChange={e => setKrUpdateValues(prev => ({ ...prev, [kr.id]: e.target.value }))}
                        onKeyDown={async e => {
                          if (e.key === 'Enter') {
                            const val = parseFloat(krUpdateValues[kr.id] ?? '');
                            if (isNaN(val)) return;
                            setBusy(true);
                            try {
                              await api.updateMethodologyItem(selectedProject.id, kr.id, { arrayKey: 'krs', item: { currentValue: val } });
                              setKrUpdateValues(prev => { const n = { ...prev }; delete n[kr.id]; return n; });
                              await refetchProject();
                            } finally { setBusy(false); }
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="okr-kr-update-btn"
                        disabled={busy || !krUpdateValues[kr.id]?.trim()}
                        onClick={async () => {
                          const val = parseFloat(krUpdateValues[kr.id] ?? '');
                          if (isNaN(val)) return;
                          setBusy(true);
                          try {
                            await api.updateMethodologyItem(selectedProject.id, kr.id, { arrayKey: 'krs', item: { currentValue: val } });
                            setKrUpdateValues(prev => { const n = { ...prev }; delete n[kr.id]; return n; });
                            await refetchProject();
                          } finally { setBusy(false); }
                        }}
                      >
                        Atualizar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add KR form */}
          {engineQuickAdd.type === 'kr' ? (
            <div className="quick-add-form okr-add-form">
              <input
                autoFocus
                placeholder="Descrição do key result (ex: 5.000 seguidores no LinkedIn)"
                value={newKrDesc}
                onChange={e => setNewKrDesc(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Escape') { closeQuickAdd(); setNewKrDesc(''); setNewKrTarget(''); setNewKrUnit(''); }
                }}
              />
              <div className="quick-add-row">
                <input
                  type="number"
                  placeholder="Valor atual (ex: 0)"
                  value={engineQuickAdd.draft.currentValue ?? ''}
                  onChange={e => setQuickDraft('currentValue', e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  placeholder="Meta (ex: 5000)"
                  value={newKrTarget}
                  onChange={e => setNewKrTarget(e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  placeholder="Unidade (ex: seguidores)"
                  value={newKrUnit}
                  onChange={e => setNewKrUnit(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="quick-add-actions">
                <button type="button" className="ghost-button" onClick={() => { closeQuickAdd(); setNewKrDesc(''); setNewKrTarget(''); setNewKrUnit(''); }}>Cancelar</button>
                <button
                  type="button"
                  disabled={busy || !newKrDesc.trim() || !newKrTarget.trim()}
                  onClick={async () => {
                    if (!newKrDesc.trim() || !newKrTarget.trim()) return;
                    setBusy(true);
                    try {
                      await api.addMethodologyItem(selectedProject.id, {
                        arrayKey: 'krs',
                        item: {
                          description: newKrDesc.trim(),
                          currentValue: parseFloat(engineQuickAdd.draft.currentValue ?? '0') || 0,
                          targetValue: parseFloat(newKrTarget) || 0,
                          unit: newKrUnit.trim() || null,
                          confidence: 'média'
                        }
                      });
                      setNewKrDesc(''); setNewKrTarget(''); setNewKrUnit('');
                      closeQuickAdd();
                      await refetchProject();
                    } finally { setBusy(false); }
                  }}
                >
                  + Adicionar KR
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="okr-add-kr-btn"
              onClick={() => openQuickAdd('kr')}
            >
              + Key Result
            </button>
          )}
        </div>
      );
    }

    // ── DECISION engine — Analytical / Scenario ──────────────────────────
    if (engine === 'decision') {
      // Scenario variant — Strategic Planner
      if (variant === 'scenario') {
        const scenarios = md.scenarios ?? [];
        const actions = md.scenarioActions ?? [];
        const noRegretCount = actions.filter(a => a.scenarioIds.length === scenarios.length).length;
        return (
          <div className="engine-decision-scenario" style={{ background: 'var(--bg-2)', borderRadius: '12px', border: '1px solid rgba(251,146,60,0.2)', overflow: 'hidden' }}>
            {/* Scenario pills header */}
            <div className="scenarios-header">
              <div className="scenarios-title">Cenários possíveis</div>
              {scenarios.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Edite o projeto para adicionar os cenários possíveis.</p>
              ) : (
                <div className="scenario-pills">
                  {scenarios.map(s => (
                    <span key={s.id} className="scenario-pill">{s.label}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions list */}
            <div style={{ padding: '10px 16px 6px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                {noRegretCount} ações no-regret · {actions.length - noRegretCount} específicas
              </div>
            </div>
            <div className="actions-list">
              {actions.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Adicione ações e indique para quais cenários elas se aplicam.</p>
              ) : (
                actions.map(action => {
                  const isNoRegret = action.scenarioIds.length >= scenarios.length && scenarios.length > 0;
                  const tagLabel = isNoRegret
                    ? 'No-regret'
                    : scenarios.filter(s => action.scenarioIds.includes(s.id)).map(s => s.label).join(' + ') || 'Nenhum';
                  return (
                    <div key={action.id} className="action-item">
                      <input
                        type="checkbox"
                        checked={action.done}
                        style={{ flexShrink: 0, cursor: 'pointer' }}
                        onChange={async () => {
                          if (busy) return;
                          setBusy(true);
                          try {
                            await api.updateMethodologyItem(selectedProject.id, action.id, { arrayKey: 'scenarioActions', item: { done: !action.done } });
                            await refetchProject();
                          } finally { setBusy(false); }
                        }}
                      />
                      <span className="action-item-text" style={{ textDecoration: action.done ? 'line-through' : 'none', opacity: action.done ? 0.5 : 1, flex: 1 }}>{action.text}</span>
                      <span className={`action-tag ${isNoRegret ? 'no-regret' : 'specific'}`}>{tagLabel}</span>
                      <button
                        type="button"
                        className="item-delete-btn"
                        disabled={busy}
                        title="Remover ação"
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api.deleteMethodologyItem(selectedProject.id, action.id, { arrayKey: 'scenarioActions' });
                            await refetchProject();
                          } finally { setBusy(false); }
                        }}
                      >✕</button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add action inline form */}
            {engineQuickAdd.type === 'action' ? (
              <div className="quick-add-form" style={{ margin: '10px 16px 16px' }}>
                <input
                  autoFocus
                  placeholder="Descreva a ação estratégica..."
                  value={engineQuickAdd.draft.text ?? ''}
                  onChange={e => setQuickDraft('text', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { closeQuickAdd(); setScenarioDraftIds([]); } }}
                />
                {/* Scenario selector — which scenarios does this action apply to? */}
                {scenarios.length > 0 && (
                  <div className="scenario-action-selector">
                    <span className="scenario-action-selector-label">Aplica-se a:</span>
                    {scenarios.map(s => (
                      <label key={s.id} className="scenario-action-check">
                        <input
                          type="checkbox"
                          checked={scenarioDraftIds.includes(s.id)}
                          onChange={() => setScenarioDraftIds(prev =>
                            prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                          )}
                        />
                        {s.label}
                      </label>
                    ))}
                    {scenarioDraftIds.length === scenarios.length && (
                      <span className="scenario-action-nr-hint">→ No-regret</span>
                    )}
                  </div>
                )}
                <div className="quick-add-actions">
                  <button type="button" className="ghost-button" onClick={() => { closeQuickAdd(); setScenarioDraftIds([]); }}>Cancelar</button>
                  <button
                    type="button"
                    disabled={busy || !engineQuickAdd.draft.text?.trim() || scenarioDraftIds.length === 0}
                    onClick={async () => {
                      const text = engineQuickAdd.draft.text?.trim();
                      if (!text || scenarioDraftIds.length === 0) return;
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'scenarioActions',
                          item: { text, scenarioIds: scenarioDraftIds, done: false }
                        });
                        setScenarioDraftIds([]);
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >
                    + Adicionar ação
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="process-new-cycle-btn"
                style={{ margin: '10px 16px 16px', background: 'rgba(251,146,60,0.07)', color: 'rgba(251,146,60,0.85)', borderColor: 'rgba(251,146,60,0.22)' }}
                onClick={() => { openQuickAdd('action'); setScenarioDraftIds(scenarios.map(s => s.id)); }}
              >
                + Adicionar ação
              </button>
            )}
          </div>
        );
      }

      // Standard decision matrix — Analytical UI
      const options = md.options ?? [];
      const criteria = md.criteria ?? [];
      const decisionChoice = md.decisionChoice;

      // Helper: compute weighted score for each option
      const weightedScore = (optId: string) =>
        criteria.reduce((sum, c) => sum + (c.weight ?? 1) * ((options.find(o => o.id === optId)?.scores?.[c.id]) ?? 0), 0);
      const maxScore = Math.max(...options.map(o => weightedScore(o.id)), 1);

      const saveScore = async (optId: string, critId: string, val: number) => {
        const updatedOptions = options.map(o =>
          o.id === optId ? { ...o, scores: { ...(o.scores ?? {}), [critId]: val } } : o
        );
        await api.updateProject(selectedProject.id, { methodologyData: { ...md, options: updatedOptions } });
        await refetchProject();
      };

      return (
        <div className="engine-decision decision-zone" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(167,139,250,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>Matriz de decisão</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{options.length} opções · {criteria.length} critérios</span>
          </div>

          {/* Add option + criteria controls */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              style={{ flex: 1, minWidth: '130px', padding: '5px 10px', borderRadius: '6px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.82rem' }}
              placeholder="+ Nova opção..."
              value={decisionNewOption}
              onChange={e => setDecisionNewOption(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && decisionNewOption.trim()) {
                  setBusy(true);
                  try {
                    const id = `op${Date.now()}`;
                    await api.updateProject(selectedProject.id, { methodologyData: { ...md, options: [...options, { id, label: decisionNewOption.trim(), scores: {} }] } });
                    setDecisionNewOption('');
                    await refetchProject();
                  } finally { setBusy(false); }
                }
              }}
            />
            <input
              style={{ flex: 1, minWidth: '130px', padding: '5px 10px', borderRadius: '6px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.82rem' }}
              placeholder="+ Novo critério..."
              value={decisionNewCriteria}
              onChange={e => setDecisionNewCriteria(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && decisionNewCriteria.trim()) {
                  setBusy(true);
                  try {
                    const id = `cr${Date.now()}`;
                    await api.updateProject(selectedProject.id, { methodologyData: { ...md, criteria: [...criteria, { id, label: decisionNewCriteria.trim(), weight: 1 }] } });
                    setDecisionNewCriteria('');
                    await refetchProject();
                  } finally { setBusy(false); }
                }
              }}
            />
          </div>

          {options.length === 0 || criteria.length === 0 ? (
            <div style={{ padding: '20px' }}>
              <EmptyState title="Configure a decisão" description="Adicione opções e critérios acima para construir a matriz." />
            </div>
          ) : (
            <>
              <div className="decision-table-wrap">
                <table className="decision-matrix-table">
                  <thead>
                    <tr>
                      <th>Critério</th>
                      <th>Peso</th>
                      {options.map(o => (
                        <th key={o.id} className="decision-opt-th">
                          <span className="decision-opt-label">{o.label}</span>
                          <button
                            type="button"
                            className="decision-remove-opt-btn"
                            title="Remover opção"
                            onClick={async () => {
                              const updated = options.filter(x => x.id !== o.id);
                              await api.updateProject(selectedProject.id, { methodologyData: { ...md, options: updated } });
                              await refetchProject();
                            }}
                          >✕</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.map(c => (
                      <tr key={c.id}>
                        <td className="decision-crit-td">
                          <span className="decision-crit-label">{c.label}</span>
                          <button
                            type="button"
                            className="decision-remove-crit-btn"
                            title="Remover critério"
                            onClick={async () => {
                              const updated = criteria.filter(x => x.id !== c.id);
                              await api.updateProject(selectedProject.id, { methodologyData: { ...md, criteria: updated } });
                              await refetchProject();
                            }}
                          >✕</button>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1} max={5}
                            value={decisionWeightValues[c.id] ?? String(c.weight ?? 1)}
                            style={{ width: '44px', padding: '3px 6px', borderRadius: '4px', background: decisionWeightValues[c.id] != null ? 'rgba(167,139,250,0.1)' : 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.82rem', textAlign: 'center' }}
                            onChange={e => setDecisionWeightValues(prev => ({ ...prev, [c.id]: e.target.value }))}
                            onBlur={async e => {
                              const val = parseInt(decisionWeightValues[c.id] ?? String(c.weight ?? 1));
                              if (!isNaN(val) && val !== c.weight) {
                                setBusy(true);
                                try {
                                  const updated = criteria.map(x => x.id === c.id ? { ...x, weight: val } : x);
                                  await api.updateProject(selectedProject.id, { methodologyData: { ...md, criteria: updated } });
                                  setDecisionWeightValues(prev => { const n = { ...prev }; delete n[c.id]; return n; });
                                  await refetchProject();
                                } finally { setBusy(false); }
                              } else {
                                setDecisionWeightValues(prev => { const n = { ...prev }; delete n[c.id]; return n; });
                              }
                            }}
                          />
                        </td>
                        {options.map(o => {
                          const scoreKey = `${o.id}-${c.id}`;
                          const currentScore = o.scores?.[c.id] ?? 0;
                          return (
                            <td key={o.id}>
                              <input
                                type="number"
                                min={0} max={10}
                                defaultValue={currentScore}
                                style={{ width: '48px', padding: '3px 6px', borderRadius: '4px', background: decisionEditScores[scoreKey] != null ? 'rgba(224,124,74,0.1)' : 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.84rem', textAlign: 'center' }}
                                onChange={e => setDecisionEditScores(prev => ({ ...prev, [scoreKey]: e.target.value }))}
                                onBlur={async e => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val !== currentScore) {
                                    setBusy(true);
                                    try {
                                      await saveScore(o.id, c.id, val);
                                      setDecisionEditScores(prev => { const next = { ...prev }; delete next[scoreKey]; return next; });
                                    } finally { setBusy(false); }
                                  }
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Weighted total row */}
                    <tr className="decision-score-row">
                      <td colSpan={2} className="decision-score-label">Score ponderado</td>
                      {options.map(o => {
                        const score = weightedScore(o.id);
                        const isBest = score === maxScore && score > 0;
                        return (
                          <td key={o.id} className={`decision-score-cell${isBest ? ' best' : ''}`}>
                            {score}{isBest ? ' ★' : ''}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Record decision */}
              {decisionChoice ? (
                <div className="decision-choice-recorded">
                  Decisão registrada: <strong>{options.find(o => o.id === decisionChoice)?.label ?? decisionChoice}</strong>
                  <button
                    type="button"
                    className="ghost-button"
                    style={{ marginLeft: '12px', fontSize: '0.78rem' }}
                    onClick={async () => {
                      await api.updateProject(selectedProject.id, { methodologyData: { ...md, decisionChoice: null } });
                      await refetchProject();
                    }}
                  >Reabrir</button>
                </div>
              ) : (
                <div style={{ padding: '10px 20px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Registrar decisão:</span>
                  {options.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      style={{ fontSize: '0.82rem' }}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.updateProject(selectedProject.id, { methodologyData: { ...md, decisionChoice: o.id } });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >Escolher: {o.label}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    // ── TIME engine (Campanha) — Launch Pad ─────────────────────────────
    if (engine === 'time' && variant === 'campaign') {
      const dailyTasks = md.dailyTasks ?? [];
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayTasks = dailyTasks.filter(t => t.date === todayStr);
      const totalGoal = selectedProject.resultTargetValue ?? md.campaignGoal;
      const campaignResult = md.campaignResult ?? 0;
      const resultPct = totalGoal && totalGoal > 0 ? Math.min(100, Math.round((campaignResult / totalGoal) * 100)) : 0;
      const launchD = md.launchDate ? daysRemaining(md.launchDate) : null;

      return (
        <div className="engine-time-campaign campaign-zone">
          {/* Campaign header: D-X + channel */}
          <div className="campaign-header-bar">
            {launchD != null && launchD > 0 ? (
              <div className="campaign-countdown">
                <span className="campaign-d-label">D</span>
                <span className="campaign-d-number">-{launchD}</span>
                <span className="campaign-d-sublabel">para lançamento</span>
              </div>
            ) : (
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>Campanha em andamento</div>
            )}
            {md.campaignChannel && (
              <span className="campaign-channel-tag">{md.campaignChannel}</span>
            )}
          </div>

          <div className="campaign-body">
            <div className="campaign-section-title">Tarefas de hoje</div>

            {/* Today task list */}
            {todayTasks.length === 0 ? (
              <div style={{ padding: '8px 0 12px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>Nenhuma tarefa para hoje. Adicione abaixo.</div>
            ) : (
              todayTasks.map(task => (
                <div
                  key={task.id}
                  className={`campaign-task-item${task.done ? ' done' : ''}`}
                >
                  <div
                    className="campaign-task-cb"
                    style={{ cursor: 'pointer' }}
                    onClick={async () => {
                      if (busy) return;
                      setBusy(true);
                      try {
                        await api.updateMethodologyItem(selectedProject.id, task.id, { arrayKey: 'dailyTasks', item: { done: !task.done } });
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  />
                  <span
                    className="campaign-task-text"
                    style={{ cursor: 'pointer', flex: 1 }}
                    onClick={async () => {
                      if (busy) return;
                      setBusy(true);
                      try {
                        await api.updateMethodologyItem(selectedProject.id, task.id, { arrayKey: 'dailyTasks', item: { done: !task.done } });
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >{task.text}</span>
                  <button
                    type="button"
                    className="item-delete-btn"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api.deleteMethodologyItem(selectedProject.id, task.id, { arrayKey: 'dailyTasks' });
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >✕</button>
                </div>
              ))
            )}

            {/* Add task — controlled input */}
            <div className="campaign-add-row">
              <input
                className="campaign-add-input"
                placeholder="Adicionar tarefa para hoje..."
                value={campaignNewTask}
                onChange={e => setCampaignNewTask(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && campaignNewTask.trim()) {
                    setBusy(true);
                    try {
                      await api.addMethodologyItem(selectedProject.id, {
                        arrayKey: 'dailyTasks',
                        item: { text: campaignNewTask.trim(), date: todayStr, done: false }
                      });
                      setCampaignNewTask('');
                      await refetchProject();
                    } finally { setBusy(false); }
                  }
                }}
              />
              <button
                type="button"
                className="campaign-add-btn"
                disabled={busy || !campaignNewTask.trim()}
                onClick={async () => {
                  if (!campaignNewTask.trim()) return;
                  setBusy(true);
                  try {
                    await api.addMethodologyItem(selectedProject.id, {
                      arrayKey: 'dailyTasks',
                      item: { text: campaignNewTask.trim(), date: todayStr, done: false }
                    });
                    setCampaignNewTask('');
                    await refetchProject();
                  } finally { setBusy(false); }
                }}
              >
                + Adicionar
              </button>
            </div>

            {/* Result vs goal */}
            {totalGoal && totalGoal > 0 && (
              <div className="campaign-result-section">
                <div className="campaign-section-title">Resultado vs meta</div>
                <div className="campaign-result-bar">
                  <div className="campaign-result-fill" style={{ width: `${resultPct}%` }} />
                </div>
                <div className="campaign-result-labels">
                  {campaignResultEdit !== null ? (
                    <input
                      type="number"
                      autoFocus
                      className="campaign-result-input"
                      value={campaignResultEdit}
                      onChange={e => setCampaignResultEdit(e.target.value)}
                      onBlur={async () => {
                        const val = parseFloat(campaignResultEdit ?? '0');
                        if (!isNaN(val)) {
                          setBusy(true);
                          try {
                            await api.updateProject(selectedProject.id, { methodologyData: { ...md, campaignResult: val } });
                            await refetchProject();
                          } finally { setBusy(false); }
                        }
                        setCampaignResultEdit(null);
                      }}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setCampaignResultEdit(null);
                      }}
                      style={{ width: '120px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg)', border: '1px solid var(--primary)', color: 'var(--text)', fontSize: '0.82rem' }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="campaign-result-value-btn"
                      title="Clique para editar resultado"
                      onClick={() => setCampaignResultEdit(String(campaignResult))}
                    >
                      {campaignResult.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ✏
                    </button>
                  )}
                  <span>{resultPct}% · meta: {totalGoal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── TIME engine (Runway) — Financial Dashboard ───────────────────────
    if (engine === 'time' && variant === 'runway') {
      const events = md.runwayEvents ?? [];
      const months = computeRunwayMonths(md.availableCash, md.burnRateMonthly);
      const runwayCls = months == null ? '' : months > 3 ? 'runway-safe' : months >= 1 ? 'runway-warn' : 'runway-danger';

      // Confirmed events only affect the "with events" calculation
      const confirmedEvents = events.filter(ev => ev.confirmed);
      const confirmedCashDelta = confirmedEvents.reduce((sum, ev) => sum + ev.amount, 0);
      const totalCashWithConfirmed = (md.availableCash ?? 0) + confirmedCashDelta;
      const monthsWithConfirmed = computeRunwayMonths(totalCashWithConfirmed, md.burnRateMonthly);

      // Helpers for displaying event impact in months
      const eventImpactMonths = (amount: number) =>
        md.burnRateMonthly && md.burnRateMonthly > 0
          ? (amount / md.burnRateMonthly).toFixed(1)
          : null;

      // Projected exhaust date
      const exhaustDate = (m: number | null) => {
        if (m == null) return null;
        const d = new Date();
        d.setMonth(d.getMonth() + Math.floor(m));
        return d.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
      };

      const saveRunwayField = async (field: 'availableCash' | 'burnRateMonthly', value: number) => {
        setBusy(true);
        try {
          await api.updateProject(selectedProject.id, { methodologyData: { ...md, [field]: value } });
          await refetchProject();
        } finally { setBusy(false); }
      };

      return (
        <div className="engine-time-runway runway-zone">
          {/* ── HERO: big number + editable fields ── */}
          <div className="runway-hero-section">
            <div className="runway-hero">
              <span className={`runway-big ${runwayCls}`}>
                {months != null ? months.toFixed(1) : '—'}
              </span>
              <div className="runway-hero-info">
                <div className="runway-unit">meses de runway</div>
                <div className="runway-exhaust">
                  esgota {exhaustDate(months) ?? 'n/d'}
                </div>
              </div>
            </div>

            <div className="runway-fields">
              {/* Caixa disponível — editable inline */}
              <div className="runway-field-row">
                <span className="runway-field-label">Caixa atual</span>
                {runwayEditingField === 'cash' ? (
                  <div className="runway-field-edit">
                    <input
                      type="number"
                      autoFocus
                      className="runway-field-input"
                      value={runwayEditCash}
                      onChange={e => setRunwayEditCash(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(runwayEditCash);
                          if (!isNaN(val)) await saveRunwayField('availableCash', val);
                          setRunwayEditingField(null);
                        }
                        if (e.key === 'Escape') setRunwayEditingField(null);
                      }}
                      onBlur={async () => {
                        const val = parseFloat(runwayEditCash);
                        if (!isNaN(val)) await saveRunwayField('availableCash', val);
                        setRunwayEditingField(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="runway-field-value"
                    onClick={() => { setRunwayEditCash(String(md.availableCash ?? '')); setRunwayEditingField('cash'); }}
                  >
                    {md.availableCash != null
                      ? md.availableCash.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : 'definir'} ✏
                  </button>
                )}
              </div>

              {/* Burn rate — editable inline */}
              <div className="runway-field-row">
                <span className="runway-field-label">Burn/mês</span>
                {runwayEditingField === 'burn' ? (
                  <div className="runway-field-edit">
                    <input
                      type="number"
                      autoFocus
                      className="runway-field-input"
                      value={runwayEditBurn}
                      onChange={e => setRunwayEditBurn(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(runwayEditBurn);
                          if (!isNaN(val)) await saveRunwayField('burnRateMonthly', val);
                          setRunwayEditingField(null);
                        }
                        if (e.key === 'Escape') setRunwayEditingField(null);
                      }}
                      onBlur={async () => {
                        const val = parseFloat(runwayEditBurn);
                        if (!isNaN(val)) await saveRunwayField('burnRateMonthly', val);
                        setRunwayEditingField(null);
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="runway-field-value"
                    onClick={() => { setRunwayEditBurn(String(md.burnRateMonthly ?? '')); setRunwayEditingField('burn'); }}
                  >
                    {md.burnRateMonthly != null
                      ? md.burnRateMonthly.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : 'definir'} ✏
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── COM EVENTOS CONFIRMADOS ── */}
          {confirmedEvents.length > 0 && monthsWithConfirmed != null && months != null && (
            <div className="runway-with-events">
              <span className="runway-with-events-label">Com eventos confirmados</span>
              <span className={`runway-with-events-value ${monthsWithConfirmed > months ? 'runway-safe' : 'runway-danger'}`}>
                {monthsWithConfirmed.toFixed(1)} meses · esgota {exhaustDate(monthsWithConfirmed)}
              </span>
              <span className="runway-with-events-delta">
                {monthsWithConfirmed > months
                  ? `+${(monthsWithConfirmed - months).toFixed(1)} meses`
                  : `${(monthsWithConfirmed - months).toFixed(1)} meses`}
              </span>
            </div>
          )}

          {/* ── EVENTOS DE CAIXA ── */}
          <div className="runway-events-list">
            <div className="runway-events-header">
              <div className="runway-events-title">Eventos de caixa</div>
              {engineQuickAdd.type !== 'event' && (
                <button
                  type="button"
                  className="runway-add-event-btn"
                  onClick={() => openQuickAdd('event', { date: new Date().toISOString().slice(0, 10) })}
                >
                  + Evento
                </button>
              )}
            </div>

            {events.length === 0 && engineQuickAdd.type !== 'event' ? (
              <div className="runway-events-empty">
                Nenhum evento. Adicione entradas (investimentos, consultorias) e saídas (despesas extras) para ver o impacto no runway.
              </div>
            ) : (
              events.map(ev => {
                const impact = eventImpactMonths(ev.amount);
                return (
                  <div key={ev.id} className={`runway-event-item ${ev.amount >= 0 ? 'income' : 'expense'}`}>
                    <div className="runway-event-dot" />
                    <span className="runway-event-label">{ev.label}</span>
                    <span className="runway-event-amount">
                      {ev.amount >= 0 ? '+' : ''}{ev.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    {impact && (
                      <span className={`runway-event-impact ${ev.amount >= 0 ? 'positive' : 'negative'}`}>
                        {ev.amount >= 0 ? '+' : ''}{impact}m
                      </span>
                    )}
                    <span className="runway-event-date">
                      {new Date(ev.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'short', year: '2-digit' })}
                    </span>
                    {/* Confirmed toggle */}
                    <button
                      type="button"
                      className={`runway-confirm-btn ${ev.confirmed ? 'confirmed' : 'pending'}`}
                      disabled={busy}
                      title={ev.confirmed ? 'Confirmado — clique para marcar como pendente' : 'Pendente — clique para confirmar'}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.updateMethodologyItem(selectedProject.id, ev.id, { arrayKey: 'runwayEvents', item: { confirmed: !ev.confirmed } });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >
                      {ev.confirmed ? '✓' : '?'}
                    </button>
                    <button
                      type="button"
                      className="item-delete-btn"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.deleteMethodologyItem(selectedProject.id, ev.id, { arrayKey: 'runwayEvents' });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >✕</button>
                  </div>
                );
              })
            )}

            {/* Add event inline form */}
            {engineQuickAdd.type === 'event' && (
              <div className="quick-add-form" style={{ marginTop: '12px' }}>
                <input
                  autoFocus
                  placeholder="Descrição (ex: Investimento Série A, Folha de pagamento)"
                  value={engineQuickAdd.draft.label ?? ''}
                  onChange={e => setQuickDraft('label', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') closeQuickAdd(); }}
                />
                <div className="quick-add-row">
                  <input
                    type="number"
                    placeholder="Valor em R$ (negativo = saída)"
                    value={engineQuickAdd.draft.amount ?? ''}
                    onChange={e => setQuickDraft('amount', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="date"
                    value={engineQuickAdd.draft.date ?? new Date().toISOString().slice(0, 10)}
                    onChange={e => setQuickDraft('date', e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <label className="quick-add-check">
                  <input
                    type="checkbox"
                    checked={engineQuickAdd.draft.confirmed === '1'}
                    onChange={e => setQuickDraft('confirmed', e.target.checked ? '1' : '')}
                  />
                  Confirmado (afeta o cálculo de runway)
                </label>
                <div className="quick-add-actions">
                  <button type="button" className="ghost-button" onClick={closeQuickAdd}>Cancelar</button>
                  <button
                    type="button"
                    disabled={busy || !engineQuickAdd.draft.label?.trim() || !engineQuickAdd.draft.amount}
                    onClick={async () => {
                      const amount = parseFloat(engineQuickAdd.draft.amount ?? '');
                      if (!engineQuickAdd.draft.label?.trim() || isNaN(amount)) return;
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'runwayEvents',
                          item: {
                            label: engineQuickAdd.draft.label.trim(),
                            amount,
                            date: engineQuickAdd.draft.date ?? new Date().toISOString().slice(0, 10),
                            confirmed: engineQuickAdd.draft.confirmed === '1'
                          }
                        });
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >
                    Registrar evento
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    // ── RECURRING engine — Routine Tracker ────────────────────────────────
    if (engine === 'recurring') {
      const template = md.cycleTemplate ?? [];
      const cycles = md.cycles ?? [];
      const currentCycle = cycles[cycles.length - 1];
      const pastCycles = cycles.slice(0, -1);
      const doneCount = currentCycle?.items.filter(i => i.done).length ?? 0;
      const total = template.length;
      const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

      // Auto-suggest period label based on frequency
      const suggestPeriodLabel = () => {
        const freq = md.frequency ?? 'mensal';
        const now = new Date();
        if (freq === 'semanal') {
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
          return `Semana ${weekNum} · ${now.toLocaleString('pt-BR', { month: 'short', year: '2-digit' })}`;
        }
        if (freq === 'mensal') return now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        if (freq === 'trimestral') return `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
        return `Ciclo ${cycles.length + 1}`;
      };

      return (
        <div className="engine-recurring process-zone">
          {/* Process zone header */}
          <div className="process-zone-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="process-frequency-badge">{md.frequency ?? 'mensal'}</span>
              <span className="process-cycle-label">
                {currentCycle ? currentCycle.periodLabel : 'Sem ciclo ativo'}
              </span>
            </div>
            {currentCycle && total > 0 && (
              <span className="process-progress-chip">
                {doneCount}/{total} · {pct}%
              </span>
            )}
          </div>

          {/* Progress bar for current cycle */}
          {currentCycle && total > 0 && (
            <div className="process-cycle-bar">
              <div className="process-cycle-bar-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success, #5bb98c)' : 'var(--primary)' }} />
            </div>
          )}

          {/* Process steps */}
          {template.length === 0 ? (
            <div style={{ padding: '20px' }}>
              <EmptyState title="Template vazio" description="Adicione passos abaixo para construir o checklist do processo." />
            </div>
          ) : (
            <div className="process-steps-list">
              {template.map(step => {
                const item = currentCycle?.items.find(i => i.templateId === step.id);
                const isDone = item?.done ?? false;
                return (
                  <div key={step.id} className={`process-step${isDone ? ' done' : ''}`}>
                    <div
                      className="process-step-check"
                      style={{ cursor: currentCycle ? 'pointer' : 'default' }}
                      onClick={async () => {
                        if (!currentCycle || busy) return;
                        setBusy(true);
                        try {
                          const existingItem = currentCycle.items.find(i => i.templateId === step.id);
                          const updatedItems = existingItem
                            ? currentCycle.items.map(i => i.templateId === step.id ? { ...i, done: !existingItem.done } : i)
                            : [...currentCycle.items, { templateId: step.id, done: true }];
                          await api.updateMethodologyItem(selectedProject.id, currentCycle.id, {
                            arrayKey: 'cycles',
                            item: { items: updatedItems }
                          });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    />
                    <span
                      className="process-step-text"
                      style={{ cursor: currentCycle ? 'pointer' : 'default' }}
                      onClick={async () => {
                        if (!currentCycle || busy) return;
                        setBusy(true);
                        try {
                          const existingItem = currentCycle.items.find(i => i.templateId === step.id);
                          const updatedItems = existingItem
                            ? currentCycle.items.map(i => i.templateId === step.id ? { ...i, done: !existingItem.done } : i)
                            : [...currentCycle.items, { templateId: step.id, done: true }];
                          await api.updateMethodologyItem(selectedProject.id, currentCycle.id, {
                            arrayKey: 'cycles',
                            item: { items: updatedItems }
                          });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >{step.text}</span>
                    {/* Delete step from template */}
                    <button
                      type="button"
                      className="item-delete-btn"
                      disabled={busy}
                      title="Remover passo"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.deleteMethodologyItem(selectedProject.id, step.id, { arrayKey: 'cycleTemplate' });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add step to template */}
          <div style={{ padding: '0 20px 4px' }}>
            {engineQuickAdd.type === 'step' ? (
              <div className="quick-add-form" style={{ marginTop: '4px' }}>
                <input
                  autoFocus
                  placeholder="Descreva o passo do processo..."
                  value={engineQuickAdd.draft.text ?? ''}
                  onChange={e => setQuickDraft('text', e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && engineQuickAdd.draft.text?.trim()) {
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'cycleTemplate',
                          item: { text: engineQuickAdd.draft.text.trim(), order: template.length }
                        });
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }
                    if (e.key === 'Escape') closeQuickAdd();
                  }}
                />
                <div className="quick-add-actions">
                  <button type="button" className="ghost-button" onClick={closeQuickAdd}>Cancelar</button>
                  <button
                    type="button"
                    disabled={busy || !engineQuickAdd.draft.text?.trim()}
                    onClick={async () => {
                      if (!engineQuickAdd.draft.text?.trim()) return;
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'cycleTemplate',
                          item: { text: engineQuickAdd.draft.text.trim(), order: template.length }
                        });
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >
                    + Adicionar passo
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="process-add-step-btn"
                disabled={busy}
                onClick={() => openQuickAdd('step')}
              >
                + Passo no template
              </button>
            )}
          </div>

          {/* Past cycles strip */}
          {pastCycles.length > 0 && (
            <div className="process-past-cycles">
              <div className="process-past-cycles-label">Ciclos anteriores</div>
              <div className="process-past-cycles-strip">
                {pastCycles.slice(-6).reverse().map(c => {
                  const done = c.items.filter(i => i.done).length;
                  const cyclePct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const isComplete = cyclePct === 100;
                  return (
                    <div key={c.id} className={`process-past-chip ${isComplete ? 'complete' : 'partial'}`} title={`${c.periodLabel}: ${done}/${total}`}>
                      <span className="process-past-chip-icon">{isComplete ? '✓' : '◑'}</span>
                      <span className="process-past-chip-label">{c.periodLabel}</span>
                      <span className="process-past-chip-pct">{cyclePct}%</span>
                      <button
                        type="button"
                        className="process-past-chip-delete"
                        title="Excluir ciclo"
                        onClick={async e => {
                          e.stopPropagation();
                          setBusy(true);
                          try {
                            await api.deleteMethodologyItem(selectedProject.id, c.id, { arrayKey: 'cycles' });
                            await refetchProject();
                          } finally { setBusy(false); }
                        }}
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* New cycle button */}
          <div style={{ padding: '0 20px 16px' }}>
            {engineQuickAdd.type === 'cycle' ? (
              <div className="quick-add-form" style={{ marginTop: '8px' }}>
                <input
                  autoFocus
                  placeholder="Período (ex: Abril 2026...)"
                  value={engineQuickAdd.draft.label ?? ''}
                  onChange={e => setQuickDraft('label', e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && engineQuickAdd.draft.label?.trim()) {
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'cycles',
                          item: { periodLabel: engineQuickAdd.draft.label.trim(), startDate: new Date().toISOString().slice(0, 10), items: template.map(step => ({ templateId: step.id, done: false })) }
                        });
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }
                    if (e.key === 'Escape') closeQuickAdd();
                  }}
                />
                <div className="quick-add-actions">
                  <button type="button" className="ghost-button" onClick={closeQuickAdd}>Cancelar</button>
                  <button
                    type="button"
                    disabled={busy || !engineQuickAdd.draft.label?.trim()}
                    onClick={async () => {
                      if (!engineQuickAdd.draft.label?.trim()) return;
                      setBusy(true);
                      try {
                        await api.addMethodologyItem(selectedProject.id, {
                          arrayKey: 'cycles',
                          item: { periodLabel: engineQuickAdd.draft.label.trim(), startDate: new Date().toISOString().slice(0, 10), items: template.map(step => ({ templateId: step.id, done: false })) }
                        });
                        closeQuickAdd();
                        await refetchProject();
                      } finally { setBusy(false); }
                    }}
                  >
                    Iniciar ciclo
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="process-new-cycle-btn"
                disabled={busy}
                onClick={() => {
                  const label = suggestPeriodLabel();
                  setEngineQuickAdd({ type: 'cycle', draft: { label } });
                }}
              >
                + Iniciar novo ciclo
              </button>
            )}
          </div>
        </div>
      );
    }

    // ── FUNIL engine ─────────────────────────────────────────────────────
    if (engine === 'funnel') {
      const fStages = ((md?.funilStages ?? []) as Array<{ id: string; label: string; value: number | null; order: number }>)
        .sort((a, b) => a.order - b.order);
      const maxVal = Math.max(...fStages.map(s => s.value ?? 0), 1);

      return (
        <div className="funnel-zone">
          <div className="funnel-zone-title">Etapas do funil</div>

          {fStages.length === 0 && (
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '0.84rem', textAlign: 'center' }}>
              Nenhuma etapa definida. Adicione abaixo.
            </div>
          )}

          {fStages.map((stage, i) => {
            const prev = i > 0 ? fStages[i - 1] : null;
            const conv = prev && (prev.value ?? 0) > 0 && stage.value != null
              ? Math.round((stage.value / (prev.value!)) * 100)
              : null;
            const barWidth = stage.value != null && stage.value > 0 ? Math.round((stage.value / maxVal) * 100) : 0;
            const convClass = conv === null ? '' : conv >= 50 ? 'good' : conv >= 25 ? 'ok' : 'bad';

            return (
              <div key={stage.id}>
                {/* Conversion connector between stages */}
                {i > 0 && (
                  <div className="funnel-conv-row">
                    {conv !== null ? (
                      <span className={`funnel-conv-badge ${convClass}`}>{conv}% conversão</span>
                    ) : (
                      <span className="funnel-conv-empty">↓</span>
                    )}
                  </div>
                )}

                {/* Stage row */}
                <div className="funnel-stage-row">
                  <div className="funnel-stage-label-wrap">
                    <span className="funnel-stage-name">{stage.label}</span>
                    <button
                      type="button"
                      className="funnel-stage-delete"
                      title="Remover etapa"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api.deleteMethodologyItem(selectedProject.id, stage.id, { arrayKey: 'funilStages' });
                          await refetchProject();
                        } finally { setBusy(false); }
                      }}
                    >✕</button>
                  </div>

                  <div className="funnel-bar-wrap">
                    <div
                      className="funnel-bar-fill"
                      style={{
                        width: `${barWidth}%`,
                        background: i === 0 ? '#6366f1' : `rgba(99,102,241,${Math.max(0.3, 1 - i * 0.15)})`
                      }}
                    />
                  </div>

                  {funilValueEditing[stage.id] !== undefined ? (
                    <input
                      type="number"
                      autoFocus
                      className="funnel-value-input"
                      value={funilValueEditing[stage.id]}
                      onChange={e => setFunilValueEditing(prev => ({ ...prev, [stage.id]: e.target.value }))}
                      onBlur={async () => {
                        const val = parseFloat(funilValueEditing[stage.id] ?? '');
                        setBusy(true);
                        try {
                          await api.updateMethodologyItem(selectedProject.id, stage.id, {
                            arrayKey: 'funilStages',
                            item: { value: isNaN(val) ? null : val }
                          });
                          await refetchProject();
                        } finally {
                          setBusy(false);
                          setFunilValueEditing(prev => { const n = { ...prev }; delete n[stage.id]; return n; });
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setFunilValueEditing(prev => { const n = { ...prev }; delete n[stage.id]; return n; });
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`funnel-value-btn${stage.value == null ? ' empty' : ''}`}
                      title="Clique para editar o valor"
                      onClick={() => setFunilValueEditing(prev => ({ ...prev, [stage.id]: String(stage.value ?? '') }))}
                    >
                      {stage.value != null
                        ? stage.value.toLocaleString('pt-BR')
                        : <span>—</span>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add stage */}
          <div className="funnel-add-row">
            <input
              className="funnel-add-input"
              placeholder="+ Nova etapa (ex: Visualizações, Leads, Vendas)"
              value={funilNewStageLabel}
              onChange={e => setFunilNewStageLabel(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && funilNewStageLabel.trim()) {
                  setBusy(true);
                  try {
                    await api.addMethodologyItem(selectedProject.id, {
                      arrayKey: 'funilStages',
                      item: { label: funilNewStageLabel.trim(), value: null, order: fStages.length }
                    });
                    setFunilNewStageLabel('');
                    await refetchProject();
                  } finally { setBusy(false); }
                }
              }}
            />
          </div>
        </div>
      );
    }

    return null;
  }

  // ── ENGINE ZONE C: history + tasks ────────────────────────────────────
  function renderEngineHistoryZone() {
    if (!selectedProject) return null;
    const engine = getEngine(selectedProject.methodology);

    return (
      <>
        {/* Metric engine: charts-only history (no duplicate inputs) */}
        {engine === 'metric' && (
          <section className="premium-grid two">
            {/* Lag projection chart */}
            <PremiumCard
              title="Evolução da métrica"
              subtitle={primaryLagMetric ? `${primaryLagMetric.name} · real vs projeção` : 'Adicione uma métrica de resultado para habilitar o gráfico'}
            >
              {!primaryLagMetric ? (
                <EmptyState
                  title="Sem métrica de resultado"
                  description="Configure a métrica lag acima para ver o gráfico de evolução."
                />
              ) : lagProjectionData.length === 0 ? (
                <EmptyState
                  title="Sem dados ainda"
                  description="Registre o check-in da semana acima para começar o histórico."
                />
              ) : (
                <div className="premium-chart-wrap">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={lagProjectionData}>
                      <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                      <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <YAxis tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <Tooltip
                        contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                        formatter={(value) => (value == null ? '—' : String(value))}
                        labelFormatter={(label, payload) => {
                          const point = payload?.[0]?.payload as { weekRange?: string } | undefined;
                          return point?.weekRange ? `Semana ${label} · ${point.weekRange}` : `Semana ${label}`;
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="real"
                        name="Real"
                        stroke={chartTheme.colors.primary}
                        strokeWidth={2.6}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="projected"
                        name="Projeção"
                        stroke={chartTheme.colors.warning}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                      />
                      {typeof lagProjectionData[0]?.target === 'number' && (
                        <Line
                          type="linear"
                          dataKey="target"
                          name="Meta"
                          stroke={chartTheme.colors.success}
                          strokeWidth={1.6}
                          dot={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </PremiumCard>

            {/* Lead compliance chart */}
            <PremiumCard
              title="Ritmo das ações semanais"
              subtitle="% de semanas com ambas as ações concluídas"
            >
              {scorecardLeadMetrics.length === 0 ? (
                <EmptyState
                  title="Sem ações configuradas"
                  description="Configure as ações semanais acima para ver o histórico de compliance."
                />
              ) : leadComplianceHistory.length > 1 ? (
                <div className="premium-chart-wrap">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={leadComplianceHistory}>
                      <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                      <XAxis dataKey="week" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                      <YAxis
                        domain={[0, 100]}
                        tick={axisProps.tick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle}
                        formatter={(value) => [`${value}%`, 'Compliance']}
                        labelFormatter={(label, payload) => {
                          const entry = payload?.[0]?.payload as { weekStart?: string } | undefined;
                          return entry?.weekStart
                            ? `Semana ${label} · ${formatIsoDate(entry.weekStart)}`
                            : `Semana ${label}`;
                        }}
                      />
                      <ReferenceLine y={80} stroke={chartTheme.colors.success} strokeDasharray="4 4" label={{ value: '80%', fill: chartTheme.colors.success, fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="compliance"
                        name="Compliance"
                        stroke={chartTheme.colors.primary}
                        strokeWidth={2.6}
                        dot={{ r: 2.5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="Sem histórico ainda"
                  description="Registre check-ins em semanas consecutivas para ver o gráfico de ritmo."
                />
              )}
            </PremiumCard>
          </section>
        )}

        {/* Runway engine: cash projection chart */}
        {engine === 'time' && getEngineVariant(selectedProject.methodology) === 'runway' && (() => {
          const mdRunway = (selectedProject.methodologyData as MethodologyData | null) ?? {};
          const cash = mdRunway.availableCash ?? 0;
          const burn = mdRunway.burnRateMonthly ?? 0;
          const events = mdRunway.runwayEvents ?? [];
          if (burn <= 0) return null;

          // Build monthly projection for up to 18 months
          const buildSeries = (initialCash: number, evts: typeof events) => {
            const series: { month: string; balance: number }[] = [];
            let balance = initialCash;
            const today = new Date();
            for (let i = 0; i <= 18; i++) {
              const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
              const monthKey = d.toISOString().slice(0, 7);
              const monthLabel = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
              const monthEvents = evts.filter(ev => ev.date.startsWith(monthKey));
              const monthDelta = monthEvents.reduce((sum, ev) => sum + ev.amount, 0);
              if (i > 0) balance = balance - burn + monthDelta;
              series.push({ month: monthLabel, balance: Math.max(0, Math.round(balance)) });
              if (balance <= 0) break;
            }
            return series;
          };

          const baseSeries = buildSeries(cash, []);
          const confirmedSeries = buildSeries(cash, events.filter(ev => ev.confirmed));
          const allEventsSeries = events.length > 0 ? buildSeries(cash, events) : null;

          // Merge by month label for recharts
          const allMonths = Array.from(new Set([...baseSeries, ...confirmedSeries].map(p => p.month)));
          const chartData = allMonths.map(month => ({
            month,
            base: baseSeries.find(p => p.month === month)?.balance ?? null,
            confirmado: confirmedSeries.find(p => p.month === month)?.balance ?? null,
            todos: allEventsSeries?.find(p => p.month === month)?.balance ?? null,
          }));

          const hasConfirmed = events.some(ev => ev.confirmed);
          const hasPending = events.some(ev => !ev.confirmed);

          return (
            <PremiumCard
              title="Projeção de caixa"
              subtitle="Saldo projetado mês a mês com e sem eventos"
            >
              <div className="premium-chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData}>
                    <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} />
                    <XAxis dataKey="month" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                    <YAxis
                      tick={axisProps.tick}
                      axisLine={axisProps.axisLine}
                      tickLine={axisProps.tickLine}
                      tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle.contentStyle}
                      labelStyle={tooltipStyle.labelStyle}
                      formatter={(value: number | undefined) => [
                        value != null ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—',
                        ''
                      ]}
                    />
                    <Legend />
                    <ReferenceLine y={0} stroke={chartTheme.colors.danger} strokeWidth={1.5} strokeDasharray="4 4" />
                    <Area
                      type="monotone"
                      dataKey="base"
                      name="Sem eventos"
                      stroke={chartTheme.colors.warning}
                      fill="rgba(245,158,11,0.08)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      connectNulls
                    />
                    {hasConfirmed && (
                      <Area
                        type="monotone"
                        dataKey="confirmado"
                        name="Com confirmados"
                        stroke={chartTheme.colors.primary}
                        fill="rgba(224,124,74,0.12)"
                        strokeWidth={2.4}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                    )}
                    {hasPending && allEventsSeries && (
                      <Area
                        type="monotone"
                        dataKey="todos"
                        name="Com todos"
                        stroke={chartTheme.colors.success}
                        fill="rgba(74,196,120,0.07)"
                        strokeWidth={1.8}
                        strokeDasharray="4 3"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>
          );
        })()}

        {/* Funil engine: conversion analysis table */}
        {engine === 'funnel' && (() => {
          const mdF = (selectedProject.methodologyData as MethodologyData | null) ?? {};
          const fStages = ((mdF.funilStages ?? []) as Array<{ id: string; label: string; value: number | null; order: number }>)
            .sort((a, b) => a.order - b.order);
          if (fStages.length < 2 || fStages.every(s => s.value == null)) return null;
          const topVal = fStages[0]?.value ?? 0;
          return (
            <PremiumCard title="Análise de conversão" subtitle="Taxa etapa a etapa e % do topo do funil">
              <table className="funnel-conv-table">
                <thead>
                  <tr>
                    <th>Etapa</th>
                    <th>Valor</th>
                    <th>% do topo</th>
                    <th>Conv. da etapa anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {fStages.map((stage, i) => {
                    const prev = i > 0 ? fStages[i - 1] : null;
                    const pctTop = topVal > 0 && stage.value != null ? Math.round((stage.value / topVal) * 100) : null;
                    const conv = prev && (prev.value ?? 0) > 0 && stage.value != null
                      ? Math.round((stage.value / (prev.value!)) * 100)
                      : null;
                    const convClass = conv === null ? '' : conv >= 50 ? 'good' : conv >= 25 ? 'ok' : 'bad';
                    return (
                      <tr key={stage.id}>
                        <td style={{ fontWeight: 600 }}>{stage.label}</td>
                        <td>{stage.value != null ? stage.value.toLocaleString('pt-BR') : '—'}</td>
                        <td>{pctTop != null ? `${pctTop}%` : '—'}</td>
                        <td>
                          {i === 0 ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                            : conv != null ? <span className={`funnel-conv-badge ${convClass}`}>{conv}%</span>
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </PremiumCard>
          );
        })()}

        {/* Recurring engine: completion rate per cycle chart */}
        {engine === 'recurring' && (() => {
          const mdRec = (selectedProject.methodologyData as MethodologyData | null) ?? {};
          const template = (mdRec.cycleTemplate ?? []) as Array<{ id: string }>;
          const cycles = (mdRec.cycles ?? []) as Array<{ id: string; periodLabel: string; items: Array<{ templateId: string; done: boolean }> }>;
          if (cycles.length < 2 || template.length === 0) return null;
          const chartData = cycles.map(c => ({
            label: c.periodLabel.length > 12 ? c.periodLabel.slice(0, 11) + '…' : c.periodLabel,
            conclusao: template.length > 0 ? Math.round((c.items.filter(i => i.done).length / template.length) * 100) : 0,
          }));
          return (
            <PremiumCard title="Histórico de ciclos" subtitle="% de conclusão por ciclo">
              <div className="premium-chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} barCategoryGap="25%">
                    <CartesianGrid stroke={cartesianGridProps.stroke} strokeDasharray={cartesianGridProps.strokeDasharray} vertical={false} />
                    <XAxis dataKey="label" tick={axisProps.tick} axisLine={axisProps.axisLine} tickLine={axisProps.tickLine} />
                    <YAxis domain={[0, 100]} tick={axisProps.tick} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      contentStyle={tooltipStyle.contentStyle}
                      labelStyle={tooltipStyle.labelStyle}
                      formatter={(v) => [`${v}%`, 'Conclusão']}
                    />
                    <ReferenceLine y={100} stroke={chartTheme.colors.success} strokeWidth={1} strokeDasharray="4 3" />
                    <Bar dataKey="conclusao" name="Conclusão" fill={chartTheme.colors.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PremiumCard>
          );
        })()}


      </>
    );
  }

  function renderMethodologyFrameworkPanel() {
    if (!projectScorecard) {
      return null;
    }

    return (
      <PremiumCard
        title={`Blueprint ${methodologyLabel(projectScorecard.framework.methodology)}`}
        subtitle={projectScorecard.framework.guide}
      >
        <div className="premium-metric-grid mini">
          {projectScorecard.framework.cards.map((card) => (
            <div
              key={card.id}
              className={`premium-metric ${
                card.tone === 'ok'
                  ? 'tone-success'
                  : card.tone === 'risk' || card.tone === 'pending'
                    ? 'tone-warning'
                    : 'tone-default'
              }`}
            >
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <small>{card.hint}</small>
            </div>
          ))}
        </div>

        <div className="project-framework-grid">
          <section className="project-framework-block">
            <h5>Rituais da semana</h5>
            <ul className="premium-list dense">
              {projectScorecard.framework.rituals.map((ritual) => (
                <li key={ritual.id}>
                  <div>
                    <strong>{ritual.title}</strong>
                    <small>{ritual.description}</small>
                  </div>
                  <span className={`status-tag ${ritual.status === 'done' ? 'feito' : ritual.status === 'risk' ? 'backlog' : 'andamento'}`}>
                    {ritual.status === 'done' ? 'ok' : ritual.status === 'risk' ? 'risco' : 'pendente'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="project-framework-block">
            <h5>Painel principal</h5>
            <p className="premium-empty">
              gráfico <strong>{projectScorecard.framework.board.chartFamily}</strong> • eixo X{' '}
              <strong>{projectScorecard.framework.board.xAxis}</strong> • eixo Y{' '}
              <strong>{projectScorecard.framework.board.yAxis}</strong>
            </p>
          </section>
        </div>
      </PremiumCard>
    );
  }

  function renderFrameworkWeeklyCheckinCard() {
    if (!selectedProject || !projectScorecard) {
      return null;
    }

    const leadOneMetric = scorecardLeadMetrics[0] ?? null;
    const leadTwoMetric = scorecardLeadMetrics[1] ?? null;
    const lagMetric = primaryLagMetric;
    const currentMeta = PROJECT_METHODOLOGY_CREATE_META[selectedProjectMethodology] ?? PROJECT_METHODOLOGY_CREATE_META['fourdx']!;
    const weekLabel = selectedScorecardWeek
      ? `Semana ${selectedScorecardWeek.index} • ${selectedScorecardWeek.weekRange}`
      : `Semana de ${formatIsoDate(scorecardWeekStart)}`;

    return (
      <PremiumCard
        title={`Check-in guiado ${methodologyLabel(selectedProject.methodology)}`}
        subtitle={`${weekLabel} • registre os direcionadores da metodologia e feche a leitura semanal`}
      >
        {leadOneMetric && leadTwoMetric && lagMetric ? (
          <>
            <div className="framework-checkin-grid">
              <article className="framework-checkin-block">
                <h5>{leadOneMetric.name}</h5>
                <small>{currentMeta.leadPairHint}</small>
                <div className="inline-actions">
                  <button
                    type="button"
                    className={frameworkLeadOneDone ? 'ghost-button task-filter active' : 'ghost-button'}
                    disabled={busy}
                    onClick={() => setFrameworkLeadOneDone(true)}
                  >
                    Feito
                  </button>
                  <button
                    type="button"
                    className={!frameworkLeadOneDone ? 'ghost-button task-filter active' : 'ghost-button'}
                    disabled={busy}
                    onClick={() => setFrameworkLeadOneDone(false)}
                  >
                    Não feito
                  </button>
                </div>
              </article>

              <article className="framework-checkin-block">
                <h5>{leadTwoMetric.name}</h5>
                <small>{selectedProjectDetailMeta.leadPanelTitle}</small>
                <div className="inline-actions">
                  <button
                    type="button"
                    className={frameworkLeadTwoDone ? 'ghost-button task-filter active' : 'ghost-button'}
                    disabled={busy}
                    onClick={() => setFrameworkLeadTwoDone(true)}
                  >
                    Feito
                  </button>
                  <button
                    type="button"
                    className={!frameworkLeadTwoDone ? 'ghost-button task-filter active' : 'ghost-button'}
                    disabled={busy}
                    onClick={() => setFrameworkLeadTwoDone(false)}
                  >
                    Não feito
                  </button>
                </div>
              </article>

              <article className="framework-checkin-block">
                <h5>{lagMetric.name}</h5>
                <small>{selectedProjectDetailMeta.lagWeeklyLabel}</small>
                <input
                  type="number"
                  value={frameworkLagValue}
                  onChange={(event) => setFrameworkLagValue(event.target.value)}
                  placeholder={`Valor da semana para ${lagMetric.name}`}
                />
              </article>
            </div>

            {frameworkExtraFields.length > 0 && (
              <div className="framework-checkin-extra-grid">
                {frameworkExtraFields.map((field) => {
                  const raw = frameworkExtraDraft[field.key];
                  if (field.kind === 'checkbox') {
                    return (
                      <label key={field.key} className="framework-checkin-extra-item checkbox">
                        <input
                          type="checkbox"
                          checked={raw === true}
                          onChange={(event) =>
                            setFrameworkExtraDraft((current) => ({
                              ...current,
                              [field.key]: event.target.checked
                            }))
                          }
                        />
                        <span>{field.label}</span>
                      </label>
                    );
                  }

                  if (field.kind === 'select') {
                    return (
                      <label key={field.key} className="framework-checkin-extra-item">
                        <span>{field.label}</span>
                        <select
                          value={typeof raw === 'string' ? raw : ''}
                          onChange={(event) =>
                            setFrameworkExtraDraft((current) => ({
                              ...current,
                              [field.key]: event.target.value
                            }))
                          }
                        >
                          <option value="">Selecione</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }

                  return (
                    <label key={field.key} className="framework-checkin-extra-item">
                      <span>{field.label}</span>
                      <input
                        type={field.kind === 'number' ? 'number' : 'text'}
                        value={typeof raw === 'string' ? raw : ''}
                        onChange={(event) =>
                          setFrameworkExtraDraft((current) => ({
                            ...current,
                            [field.key]: event.target.value
                          }))
                        }
                        placeholder={field.placeholder}
                      />
                    </label>
                  );
                })}
              </div>
            )}

            <label>
              Nota da semana (opcional)
              <textarea
                value={frameworkNote}
                onChange={(event) => setFrameworkNote(event.target.value)}
                placeholder="Resumo executivo do que funcionou, riscos e decisão para próxima semana."
                rows={3}
              />
            </label>

            <div className="framework-checkin-footer">
              <button type="button" disabled={busy} onClick={submitFrameworkWeeklyCheckin}>
                Salvar check-in guiado
              </button>
              <small>
                Atualiza os dois leads + lag da semana atual e registra contexto por metodologia.
              </small>
            </div>
          </>
        ) : scorecardLeadMetrics.length >= 2 && !primaryLagMetric ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Falta definir a métrica lag (o resultado que você quer mover). Adicione agora:
            </p>
            <input
              className="scoreboard-setup-input"
              placeholder={`Nome da métrica lag (ex: ${selectedProject?.primaryMetric || 'seguidores, receita, leads'})`}
              value={fourdxLagName}
              onChange={e => setFourdxLagName(e.target.value)}
            />
            <input
              className="scoreboard-setup-input"
              placeholder="Unidade (ex: seguidores, R$, leads)"
              value={fourdxLagUnit}
              onChange={e => setFourdxLagUnit(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !fourdxLagName.trim()}
              style={{ alignSelf: 'flex-start', padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}
              onClick={async () => {
                if (!fourdxLagName.trim() || !selectedProject) return;
                setBusy(true);
                try {
                  await api.createProjectMetric(selectedProject.id, { kind: 'lag', name: fourdxLagName.trim(), unit: fourdxLagUnit.trim() || null });
                  setFourdxLagName(''); setFourdxLagUnit('');
                  await refetchProject();
                } finally { setBusy(false); }
              }}
            >
              Adicionar métrica lag
            </button>
          </div>
        ) : (
          <EmptyState
            title="Scorecard incompleto para check-in guiado"
            description="Defina 2 métricas lead e 1 métrica lag para habilitar o fluxo semanal guiado."
          />
        )}
      </PremiumCard>
    );
  }

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          title="Projetos"
        />
        <PremiumCard title="Projetos">
          <SkeletonBlock height={36} />
        </PremiumCard>
        <PremiumCard title="Tarefas do projeto">
          <SkeletonBlock lines={6} />
        </PremiumCard>
      </PremiumPage>
    );
  }

  if (isProjectRoute) {
    const statusColorMap: Record<string, string> = {
      ativo: 'st-ativo',
      latente: 'st-latente',
      encerrado: 'st-encerrado',
      fantasma: 'st-fantasma',
    };
    const currentStatusClass = statusColorMap[selectedProject?.status ?? 'ativo'] ?? 'st-ativo';

    return (
      <PremiumPage>
        {/* Compact project detail header */}
        <div className="project-detail-header">
          <button
            type="button"
            className="project-back-crumb"
            onClick={() => navigate('/projetos')}
          >
            ← Projetos
          </button>
          <div className="project-detail-header-main">
            <div className="project-detail-header-left">
              <h1 className="project-detail-h1">{selectedProject?.title ?? 'Projeto não encontrado'}</h1>
              {selectedProject && (
                <span className="project-detail-subtitle">
                  {selectedProject.workspace?.name ?? 'Sem frente'} · {methodologyLabel(selectedProject.methodology)}
                </span>
              )}
            </div>
            {selectedProject && (
              <div className="project-detail-header-actions">
                <button
                  type="button"
                  className="project-new-task-btn"
                  onClick={() => {
                    setCreateEntity('task');
                    setWorkspaceId(selectedProject.workspaceId);
                    setCreateTaskProjectId(selectedProject.id);
                    setCreateModalOpen(true);
                  }}
                >
                  + Tarefa
                </button>

                <select
                  className={`project-status-badge-select ${currentStatusClass}`}
                  value={selectedProject.status ?? 'ativo'}
                  disabled={busy}
                  onChange={e => setProjectStatus(e.target.value as ProjectStatus)}
                  title={PROJECT_STATUS_HINTS[selectedProject.status as ProjectStatus] ?? ''}
                >
                  <option value="ativo">Ativo</option>
                  <option value="latente">Latente</option>
                  <option value="encerrado">Encerrado</option>
                </select>

                <div className="project-overflow-wrap">
                  <button
                    type="button"
                    className="project-overflow-trigger"
                    onClick={() => setProjectOverflowOpen(o => !o)}
                    title="Mais opções"
                  >
                    •••
                  </button>
                  {projectOverflowOpen && (
                    <>
                      <div
                        className="project-overflow-backdrop"
                        onClick={() => setProjectOverflowOpen(false)}
                      />
                      <div className="project-overflow-menu">
                        <button
                          type="button"
                          className="project-overflow-item danger"
                          disabled={busy}
                          onClick={() => { setProjectOverflowOpen(false); deleteSelectedProject(); }}
                        >
                          Excluir projeto
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

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
            {renderEngineHeader()}
            {renderEngineActionZone()}
            {renderEngineHistoryZone()}
          </>
        )}

        {methodologyPickerModal}

        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title={createEntity === 'project' ? 'Criar projeto' : 'Criar tarefa no projeto'}
          subtitle={
            createEntity === 'project'
              ? `Etapa ${projectCreateStep}/3 • ${methodologyLabel(newProjectMethodology)}`
              : 'Adicione execução com prioridade clara'
          }
          size="lg"
        >
          <div className="inline-actions create-mode-switch">
            <button
              type="button"
              className={createEntity === 'project' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
              onClick={() => {
                setCreateEntity('project');
                setCreateModalOpen(false);
                setMethodologyGuideOpen(null);
                setMethodologyPickerOpen(true);
              }}
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
            renderProjectCreateForm()
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
                    min={1}
                    step={1}
                    value={newTaskEstimatedMinutes}
                    onChange={(event) => setNewTaskEstimatedMinutes(event.target.value)}
                    required
                  />
                </label>
                <select
                  value={newTaskType}
                  onChange={(event) => {
                    const nextType = event.target.value as TaskType;
                    setNewTaskType(nextType);
                    setNewTaskPriority(suggestedPriorityFromTaskType(nextType));
                  }}
                >
                  <option value="a">Tipo A</option>
                  <option value="b">Tipo B</option>
                  <option value="c">Tipo C</option>
                </select>
              </div>
              <p className="premium-empty">
                Tipo define impacto ({newTaskType.toUpperCase()}) e prioridade define urgência. Sugestão: P
                {suggestedPriorityFromTaskType(newTaskType)}.
              </p>

              <label>
                Data limite (opcional)
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(event) => setNewTaskDueDate(event.target.value)}
                />
              </label>

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
        title="Projetos"
        subtitle={`${projects.length} projeto${projects.length !== 1 ? 's' : ''} · ${tasks.filter((task) => task.status !== 'feito').length} tarefa${tasks.filter((task) => task.status !== 'feito').length !== 1 ? 's' : ''} aberta${tasks.filter((task) => task.status !== 'feito').length !== 1 ? 's' : ''}`}
        actions={
          <div className="inline-actions">
            {projects.length > 0 && (
              <button type="button" className="ghost-button" title="Guia de metodologias" onClick={() => setGuideManuallyOpen((v) => !v)}>
                ?
              </button>
            )}
            <button type="button" className="ghost-button" onClick={() => openCreateModal('task')}>
              Nova tarefa
            </button>
            <button type="button" onClick={() => openCreateModal('project')}>
              Criar
            </button>
          </div>
        }
      />

      {(projects.length === 0 || guideManuallyOpen) && (
        <PremiumCard
          title="Como escolher a metodologia certa (rápido)"
          subtitle="use este atalho mental antes de criar um projeto"
          actions={
            <button type="button" className="ghost-button" onClick={() => { setGuideManuallyOpen(false); if (projects.length === 0) dismissProjectsOverviewGuide(); }}>
              Ocultar guia
            </button>
          }
        >
          <div className="projects-onboarding-grid">
            <article>
              <strong>4DX</strong>
              <small>Meta clara com prazo e disciplina semanal de duas MDDs.</small>
            </article>
            <article>
              <strong>Delivery</strong>
              <small>Entrega concreta com marcos, risco e escopo restante.</small>
            </article>
            <article>
              <strong>Launch</strong>
              <small>Janela crítica de lançamento com readiness e contingência.</small>
            </article>
            <article>
              <strong>Discovery</strong>
              <small>Hipótese e aprendizado: validar/refutar com evidência.</small>
            </article>
            <article>
              <strong>Growth</strong>
              <small>Crescimento contínuo com loops e métrica norte.</small>
            </article>
          </div>
          <p className="project-create-quick-hint">
            Primeiro escolha a metodologia, depois preencha somente os campos dela. O cockpit muda conforme o tipo.
          </p>
        </PremiumCard>
      )}

      {error && <p className="surface-error">{error}</p>}

      {strategicActiveLoad > 5 && (
        <p className="surface-error">
          Risco de fragmentação: {strategicActiveLoad} projetos ativos com cadência atrasada.
        </p>
      )}

      <PremiumCard title="Projetos">
        {projectSelectionCards.length === 0 ? (
          <EmptyState
            title="Sem projetos nesta frente"
            description="Crie o primeiro projeto para organizar entregas e backlog por escopo."
          />
        ) : (
          <div className="project-selector-grid">
            {projectSelectionCards.map((entry) => {
              const isActive = selectedProjectId === entry.project.id;
              const lagPct = entry.lagProgress ?? 0;
              const lagTone = lagPct > 50 ? 'danger' : lagPct > 20 ? 'warning' : 'ok';
              const cardMetrics = getProjectCardMetrics(entry.project, entry.totalTasks, entry.lagProgress);

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
                      <div className="project-selector-title-row">
                        <span className="project-selector-methodology">{methodologyLabel(entry.project.methodology)}</span>
                        <span className={`status-tag ${entry.project.status ?? 'ativo'}`}>
                          {entry.project.status ?? 'ativo'}
                        </span>
                      </div>
                      <strong>{entry.project.title}</strong>
                    </div>
                    <div className={`project-lag-bar-track lag-${lagTone}`}>
                      <div style={{ width: `${Math.min(100, lagPct)}%` }} />
                    </div>
                    <div className="project-selector-metrics">
                      {cardMetrics.map((metric, idx) => (
                        <span key={idx}>{metric}</span>
                      ))}
                    </div>
                  </button>
                  <div className="project-selector-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => openProjectDetail(entry.project.id)}
                    >
                      Abrir →
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PremiumCard>

      {methodologyPickerModal}

      <Modal
        open={projectDetailOpen && Boolean(selectedProject)}
        onClose={() => setProjectDetailOpen(false)}
        title={selectedProject?.title ?? 'Detalhe do projeto'}
        subtitle={
          selectedProject
            ? `${projectTasks.length} tarefas • ${methodologyLabel(selectedProject.methodology)} • ${selectedProject.type ?? 'operacao'} • ${selectedProject.status ?? 'ativo'}`
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
                <span>{selectedProjectDetailMeta.objectiveLabel}</span>
                <strong>{selectedProject.objective ? 'Definido' : 'Pendente'}</strong>
                <small>{selectedProject.objective ?? selectedProjectDetailMeta.objectiveHintMissing}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>{selectedProjectMethodologyMeta.lagLabel}</span>
                <strong>{selectedProject.primaryMetric ? 'Definida' : 'Pendente'}</strong>
                <small>{selectedProject.primaryMetric ?? 'Defina um alvo mensurável.'}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>{(PROJECT_METHODOLOGY_META[selectedProject.methodology ?? 'fourdx'] ?? PROJECT_METHODOLOGY_META['fourdx']!).leadLabel}</span>
                <strong>{scorecardLeadMetrics.length}/2 registradas</strong>
                <small>
                  {scorecardLeadMetrics.length
                    ? scorecardLeadMetrics.map((metric) => metric.name).join(' • ')
                    : `Defina duas medidas de ${(PROJECT_METHODOLOGY_META[selectedProject.methodology ?? 'fourdx'] ?? PROJECT_METHODOLOGY_META['fourdx']!).leadLabel.toLowerCase()}.`}
                </small>
              </div>
              <div className="premium-metric tone-default">
                <span>{selectedProjectDetailMeta.deadlineLabel}</span>
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
                <strong>Scorecard {methodologyLabel(selectedProject.methodology)}</strong>
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
                      <span>{selectedProjectDetailMeta.leadComplianceLabel}</span>
                      <strong>{projectScorecard.summary.weeklyLeadCompliancePercent}%</strong>
                      <small>
                        {projectScorecard.summary.weeklyCheckinsMissing} métrica(s) sem check-in nesta semana
                      </small>
                    </div>
                    <div className="premium-metric tone-default">
                      <span>{selectedProjectDetailMeta.lagProgressLabel}</span>
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
                      Estrutura recomendada: 2 medidas lead + 1 métrica histórica (lag), com check-in semanal.
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
                              Semana de {formatIsoDate(projectScorecard.project.weekStart)}:{' '}
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
                                          title={`${formatIsoDate(point.weekStart)}: ${point.value}`}
                                        />
                                        <small>{formatIsoDateDayMonth(point.weekStart)}</small>
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
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => requestTaskCompletion(task.id)}
                        >
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
            ? `Etapa ${projectCreateStep}/3 • ${methodologyLabel(newProjectMethodology)}`
            : 'Adicione execução com prioridade clara'
        }
        size="lg"
      >
        <div className="inline-actions create-mode-switch">
          <button
            type="button"
            className={createEntity === 'project' ? 'ghost-button task-filter active' : 'ghost-button task-filter'}
            onClick={() => {
              setCreateEntity('project');
              setCreateModalOpen(false);
              setMethodologyGuideOpen(null);
              setMethodologyPickerOpen(true);
            }}
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
          renderProjectCreateForm()
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
                  min={1}
                  step={1}
                  value={newTaskEstimatedMinutes}
                  onChange={(event) => setNewTaskEstimatedMinutes(event.target.value)}
                  required
                />
              </label>
              <select
                value={newTaskType}
                onChange={(event) => {
                  const nextType = event.target.value as TaskType;
                  setNewTaskType(nextType);
                  setNewTaskPriority(suggestedPriorityFromTaskType(nextType));
                }}
              >
                <option value="a">Tipo A</option>
                <option value="b">Tipo B</option>
                <option value="c">Tipo C</option>
              </select>
            </div>
            <p className="premium-empty">
              Tipo define impacto ({newTaskType.toUpperCase()}) e prioridade define urgência. Sugestão: P
              {suggestedPriorityFromTaskType(newTaskType)}.
            </p>

            <label>
              Data limite (opcional)
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(event) => setNewTaskDueDate(event.target.value)}
              />
            </label>

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
                  min={1}
                  step={1}
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
                <option value="otimizacao" disabled={selectedWorkspaceMode === 'manutencao'}>
                  Otimização
                </option>
                <option value="operacao">Operação</option>
                <option value="suporte">Suporte</option>
              </select>
            </div>

            {selectedWorkspaceMode === 'manutencao' && (
              <p className="premium-empty">
                Frente em manutenção: nova tarefa fica restrita a operação/suporte.
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

      <TaskCompletionModal
        open={Boolean(completionTask)}
        taskTitle={completionTask?.title ?? 'Tarefa'}
        busy={busy}
        onClose={() => setCompletionTaskId('')}
        onConfirm={(input) => confirmTaskCompletion(input)}
      />
    </PremiumPage>
  );
}

function ProjectsExecutionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectExecutionListItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [filters, setFilters] = useState<ProjectListFilters>({
    search: '',
    workspaceId: searchParams.get('workspaceId') ?? '',
    state: 'active'
  });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(searchParams.get('new') === 'true');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(filters.search), 250);
    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([
      api.getProjectExecutionList({
        workspaceId: filters.workspaceId || undefined,
        search: debouncedSearch || undefined
      }),
      api.getWorkspaces()
    ]).then(([projectRows, workspaceRows]) => {
      if (!active) return;
      setProjects(projectRows);
      setWorkspaces(workspaceRows.filter((workspace) => workspace.type !== 'geral'));
      setReady(true);
    }).catch((requestError) => {
      if (!active) return;
      setError((requestError as Error).message);
      setReady(true);
    });
    return () => { active = false; };
  }, [debouncedSearch, filters.workspaceId]);

  function changeFilters(next: ProjectListFilters) {
    setFilters(next);
    const params = new URLSearchParams(searchParams);
    if (next.workspaceId) params.set('workspaceId', next.workspaceId);
    else params.delete('workspaceId');
    params.delete('new');
    setSearchParams(params, { replace: true });
  }

  return (
    <section className="projects-execution-page">
      <header className="projects-execution-page__header">
        <div><span>EXECUÇÃO ADAPTATIVA</span><h1>Projetos</h1><p>Direção, movimento e método — numa única leitura.</p></div>
        <button type="button" onClick={() => setWizardOpen(true)}>Novo Projeto</button>
      </header>
      {!ready ? <div className="projects-list-loading"><span /><span /><span /></div> : error ? <div className="projects-list-error" role="alert"><p>{error}</p><button type="button" onClick={() => setDebouncedSearch((value) => `${value} `)}>Tentar novamente</button></div> : <ProjectList projects={projects} filters={filters} onFiltersChange={changeFilters} onNewProject={() => setWizardOpen(true)} />}
      <ProjectWizard open={wizardOpen} workspaces={workspaces} onClose={() => setWizardOpen(false)} />
    </section>
  );
}

export function ProjetosPage() {
  const { projectId } = useParams<{ projectId?: string }>();
  if (!isFrontsProjectsV2Enabled() || projectId) return <LegacyProjetosPage />;
  return <ProjectsExecutionPage />;
}
