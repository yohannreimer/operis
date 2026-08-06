import type { AgendaBlock, AgendaWeek } from '../../api';

export type GridMetrics = {
  startHour: number;
  pixelsPerHour: number;
};

export type PlannerSource = {
  kind: 'task' | 'inbox';
  sourceId: string;
};

export type MoveBlockInput = {
  date: string;
  startTime: string;
  endTime: string;
};

export type PlannerCommitmentBlock = {
  id: string;
  kind: 'commitment';
  sourceId: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  completedAt: null;
  workspaceId: string | null;
  plannedMinutes: number;
  recurring: boolean;
  rescheduled: boolean;
};

export type PlannerBlockModel = AgendaBlock | PlannerCommitmentBlock;

export type AgendaWeekController = {
  week: AgendaWeek | null;
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  scheduleSource(source: PlannerSource, startTime: string): Promise<void>;
  moveBlock(id: string, target: MoveBlockInput): Promise<void>;
  resizeBlock(id: string, endTime: string): Promise<void>;
  setBlockCompleted(id: string, completed: boolean): Promise<void>;
  removeBlock(id: string): Promise<void>;
};
