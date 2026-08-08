import type { Workspace } from '../../api';

export const TASK_PREFERRED_WORKSPACE_KEY = 'operis:last-front-id';

export function resolveTaskWorkspaceId(input: {
  activeWorkspaceId: string;
  preferredWorkspaceId?: string | null;
  workspaces: Workspace[];
}) {
  const eligible = input.workspaces.filter(
    (workspace) => workspace.type !== 'geral' && workspace.mode !== 'standby'
  );
  if (
    input.activeWorkspaceId !== 'all' &&
    eligible.some((workspace) => workspace.id === input.activeWorkspaceId)
  ) {
    return input.activeWorkspaceId;
  }
  if (
    input.preferredWorkspaceId &&
    eligible.some((workspace) => workspace.id === input.preferredWorkspaceId)
  ) {
    return input.preferredWorkspaceId;
  }
  return eligible[0]?.id ?? null;
}

export function readPreferredTaskWorkspaceId() {
  try {
    return window.localStorage.getItem(TASK_PREFERRED_WORKSPACE_KEY);
  } catch {
    return null;
  }
}
