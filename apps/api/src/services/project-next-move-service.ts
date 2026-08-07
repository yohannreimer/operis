import {
  Prisma,
  PrismaClient,
  ProjectNextMoveSource
} from '@prisma/client';

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export class ProjectNextMoveService {
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

  async replaceActive(
    projectId: string,
    input: {
      text: string;
      source: ProjectNextMoveSource;
      reason?: string;
      ruleKey?: string;
    },
    clerkUserId: string
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspace: { clerkUserId } },
      select: { id: true }
    });
    if (!project) throw notFound('Projeto não encontrado.');

    return this.serializable(async (tx) => {
      await tx.projectNextMove.updateMany({
        where: { projectId, status: 'active' },
        data: { status: 'resolved', resolvedAt: new Date() }
      });
      return tx.projectNextMove.create({
        data: {
          projectId,
          text: input.text.trim(),
          source: input.source,
          reason: input.reason?.trim() || undefined,
          ruleKey: input.ruleKey?.trim() || undefined
        }
      });
    });
  }

  async resolve(projectId: string, nextMoveId: string, clerkUserId: string) {
    const move = await this.prisma.projectNextMove.findFirst({
      where: {
        id: nextMoveId,
        projectId,
        project: { workspace: { clerkUserId } }
      },
      select: { id: true }
    });
    if (!move) throw notFound('Próximo movimento não encontrado.');

    return this.prisma.projectNextMove.update({
      where: { id: nextMoveId },
      data: { status: 'resolved', resolvedAt: new Date() }
    });
  }

  async sendToToday(
    projectId: string,
    nextMoveId: string,
    idempotencyKey: string,
    clerkUserId: string
  ) {
    return this.serializable(async (tx) => {
      const move = await tx.projectNextMove.findFirst({
        where: {
          id: nextMoveId,
          projectId,
          status: 'active',
          project: { workspace: { clerkUserId } }
        },
        include: { project: { select: { workspaceId: true } } }
      });
      if (!move) throw notFound('Próximo movimento não encontrado.');

      if (move.taskId) {
        const task = await tx.task.update({
          where: { id: move.taskId },
          data: { status: 'hoje' }
        });
        if (move.idempotencyKey !== idempotencyKey) {
          await tx.projectNextMove.update({
            where: { id: move.id },
            data: { idempotencyKey }
          });
        }
        return { move: { ...move, idempotencyKey }, task };
      }

      const task = await tx.task.create({
        data: {
          workspaceId: move.project.workspaceId,
          projectId,
          title: move.text,
          status: 'hoje',
          taskType: 'b',
          energyLevel: 'media',
          executionKind: 'operacao',
          priority: 3
        }
      });
      const updatedMove = await tx.projectNextMove.update({
        where: { id: move.id },
        data: { taskId: task.id, idempotencyKey }
      });
      return { move: updatedMove, task };
    });
  }
}
