import type { ProjectMethodology } from './api';

export type ProjectEngine =
  | 'metric'      // 4DX: lead/lag weekly cadence
  | 'milestone'   // Entrega, Autoridade: checklist of items
  | 'log'         // Exploração, Mentoria: chronological entries
  | 'pipeline'    // Pipeline, Captação, Sistema de Receita: items through stages
  | 'composite'   // OKR: multiple KRs to one objective
  | 'decision'    // Decisão, Cenário: options matrix
  | 'time'        // Campanha, Runway: countdown with events
  | 'recurring'   // Processo Recorrente: template that resets
  | 'funnel';     // Funil: stages with values and conversion rates

export type ProjectEngineVariant =
  | 'standard'
  | 'authority'    // milestone variant
  | 'financial'    // pipeline variant (Captação)
  | 'linear'       // pipeline variant (Sistema de Receita)
  | 'discovery'    // log variant (Exploração)
  | 'coaching'     // log variant (Mentoria)
  | 'campaign'     // time variant (Campanha)
  | 'runway'       // time variant (Runway)
  | 'scenario';    // decision variant (Cenário)

export type WizardField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'structured-goal' | 'dynamic-list' | 'dynamic-stages';
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
};

export type ProjectTypeConfig = {
  key: ProjectMethodology;
  label: string;
  icon: string;
  tagline: string;
  question: string;
  example: string;
  engine: ProjectEngine;
  engineVariant: ProjectEngineVariant;
  accentColor?: string;
  wizardFields: WizardField[];
  isLegacy?: boolean; // old types — still render but not in picker
};

export const PROJECT_TYPES: ProjectTypeConfig[] = [
  // ── 4DX ──────────────────────────────────────────────────────────────
  {
    key: 'fourdx',
    label: '4DX',
    icon: '🎯',
    tagline: 'Meta numérica de X → Y em Z tempo',
    question: 'Tenho uma meta numérica com linha de chegada',
    example: '"10k seguidores em 3 meses"',
    engine: 'metric',
    engineVariant: 'standard',
    wizardFields: [
      { key: 'objective', label: 'Meta', type: 'structured-goal', placeholder: 'de 0 para 10.000 em 3 meses', hint: 'Formato: de X para Y em Z tempo', required: true },
      { key: 'leadOne', label: 'Ação semanal 1', type: 'text', placeholder: 'Ex: postar 2 reels por semana', required: true },
      { key: 'leadTwo', label: 'Ação semanal 2', type: 'text', placeholder: 'Ex: analisar métricas toda sexta', required: true },
      { key: 'primaryMetric', label: 'Métrica de acompanhamento', type: 'text', placeholder: 'Ex: seguidores no Instagram', required: true },
      { key: 'resultStartValue', label: 'Valor atual', type: 'number', placeholder: 'Ex: 0', required: true },
      { key: 'resultTargetValue', label: 'Meta final', type: 'number', placeholder: 'Ex: 10000', required: true },
      { key: 'timeHorizonEnd', label: 'Prazo', type: 'date', required: true },
    ],
  },

  // ── ENTREGA ───────────────────────────────────────────────────────────
  {
    key: 'entrega',
    label: 'Entrega',
    icon: '📦',
    tagline: 'Entregar X concreto até data Y',
    question: 'Tenho algo concreto para entregar por uma data',
    example: '"Lançar módulo de finanças em abril"',
    engine: 'milestone',
    engineVariant: 'standard',
    wizardFields: [
      { key: 'objective', label: 'O que será entregue?', type: 'textarea', placeholder: 'Ex: módulo de finanças em produção com QA aprovado', required: true },
      { key: 'milestones', label: 'Marcos do projeto', type: 'dynamic-list', placeholder: 'Ex: Backend concluído', hint: 'Adicione os marcos principais — pode editar depois', required: false },
      { key: 'methodologyExtraOne', label: 'Padrão de conclusão', type: 'text', placeholder: 'Ex: deploy em produção + QA aprovado', hint: 'Como saber que a entrega está pronta?', required: true },
      { key: 'timeHorizonEnd', label: 'Prazo', type: 'date', required: true },
    ],
  },

  // ── EXPLORAÇÃO ────────────────────────────────────────────────────────
  {
    key: 'exploracao',
    label: 'Exploração',
    icon: '🔍',
    tagline: 'Validar hipótese com evidências até decidir',
    question: 'Tenho uma hipótese para validar com evidências',
    example: '"Canal LinkedIn gera leads qualificados?"',
    engine: 'log',
    engineVariant: 'discovery',
    wizardFields: [
      { key: 'hypothesis', label: 'Hipótese', type: 'text', placeholder: 'Se criarmos conteúdo no LinkedIn, então...', hint: 'Formato: Se [ação], então [resultado esperado]', required: true },
      { key: 'hypothesisCriteria', label: 'Critério de validação', type: 'text', placeholder: 'Ex: 10 leads qualificados em 30 dias', hint: 'O que vai confirmar ou refutar a hipótese?', required: true },
      { key: 'timeHorizonEnd', label: 'Prazo da exploração', type: 'date', required: true },
    ],
  },

  // ── PIPELINE ──────────────────────────────────────────────────────────
  {
    key: 'pipeline',
    label: 'Pipeline',
    icon: '📊',
    tagline: 'Leads/oportunidades passando por estágios',
    question: 'Tenho leads ou oportunidades passando por estágios',
    example: '"Pipeline de parcerias Q2"',
    engine: 'pipeline',
    engineVariant: 'standard',
    wizardFields: [
      { key: 'objective', label: 'O que você está gerenciando?', type: 'text', placeholder: 'Ex: parcerias estratégicas Q2', required: true },
      { key: 'stages', label: 'Estágios do pipeline', type: 'dynamic-stages', placeholder: 'Ex: Prospecção, Qualificação, Proposta, Fechado', hint: 'Liste os estágios em ordem — arraste para reorganizar', required: true },
      { key: 'timeHorizonEnd', label: 'Prazo (opcional)', type: 'date', required: false },
    ],
  },

  // ── CAPTAÇÃO ──────────────────────────────────────────────────────────
  {
    key: 'captacao',
    label: 'Captação',
    icon: '💰',
    tagline: 'Capital ou receita com forecast ponderado',
    question: 'Quero captar capital ou fechar uma meta de receita',
    example: '"Seed Round $500k"',
    engine: 'pipeline',
    engineVariant: 'financial',
    wizardFields: [
      { key: 'objective', label: 'O que você está captando?', type: 'text', placeholder: 'Ex: Seed Round', required: true },
      { key: 'resultTargetValue', label: 'Meta total', type: 'number', placeholder: 'Ex: 500000', required: true },
      { key: 'currency', label: 'Moeda', type: 'select', options: [{ value: 'BRL', label: 'R$ (BRL)' }, { value: 'USD', label: '$ (USD)' }, { value: 'EUR', label: '€ (EUR)' }], required: false },
      { key: 'stages', label: 'Estágios', type: 'dynamic-stages', placeholder: 'Ex: Prospecção, Reunião, Term Sheet, Fechado', hint: 'Estágios padrão para captação — customize se necessário', required: true },
      { key: 'timeHorizonEnd', label: 'Prazo', type: 'date', required: true },
    ],
  },

  // ── CAMPANHA ──────────────────────────────────────────────────────────
  {
    key: 'campanha',
    label: 'Campanha',
    icon: '⚡',
    tagline: 'Execução intensa numa janela de tempo fixa',
    question: 'Tenho uma janela de execução intensa com data crítica',
    example: '"Black Friday 2026"',
    engine: 'time',
    engineVariant: 'campaign',
    wizardFields: [
      { key: 'objective', label: 'Objetivo da campanha', type: 'text', placeholder: 'Ex: Lançar oferta e atingir R$150k em receita', required: true },
      { key: 'launchDate', label: 'Data de lançamento', type: 'date', hint: 'Dia D — quando a campanha vai ao ar', required: true },
      { key: 'timeHorizonEnd', label: 'Fim da campanha', type: 'date', hint: 'Quando você vai avaliar o resultado final?', required: true },
      { key: 'resultTargetValue', label: 'Meta da campanha', type: 'number', placeholder: 'Ex: 150000', required: false },
      { key: 'campaignChannel', label: 'Canal principal', type: 'text', placeholder: 'Ex: email + tráfego pago', required: false },
    ],
  },

  // ── PROCESSO RECORRENTE ───────────────────────────────────────────────
  {
    key: 'processo',
    label: 'Processo Recorrente',
    icon: '🔁',
    tagline: 'Template de checklist que reseta todo ciclo',
    question: 'Tenho um processo que se repete todo ciclo',
    example: '"Fechamento mensal" ou "Revisão semanal"',
    engine: 'recurring',
    engineVariant: 'standard',
    wizardFields: [
      { key: 'objective', label: 'Nome do processo', type: 'text', placeholder: 'Ex: Fechamento mensal', required: true },
      { key: 'frequency', label: 'Frequência', type: 'select', options: [{ value: 'semanal', label: 'Semanal' }, { value: 'mensal', label: 'Mensal' }, { value: 'trimestral', label: 'Trimestral' }], required: true },
      { key: 'cycleTemplate', label: 'Passos do processo', type: 'dynamic-list', placeholder: 'Ex: Exportar relatório financeiro', hint: 'Liste os passos em ordem — serão repetidos a cada ciclo', required: true },
    ],
  },

  // ── OKR ───────────────────────────────────────────────────────────────
  {
    key: 'okr',
    label: 'OKR',
    icon: '🏆',
    tagline: 'Um objetivo com múltiplas frentes de resultado',
    question: 'Tenho um objetivo com múltiplas frentes de resultado',
    example: '"Crescer brand e autoridade no Q2"',
    engine: 'composite',
    engineVariant: 'standard',
    wizardFields: [
      { key: 'objective', label: 'Objetivo', type: 'textarea', placeholder: 'Ex: Crescer brand e gerar autoridade no mercado', hint: 'Qualitativo — a direção que você quer ir', required: true },
      { key: 'okrPeriod', label: 'Período', type: 'text', placeholder: 'Ex: Q2 2026', required: true },
      { key: 'krs', label: 'Key Results', type: 'dynamic-list', placeholder: 'Ex: 5.000 seguidores no LinkedIn', hint: 'Adicione 3-5 resultados mensuráveis — pode editar depois', required: true },
      { key: 'timeHorizonEnd', label: 'Prazo do OKR', type: 'date', required: true },
    ],
  },

  // ── DECISÃO ───────────────────────────────────────────────────────────
  {
    key: 'decisao',
    label: 'Decisão',
    icon: '⚖️',
    tagline: 'Escolha estruturada com critérios e evidência',
    question: 'Preciso tomar uma decisão difícil com evidência e critérios',
    example: '"Contratar CMO ou agência?"',
    engine: 'decision',
    engineVariant: 'standard',
    wizardFields: [
      { key: 'objective', label: 'O que precisa ser decidido?', type: 'textarea', placeholder: 'Ex: Contratar CMO interno ou trabalhar com agência de marketing?', required: true },
      { key: 'options', label: 'Opções', type: 'dynamic-list', placeholder: 'Ex: CMO interno', hint: 'Liste as opções que você está considerando', required: true },
      { key: 'criteria', label: 'Critérios de avaliação', type: 'dynamic-list', placeholder: 'Ex: Velocidade de execução', hint: 'O que importa para esta decisão?', required: true },
      { key: 'timeHorizonEnd', label: 'Prazo para decidir', type: 'date', required: true },
    ],
  },

  // ── MENTORIA ──────────────────────────────────────────────────────────
  {
    key: 'mentoria',
    label: 'Mentoria',
    icon: '🎓',
    tagline: 'Desenvolvimento guiado por sessões e compromissos',
    question: 'Estou num processo de desenvolvimento guiado',
    example: '"Mentoria com João Silva — escalar para R$1M ARR"',
    engine: 'log',
    engineVariant: 'coaching',
    wizardFields: [
      { key: 'objective', label: 'Objetivo do processo', type: 'textarea', placeholder: 'Ex: Escalar a empresa para R$1M ARR em 12 meses', required: true },
      { key: 'methodologyExtraOne', label: 'Com quem?', type: 'text', placeholder: 'Ex: João Silva', required: false },
      { key: 'timeHorizonEnd', label: 'Duração estimada (fim)', type: 'date', required: false },
    ],
  },

  // ── AUTORIDADE ────────────────────────────────────────────────────────
  {
    key: 'autoridade',
    label: 'Autoridade',
    icon: '⭐',
    tagline: 'Construir reputação acumulando provas no campo',
    question: 'Quero construir reputação e autoridade no meu campo',
    example: '"Ser referência em growth B2B"',
    engine: 'milestone',
    engineVariant: 'authority',
    wizardFields: [
      { key: 'objective', label: 'Em que você quer ser referência?', type: 'text', placeholder: 'Ex: growth B2B para startups', required: true },
      { key: 'resultTargetValue', label: 'Score alvo', type: 'number', placeholder: 'Ex: 100', hint: 'Artigo=1pt, Menção=1pt, Case=2pt, Palestra=3pt', required: false },
      { key: 'timeHorizonEnd', label: 'Prazo', type: 'date', required: false },
    ],
  },

  // ── CENÁRIO ───────────────────────────────────────────────────────────
  {
    key: 'cenario',
    label: 'Cenário',
    icon: '🌐',
    tagline: 'Preparar múltiplos futuros com ações no-regret',
    question: 'Preciso me preparar para múltiplos futuros possíveis',
    example: '"Ficar no Brasil vs mudar para Portugal"',
    engine: 'decision',
    engineVariant: 'scenario',
    wizardFields: [
      { key: 'objective', label: 'Qual é a decisão que você precisa tomar?', type: 'text', placeholder: 'Ex: Expandir para SP ou consolidar em BH?', required: true },
      { key: 'scenarios', label: 'Cenários possíveis', type: 'dynamic-list', placeholder: 'Ex: Expandir para SP', hint: 'Defina 2 ou 3 cenários que você está considerando', required: true },
      { key: 'timeHorizonEnd', label: 'Data de decisão', type: 'date', required: false },
    ],
  },

  // ── RUNWAY ────────────────────────────────────────────────────────────
  {
    key: 'runway',
    label: 'Runway',
    icon: '⏱️',
    tagline: 'Quanto tempo tenho antes de precisar agir',
    question: 'Preciso saber quanto tempo tenho antes de precisar agir',
    example: '"Runway pessoal — 8 meses de caixa"',
    engine: 'time',
    engineVariant: 'runway',
    wizardFields: [
      { key: 'objective', label: 'Qual é o contexto?', type: 'text', placeholder: 'Ex: Runway da empresa antes do próximo round', required: true },
      { key: 'availableCash', label: 'Recursos disponíveis', type: 'number', placeholder: 'Ex: 83000', hint: 'Valor atual em caixa (R$)', required: true },
      { key: 'burnRateMonthly', label: 'Burn rate mensal', type: 'number', placeholder: 'Ex: 10000', hint: 'Quanto você gasta por mês (R$)', required: true },
    ],
  },

  // ── SISTEMA DE RECEITA ────────────────────────────────────────────────
  {
    key: 'sistema_receita',
    label: 'Sistema de Receita',
    icon: '🚀',
    tagline: 'Novo fluxo de renda crescendo de ideia a escala',
    question: 'Estou construindo um novo fluxo de renda do zero',
    example: '"Consultoria → produto digital → licenciamento"',
    engine: 'pipeline',
    engineVariant: 'linear',
    wizardFields: [
      { key: 'objective', label: 'Qual é o modelo de receita?', type: 'text', placeholder: 'Ex: Consultoria de growth para startups B2B', required: true },
      { key: 'resultTargetValue', label: 'Meta de receita mensal', type: 'number', placeholder: 'Ex: 50000', hint: 'Quanto você quer gerar por mês neste sistema?', required: false },
      { key: 'timeHorizonEnd', label: 'Prazo para chegar na meta', type: 'date', required: false },
    ],
  },

  // ── FUNIL ─────────────────────────────────────────────────────────────
  {
    key: 'funil',
    label: 'Funil',
    icon: '🔽',
    tagline: 'Visualizar e analisar a conversão em cada etapa do funil',
    question: 'Preciso analisar a conversão etapa a etapa de um funil',
    example: '"Funil de marketing: Visualizações → Leads → Vendas"',
    engine: 'funnel',
    engineVariant: 'standard',
    accentColor: '#6366f1',
    wizardFields: [
      { key: 'objective', label: 'Qual é o funil?', type: 'text', placeholder: 'Ex: Funil de marketing do Instagram', required: true },
      { key: 'stages', label: 'Etapas do funil', type: 'dynamic-list', placeholder: 'Ex: Visualizações', hint: 'Liste as etapas em ordem — do topo ao fundo', required: true },
      { key: 'timeHorizonEnd', label: 'Período de análise (até)', type: 'date', required: false },
    ],
  },

  // ── LEGACY (kept for backward compat, not shown in picker) ───────────
  {
    key: 'delivery',
    label: 'Entrega',
    icon: '📦',
    tagline: 'Entregar X concreto até data Y',
    question: 'Tenho algo concreto para entregar',
    example: '"Lançar módulo em produção"',
    engine: 'milestone',
    engineVariant: 'standard',
    isLegacy: true,
    wizardFields: [],
  },
  {
    key: 'launch',
    label: 'Lançamento',
    icon: '⚡',
    tagline: 'Campanha com janela de execução e data crítica',
    question: 'Tenho uma campanha ou lançamento com data crítica',
    example: '"Lançar curso em março"',
    engine: 'time',
    engineVariant: 'campaign',
    isLegacy: true,
    wizardFields: [],
  },
  {
    key: 'discovery',
    label: 'Exploração',
    icon: '🔍',
    tagline: 'Validar hipótese com evidências',
    question: 'Tenho uma hipótese para validar',
    example: '"Validar canal de aquisição"',
    engine: 'log',
    engineVariant: 'discovery',
    isLegacy: true,
    wizardFields: [],
  },
  {
    key: 'growth',
    label: 'Exploração',
    icon: '🔍',
    tagline: 'Loops de crescimento e métrica norte',
    question: 'Quero construir loops de crescimento',
    example: '"Escalar aquisição orgânica"',
    engine: 'log',
    engineVariant: 'discovery',
    isLegacy: true,
    wizardFields: [],
  },
];

/** All types shown in the picker (non-legacy) */
export const PICKER_TYPES = PROJECT_TYPES.filter(t => !t.isLegacy);

/** Get engine type for a methodology key */
export function getEngine(methodology: ProjectMethodology | null | undefined): ProjectEngine {
  return PROJECT_TYPES.find(t => t.key === methodology)?.engine ?? 'metric';
}

/** Get engine variant for a methodology key */
export function getEngineVariant(methodology: ProjectMethodology | null | undefined): ProjectEngineVariant {
  return PROJECT_TYPES.find(t => t.key === methodology)?.engineVariant ?? 'standard';
}

/** Get full config for a methodology key */
export function getProjectTypeConfig(methodology: ProjectMethodology | null | undefined): ProjectTypeConfig {
  return PROJECT_TYPES.find(t => t.key === methodology) ?? PROJECT_TYPES[0];
}

/** Display label for any methodology (including legacy) */
export function methodologyDisplayLabel(methodology: ProjectMethodology | null | undefined): string {
  return PROJECT_TYPES.find(t => t.key === methodology)?.label ?? '4DX';
}

/** Icon for any methodology */
export function methodologyIcon(methodology: ProjectMethodology | null | undefined): string {
  return PROJECT_TYPES.find(t => t.key === methodology)?.icon ?? '🎯';
}

/** Compute runway in months from methodology_data */
export function computeRunwayMonths(availableCash?: number | null, burnRate?: number | null): number | null {
  if (!availableCash || !burnRate || burnRate <= 0) return null;
  return Math.floor((availableCash / burnRate) * 10) / 10;
}

/** Authority score from proofs array */
export function computeAuthorityScore(proofs?: Array<{ points: number }> | null): number {
  if (!proofs || proofs.length === 0) return 0;
  return proofs.reduce((sum, p) => sum + (p.points ?? 0), 0);
}

/** OKR overall score (average of KR progress %) */
export function computeOkrScore(krs?: Array<{ currentValue: number; targetValue: number }> | null): number {
  if (!krs || krs.length === 0) return 0;
  const percentages = krs.map(kr => kr.targetValue > 0 ? Math.min(100, (kr.currentValue / kr.targetValue) * 100) : 0);
  return Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length);
}

/** Pipeline financial forecast (sum of amount * probability) */
export function computePipelineForecast(deals?: Array<{ amount?: number | null; probability?: number | null; stageId: string }> | null, closedStageId?: string): number {
  if (!deals || deals.length === 0) return 0;
  return deals.reduce((sum, deal) => {
    if (deal.stageId === closedStageId) return sum + (deal.amount ?? 0);
    const prob = (deal.probability ?? 50) / 100;
    return sum + (deal.amount ?? 0) * prob;
  }, 0);
}

/** Days remaining until a date */
export function daysRemaining(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
