import { z } from 'zod';

export type ProjectEngineKey =
  | 'metric'
  | 'milestone'
  | 'pipeline'
  | 'exploration'
  | 'campaign'
  | 'decision'
  | 'okr'
  | 'funnel'
  | 'recurring';

export type ProjectProgress =
  | { kind: 'percent'; value: number; label: string }
  | { kind: 'phase'; value: string; label: string };

export type OperationalState =
  | 'blocked'
  | 'at_risk'
  | 'moving'
  | 'stalled'
  | 'paused'
  | 'completed'
  | 'archived';

export type EngineBlocker = { id: string; title: string; resolvedAt?: string | null };
export type EngineMilestone = {
  id: string;
  title: string;
  done: boolean;
  critical?: boolean;
  doneAt?: string | null;
  order?: number;
};
export type EngineStage = { id: string; label: string; order: number };
export type EngineDeal = {
  id: string;
  name: string;
  stageId: string;
  amount?: number | null;
  probability?: number | null;
  notes?: string | null;
  createdAt: string;
  stageEnteredAt?: string | null;
};
export type EngineDiscovery = {
  id: string;
  text: string;
  type: 'confirms' | 'refutes' | 'inconclusive';
  week: string;
  createdAt: string;
};
export type EngineKeyResult = {
  id: string;
  description: string;
  currentValue: number;
  targetValue: number;
  unit?: string | null;
  confidence: 'alta' | 'media' | 'baixa';
  order: number;
};

export type NormalizedEngineData = Record<string, unknown> & {
  blockers: EngineBlocker[];
  milestones?: EngineMilestone[];
  proofs?: Array<{
    id: string;
    type: 'artigo' | 'palestra' | 'case' | 'mencao' | 'podcast' | 'outro';
    title: string;
    link?: string | null;
    points: number;
    createdAt: string;
  }>;
  stages?: EngineStage[];
  deals?: EngineDeal[];
  currency?: string;
  totalGoal?: number;
  stageCriteria?: Array<{ id: string; stageId: string; text: string; done: boolean; doneAt?: string | null }>;
  discoveries?: EngineDiscovery[];
  decision?: { choice: 'follow' | 'pivot' | 'discard'; justification: string; decidedAt: string } | null;
  hypothesis?: string;
  hypothesisCriteria?: string;
  sessions?: Array<{
    id: string;
    date: string;
    learned: string;
    commitments: Array<{ id: string; text: string; done: boolean; doneAt?: string | null }>;
  }>;
  launchDate?: string | null;
  campaignGoal?: number | null;
  campaignResult?: number | null;
  dailyTasks?: Array<{ id: string; date: string; text: string; done: boolean }>;
  availableCash?: number | null;
  burnRateMonthly?: number | null;
  runwayEvents?: Array<{ id: string; label: string; amount: number; date: string; confirmed: boolean }>;
  options?: Array<{ id: string; label: string; scores?: Record<string, number> }>;
  criteria?: Array<{ id: string; label: string; weight: number }>;
  decisionChoice?: string | null;
  scenarios?: Array<{ id: string; label: string }>;
  scenarioActions?: Array<{ id: string; text: string; done: boolean; scenarioIds: string[] }>;
  krs?: EngineKeyResult[];
  okrPeriod?: string;
  funilStages?: Array<{ id: string; label: string; value: number | null; order: number }>;
  frequency?: 'semanal' | 'mensal' | 'trimestral';
  cycleTemplate?: Array<{ id: string; text: string; order: number }>;
  cycles?: Array<{ id: string; periodLabel: string; startDate: string; items: Array<{ templateId: string; done: boolean }> }>;
};

const blockerSchema = z.object({
  id: z.string(),
  title: z.string(),
  resolvedAt: z.string().nullable().optional()
});

const milestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  critical: z.boolean().optional(),
  doneAt: z.string().nullable().optional(),
  order: z.number().optional()
});

const stageSchema = z.object({ id: z.string(), label: z.string(), order: z.number() });
const dealSchema = z.object({
  id: z.string(),
  name: z.string(),
  stageId: z.string(),
  amount: z.number().nullable().optional(),
  probability: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  stageEnteredAt: z.string().nullable().optional()
});
const discoverySchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['confirms', 'refutes', 'inconclusive']),
  week: z.string(),
  createdAt: z.string()
});
const decisionResultSchema = z.object({
  choice: z.enum(['follow', 'pivot', 'discard']),
  justification: z.string(),
  decidedAt: z.string()
});
const sessionSchema = z.object({
  id: z.string(),
  date: z.string(),
  learned: z.string(),
  commitments: z.array(z.object({
    id: z.string(), text: z.string(), done: z.boolean(), doneAt: z.string().nullable().optional()
  })).default([])
});
const keyResultSchema = z.object({
  id: z.string(),
  description: z.string(),
  currentValue: z.number(),
  targetValue: z.number(),
  unit: z.string().nullable().optional(),
  confidence: z.enum(['alta', 'media', 'baixa']),
  order: z.number()
});

function engineSchema(shape: z.ZodRawShape) {
  return z.object({
    blockers: z.array(blockerSchema).default([]),
    ...shape
  }).passthrough();
}

const strictSchemas: Record<ProjectEngineKey, z.ZodTypeAny> = {
  metric: engineSchema({}),
  milestone: engineSchema({
    milestones: z.array(milestoneSchema).default([]),
    proofs: z.array(z.object({
      id: z.string(), type: z.enum(['artigo', 'palestra', 'case', 'mencao', 'podcast', 'outro']),
      title: z.string(), link: z.string().nullable().optional(), points: z.number(), createdAt: z.string()
    })).default([])
  }),
  pipeline: engineSchema({
    stages: z.array(stageSchema).default([]),
    deals: z.array(dealSchema).default([]),
    currency: z.string().default('BRL'),
    totalGoal: z.number().optional(),
    stageCriteria: z.array(z.object({
      id: z.string(), stageId: z.string(), text: z.string(), done: z.boolean(), doneAt: z.string().nullable().optional()
    })).default([])
  }),
  exploration: engineSchema({
    hypothesis: z.string().optional(),
    hypothesisCriteria: z.string().optional(),
    discoveries: z.array(discoverySchema).default([]),
    decision: decisionResultSchema.nullable().optional(),
    sessions: z.array(sessionSchema).default([]),
    nextSessionDate: z.string().nullable().optional(),
    mentoriaRole: z.enum(['receiving', 'giving']).optional(),
    mentoriaWith: z.string().nullable().optional()
  }),
  campaign: engineSchema({
    launchDate: z.string().nullable().optional(),
    campaignGoal: z.number().nullable().optional(),
    campaignChannel: z.string().nullable().optional(),
    campaignResult: z.number().nullable().optional(),
    dailyTasks: z.array(z.object({ id: z.string(), date: z.string(), text: z.string(), done: z.boolean() })).default([]),
    availableCash: z.number().nullable().optional(),
    burnRateMonthly: z.number().nullable().optional(),
    runwayEvents: z.array(z.object({
      id: z.string(), label: z.string(), amount: z.number(), date: z.string(), confirmed: z.boolean()
    })).default([])
  }),
  decision: engineSchema({
    options: z.array(z.object({ id: z.string(), label: z.string(), scores: z.record(z.number()).optional() })).default([]),
    criteria: z.array(z.object({ id: z.string(), label: z.string(), weight: z.number() })).default([]),
    decisionChoice: z.string().nullable().optional(),
    decisionJustification: z.string().nullable().optional(),
    decisionDate: z.string().nullable().optional(),
    scenarios: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
    scenarioActions: z.array(z.object({
      id: z.string(), text: z.string(), done: z.boolean(), scenarioIds: z.array(z.string())
    })).default([]),
    scenarioDecisionDate: z.string().nullable().optional()
  }),
  okr: engineSchema({
    krs: z.array(keyResultSchema).default([]),
    okrPeriod: z.string().optional()
  }),
  funnel: engineSchema({
    funilStages: z.array(z.object({
      id: z.string(), label: z.string(), value: z.number().nullable(), order: z.number()
    })).default([])
  }),
  recurring: engineSchema({
    frequency: z.enum(['semanal', 'mensal', 'trimestral']).optional(),
    cycleTemplate: z.array(z.object({ id: z.string(), text: z.string(), order: z.number() })).default([]),
    cycles: z.array(z.object({
      id: z.string(), periodLabel: z.string(), startDate: z.string(),
      items: z.array(z.object({ templateId: z.string(), done: z.boolean() }))
    })).default([])
  })
};

const legacyMethodology = {
  delivery: 'entrega',
  launch: 'campanha',
  discovery: 'exploracao',
  growth: 'exploracao'
} as const;

function canonicalMethodology(methodology: string): string {
  const legacy = legacyMethodology[methodology as keyof typeof legacyMethodology] as string | undefined;
  return legacy ?? methodology;
}

export function engineForMethodology(methodology: string): ProjectEngineKey {
  const canonical = canonicalMethodology(methodology);
  if (canonical === 'fourdx') return 'metric';
  if (canonical === 'entrega' || canonical === 'autoridade') return 'milestone';
  if (canonical === 'pipeline' || canonical === 'captacao' || canonical === 'sistema_receita') return 'pipeline';
  if (canonical === 'exploracao' || canonical === 'mentoria') return 'exploration';
  if (canonical === 'campanha' || canonical === 'runway') return 'campaign';
  if (canonical === 'decisao' || canonical === 'cenario') return 'decision';
  if (canonical === 'okr') return 'okr';
  if (canonical === 'funil') return 'funnel';
  if (canonical === 'processo') return 'recurring';
  return 'metric';
}

function emptyData(engine: ProjectEngineKey): NormalizedEngineData {
  return strictSchemas[engine].parse({}) as NormalizedEngineData;
}

function recoverKnownFields(engine: ProjectEngineKey, raw: Record<string, unknown>) {
  const fallback = emptyData(engine);
  const recovered: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(fallback)) {
    const fieldSchema = (strictSchemas[engine] as z.AnyZodObject).shape[key] as z.ZodTypeAny | undefined;
    if (!fieldSchema) continue;
    const parsed = fieldSchema.safeParse(raw[key]);
    recovered[key] = parsed.success ? parsed.data : value;
  }
  return strictSchemas[engine].parse(recovered) as NormalizedEngineData;
}

export function normalizeProjectEngine(methodology: string, rawData: unknown) {
  const canonical = canonicalMethodology(methodology);
  const engine = engineForMethodology(canonical);
  const raw = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
    ? rawData as Record<string, unknown>
    : {};
  const parsed = strictSchemas[engine].safeParse(raw);

  return {
    methodology: canonical,
    engine,
    data: parsed.success ? parsed.data as NormalizedEngineData : recoverKnownFields(engine, raw),
    recovered: !parsed.success || rawData !== undefined && rawData !== null && raw !== rawData
  };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function projectProgress(input: {
  methodology: string;
  data: NormalizedEngineData;
  resultStartValue?: number | null;
  resultCurrentValue?: number | null;
  resultTargetValue?: number | null;
}): ProjectProgress {
  const engine = engineForMethodology(input.methodology);
  if (engine === 'metric') {
    const start = input.resultStartValue ?? 0;
    const current = input.resultCurrentValue ?? start;
    const target = input.resultTargetValue ?? start;
    const value = target === start ? 0 : clampPercent(((current - start) / (target - start)) * 100);
    return { kind: 'percent', value, label: `${current} de ${target}` };
  }
  if (engine === 'milestone') {
    const items = input.data.milestones ?? [];
    const done = items.filter((item) => item.done).length;
    return {
      kind: 'percent',
      value: items.length ? clampPercent(done / items.length * 100) : 0,
      label: `${done} de ${items.length} marcos`
    };
  }
  if (engine === 'pipeline') {
    const stages = input.data.stages ?? [];
    const closedIds = new Set(stages.filter((stage) => /fechad|closed|ganh/i.test(stage.label)).map((stage) => stage.id));
    const closed = (input.data.deals ?? []).filter((deal) => closedIds.has(deal.stageId)).reduce((sum, deal) => sum + (deal.amount ?? 0), 0);
    const goal = input.data.totalGoal ?? input.resultTargetValue ?? null;
    return goal && goal > 0
      ? { kind: 'percent', value: clampPercent(closed / goal * 100), label: `${closed} de ${goal}` }
      : { kind: 'phase', value: 'pipeline', label: `${input.data.deals?.length ?? 0} oportunidades` };
  }
  if (engine === 'exploration') {
    if (input.data.decision) return { kind: 'phase', value: 'decided', label: 'Decisão registrada' };
    if ((input.data.discoveries?.length ?? 0) === 0) return { kind: 'phase', value: 'evidence', label: 'Coletando evidências' };
    return { kind: 'phase', value: 'evaluation', label: 'Avaliando evidências' };
  }
  if (engine === 'campaign') {
    const items = input.data.dailyTasks ?? [];
    const done = items.filter((item) => item.done).length;
    return items.length
      ? { kind: 'percent', value: clampPercent(done / items.length * 100), label: `${done} de ${items.length} atividades` }
      : { kind: 'phase', value: input.methodology === 'runway' ? 'runway' : 'preparation', label: input.methodology === 'runway' ? 'Monitorando runway' : 'Preparando campanha' };
  }
  if (engine === 'decision') {
    if (input.data.decisionChoice) return { kind: 'phase', value: 'decided', label: 'Decisão registrada' };
    return { kind: 'phase', value: 'evaluation', label: 'Avaliando opções' };
  }
  if (engine === 'okr') {
    const krs = input.data.krs ?? [];
    const average = krs.length
      ? krs.reduce((sum, kr) => sum + (kr.targetValue === 0 ? 0 : clampPercent(kr.currentValue / kr.targetValue * 100)), 0) / krs.length
      : 0;
    return { kind: 'percent', value: clampPercent(average), label: `${krs.length} resultados-chave` };
  }
  if (engine === 'recurring') {
    return { kind: 'phase', value: 'legacy-recurring', label: 'Processo recorrente legado' };
  }
  return { kind: 'phase', value: 'tracking', label: 'Acompanhando conversão' };
}

export function deriveOperationalState(input: {
  persistedStatus: string;
  hasCriticalBlocker: boolean;
  overdue: boolean;
  stalled: boolean;
}): OperationalState {
  if (input.persistedStatus === 'concluido' || input.persistedStatus === 'encerrado') return 'completed';
  if (input.persistedStatus === 'arquivado') return 'archived';
  if (input.persistedStatus === 'pausado' || input.persistedStatus === 'latente') return 'paused';
  if (input.hasCriticalBlocker) return 'blocked';
  if (input.overdue) return 'at_risk';
  return input.stalled ? 'stalled' : 'moving';
}
