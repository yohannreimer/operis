import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Workspace
} from '../api';
import { Modal } from '../components/modal';
import { TaskCompletionModal } from '../components/task-completion-modal';
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
import { useShellContext } from '../components/shell-context';
import { formatIsoDate, formatIsoDateDayMonth } from '../utils/date';
import { workspaceQuery } from '../utils/workspace';

type CreateEntity = 'project' | 'task';
type ProjectCreateStep = 1 | 2 | 3;
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

const PROJECT_METHODOLOGY_META: Record<
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
> = {
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
  return PROJECT_METHODOLOGY_META[methodology ?? 'fourdx'].label;
}

const PROJECT_CREATE_STEP_LABELS: Array<{ step: ProjectCreateStep; label: string }> = [
  { step: 1, label: '1. Metodologia' },
  { step: 2, label: '2. Dados essenciais' },
  { step: 3, label: '3. Preview e criação' }
];

const PROJECT_METHOD_PANEL_PREVIEW: Record<
  ProjectMethodology,
  {
    chart: string;
    focus: string;
  }
> = {
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

const PROJECT_METHODOLOGY_DETAIL_META: Record<
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
> = {
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

const PROJECT_METHODOLOGY_CREATE_META: Record<
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
> = {
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
  const createMeta = PROJECT_METHODOLOGY_CREATE_META[methodology];
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

export function ProjetosPage() {
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

  const [scorecardWeekStart, setScorecardWeekStart] = useState(() => currentWeekStartIso());
  const [projectScorecard, setProjectScorecard] = useState<ProjectScorecard | null>(null);
  const [newMetricName, setNewMetricName] = useState('');
  const [newMetricTargetValue, setNewMetricTargetValue] = useState('');
  const [newMetricUnit, setNewMetricUnit] = useState('');
  const [checkinValueByMetric, setCheckinValueByMetric] = useState<Record<string, string>>({});
  const [checkinNoteByMetric, setCheckinNoteByMetric] = useState<Record<string, string>>({});
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

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completionTask = tasks.find((task) => task.id === completionTaskId) ?? null;

  function resetProjectDraft(methodology: ProjectMethodology) {
    setNewProjectTitle('');
    setNewProjectDescription('');
    setNewProjectType(methodology === 'delivery' || methodology === 'discovery' ? 'construcao' : 'crescimento');
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
    setNewProjectCadenceDays(String(PROJECT_METHODOLOGY_CREATE_META[methodology].cadenceSuggestion));
    setNewProjectStatus('ativo');
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
  const selectedProjectMethodology = selectedProject?.methodology ?? 'fourdx';
  const selectedProjectMethodologyMeta = PROJECT_METHODOLOGY_META[selectedProjectMethodology];
  const selectedProjectDetailMeta = PROJECT_METHODOLOGY_DETAIL_META[selectedProjectMethodology];
  const frameworkExtraFields = useMemo(
    () => frameworkExtraFieldsForMethodology(selectedProjectMethodology),
    [selectedProjectMethodology]
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

  function validateProjectDraftForWizard() {
    if (!workspaceId || workspaceId === 'all') {
      return 'Selecione uma frente antes de criar projeto.';
    }

    if (!newProjectTitle.trim()) {
      return 'Defina o nome do projeto.';
    }

    const methodologyCreateMeta = PROJECT_METHODOLOGY_CREATE_META[newProjectMethodology];
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

    const methodologyMeta = PROJECT_METHODOLOGY_META[newProjectMethodology];
    const methodologyCreateMeta = PROJECT_METHODOLOGY_CREATE_META[newProjectMethodology];
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

  function renderProjectCreateForm() {
    const methodologyMeta = PROJECT_METHODOLOGY_META[newProjectMethodology];
    const createMeta = PROJECT_METHODOLOGY_CREATE_META[newProjectMethodology];
    const methodPreview = PROJECT_METHOD_PANEL_PREVIEW[newProjectMethodology];
    const checklistLines = [
      createMeta.objectiveLabel,
      createMeta.lagMetricLabel,
      `${createMeta.leadOneLabel} + ${createMeta.leadTwoLabel}`,
      ...(createMeta.extraOneRequired ? [createMeta.extraOneLabel] : []),
      ...(createMeta.extraTwoRequired ? [createMeta.extraTwoLabel] : [])
    ];

    return (
      <form className="minimal-form" onSubmit={createProject}>
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

        <div className="project-methodology-current compact">
          <div className="project-methodology-current-head">
            <strong>{methodologyMeta.label}</strong>
            <small>{methodologyMeta.subtitle}</small>
          </div>
          <button type="button" className="ghost-button" onClick={reopenMethodologyPickerFromForm}>
            Trocar metodologia
          </button>
        </div>

        <p className="project-create-quick-hint">
          <strong>Checklist:</strong> {checklistLines.join(' • ')} <span>•</span> {createMeta.cadenceHint}
        </p>

        {projectCreateStep === 2 ? (
          <>
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
              {createMeta.requireLagStart ? (
                <label>
                  Valor inicial ({createMeta.lagMetricLabel.toLowerCase()})
                  <input
                    type="number"
                    value={newProjectResultStartValue}
                    onChange={(event) => setNewProjectResultStartValue(event.target.value)}
                    placeholder="0"
                    required
                  />
                </label>
              ) : (
                <label>
                  Valor inicial
                  <input
                    type="number"
                    value={newProjectResultStartValue}
                    onChange={(event) => setNewProjectResultStartValue(event.target.value)}
                    placeholder="0 (opcional)"
                  />
                  <small>
                    Para {methodologyMeta.label}, o padrão é começar em 0 e evoluir por checkpoints semanais.
                  </small>
                </label>
              )}
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

            <div className="inline-actions">
              <button type="button" className="ghost-button" onClick={reopenMethodologyPickerFromForm}>
                Voltar para metodologia
              </button>
              <button type="submit" disabled={busy}>
                Continuar para preview
              </button>
            </div>
          </>
        ) : (
          <PremiumCard
            title={`Preview do painel ${methodologyMeta.label}`}
            subtitle="confira o cockpit que será criado ao finalizar"
          >
            <div className="premium-metric-grid mini">
              <div className="premium-metric tone-default">
                <span>Frente</span>
                <strong>{workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? 'Não selecionada'}</strong>
                <small>{newProjectTitle || 'Nome do projeto pendente'}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>Objetivo</span>
                <strong className="objective-metric-text">{newProjectObjective || 'Objetivo pendente'}</strong>
                <small>{createMeta.objectiveLabel}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>Rotina semanal</span>
                <strong>
                  {newProjectLeadMeasure1 || createMeta.leadOneLabel} + {newProjectLeadMeasure2 || createMeta.leadTwoLabel}
                </strong>
                <small>{createMeta.leadPairHint}</small>
              </div>
              <div className="premium-metric tone-default">
                <span>Mundo interno</span>
                <strong>{methodPreview.chart}</strong>
                <small>foco: {methodPreview.focus}</small>
              </div>
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
      title="Escolher metodologia do projeto"
      subtitle="Selecione o framework antes de preencher os dados do projeto."
      size="lg"
    >
      <div className="project-methodology-picker-grid">
        {methodologyKeys.map((methodology) => {
          const meta = PROJECT_METHODOLOGY_META[methodology];
          const expanded = methodologyGuideOpen === methodology;
          return (
            <article
              key={methodology}
              className={
                newProjectMethodology === methodology
                  ? 'project-methodology-picker-card active'
                  : 'project-methodology-picker-card'
              }
            >
              <header>
                <strong>{meta.label}</strong>
                <small>{meta.subtitle}</small>
              </header>
              {expanded && <p>{meta.deepDive}</p>}
              <footer className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setMethodologyGuideOpen(expanded ? null : methodology)}
                >
                  {expanded ? 'Ocultar detalhes' : 'Ler mais'}
                </button>
                <button type="button" onClick={() => startCreateProjectWithMethodology(methodology)}>
                  Usar {meta.label}
                </button>
              </footer>
            </article>
          );
        })}
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
                <Area
                  type="monotone"
                  dataKey="remaining"
                  name="Escopo restante"
                  stroke="#ef4444"
                  fill="#fecaca"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="real"
                  name="Escopo entregue"
                  stroke="#2563eb"
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
                <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                <XAxis dataKey="week" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }}
                  formatter={(value) => (value == null ? '—' : String(value))}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="real"
                  name="Resultado real"
                  stroke="#2563eb"
                  fill="#dbeafe"
                  strokeWidth={2.2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Ritmo esperado"
                  stroke="#7c3aed"
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
                <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                <XAxis dataKey="week" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }}
                  formatter={(value) => (value == null ? '—' : String(value))}
                  labelFormatter={(label, payload) => {
                    const point = payload?.[0]?.payload as { weekStart?: string; value?: number } | undefined;
                    return point?.weekStart
                      ? `Semana ${label} • ${formatIsoDate(point.weekStart)} • valor ${point.value ?? 'n/d'}`
                      : `Semana ${label}`;
                  }}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <Bar dataKey="delta" name="Delta semanal" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : chartMode === 'validation' ? (
          <div className="premium-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={lagProjectionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                <XAxis dataKey="week" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }}
                  formatter={(value) => (value == null ? '—' : String(value))}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="real"
                  name="Hipóteses validadas"
                  stroke="#16a34a"
                  fill="#dcfce7"
                  strokeWidth={2.2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Meta de validação"
                  stroke="#0f766e"
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                    <XAxis dataKey="week" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }}
                      formatter={(value) => (value == null ? '—' : String(value))}
                      labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload as { weekStart?: string } | undefined;
                        return point?.weekStart
                          ? `Semana ${label} • ${formatIsoDate(point.weekStart)}`
                          : `Semana ${label}`;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="done" name="Feito" stackId="a" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="missed" name="Não feito" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : chartMode === 'area' && leadWeeklySeries.length > 1 ? (
              <div className="premium-chart-wrap">
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={leadWeeklySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dce6f7" />
                    <XAxis dataKey="week" tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#60708a', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: '1px solid #d8e0ec' }}
                      formatter={(value) => [`${value}%`, 'Compliance']}
                    />
                    <Area
                      type="monotone"
                      dataKey="compliance"
                      name="Compliance"
                      stroke="#2563eb"
                      fill="#dbeafe"
                      strokeWidth={2.2}
                    />
                    <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : leadComplianceHistory.length > 1 && (
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
                        return entry?.weekStart
                          ? `Semana ${label} • ${formatIsoDate(entry.weekStart)}`
                          : `Semana ${label}`;
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
    const currentMeta = PROJECT_METHODOLOGY_CREATE_META[selectedProjectMethodology];
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
              ? `${selectedProject.workspace?.name ?? 'Sem frente'} • ${methodologyLabel(selectedProject.methodology)} • ${selectedProject.type ?? 'operacao'} • ${selectedProject.status ?? 'ativo'}`
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
            {showProjectGuide && (
              <PremiumCard
                title="Como usar este projeto em 90 segundos"
                subtitle={`${methodologyLabel(selectedProject.methodology)} • guia rápido para começar sem fricção`}
                actions={
                  <button type="button" className="ghost-button" onClick={dismissProjectGuide}>
                    Entendi
                  </button>
                }
              >
                <div className="premium-metric-grid mini">
                  <div className="premium-metric tone-default">
                    <span>1. Objetivo</span>
                    <strong>{PROJECT_METHODOLOGY_CREATE_META[selectedProjectMethodology].objectiveLabel}</strong>
                    <small>Defina uma frase clara com resultado e prazo.</small>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>2. Rotina semanal</span>
                    <strong>
                      {PROJECT_METHODOLOGY_CREATE_META[selectedProjectMethodology].leadOneLabel} +{' '}
                      {PROJECT_METHODOLOGY_CREATE_META[selectedProjectMethodology].leadTwoLabel}
                    </strong>
                    <small>Faça check-in semanal de feito/não feito.</small>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>3. Resultado</span>
                    <strong>{PROJECT_METHODOLOGY_CREATE_META[selectedProjectMethodology].lagMetricLabel}</strong>
                    <small>Atualize um valor por semana para o gráfico evoluir.</small>
                  </div>
                </div>
              </PremiumCard>
            )}

            {renderMethodologyFrameworkPanel()}

            {renderMethodologyCockpit()}

            <PremiumCard
              title={`Plano operacional ${methodologyLabel(selectedProject.methodology)}`}
              subtitle="direcionadores executivos ativos neste projeto"
            >
              <ul className="project-action-pillars">
                {methodologyOperationalPillars(selectedProject).map((pillar) => (
                  <li key={`${pillar.label}:${pillar.value}`}>
                    <span>{pillar.label}</span>
                    <strong>{pillar.value}</strong>
                  </li>
                ))}
              </ul>
            </PremiumCard>

            <PremiumCard
              title={selectedProjectDetailMeta.scoreboardTitle}
              subtitle={selectedProjectDetailMeta.scoreboardSubtitle}
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
              {renderMethodologyScoreboardSummary()}
            </PremiumCard>

            {renderFrameworkWeeklyCheckinCard()}

            {renderMethodologyExecutionPanels()}

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
            </PremiumCard>
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

      {showProjectsOverviewGuide && (
        <PremiumCard
          title="Como escolher a metodologia certa (rápido)"
          subtitle="use este atalho mental antes de criar um projeto"
          actions={
            <button type="button" className="ghost-button" onClick={dismissProjectsOverviewGuide}>
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

      <PremiumCard
        title="Ranking estratégico de projetos"
        subtitle="tração por metodologia (lead + métrica histórica)"
      >
        {strategicActiveLoad > 5 && (
          <p className="surface-error">
            Risco de fragmentação: {strategicActiveLoad} projetos ativos com cadência de metodologia atrasada.
          </p>
        )}

        {projectRanking.length === 0 ? (
          <EmptyState
            title="Sem projetos para ranquear"
            description="Crie projetos com metodologia e métricas para visualizar tração estratégica."
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
                    {methodologyLabel(entry.project.methodology)} • score {entry.strategicScore} • lag{' '}
                    {entry.lagProgress ?? 'n/d'}% • {entry.summary.lineTwo.toLowerCase()} • {entry.summary.lineOne.toLowerCase()} • último check-in{' '}
                    {formatLastCheckinLabel(entry.project.lastScorecardCheckinAt)} • status{' '}
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
                      {methodologyLabel(entry.project.methodology)} • {entry.project.type ?? 'operacao'} • score{' '}
                      {entry.strategicScore}
                    </small>
                    <div className="project-selector-metrics">
                      <span>{entry.totalTasks} tarefas</span>
                      <span>{entry.summary.lineOne}</span>
                      <span>{entry.summary.lineTwo}</span>
                    </div>
                  </button>
                  <div className="project-selector-actions">
                    <small className="project-selector-footnote">
                      Último check-in: {formatLastCheckinLabel(entry.project.lastScorecardCheckinAt)}
                    </small>
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
                <span>{PROJECT_METHODOLOGY_META[selectedProject.methodology ?? 'fourdx'].leadLabel}</span>
                <strong>{scorecardLeadMetrics.length}/2 registradas</strong>
                <small>
                  {scorecardLeadMetrics.length
                    ? scorecardLeadMetrics.map((metric) => metric.name).join(' • ')
                    : `Defina duas medidas de ${PROJECT_METHODOLOGY_META[selectedProject.methodology ?? 'fourdx'].leadLabel.toLowerCase()}.`}
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
