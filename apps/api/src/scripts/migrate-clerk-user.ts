import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  OWNERSHIP_MODELS,
  buildMigrationConfig,
  detectDuplicateOwnershipKeys,
  type MigrationConfig,
  type OwnershipModel,
  type ScopedOwnershipKey
} from './clerk-user-migration.js';

dotenv.config({ path: process.env.ENV_FILE ?? '../../.env', override: true });

type DelegateWithClerkUserId = {
  count(args: { where: { clerkUserId: { in: string[] } | string } }): Promise<number>;
  updateMany(args: {
    where: { clerkUserId: { in: string[] } };
    data: { clerkUserId: string };
  }): Promise<{ count: number }>;
};

type CountsByModel = Array<{
  model: OwnershipModel;
  sourceCount: number;
  targetCount: number;
}>;

const prisma = new PrismaClient();

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = buildMigrationConfig({
    sourceClerkUserIds: args.source ?? process.env.SOURCE_CLERK_USER_IDS ?? process.env.OLD_CLERK_USER_ID,
    targetClerkUserId: args.target ?? process.env.TARGET_CLERK_USER_ID ?? process.env.NEW_CLERK_USER_ID,
    apply: args.apply
  });

  console.log(`Source Clerk user ids: ${config.sourceClerkUserIds.join(', ')}`);
  console.log(`Target Clerk user id: ${config.targetClerkUserId}`);
  console.log(`Mode: ${config.apply ? 'apply' : 'dry-run'}`);

  const counts = await getCounts(config);
  printCounts(counts);
  await assertSafeToApply(config, counts);

  if (!config.apply) {
    console.log('Dry run complete. Re-run with --apply to update the database.');
    return;
  }

  const updates = await prisma.$transaction(async (tx) => {
    const results: Array<{ label: string; count: number }> = [];

    for (const model of OWNERSHIP_MODELS) {
      const delegate = getDelegate(tx, model);
      const result = await delegate.updateMany({
        where: { clerkUserId: { in: config.sourceClerkUserIds } },
        data: { clerkUserId: config.targetClerkUserId }
      });
      results.push({ label: model.label, count: result.count });
    }

    return results;
  });

  console.log('Migration applied:');
  for (const update of updates) {
    console.log(`- ${update.label}: ${update.count}`);
  }
}

function parseArgs(args: string[]) {
  const parsed = {
    source: undefined as string | undefined,
    target: undefined as string | undefined,
    apply: false
  };

  for (const arg of args) {
    if (arg === '--apply') {
      parsed.apply = true;
    } else if (arg.startsWith('--source=')) {
      parsed.source = arg.slice('--source='.length);
    } else if (arg.startsWith('--target=')) {
      parsed.target = arg.slice('--target='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

async function getCounts(config: MigrationConfig): Promise<CountsByModel> {
  return Promise.all(
    OWNERSHIP_MODELS.map(async (model) => {
      const delegate = getDelegate(prisma, model);
      const [sourceCount, targetCount] = await Promise.all([
        delegate.count({ where: { clerkUserId: { in: config.sourceClerkUserIds } } }),
        delegate.count({ where: { clerkUserId: config.targetClerkUserId } })
      ]);

      return { model, sourceCount, targetCount };
    })
  );
}

function printCounts(counts: CountsByModel) {
  console.log('Rows found:');
  for (const item of counts) {
    console.log(`- ${item.model.label}: source=${item.sourceCount}, target=${item.targetCount}`);
  }
}

async function assertSafeToApply(config: MigrationConfig, counts: CountsByModel) {
  const targetRows = counts.filter((item) => item.targetCount > 0);
  if (targetRows.length > 0) {
    throw new Error(
      [
        'Target Clerk user already owns Operis rows. Stop here to avoid merging two accounts implicitly.',
        ...targetRows.map((item) => `- ${item.model.label}: ${item.targetCount}`)
      ].join('\n')
    );
  }

  const uniqueOneConflicts = counts
    .filter((item) => ['gamificationState', 'userPhone'].includes(item.model.prismaKey))
    .filter((item) => item.sourceCount > 1)
    .map((item) => `${item.model.label}: ${item.sourceCount} source rows`);

  if (uniqueOneConflicts.length > 0) {
    throw new Error(
      ['Multiple source rows would collide in unique Clerk ownership tables.', ...uniqueOneConflicts].join('\n')
    );
  }

  const duplicateScopedKeys = detectDuplicateOwnershipKeys(await findScopedOwnershipKeys(config.sourceClerkUserIds));
  if (duplicateScopedKeys.length > 0) {
    throw new Error(
      [
        'Multiple source rows would collide after receiving the same target Clerk id.',
        ...duplicateScopedKeys.map(
          (item) => `- ${item.model} ${item.key}: ${item.sourceClerkUserIds.join(', ')}`
        )
      ].join('\n')
    );
  }
}

async function findScopedOwnershipKeys(sourceClerkUserIds: string[]): Promise<ScopedOwnershipKey[]> {
  const [dayPlans, inboxTodayItems] = await Promise.all([
    prisma.dayPlan.findMany({
      where: { clerkUserId: { in: sourceClerkUserIds } },
      select: { clerkUserId: true, date: true }
    }),
    prisma.inboxTodayItem.findMany({
      where: { clerkUserId: { in: sourceClerkUserIds } },
      select: { clerkUserId: true, inboxItemId: true, todayDate: true }
    })
  ]);

  return [
    ...dayPlans.map((item) => ({
      model: 'DayPlan',
      key: toOwnershipKey(item.date),
      sourceClerkUserId: item.clerkUserId
    })),
    ...inboxTodayItems.map((item) => ({
      model: 'InboxTodayItem',
      key: `${item.inboxItemId}:${item.todayDate}`,
      sourceClerkUserId: item.clerkUserId
    }))
  ];
}

function toOwnershipKey(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function getDelegate(prismaClient: object, model: OwnershipModel): DelegateWithClerkUserId {
  return (prismaClient as Record<string, unknown>)[model.prismaKey] as DelegateWithClerkUserId;
}
