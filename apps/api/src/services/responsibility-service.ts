import {
  PrismaClient,
  ResponsibilityCadence,
  ResponsibilityHealth
} from '@prisma/client';

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export function nextReviewDate(
  base: Date,
  cadence: ResponsibilityCadence,
  customDays?: number | null
) {
  const next = new Date(base);
  if (cadence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  else if (cadence === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3);
  else next.setUTCDate(next.getUTCDate() + (
    cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : customDays ?? 7
  ));
  return next;
}

export class ResponsibilityService {
  constructor(private readonly prisma: PrismaClient) {}

  private async owned(responsibilityId: string, clerkUserId: string) {
    const responsibility = await this.prisma.responsibility.findFirst({
      where: { id: responsibilityId, workspace: { clerkUserId } }
    });
    if (!responsibility) throw notFound('Responsabilidade não encontrada.');
    return responsibility;
  }

  async list(workspaceId: string, clerkUserId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, clerkUserId },
      select: { id: true }
    });
    if (!workspace) throw notFound('Frente não encontrada.');
    return this.prisma.responsibility.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ status: 'asc' }, { nextReviewAt: 'asc' }, { title: 'asc' }]
    });
  }

  async create(
    workspaceId: string,
    input: {
      title: string;
      expectedStandard: string;
      cadence: ResponsibilityCadence;
      cadenceIntervalDays?: number | null;
      health?: ResponsibilityHealth;
      nextCare: string;
      nextReviewAt: string;
    },
    clerkUserId: string
  ) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, clerkUserId },
      select: { id: true }
    });
    if (!workspace) throw notFound('Frente não encontrada.');
    return this.prisma.responsibility.create({
      data: {
        workspaceId,
        title: input.title.trim(),
        expectedStandard: input.expectedStandard.trim(),
        cadence: input.cadence,
        cadenceIntervalDays: input.cadenceIntervalDays ?? null,
        health: input.health ?? 'healthy',
        nextCare: input.nextCare.trim(),
        nextReviewAt: new Date(input.nextReviewAt)
      }
    });
  }

  async update(
    responsibilityId: string,
    input: Partial<{
      title: string;
      expectedStandard: string;
      cadence: ResponsibilityCadence;
      cadenceIntervalDays: number | null;
      health: ResponsibilityHealth;
      nextCare: string;
      nextReviewAt: string;
    }>,
    clerkUserId: string
  ) {
    await this.owned(responsibilityId, clerkUserId);
    return this.prisma.responsibility.update({
      where: { id: responsibilityId },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.expectedStandard !== undefined && { expectedStandard: input.expectedStandard.trim() }),
        ...(input.cadence !== undefined && { cadence: input.cadence }),
        ...(input.cadenceIntervalDays !== undefined && { cadenceIntervalDays: input.cadenceIntervalDays }),
        ...(input.health !== undefined && { health: input.health }),
        ...(input.nextCare !== undefined && { nextCare: input.nextCare.trim() }),
        ...(input.nextReviewAt !== undefined && { nextReviewAt: new Date(input.nextReviewAt) })
      }
    });
  }

  async review(
    responsibilityId: string,
    input: {
      health: ResponsibilityHealth;
      note?: string;
      nextCare: string;
      nextReviewAt?: string;
      createTask?: 'backlog' | 'today';
    },
    clerkUserId: string,
    now = new Date()
  ) {
    const responsibility = await this.owned(responsibilityId, clerkUserId);
    const reviewAt = new Date(now);
    const nextAt = input.nextReviewAt
      ? new Date(input.nextReviewAt)
      : nextReviewDate(reviewAt, responsibility.cadence, responsibility.cadenceIntervalDays);

    return this.prisma.$transaction(async (tx) => {
      const task = input.createTask
        ? await tx.task.create({
            data: {
              workspaceId: responsibility.workspaceId,
              title: input.nextCare.trim(),
              status: input.createTask === 'today' ? 'hoje' : 'backlog',
              taskType: 'b',
              energyLevel: 'media',
              executionKind: 'operacao',
              priority: 3
            }
          })
        : null;
      const updated = await tx.responsibility.update({
        where: { id: responsibilityId },
        data: {
          health: input.health,
          nextCare: input.nextCare.trim(),
          nextReviewAt: nextAt,
          lastReviewedAt: reviewAt,
          status: 'active'
        }
      });
      const review = await tx.responsibilityReview.create({
        data: {
          responsibilityId,
          createdTaskId: task?.id ?? null,
          health: input.health,
          note: input.note?.trim() || null,
          nextCare: input.nextCare.trim(),
          nextReviewAt: nextAt,
          reviewedAt: reviewAt
        }
      });
      return { responsibility: updated, review, task };
    });
  }

  async reviews(responsibilityId: string, clerkUserId: string) {
    await this.owned(responsibilityId, clerkUserId);
    return this.prisma.responsibilityReview.findMany({
      where: { responsibilityId },
      orderBy: { reviewedAt: 'desc' }
    });
  }

  async pause(responsibilityId: string, paused: boolean, clerkUserId: string) {
    await this.owned(responsibilityId, clerkUserId);
    return this.prisma.responsibility.update({
      where: { id: responsibilityId },
      data: { status: paused ? 'paused' : 'active' }
    });
  }

  async archive(responsibilityId: string, clerkUserId: string) {
    await this.owned(responsibilityId, clerkUserId);
    return this.prisma.responsibility.update({
      where: { id: responsibilityId },
      data: { status: 'archived', archivedAt: new Date() }
    });
  }
}
