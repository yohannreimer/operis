import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { Commitment, DayPlan, DayPlanItem, ExecutionSession, InboxItem, Task } from '../../api';
import { api } from '../../api';
import type { RolloverAction, TodayEntry } from './types';

export type TodayWorkspaceState = {
  entries: TodayEntry[];
  rollover: TodayEntry[];
  inboxItems: InboxItem[];
  inboxCount: number;
  commitments: Commitment[];
  dayPlan: DayPlan;
  activeSession: ExecutionSession | null;
  loading: boolean;
  error: string | null;
  inboxError: string | null;
  agendaError: string | null;
  dayPlanError: string | null;
  reload(): Promise<void>;
  addInboxToToday(item: InboxItem): Promise<void>;
  addTaskToToday(task: Task): Promise<void>;
  toggleCompleted(item: TodayEntry): Promise<void>;
  removeFromToday(item: TodayEntry): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;
  resolveRollover(item: TodayEntry, action: RolloverAction): Promise<void>;
  startSession(item: TodayEntry): Promise<void>;
  stopSession(): Promise<void>;
  cancelSession(): Promise<void>;
  setPlannedBlockCompleted(item: DayPlanItem, completed: boolean): Promise<void>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function sortRollover(items: TodayEntry[]) {
  return [...items].sort((left, right) => left.date.localeCompare(right.date) || left.position - right.position);
}

export function useTodayWorkspace(date: string): TodayWorkspaceState {
  const [entries, setEntries] = useState<TodayEntry[]>([]);
  const [rollover, setRollover] = useState<TodayEntry[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [dayPlan, setDayPlan] = useState<DayPlan>({ date, items: [] });
  const [activeSession, setActiveSession] = useState<ExecutionSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [dayPlanError, setDayPlanError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInboxError(null);
    setAgendaError(null);
    setDayPlanError(null);

    const [executionResult, commitmentResult, inboxResult, dayPlanResult, sessionResult] = await Promise.allSettled([
      api.getDailyExecution(date),
      api.getCommitments({ date }),
      api.getInbox({ view: 'unprocessed', date }),
      api.getDayPlan(date),
      api.getActiveExecutionSession()
    ]);

    if (executionResult.status === 'fulfilled') {
      setEntries(executionResult.value.entries);
      setRollover(executionResult.value.rollover);
    } else {
      setError(errorMessage(executionResult.reason, 'Não foi possível carregar o seu dia.'));
    }

    if (commitmentResult.status === 'fulfilled') {
      setCommitments(commitmentResult.value);
    } else {
      setAgendaError(errorMessage(commitmentResult.reason, 'Agenda indisponível.'));
    }

    if (inboxResult.status === 'fulfilled') {
      setInboxItems(inboxResult.value.items);
    } else {
      setInboxError(errorMessage(inboxResult.reason, 'Inbox indisponível.'));
    }

    if (dayPlanResult.status === 'fulfilled') {
      setDayPlan(dayPlanResult.value);
    } else {
      setDayPlanError(errorMessage(dayPlanResult.reason, 'Linha do tempo indisponível.'));
    }

    if (sessionResult.status === 'fulfilled') {
      setActiveSession(sessionResult.value);
    } else {
      setDayPlanError(errorMessage(sessionResult.reason, 'Execução observada indisponível.'));
    }

    setLoading(false);
  }, [date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const removeFromToday = useCallback(async (item: TodayEntry) => {
    const previousEntries = entries;
    setEntries((current) => current.filter((entry) => entry.id !== item.id));

    try {
      await api.removeDailyExecution(item.id);
      const inboxResult = await api.getInbox({ view: 'unprocessed', date });
      setInboxItems(inboxResult.items);
    } catch (cause) {
      setEntries(previousEntries);
      toast.error(errorMessage(cause, 'Não foi possível remover de Hoje.'));
    }
  }, [date, entries]);

  const addInboxToToday = useCallback(async (item: InboxItem) => {
    const previousEntries = entries;
    const previousInbox = inboxItems;
    const optimisticId = `optimistic:inbox:${item.id}`;
    const optimisticEntry: TodayEntry = {
      id: optimisticId,
      kind: 'inbox',
      sourceId: item.id,
      date,
      title: item.content,
      position: entries.length,
      completedAt: null,
      context: item.inboxContext?.name ?? item.workspace?.name ?? null
    };
    setEntries((current) => [...current, optimisticEntry]);
    setInboxItems((current) => current.filter((candidate) => candidate.id !== item.id));

    try {
      const created = await api.assignDailyExecution(date, {
        sourceType: 'inbox', sourceId: item.id
      });
      setEntries((current) => current.map((entry) => entry.id === optimisticId ? created : entry));
      toast('Adicionado a Hoje.', {
        action: { label: 'Desfazer', onClick: () => void removeFromToday(created) }
      });
    } catch (cause) {
      setEntries(previousEntries);
      setInboxItems(previousInbox);
      toast.error(errorMessage(cause, 'Não foi possível adicionar a Hoje.'));
    }
  }, [date, entries, inboxItems, removeFromToday]);

  const addTaskToToday = useCallback(async (task: Task) => {
    const previousEntries = entries;
    const optimisticId = `optimistic:task:${task.id}`;
    const optimisticEntry: TodayEntry = {
      id: optimisticId,
      kind: 'task',
      sourceId: task.id,
      date,
      title: task.title,
      position: entries.length,
      completedAt: task.completedAt ?? null,
      project: task.project?.title ?? null,
      estimatedMinutes: task.estimatedMinutes ?? null,
      deadline: task.dueDate ?? null
    };
    setEntries((current) => [...current, optimisticEntry]);

    try {
      const created = await api.assignDailyExecution(date, {
        sourceType: 'task', sourceId: task.id
      });
      setEntries((current) => current.map((entry) => entry.id === optimisticId ? created : entry));
      toast('Adicionado a Hoje.', {
        action: { label: 'Desfazer', onClick: () => void removeFromToday(created) }
      });
    } catch (cause) {
      setEntries(previousEntries);
      toast.error(errorMessage(cause, 'Não foi possível adicionar a tarefa.'));
    }
  }, [date, entries, removeFromToday]);

  const setCompletion = useCallback(async (
    item: TodayEntry,
    completed: boolean,
    showUndo: boolean
  ) => {
    const previousEntries = entries;
    const optimisticCompletedAt = completed ? new Date().toISOString() : null;
    setEntries((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, completedAt: optimisticCompletedAt }
      : entry));

    try {
      const updated = await api.setDailyExecutionCompleted(item.id, completed);
      setEntries((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      if (completed && showUndo) {
        toast('Concluído.', {
          action: {
            label: 'Desfazer',
            onClick: () => void setCompletion(updated, false, false)
          }
        });
      }
    } catch (cause) {
      setEntries(previousEntries);
      toast.error(errorMessage(cause, 'Não foi possível atualizar a conclusão.'));
    }
  }, [entries]);

  const toggleCompleted = useCallback(async (item: TodayEntry) => {
    await setCompletion(item, !item.completedAt, true);
  }, [setCompletion]);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const previousEntries = entries;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const reordered = orderedIds.flatMap((id, position) => {
      const item = byId.get(id);
      return item ? [{ ...item, position }] : [];
    });
    setEntries(reordered);

    try {
      await api.reorderDailyExecution(date, orderedIds);
    } catch (cause) {
      setEntries(previousEntries);
      toast.error(errorMessage(cause, 'Não foi possível salvar a ordem.'));
    }
  }, [date, entries]);

  const undoRollover = useCallback(async (
    item: TodayEntry,
    action: RolloverAction,
    resolved?: TodayEntry | void
  ) => {
    try {
      if (action === 'keep_today' && resolved) {
        const restored = await api.resolveDailyRollover(resolved.id, 'keep_today', item.date);
        setEntries((current) => current.filter((entry) => entry.id !== resolved.id));
        if (restored) setRollover((current) => sortRollover([...current, restored]));
        return;
      }

      if (action === 'complete') {
        const restored = await api.setDailyExecutionCompleted(item.id, false);
        setRollover((current) => sortRollover([...current, restored]));
        return;
      }

      const restored = await api.assignDailyExecution(item.date, {
        sourceType: item.kind,
        sourceId: item.sourceId
      });
      setRollover((current) => sortRollover([...current, restored]));
    } catch {
      await reload();
      toast.error('Não foi possível desfazer a revisão.');
    }
  }, [reload]);

  const resolveRollover = useCallback(async (item: TodayEntry, action: RolloverAction) => {
    try {
      const resolved = await api.resolveDailyRollover(item.id, action, date);
      setRollover((current) => current.filter((entry) => entry.id !== item.id));
      if (action === 'keep_today' && resolved) {
        setEntries((current) => [...current, resolved]);
      }
      toast('Pendência revisada.', {
        duration: 5000,
        action: {
          label: 'Desfazer',
          onClick: () => void undoRollover(item, action, resolved)
        }
      });
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível revisar a pendência.'));
    }
  }, [date, undoRollover]);

  const startSession = useCallback(async (item: TodayEntry) => {
    const plannedItem = dayPlan.items.find((candidate) =>
      item.kind === 'task'
        ? candidate.taskId === item.sourceId
        : candidate.inboxItemId === item.sourceId
    );
    try {
      const session = await api.startExecutionSession({
        sourceType: item.kind,
        sourceId: item.sourceId,
        dayPlanItemId: plannedItem?.id ?? null,
        dailyExecutionItemId: item.id
      });
      setActiveSession(session);
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível iniciar a execução.'));
    }
  }, [dayPlan.items]);

  const stopSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await api.stopExecutionSession(activeSession.id);
      setActiveSession(null);
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível encerrar a execução.'));
    }
  }, [activeSession]);

  const cancelSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await api.cancelExecutionSession(activeSession.id);
      setActiveSession(null);
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível cancelar a execução.'));
    }
  }, [activeSession]);

  const setPlannedBlockCompleted = useCallback(async (item: DayPlanItem, completed: boolean) => {
    const previous = dayPlan;
    const completedAt = completed ? new Date().toISOString() : null;
    setDayPlan((current) => ({
      ...current,
      items: current.items.map((candidate) => candidate.id === item.id
        ? { ...candidate, completedAt }
        : candidate)
    }));
    try {
      const updated = await api.updateDayPlanItem(item.id, { completedAt });
      setDayPlan((current) => ({
        ...current,
        items: current.items.map((candidate) => candidate.id === item.id ? updated : candidate)
      }));
    } catch (cause) {
      setDayPlan(previous);
      toast.error(errorMessage(cause, 'Não foi possível concluir o bloco.'));
    }
  }, [dayPlan]);

  return {
    entries,
    rollover,
    inboxItems,
    inboxCount: inboxItems.length,
    commitments,
    dayPlan,
    activeSession,
    loading,
    error,
    inboxError,
    agendaError,
    dayPlanError,
    reload,
    addInboxToToday,
    addTaskToToday,
    toggleCompleted,
    removeFromToday,
    reorder,
    resolveRollover,
    startSession,
    stopSession,
    cancelSession,
    setPlannedBlockCompleted
  };
}
