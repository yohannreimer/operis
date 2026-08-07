import type { NormalizedEngineData } from '../domain/project-engine-domain.js';

export type ProjectRecommendation = {
  ruleKey: string;
  text: string;
  reason: string;
  severity: 'normal' | 'attention' | 'critical';
  sourceId?: string;
};

export type RecommendationContext = {
  now: Date;
  project: {
    id: string;
    methodology: string;
    status: string;
    timeHorizonEnd?: string | Date | null;
    lastScorecardCheckinAt?: string | Date | null;
    scorecardCadenceDays?: number | null;
    updatedAt?: string | Date | null;
    resultCurrentValue?: number | null;
    resultTargetValue?: number | null;
  };
  data: NormalizedEngineData;
  activeMove: { id: string; text: string } | null;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: string | Date | null;
    updatedAt?: string | Date | null;
  }>;
};

const DAY_MS = 86_400_000;

function asDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function elapsedDays(from: string | Date, to: Date) {
  const start = asDate(from);
  if (!start) return 0;
  return Math.max(0, Math.floor((to.getTime() - start.getTime()) / DAY_MS));
}

function openTask(status: string) {
  return status !== 'feito' && status !== 'arquivado';
}

function recommendFourDx(context: RecommendationContext): ProjectRecommendation | null {
  const lastCheckin = asDate(context.project.lastScorecardCheckinAt);
  const cadence = context.project.scorecardCadenceDays ?? 7;
  if (!lastCheckin || elapsedDays(lastCheckin, context.now) >= cadence) {
    return {
      ruleKey: 'fourdx.checkin-due',
      text: 'Atualizar o placar 4DX',
      reason: lastCheckin
        ? `O último check-in foi há ${elapsedDays(lastCheckin, context.now)} dias.`
        : 'O projeto ainda não possui um check-in.',
      severity: 'attention'
    };
  }
  return null;
}

function recommendMilestone(context: RecommendationContext): ProjectRecommendation | null {
  if (context.project.methodology === 'autoridade' && (context.data.proofs?.length ?? 0) === 0) {
    return {
      ruleKey: 'authority.next-proof',
      text: 'Registrar a primeira prova de autoridade',
      reason: 'O projeto ainda não possui uma evidência pública registrada.',
      severity: 'normal'
    };
  }
  const milestones = [...(context.data.milestones ?? [])]
    .filter((item) => !item.done)
    .sort((a, b) => Number(Boolean(b.critical)) - Number(Boolean(a.critical)) || (a.order ?? 0) - (b.order ?? 0));
  const next = milestones[0];
  if (!next) return null;
  return {
    ruleKey: next.critical ? 'milestone.next-critical' : 'milestone.next',
    text: `Avançar: ${next.title}`,
    reason: next.critical ? 'Este é o próximo marco crítico ainda aberto.' : 'Este é o próximo marco aberto na ordem do projeto.',
    severity: next.critical ? 'attention' : 'normal',
    sourceId: next.id
  };
}

function recommendPipeline(context: RecommendationContext): ProjectRecommendation | null {
  if (context.project.methodology === 'sistema_receita') {
    const criterion = context.data.stageCriteria?.find((item) => !item.done);
    if (criterion) {
      return {
        ruleKey: 'revenue.next-stage-criterion',
        text: criterion.text,
        reason: 'Este é o próximo critério necessário para avançar o sistema de receita.',
        severity: 'normal',
        sourceId: criterion.id
      };
    }
  }

  if (context.project.methodology === 'captacao' && (context.data.deals?.length ?? 0) > 0) {
    const weighted = (context.data.deals ?? []).reduce(
      (sum, deal) => sum + (deal.amount ?? 0) * ((deal.probability ?? 0) / 100),
      0
    );
    return {
      ruleKey: 'fundraising.weighted-forecast',
      text: 'Revisar o forecast da captação',
      reason: `O forecast ponderado atual é ${Math.round(weighted)} de ${context.data.totalGoal ?? 0}.`,
      severity: 'normal'
    };
  }

  const stalled = [...(context.data.deals ?? [])]
    .map((deal) => ({ deal, days: elapsedDays(deal.stageEnteredAt ?? deal.createdAt, context.now) }))
    .filter((entry) => entry.days >= 5)
    .sort((a, b) => b.days - a.days || (b.deal.amount ?? 0) - (a.deal.amount ?? 0))[0];
  if (stalled) {
    return {
      ruleKey: 'pipeline.stalled-deal',
      text: `Retomar ${stalled.deal.name}`,
      reason: `${stalled.deal.name} está há ${stalled.days} dias sem avançar.`,
      severity: 'attention',
      sourceId: stalled.deal.id
    };
  }
  if ((context.data.deals?.length ?? 0) === 0) {
    return {
      ruleKey: 'pipeline.add-opportunity',
      text: 'Adicionar a primeira oportunidade',
      reason: 'O pipeline ainda não possui oportunidades.',
      severity: 'normal'
    };
  }
  return null;
}

function recommendExploration(context: RecommendationContext): ProjectRecommendation | null {
  if (context.project.methodology === 'mentoria') {
    for (const session of context.data.sessions ?? []) {
      const commitment = session.commitments.find((item) => !item.done);
      if (commitment) {
        return {
          ruleKey: 'mentoring.pending-commitment',
          text: commitment.text,
          reason: 'Este compromisso da última sessão ainda está aberto.',
          severity: 'attention',
          sourceId: commitment.id
        };
      }
    }
  }
  if (!context.data.hypothesisCriteria?.trim()) {
    return {
      ruleKey: 'exploration.define-criteria',
      text: 'Definir o critério de validação',
      reason: 'Sem um critério, as evidências não permitem decidir.',
      severity: 'attention'
    };
  }
  if ((context.data.discoveries?.length ?? 0) === 0) {
    return {
      ruleKey: 'exploration.next-evidence',
      text: 'Executar o menor teste da hipótese',
      reason: 'Ainda não há evidências registradas para confirmar ou refutar a hipótese.',
      severity: 'normal'
    };
  }
  if (!context.data.decision) {
    return {
      ruleKey: 'exploration.decide',
      text: 'Avaliar as evidências e decidir',
      reason: 'Já existem evidências, mas seguir, pivotar ou descartar ainda não foi registrado.',
      severity: 'normal'
    };
  }
  return null;
}

function recommendCampaign(context: RecommendationContext): ProjectRecommendation | null {
  if (context.project.methodology === 'runway') {
    if (context.data.availableCash == null || context.data.burnRateMonthly == null) {
      return {
        ruleKey: 'runway.refresh-inputs',
        text: 'Atualizar caixa e burn rate',
        reason: 'O cálculo de runway depende dos dois valores atuais.',
        severity: 'attention'
      };
    }
    const nextEvent = [...(context.data.runwayEvents ?? [])]
      .filter((item) => item.confirmed && asDate(item.date) && asDate(item.date)!.getTime() >= context.now.getTime())
      .sort((a, b) => asDate(a.date)!.getTime() - asDate(b.date)!.getTime())[0];
    return nextEvent ? {
      ruleKey: 'runway.next-event',
      text: `Preparar: ${nextEvent.label}`,
      reason: 'Este é o próximo evento financeiro confirmado.',
      severity: 'normal',
      sourceId: nextEvent.id
    } : null;
  }

  const next = [...(context.data.dailyTasks ?? [])]
    .filter((item) => !item.done)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  return {
    ruleKey: 'campaign.next-critical',
    text: next.text,
    reason: `Esta é a próxima atividade da campanha, prevista para ${next.date}.`,
    severity: asDate(next.date) && asDate(next.date)!.getTime() < context.now.getTime() ? 'attention' : 'normal',
    sourceId: next.id
  };
}

function recommendDecision(context: RecommendationContext): ProjectRecommendation | null {
  if (context.project.methodology === 'cenario') {
    const action = [...(context.data.scenarioActions ?? [])]
      .filter((item) => !item.done)
      .sort((a, b) => b.scenarioIds.length - a.scenarioIds.length)[0];
    return action ? {
      ruleKey: 'scenario.no-regret-action',
      text: action.text,
      reason: `Esta ação ajuda em ${action.scenarioIds.length} cenário(s) sem exigir uma decisão prematura.`,
      severity: 'normal',
      sourceId: action.id
    } : null;
  }

  const criteriaIds = (context.data.criteria ?? []).map((criterion) => criterion.id);
  const incomplete = (context.data.options ?? []).find((option) =>
    criteriaIds.some((criterionId) => option.scores?.[criterionId] == null)
  );
  if (incomplete) {
    return {
      ruleKey: 'decision.incomplete-option',
      text: `Avaliar ${incomplete.label}`,
      reason: 'Esta opção ainda não foi avaliada em todos os critérios.',
      severity: 'normal',
      sourceId: incomplete.id
    };
  }
  if (!context.data.decisionChoice && (context.data.options?.length ?? 0) > 0) {
    return {
      ruleKey: 'decision.choose',
      text: 'Registrar a decisão',
      reason: 'A matriz está preenchida e ainda não existe uma escolha registrada.',
      severity: 'attention'
    };
  }
  return null;
}

function recommendOkr(context: RecommendationContext): ProjectRecommendation | null {
  const krs = context.data.krs ?? [];
  const confidenceWeight = { baixa: 0, media: 1, alta: 2 } as const;
  const lowest = [...krs].sort((a, b) =>
    confidenceWeight[a.confidence] - confidenceWeight[b.confidence]
    || (a.targetValue ? a.currentValue / a.targetValue : 0) - (b.targetValue ? b.currentValue / b.targetValue : 0)
  )[0];
  if (!lowest) {
    return {
      ruleKey: 'okr.configure',
      text: 'Adicionar o primeiro resultado-chave',
      reason: 'O objetivo ainda não possui resultados mensuráveis.',
      severity: 'attention'
    };
  }
  return {
    ruleKey: 'okr.low-confidence',
    text: `Revisar: ${lowest.description}`,
    reason: `Este KR está com confiança ${lowest.confidence}.`,
    severity: lowest.confidence === 'baixa' ? 'attention' : 'normal',
    sourceId: lowest.id
  };
}

function recommendFunnel(context: RecommendationContext): ProjectRecommendation | null {
  const stages = [...(context.data.funilStages ?? [])].sort((a, b) => a.order - b.order);
  let largest: { from: typeof stages[number]; to: typeof stages[number]; rate: number } | null = null;
  for (let index = 1; index < stages.length; index += 1) {
    const from = stages[index - 1];
    const to = stages[index];
    if (from.value == null || to.value == null || from.value <= 0) continue;
    const rate = to.value / from.value;
    if (!largest || rate < largest.rate) largest = { from, to, rate };
  }
  return largest ? {
    ruleKey: 'funnel.conversion-drop',
    text: `Investigar ${largest.from.label} → ${largest.to.label}`,
    reason: `A conversão desta passagem está em ${Math.round(largest.rate * 100)}%.`,
    severity: 'attention',
    sourceId: largest.to.id
  } : {
    ruleKey: 'funnel.refresh-stages',
    text: 'Atualizar os valores do funil',
    reason: 'Ainda não há duas etapas com valores comparáveis.',
    severity: 'normal'
  };
}

function recommendRecurringLegacy(context: RecommendationContext): ProjectRecommendation | null {
  const cycle = context.data.cycles?.at(-1);
  const incomplete = cycle?.items.find((item) => !item.done);
  if (!cycle || !incomplete) return null;
  const template = context.data.cycleTemplate?.find((item) => item.id === incomplete.templateId);
  return template ? {
    ruleKey: 'recurring.next-cycle-item',
    text: template.text,
    reason: `Este é o próximo item aberto do ciclo ${cycle.periodLabel}.`,
    severity: 'normal',
    sourceId: template.id
  } : null;
}

function recommendationByEngine(context: RecommendationContext): ProjectRecommendation | null {
  switch (context.project.methodology) {
    case 'fourdx': return recommendFourDx(context);
    case 'delivery':
    case 'entrega':
    case 'autoridade': return recommendMilestone(context);
    case 'pipeline':
    case 'captacao':
    case 'sistema_receita': return recommendPipeline(context);
    case 'discovery':
    case 'growth':
    case 'exploracao':
    case 'mentoria': return recommendExploration(context);
    case 'launch':
    case 'campanha':
    case 'runway': return recommendCampaign(context);
    case 'decisao':
    case 'cenario': return recommendDecision(context);
    case 'okr': return recommendOkr(context);
    case 'funil': return recommendFunnel(context);
    case 'processo': return recommendRecurringLegacy(context);
    default: return null;
  }
}

export function getProjectRecommendation(context: RecommendationContext): ProjectRecommendation | null {
  const blocker = context.data.blockers.find((item) => !item.resolvedAt);
  if (blocker) {
    return {
      ruleKey: 'global.critical-blocker',
      text: `Resolver: ${blocker.title}`,
      reason: 'Este bloqueio impede o avanço do projeto.',
      severity: 'critical',
      sourceId: blocker.id
    };
  }
  if (context.activeMove) return null;

  const overdueTask = context.tasks
    .filter((task) => openTask(task.status) && asDate(task.dueDate) && asDate(task.dueDate)!.getTime() < context.now.getTime())
    .sort((a, b) => asDate(a.dueDate)!.getTime() - asDate(b.dueDate)!.getTime())[0];
  if (overdueTask) {
    return {
      ruleKey: 'global.overdue-task',
      text: overdueTask.title,
      reason: 'Esta tarefa do projeto está atrasada.',
      severity: 'attention',
      sourceId: overdueTask.id
    };
  }

  const updatedAt = asDate(context.project.updatedAt);
  if (updatedAt && elapsedDays(updatedAt, context.now) >= 14) {
    return {
      ruleKey: 'global.stalled-project',
      text: 'Retomar o projeto',
      reason: `O projeto está há ${elapsedDays(updatedAt, context.now)} dias sem atualização.`,
      severity: 'attention'
    };
  }

  const deadline = asDate(context.project.timeHorizonEnd);
  if (deadline) {
    const daysLeft = Math.ceil((deadline.getTime() - context.now.getTime()) / DAY_MS);
    if (daysLeft >= 0 && daysLeft <= 7) {
      return {
        ruleKey: 'global.deadline-risk',
        text: 'Revisar o plano até o prazo',
        reason: `Faltam ${daysLeft} dia(s) para o prazo do projeto.`,
        severity: 'attention'
      };
    }
  }

  return recommendationByEngine(context);
}
