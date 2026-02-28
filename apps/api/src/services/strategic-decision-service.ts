import { Prisma, PrismaClient } from '@prisma/client';

export type StrategicDecisionSignal = 'executiva' | 'risco' | 'neutra';

type RecordDecisionInput = {
  workspaceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  source?: string;
  eventCode: string;
  signal: StrategicDecisionSignal;
  title: string;
  rationale?: string | null;
  impactScore?: number;
  payload?: Prisma.InputJsonValue;
  createdAt?: Date;
};

function normalizeImpactScore(value?: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-100, Math.min(100, Math.round(value as number)));
}

function isMissingTableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2021';
  }

  if (error instanceof Error) {
    return error.message.toLowerCase().includes('strategic_decision_events');
  }

  return false;
}

export function signalFromImpact(impactScore: number): StrategicDecisionSignal {
  if (impactScore >= 4) {
    return 'executiva';
  }

  if (impactScore <= -2) {
    return 'risco';
  }

  return 'neutra';
}

export async function safeRecordStrategicDecisionEvent(
  prisma: PrismaClient,
  input: RecordDecisionInput
) {
  try {
    await prisma.strategicDecisionEvent.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        source: input.source ?? 'system',
        eventCode: input.eventCode,
        signal: input.signal,
        title: input.title.trim(),
        rationale: input.rationale?.trim() || null,
        impactScore: normalizeImpactScore(input.impactScore),
        payload: input.payload,
        createdAt: input.createdAt
      }
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }

    // Decision memory is non-blocking by design.
    // eslint-disable-next-line no-console
    console.warn('strategic_decision_event_write_failed', error);
  }
}
