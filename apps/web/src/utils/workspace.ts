export function workspaceQuery(activeWorkspaceId: string) {
  return activeWorkspaceId === 'all' ? undefined : activeWorkspaceId;
}
