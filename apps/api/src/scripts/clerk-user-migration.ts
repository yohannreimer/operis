export type OwnershipModel = {
  label: string;
  prismaKey:
    | 'workspace'
    | 'noteFolder'
    | 'note'
    | 'recurringBlock'
    | 'dayPlan'
    | 'inboxItem'
    | 'inboxContext'
    | 'inboxTodayItem'
    | 'whatsappConversationSession'
    | 'commitment'
    | 'gamificationState'
    | 'habit'
    | 'userPhone';
};

export type MigrationConfig = {
  sourceClerkUserIds: string[];
  targetClerkUserId: string;
  apply: boolean;
};

export type ScopedOwnershipKey = {
  model: string;
  key: string;
  sourceClerkUserId: string;
};

export type DuplicateOwnershipKey = {
  model: string;
  key: string;
  sourceClerkUserIds: string[];
};

export const OWNERSHIP_MODELS: OwnershipModel[] = [
  { label: 'Workspace', prismaKey: 'workspace' },
  { label: 'NoteFolder', prismaKey: 'noteFolder' },
  { label: 'Note', prismaKey: 'note' },
  { label: 'RecurringBlock', prismaKey: 'recurringBlock' },
  { label: 'DayPlan', prismaKey: 'dayPlan' },
  { label: 'InboxItem', prismaKey: 'inboxItem' },
  { label: 'InboxContext', prismaKey: 'inboxContext' },
  { label: 'InboxTodayItem', prismaKey: 'inboxTodayItem' },
  { label: 'WhatsappConversationSession', prismaKey: 'whatsappConversationSession' },
  { label: 'Commitment', prismaKey: 'commitment' },
  { label: 'GamificationState', prismaKey: 'gamificationState' },
  { label: 'Habit', prismaKey: 'habit' },
  { label: 'UserPhone', prismaKey: 'userPhone' }
];

export function parseSourceClerkUserIds(value: string | undefined): string[] {
  const ids =
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? [];

  if (ids.length === 0) {
    throw new Error('At least one source Clerk user id is required.');
  }

  return Array.from(new Set(ids));
}

export function buildMigrationConfig(input: {
  sourceClerkUserIds: string | undefined;
  targetClerkUserId: string | undefined;
  apply: boolean;
}): MigrationConfig {
  const sourceClerkUserIds = parseSourceClerkUserIds(input.sourceClerkUserIds);
  const targetClerkUserId = input.targetClerkUserId?.trim();

  if (!targetClerkUserId) {
    throw new Error('Target Clerk user id is required.');
  }

  if (sourceClerkUserIds.includes(targetClerkUserId)) {
    throw new Error('Target Clerk user id cannot also be a source id.');
  }

  return {
    sourceClerkUserIds,
    targetClerkUserId,
    apply: input.apply
  };
}

export function detectDuplicateOwnershipKeys(rows: ScopedOwnershipKey[]): DuplicateOwnershipKey[] {
  const grouped = new Map<string, Set<string>>();

  for (const row of rows) {
    const groupKey = `${row.model}:${row.key}`;
    const ids = grouped.get(groupKey) ?? new Set<string>();
    ids.add(row.sourceClerkUserId);
    grouped.set(groupKey, ids);
  }

  return Array.from(grouped.entries())
    .filter(([, ids]) => ids.size > 1)
    .map(([groupKey, ids]) => {
      const separatorIndex = groupKey.indexOf(':');

      return {
        model: groupKey.slice(0, separatorIndex),
        key: groupKey.slice(separatorIndex + 1),
        sourceClerkUserIds: Array.from(ids).sort()
      };
    });
}
