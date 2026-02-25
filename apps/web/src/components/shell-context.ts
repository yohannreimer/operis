import { useOutletContext } from 'react-router-dom';

import { Gamification, Workspace } from '../api';

export type ShellContext = {
  activeWorkspaceId: string;
  setActiveWorkspaceId: (workspaceId: string) => void;
  workspaces: Workspace[];
  gamification: Gamification | null;
  refreshGlobal: () => Promise<void>;
};

export function useShellContext() {
  return useOutletContext<ShellContext>();
}
