import { describe, expect, it } from 'vitest';
import {
  OWNERSHIP_MODELS,
  buildMigrationConfig,
  detectDuplicateOwnershipKeys,
  parseSourceClerkUserIds
} from './clerk-user-migration.js';

describe('clerk user migration helpers', () => {
  it('parses comma-separated source Clerk user ids', () => {
    expect(parseSourceClerkUserIds(' user_old , legacy ,,')).toEqual(['user_old', 'legacy']);
  });

  it('rejects empty source Clerk user ids', () => {
    expect(() => parseSourceClerkUserIds(' , ')).toThrow('At least one source Clerk user id is required.');
  });

  it('rejects configs where the target is also a source', () => {
    expect(() =>
      buildMigrationConfig({
        sourceClerkUserIds: 'user_old,user_new',
        targetClerkUserId: 'user_new',
        apply: false
      })
    ).toThrow('Target Clerk user id cannot also be a source id.');
  });

  it('tracks every Operis model with a clerkUserId ownership column', () => {
    expect(OWNERSHIP_MODELS.map((model) => model.prismaKey)).toEqual([
      'workspace',
      'noteFolder',
      'note',
      'recurringBlock',
      'dayPlan',
      'inboxItem',
      'inboxContext',
      'inboxTodayItem',
      'whatsappConversationSession',
      'commitment',
      'gamificationState',
      'habit',
      'userPhone'
    ]);
  });

  it('detects duplicate scoped rows that would collide after migration', () => {
    expect(
      detectDuplicateOwnershipKeys([
        { model: 'DayPlan', key: '2026-05-17', sourceClerkUserId: 'legacy' },
        { model: 'DayPlan', key: '2026-05-17', sourceClerkUserId: 'user_old' },
        { model: 'InboxTodayItem', key: 'item-1:2026-05-17', sourceClerkUserId: 'legacy' }
      ])
    ).toEqual([
      {
        model: 'DayPlan',
        key: '2026-05-17',
        sourceClerkUserIds: ['legacy', 'user_old']
      }
    ]);
  });
});
