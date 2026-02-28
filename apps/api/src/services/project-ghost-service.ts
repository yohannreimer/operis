import { PrismaClient } from '@prisma/client';

type RefreshGhostProjectsParams = {
  workspaceId?: string;
};

export async function refreshGhostProjects(
  prisma: PrismaClient,
  params?: RefreshGhostProjectsParams
) {
  const threshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const strategicProjects = await prisma.project.findMany({
    where: {
      archivedAt: null,
      workspaceId: params?.workspaceId,
      status: {
        in: ['ativo', 'fantasma']
      }
    },
    select: {
      id: true,
      status: true,
      tasks: {
        where: {
          taskType: 'a',
          updatedAt: {
            gte: threshold
          },
          archivedAt: null
        },
        select: { id: true },
        take: 1
      },
      deepWorkSessions: {
        where: {
          startedAt: {
            gte: threshold
          }
        },
        select: { id: true },
        take: 1
      }
    }
  });

  const toGhost = strategicProjects
    .filter(
      (project) =>
        project.status === 'ativo' &&
        project.tasks.length === 0 &&
        project.deepWorkSessions.length === 0
    )
    .map((project) => project.id);

  const toReactivate = strategicProjects
    .filter(
      (project) =>
        project.status === 'fantasma' &&
        (project.tasks.length > 0 || project.deepWorkSessions.length > 0)
    )
    .map((project) => project.id);

  if (toGhost.length) {
    await prisma.project.updateMany({
      where: { id: { in: toGhost } },
      data: { status: 'fantasma' }
    });
  }

  if (toReactivate.length) {
    await prisma.project.updateMany({
      where: { id: { in: toReactivate } },
      data: { status: 'ativo' }
    });
  }

  return {
    checked: strategicProjects.length,
    ghosted: toGhost.length,
    reactivated: toReactivate.length
  };
}
