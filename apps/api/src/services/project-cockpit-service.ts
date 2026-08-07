import {
  Prisma,
  PrismaClient,
  ProjectMethodology,
  type Project,
  type ProjectNextMove,
  type Task,
  type Workspace
} from '@prisma/client';

import {
  deriveOperationalState,
  normalizeProjectEngine,
  projectProgress
} from '../domain/project-engine-domain.js';
import { getProjectRecommendation } from './project-recommendation-service.js';

type CockpitProject = Project & {
  workspace: Workspace;
  tasks: Task[];
  nextMoves: ProjectNextMove[];
};

export type CreateExecutionProjectInput = {
  creationKey: string;
  workspaceId: string;
  methodology: ProjectMethodology;
  title: string;
  objective: string;
  timeHorizonEnd?: string | null;
  resultStartValue?: number | null;
  resultCurrentValue?: number | null;
  resultTargetValue?: number | null;
  primaryMetric?: string | null;
  methodologyData?: Prisma.InputJsonValue;
  metrics?: Array<{
    kind: 'lead' | 'lag';
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

const DAY_MS = 86_400_000;

const methodologyLabels: Record<string, { intentLabel: string; methodLabel: string }> = {
  fourdx: { intentLabel: 'Atingir uma meta', methodLabel: '4DX' },
  delivery: { intentLabel: 'Entregar algo', methodLabel: 'Marcos' },
  entrega: { intentLabel: 'Entregar algo', methodLabel: 'Marcos' },
  launch: { intentLabel: 'Executar um lançamento', methodLabel: 'Campanha' },
  campanha: { intentLabel: 'Executar um lançamento', methodLabel: 'Campanha' },
  discovery: { intentLabel: 'Validar uma ideia', methodLabel: 'Experimentos' },
  growth: { intentLabel: 'Validar uma ideia', methodLabel: 'Experimentos' },
  exploracao: { intentLabel: 'Validar uma ideia', methodLabel: 'Experimentos' },
  pipeline: { intentLabel: 'Vender', methodLabel: 'Pipeline' },
  decisao: { intentLabel: 'Tomar uma decisão', methodLabel: 'Matriz' },
  okr: { intentLabel: 'Coordenar vários resultados', methodLabel: 'OKR' },
  captacao: { intentLabel: 'Captar recursos', methodLabel: 'Captação' },
  mentoria: { intentLabel: 'Desenvolver alguém', methodLabel: 'Mentoria' },
  autoridade: { intentLabel: 'Construir autoridade', methodLabel: 'Provas' },
  cenario: { intentLabel: 'Preparar cenários', methodLabel: 'Cenários' },
  runway: { intentLabel: 'Preservar caixa', methodLabel: 'Runway' },
  sistema_receita: { intentLabel: 'Construir receita', methodLabel: 'Sistema de receita' },
  funil: { intentLabel: 'Melhorar conversão', methodLabel: 'Funil' },
  processo: { intentLabel: 'Manter um processo', methodLabel: 'Processo legado' }
};

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function openTask(status: string) {
  return status !== 'feito' && status !== 'arquivado';
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCockpitReadModel(project: CockpitProject, now: Date) {
  const engine = normalizeProjectEngine(project.methodology, project.methodologyData);
  const activeMove = project.nextMoves[0] ?? null;
  const primaryBlocker = engine.data.blockers.find((blocker) => !blocker.resolvedAt) ?? null;
  const deadline = asDate(project.timeHorizonEnd);
  const overdue = Boolean(
    deadline && deadline.getTime() < now.getTime()
    || project.tasks.some((task) => {
      const dueDate = asDate(task.dueDate);
      return openTask(task.status) && Boolean(dueDate && dueDate.getTime() < now.getTime());
    })
  );
  const stalled = openTask(project.status)
    && now.getTime() - project.updatedAt.getTime() >= 14 * DAY_MS;
  const operationalState = deriveOperationalState({
    persistedStatus: project.status,
    hasCriticalBlocker: Boolean(primaryBlocker),
    overdue,
    stalled
  });
  const recommendation = getProjectRecommendation({
    now,
    project,
    data: engine.data,
    activeMove,
    tasks: project.tasks
  });
  const labels = methodologyLabels[project.methodology]
    ?? { intentLabel: 'Executar um projeto', methodLabel: project.methodology };

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    objective: project.objective,
    workspace: project.workspace,
    ...labels,
    persistedStatus: project.status,
    operationalState,
    timeHorizonEnd: project.timeHorizonEnd,
    primaryMetric: project.primaryMetric,
    resultStartValue: project.resultStartValue,
    resultCurrentValue: project.resultCurrentValue,
    resultTargetValue: project.resultTargetValue,
    progress: projectProgress({
      methodology: engine.methodology,
      data: engine.data,
      resultStartValue: project.resultStartValue,
      resultCurrentValue: project.resultCurrentValue,
      resultTargetValue: project.resultTargetValue
    }),
    primaryBlocker: primaryBlocker?.title ?? null,
    activeMove,
    recommendation,
    engine: {
      key: engine.engine,
      methodology: engine.methodology,
      data: engine.data,
      recovered: engine.recovered
    },
    tasks: project.tasks,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export class ProjectCockpitService {
  constructor(private readonly prisma: PrismaClient) {}

  private async serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (attempt === 1 || !isSerializationConflict(error)) throw error;
      }
    }
    throw new Error('Não foi possível concluir a transação.');
  }

  async detail(projectId: string, clerkUserId: string, now = new Date()) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspace: { clerkUserId }, archivedAt: null },
      include: {
        workspace: true,
        tasks: { where: { archivedAt: null }, orderBy: { createdAt: 'desc' } },
        nextMoves: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    if (!project) throw notFound('Projeto não encontrado.');
    return buildCockpitReadModel(project, now);
  }

  async list(
    filters: { workspaceId?: string; status?: string; search?: string },
    clerkUserId: string,
    now = new Date()
  ) {
    const projects = await this.prisma.project.findMany({
      where: {
        workspace: { clerkUserId },
        archivedAt: null,
        ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
        ...(filters.status ? { status: filters.status as Project['status'] } : {}),
        ...(filters.search ? {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { objective: { contains: filters.search, mode: 'insensitive' } }
          ]
        } : {})
      },
      include: {
        workspace: true,
        tasks: { where: { archivedAt: null } },
        nextMoves: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: [{ workspace: { name: 'asc' } }, { updatedAt: 'desc' }]
    });
    return projects.map((project) => buildCockpitReadModel(project, now));
  }

  async create(input: CreateExecutionProjectInput, clerkUserId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: input.workspaceId, clerkUserId },
      select: { id: true }
    });
    if (!workspace) throw notFound('Frente não encontrada.');

    return this.serializable(async (tx) => {
      const existing = await tx.project.findFirst({
        where: {
          workspaceId: input.workspaceId,
          creationKey: input.creationKey,
          workspace: { clerkUserId }
        },
        include: {
          nextMoves: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { task: true }
          }
        }
      });
      if (existing) {
        const activeMove = existing.nextMoves[0] ?? null;
        return { project: existing, activeMove, task: activeMove?.task ?? null };
      }

      const project = await tx.project.create({
        data: {
          creationKey: input.creationKey,
          workspaceId: input.workspaceId,
          title: input.title.trim(),
          objective: input.objective.trim(),
          methodology: input.methodology,
          methodologyData: input.methodologyData,
          timeHorizonEnd: input.timeHorizonEnd ? new Date(input.timeHorizonEnd) : null,
          resultStartValue: input.resultStartValue,
          resultCurrentValue: input.resultCurrentValue,
          resultTargetValue: input.resultTargetValue,
          primaryMetric: input.primaryMetric?.trim() || null,
          status: 'ativo',
          type: 'construcao',
          ...(input.metrics?.length ? {
            metrics: {
              create: input.metrics.map((metric) => ({
                ...metric,
                name: metric.name.trim(),
                description: metric.description?.trim() || null,
                unit: metric.unit?.trim() || null
              }))
            }
          } : {})
        }
      });
      const task = input.nextMoveDestination === 'project'
        ? null
        : await tx.task.create({
          data: {
            workspaceId: input.workspaceId,
            projectId: project.id,
            title: input.nextMove.trim(),
            status: input.nextMoveDestination === 'today' ? 'hoje' : 'backlog',
            taskType: 'b',
            energyLevel: 'media',
            executionKind: 'operacao',
            priority: 3
          }
        });
      const activeMove = await tx.projectNextMove.create({
        data: {
          projectId: project.id,
          taskId: task?.id,
          text: input.nextMove.trim(),
          source: 'manual'
        }
      });
      return { project, activeMove, task };
    });
  }
}
