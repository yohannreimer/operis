import { describe, expect, it } from 'vitest';

import { resolveTaskWorkspaceId } from './task-workspace';

const workspaces = [
  { id: 'general', name: 'Geral', type: 'geral' as const },
  { id: 'ws-1', name: 'Empresa', type: 'empresa' as const, mode: 'expansao' as const },
  { id: 'ws-2', name: 'Pessoal', type: 'pessoal' as const, mode: 'manutencao' as const },
  { id: 'ws-3', name: 'Depois', type: 'vida' as const, mode: 'standby' as const }
];

describe('task workspace resolution', () => {
  it('prefers a specific active shell front', () => {
    expect(resolveTaskWorkspaceId({ activeWorkspaceId: 'ws-1', preferredWorkspaceId: 'ws-2', workspaces })).toBe('ws-1');
  });

  it('uses the persisted valid front before the first active one', () => {
    expect(resolveTaskWorkspaceId({ activeWorkspaceId: 'all', preferredWorkspaceId: 'ws-2', workspaces })).toBe('ws-2');
  });

  it('ignores general and standby fronts', () => {
    expect(resolveTaskWorkspaceId({ activeWorkspaceId: 'all', preferredWorkspaceId: 'ws-3', workspaces })).toBe('ws-1');
  });

  it('returns null when no operational front exists', () => {
    expect(resolveTaskWorkspaceId({ activeWorkspaceId: 'all', workspaces: workspaces.slice(0, 1) })).toBeNull();
  });
});
