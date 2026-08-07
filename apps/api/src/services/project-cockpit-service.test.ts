import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectCockpitService } from './project-cockpit-service.js';

const now = new Date('2026-08-06T12:00:00.000Z');
const projectFixture = {
  id: 'p1', workspaceId: 'w1', title: 'Pipeline Q3', description: null, status: 'ativo', type: 'crescimento',
  methodology: 'pipeline', objective: 'Vender R$ 50 mil', primaryMetric: null, actionStatement: null,
  methodologyExtraOne: null, methodologyExtraTwo: null, methodologyData: { stages: 'bad' },
  timeHorizonEnd: new Date('2026-08-05T12:00:00.000Z'), resultStartValue: 0,
  resultCurrentValue: 10, resultTargetValue: 50, scorecardCadenceDays: 7,
  lastScorecardCheckinAt: null, lastStrategicAt: now, createdAt: now,
  updatedAt: new Date('2026-08-05T12:00:00.000Z'), archivedAt: null, creationKey: null,
  workspace: { id: 'w1', name: 'Prymeira', type: 'empresa', category: 'Empresa', mode: 'expansao', color: '#f97316', createdAt: now, updatedAt: now },
  tasks: [], nextMoves: []
};

function prismaMock() {
  const prisma = {
    project: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    workspace: { findFirst: vi.fn() },
    projectNextMove: { create: vi.fn() },
    task: { create: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn()
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return prisma;
}

describe('ProjectCockpitService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: ProjectCockpitService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new ProjectCockpitService(prisma as never);
  });

  it('returns a recovered engine instead of throwing for malformed data', async () => {
    prisma.project.findFirst.mockResolvedValue(projectFixture);
    const result = await service.detail('p1', 'user_1', now);
    expect(result.engine).toMatchObject({ key: 'pipeline', recovered: true, data: { stages: [], deals: [] } });
  });

  it('returns persisted and operational states separately', async () => {
    prisma.project.findFirst.mockResolvedValue(projectFixture);
    const result = await service.detail('p1', 'user_1', now);
    expect(result).toMatchObject({ persistedStatus: 'ativo', operationalState: 'at_risk' });
  });

  it('creates a project, movement and optional Today task atomically', async () => {
    prisma.workspace.findFirst.mockResolvedValue({ id: 'w1' });
    prisma.project.findFirst.mockResolvedValue(null);
    prisma.project.create.mockResolvedValue({ id: 'new-p', workspaceId: 'w1' });
    prisma.task.create.mockResolvedValue({ id: 't1' });
    prisma.projectNextMove.create.mockResolvedValue({ id: 'm1', taskId: 't1' });

    const result = await service.create({
      creationKey: 'create-key-1', workspaceId: 'w1', methodology: 'entrega', title: 'Novo site',
      objective: 'Site publicado', methodologyData: { milestones: [] }, nextMove: 'Definir escopo',
      nextMoveDestination: 'today'
    }, 'user_1');

    expect(prisma.project.create).toHaveBeenCalledWith({ data: expect.objectContaining({ creationKey: 'create-key-1', workspaceId: 'w1' }) });
    expect(prisma.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'hoje', projectId: 'new-p' }) });
    expect(result).toMatchObject({ project: { id: 'new-p' }, activeMove: { id: 'm1' }, task: { id: 't1' } });
  });
});
