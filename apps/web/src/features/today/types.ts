export type TodayEntry =
  | {
      id: string;
      kind: 'inbox';
      sourceId: string;
      date: string;
      title: string;
      position: number;
      completedAt: string | null;
      context: string | null;
    }
  | {
      id: string;
      kind: 'task';
      sourceId: string;
      date: string;
      title: string;
      position: number;
      completedAt: string | null;
      project: string | null;
      estimatedMinutes: number | null;
      deadline: string | null;
    };

export type RolloverAction = 'keep_today' | 'return_inbox' | 'complete';

export type DailyExecutionResponse = {
  entries: TodayEntry[];
  rollover: TodayEntry[];
};
