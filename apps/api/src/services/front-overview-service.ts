import { Prisma, PrismaClient } from '@prisma/client';

import {
  deriveOperationalState,
  normalizeProjectEngine,
  projectProgress
} from '../domain/project-engine-domain.js';
import { getProjectRecommendation } from './project-recommendation-service.js';

export type FrontAttention = {
  kind: 'project' | 'responsibility';
  sourceId: string;
  severity: 'attention' | 'critical';
  title: string;
  reason: string;
};

const severityWeight = { attention: 1, critical: 2 } as const;
const DAY_MS = 86_400_000;

export function selectPrimaryAttention(items: FrontAttention[]) {
  return [...items].sort((a, b) =>
    severityWeight[b.severity] - severityWeight[a.severity]
    || a.title.localeCompare(b.title)
  )[0] ?? null;
}

const frontInclude = {
  projects: {
    where: { archivedAt: null },
    include: {
      tasks: {
        where: { archivedAt: null },
        select: { id: true, title: true, status: true, dueDate: true, updatedAt: true }
      },
      nextMoves: {
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, text: true, reason: true, taskId: true, source: true }
      }
    }
  },
  responsibilities: {
    where: { archivedAt: null, status: { not: 'archived' } },
    orderBy: [{ nextReviewAt: 'asc' }, { title: 'asc' }]
  },
  tasks: {
    where: { archivedAt: null, status: 'hoje' },
    select: { id: true }
  }
} satisfies Prisma.WorkspaceInclude;

type FrontRecord = Prisma.WorkspaceGetPayload<{ include: typeof frontInclude }>;

function daysSince(value: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / DAY_MS));
}

function summarizeProject(project: FrontRecord['projects'][number], now: Date) {
  const engine = normalizeProjectEngine(project.methodology, project.methodologyData);
  const blocker = engine.data.blockers.find((item) => !item.resolvedAt) ?? null;
  const overdue = Boolean(
    project.timeHorizonEnd
    && project.timeHorizonEnd.getTime() < now.getTime()
    && !['concluido', 'encerrado', 'arquivado'].includes(project.status)
  );
  const stalled = daysSince(project.updatedAt, now) >= 14;
  const activeMove = project.nextMoves[0] ?? null;
  const recommendation = getProjectRecommendation({
    now,
    project: {
      id: project.id,
      methodology: project.methodology,
      status: project.status,
      timeHorizonEnd: project.timeHorizonEnd,
      lastScorecardCheckinAt: project.lastScorecardCheckinAt,
      scorecardCadenceDays: project.scorecardCadenceDays,
      updatedAt: project.updatedAt,
      resultCurrentValue: project.resultCurrentValue,
      resultTargetValue: project.resultTargetValue
    },
    data: engine.data,
    activeMove,
    tasks: project.tasks
  });
  return {
    id: project.id,
    title: project.title,
    objective: project.objective,
    methodology: project.methodology,
    canonicalMethodology: engine.methodology,
    engine: engine.engine,
    status: project.status,
    operationalState: deriveOperationalState({
      persistedStatus: project.status,
      hasCriticalBlocker: Boolean(blocker),
      overdue,
      stalled
    }),
    timeHorizonEnd: project.timeHorizonEnd,
    progress: projectProgress({
      methodology: project.methodology,
      data: engine.data,
      resultStartValue: project.resultStartValue,
      resultCurrentValue: project.resultCurrentValue,
      resultTargetValue: project.resultTargetValue
    }),
    primaryBlocker: blocker?.title ?? null,
    activeMove,
    recommendation
  };
}

function attentionFromProject(project: ReturnType<typeof summarizeProject>): FrontAttention | null {
  if (project.operationalState === 'blocked') {
    return {
      kind: 'project', sourceId: project.id, severity: 'critical', title: project.title,
      reason: project.primaryBlocker ?? 'Projeto bloqueado.'
    };
  }
  if (project.operationalState === 'at_risk' || project.operationalState === 'stalled') {
    return {
      kind: 'project', sourceId: project.id, severity: 'attention', title: project.title,
      reason: project.recommendation?.reason ?? (project.operationalState === 'at_risk' ? 'Projeto fora do prazo.' : 'Projeto sem atualização recente.')
    };
  }
  return null;
}

function attentionFromResponsibility(
  responsibility: FrontRecord['responsibilities'][number],
  now: Date
): FrontAttention | null {
  if (responsibility.status !== 'active') return null;
  if (responsibility.health === 'critical') {
    return {
      kind: 'responsibility', sourceId: responsibility.id, severity: 'critical',
      title: responsibility.title, reason: responsibility.nextCare
    };
  }
  if (responsibility.health === 'attention' || responsibility.nextReviewAt.getTime() <= now.getTime()) {
    return {
      kind: 'responsibility', sourceId: responsibility.id, severity: 'attention',
      title: responsibility.title,
      reason: responsibility.health === 'attention' ? responsibility.nextCare : 'Revisão de cuidado vencida.'
    };
  }
  return null;
}

function mapFront(front: FrontRecord, now: Date) {
  const allProjects = front.projects.map((project) => summarizeProject(project, now));
  const projects = allProjects.filter((project) => project.status === 'ativo');
  const pausedProjects = allProjects.filter((project) => project.status === 'pausado' || project.status === 'latente');
  const attentionItems = [
    ...projects.map(attentionFromProject),
    ...front.responsibilities.map((item) => attentionFromResponsibility(item, now))
  ].filter((item): item is FrontAttention => Boolean(item));
  const attention = selectPrimaryAttention(attentionItems);
  return {
    id: front.id,
    name: front.name,
    type: front.type,
    category: front.category,
    mode: front.mode,
    color: front.color,
    health: attention?.severity ?? 'normal',
    attention,
    projects,
    pausedProjects,
    responsibilities: front.responsibilities,
    capacity: { activeProjects: projects.length, todayTasks: front.tasks.length }
  };
}

export class FrontOverviewService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(clerkUserId: string, now = new Date()) {
    const fronts = await this.prisma.workspace.findMany({
      where: { clerkUserId },
      include: frontInclude,
      orderBy: { createdAt: 'asc' }
    });
    return fronts.map((front) => {
      const mapped = mapFront(front, now);
      return {
        id: mapped.id,
        name: mapped.name,
        type: mapped.type,
        mode: mapped.mode,
        color: mapped.color,
        health: mapped.health,
        attention: mapped.attention,
        activeProjects: mapped.capacity.activeProjects
      };
    });
  }

  async detail(workspaceId: string, clerkUserId: string, now = new Date()) {
    const front = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, clerkUserId },
      include: frontInclude
    });
    if (!front) throw Object.assign(new Error('Frente não encontrada.'), { statusCode: 404 });
    return mapFront(front, now);
  }
}
