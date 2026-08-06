import { Prisma, PrismaClient } from '@prisma/client';

export type StartExecutionInput = {
  sourceType: 'task' | 'inbox';
  sourceId: string;
  dayPlanItemId?: string | null;
  dailyExecutionItemId?: string | null;
};

export const executionSessionInclude = {
  task: true,
  inboxItem: true,
  dayPlanItem: true
} satisfies Prisma.ExecutionSessionInclude;

export type ExecutionSessionRecord = Prisma.ExecutionSessionGetPayload<{
  include: typeof executionSessionInclude;
}>;

function serviceError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

export class ExecutionSessionService {
  constructor(private readonly prisma: PrismaClient) {}

  async getActive(clerkUserId: string): Promise<ExecutionSessionRecord | null> {
    return this.prisma.executionSession.findFirst({
      where: { clerkUserId, state: 'active' },
      include: executionSessionInclude
    });
  }

  async start(
    clerkUserId: string,
    input: StartExecutionInput
  ): Promise<ExecutionSessionRecord> {
    await this.assertNoActiveSession(clerkUserId);
    const source = await this.resolveOwnedSource(clerkUserId, input);
    await this.assertOwnedContext(clerkUserId, input);

    return this.prisma.executionSession.create({
      data: {
        clerkUserId,
        taskId: input.sourceType === 'task' ? source.id : null,
        inboxItemId: input.sourceType === 'inbox' ? source.id : null,
        dayPlanItemId: input.dayPlanItemId ?? null,
        dailyExecutionItemId: input.dailyExecutionItemId ?? null
      },
      include: executionSessionInclude
    });
  }

  async stop(clerkUserId: string, id: string): Promise<ExecutionSessionRecord> {
    return this.finish(clerkUserId, id, 'completed');
  }

  async cancel(clerkUserId: string, id: string): Promise<ExecutionSessionRecord> {
    return this.finish(clerkUserId, id, 'cancelled');
  }

  private async assertNoActiveSession(clerkUserId: string) {
    const generic = await this.prisma.executionSession.findFirst({
      where: { clerkUserId, state: 'active' },
      select: { id: true }
    });
    if (generic) {
      throw serviceError('Já existe uma execução ativa.', 409);
    }

    const deepWork = await this.prisma.deepWorkSession.findFirst({
      where: {
        state: 'active',
        workspace: { clerkUserId }
      },
      select: { id: true }
    });
    if (deepWork) {
      throw serviceError('Já existe uma execução ativa.', 409);
    }
  }

  private async resolveOwnedSource(clerkUserId: string, input: StartExecutionInput) {
    const source =
      input.sourceType === 'task'
        ? await this.prisma.task.findFirst({
            where: { id: input.sourceId, workspace: { clerkUserId } },
            select: { id: true }
          })
        : await this.prisma.inboxItem.findFirst({
            where: { id: input.sourceId, clerkUserId },
            select: { id: true }
          });

    if (!source) {
      throw serviceError('Origem de execução não encontrada.', 404);
    }
    return source;
  }

  private async assertOwnedContext(clerkUserId: string, input: StartExecutionInput) {
    if (input.dayPlanItemId && input.dailyExecutionItemId) {
      throw serviceError('Informe apenas um contexto de execução.', 400);
    }

    const sourceWhere =
      input.sourceType === 'task'
        ? { taskId: input.sourceId }
        : { inboxItemId: input.sourceId };

    if (input.dayPlanItemId) {
      const dayPlanItem = await this.prisma.dayPlanItem.findFirst({
        where: {
          id: input.dayPlanItemId,
          dayPlan: { clerkUserId },
          ...sourceWhere
        },
        select: { id: true }
      });
      if (!dayPlanItem) {
        throw serviceError('Bloco planejado não encontrado para esta origem.', 404);
      }
    }

    if (input.dailyExecutionItemId) {
      const dailyItem = await this.prisma.dailyExecutionItem.findFirst({
        where: {
          id: input.dailyExecutionItemId,
          clerkUserId,
          ...sourceWhere
        },
        select: { id: true }
      });
      if (!dailyItem) {
        throw serviceError('Item diário não encontrado para esta origem.', 404);
      }
    }
  }

  private async finish(
    clerkUserId: string,
    id: string,
    state: 'completed' | 'cancelled'
  ): Promise<ExecutionSessionRecord> {
    const session = await this.prisma.executionSession.findFirst({
      where: { id, clerkUserId },
      include: executionSessionInclude
    });
    if (!session) {
      throw serviceError('Sessão de execução não encontrada.', 404);
    }
    if (session.state !== 'active') {
      return session;
    }

    return this.prisma.executionSession.update({
      where: { id },
      data: { endedAt: new Date(), state },
      include: executionSessionInclude
    });
  }
}
