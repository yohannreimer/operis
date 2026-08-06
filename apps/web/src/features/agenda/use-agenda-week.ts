import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { api, type AgendaBlock, type AgendaWeek, type DayPlanItem } from '../../api';
import type {
  AgendaWeekController,
  MoveBlockInput,
  PlannerSource
} from './types';

export type { AgendaWeekController } from './types';

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function durationMinutes(startTime: string, endTime: string) {
  return Math.max(
    0,
    Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000)
  );
}

function findBlock(week: AgendaWeek, id: string) {
  return week.days.flatMap((day) => day.blocks).find((block) => block.id === id) ?? null;
}

function placeBlock(week: AgendaWeek, block: AgendaBlock) {
  return {
    ...week,
    days: week.days.map((day) => ({
      ...day,
      blocks:
        day.date === block.date
          ? [...day.blocks.filter((candidate) => candidate.id !== block.id), block].sort((a, b) =>
              a.startTime.localeCompare(b.startTime)
            )
          : day.blocks.filter((candidate) => candidate.id !== block.id)
    }))
  };
}

function removeBlock(week: AgendaWeek, id: string) {
  return {
    ...week,
    days: week.days.map((day) => ({
      ...day,
      blocks: day.blocks.filter((block) => block.id !== id)
    }))
  };
}

function replaceBlock(week: AgendaWeek, optimisticId: string, block: AgendaBlock) {
  return {
    ...week,
    days: week.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((candidate) =>
        candidate.id === optimisticId ? block : candidate
      )
    }))
  };
}

function fromDayPlanItem(item: DayPlanItem, fallback: AgendaBlock): AgendaBlock {
  const kind = item.taskId ? 'task' : item.inboxItemId ? 'inbox' : fallback.kind;
  return {
    ...fallback,
    id: item.id,
    kind,
    sourceId: item.taskId ?? item.inboxItemId ?? fallback.sourceId,
    title: item.task?.title ?? item.inboxItem?.content ?? fallback.title,
    startTime: item.startTime,
    endTime: item.endTime,
    completedAt: item.completedAt,
    workspaceId:
      item.task?.workspaceId ?? item.inboxItem?.workspaceId ?? fallback.workspaceId,
    plannedMinutes: durationMinutes(item.startTime, item.endTime)
  };
}

export function useAgendaWeek(weekStart: string): AgendaWeekController {
  const [week, setWeekState] = useState<AgendaWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const weekRef = useRef<AgendaWeek | null>(null);
  const moveBlockRef = useRef<AgendaWeekController['moveBlock']>(async () => undefined);
  const resizeBlockRef = useRef<AgendaWeekController['resizeBlock']>(async () => undefined);
  const setCompletedRef = useRef<AgendaWeekController['setBlockCompleted']>(
    async () => undefined
  );

  const setWeek = useCallback((next: AgendaWeek | null) => {
    weekRef.current = next;
    setWeekState(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWeek(await api.getAgendaWeek(weekStart));
    } catch (cause) {
      setError(message(cause, 'Não foi possível carregar a Agenda.'));
    } finally {
      setLoading(false);
    }
  }, [setWeek, weekStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const scheduleSource = useCallback(async (source: PlannerSource, startTime: string) => {
    const previous = weekRef.current;
    if (!previous) {
      return;
    }

    const sourceRecord =
      source.kind === 'inbox'
        ? previous.unscheduled.inbox.find((item) => item.id === source.sourceId)
        : previous.unscheduled.tasks.find((item) => item.id === source.sourceId);
    if (!sourceRecord) {
      toast.error('Item não encontrado para planejamento.');
      return;
    }

    const plannedMinutes =
      source.kind === 'inbox'
        ? 15
        : Math.max(
            15,
            previous.unscheduled.tasks.find((item) => item.id === source.sourceId)
              ?.remainingMinutes ||
              previous.unscheduled.tasks.find((item) => item.id === source.sourceId)
                ?.estimatedMinutes ||
              60
          );
    const endTime = addMinutes(startTime, plannedMinutes);
    const date = startTime.slice(0, 10);
    const optimisticId = `optimistic:${source.kind}:${source.sourceId}:${startTime}`;
    const optimistic: AgendaBlock = {
      id: optimisticId,
      kind: source.kind,
      sourceId: source.sourceId,
      date,
      title: sourceRecord.title,
      startTime,
      endTime,
      completedAt: null,
      workspaceId: sourceRecord.workspaceId,
      plannedMinutes
    };
    const optimisticWeek = placeBlock(previous, optimistic);
    optimisticWeek.unscheduled = {
      tasks: optimisticWeek.unscheduled.tasks.map((task) =>
        source.kind === 'task' && task.id === source.sourceId
          ? {
              ...task,
              plannedMinutes: task.plannedMinutes + plannedMinutes,
              remainingMinutes: Math.max(0, task.remainingMinutes - plannedMinutes)
            }
          : task
      ),
      inbox:
        source.kind === 'inbox'
          ? optimisticWeek.unscheduled.inbox.filter((item) => item.id !== source.sourceId)
          : optimisticWeek.unscheduled.inbox
    };
    setWeek(optimisticWeek);

    try {
      const created = await api.createDayPlanItem(date, {
        taskId: source.kind === 'task' ? source.sourceId : null,
        inboxItemId: source.kind === 'inbox' ? source.sourceId : null,
        startTime,
        endTime,
        blockType: 'task'
      });
      const persisted = fromDayPlanItem(created, optimistic);
      const current = weekRef.current;
      if (current) {
        setWeek(replaceBlock(current, optimisticId, persisted));
      }
      toast('Planejado.', {
        action: {
          label: 'Desfazer',
          onClick: () => void api.deleteDayPlanItem(persisted.id).then(reload)
        }
      });
    } catch (cause) {
      setWeek(previous);
      toast.error(message(cause, 'Não foi possível planejar o item.'));
    }
  }, [reload, setWeek]);

  const moveBlock = useCallback(async (id: string, target: MoveBlockInput) => {
    const previous = weekRef.current;
    if (!previous) {
      return;
    }
    const original = findBlock(previous, id);
    if (!original) {
      return;
    }
    const optimistic = {
      ...original,
      ...target,
      plannedMinutes: durationMinutes(target.startTime, target.endTime)
    };
    setWeek(placeBlock(previous, optimistic));

    try {
      const updated = await api.updateDayPlanItem(id, target);
      const current = weekRef.current;
      if (current) {
        setWeek(placeBlock(current, fromDayPlanItem(updated, optimistic)));
      }
      toast('Bloco movido.', {
        action: {
          label: 'Desfazer',
          onClick: () =>
            void moveBlockRef.current(id, {
              date: original.date,
              startTime: original.startTime,
              endTime: original.endTime
            })
        }
      });
    } catch {
      setWeek(previous);
      toast.error('Não foi possível mover o bloco.');
    }
  }, [setWeek]);
  moveBlockRef.current = moveBlock;

  const resizeBlock = useCallback(async (id: string, endTime: string) => {
    const previous = weekRef.current;
    if (!previous) {
      return;
    }
    const original = findBlock(previous, id);
    if (!original) {
      return;
    }
    const optimistic = {
      ...original,
      endTime,
      plannedMinutes: durationMinutes(original.startTime, endTime)
    };
    setWeek(placeBlock(previous, optimistic));

    try {
      const updated = await api.updateDayPlanItem(id, { endTime });
      const current = weekRef.current;
      if (current) {
        setWeek(placeBlock(current, fromDayPlanItem(updated, optimistic)));
      }
      toast('Duração atualizada.', {
        action: {
          label: 'Desfazer',
          onClick: () => void resizeBlockRef.current(id, original.endTime)
        }
      });
    } catch {
      setWeek(previous);
      toast.error('Não foi possível alterar a duração.');
    }
  }, [setWeek]);
  resizeBlockRef.current = resizeBlock;

  const setBlockCompleted = useCallback(async (id: string, completed: boolean) => {
    const previous = weekRef.current;
    if (!previous) {
      return;
    }
    const original = findBlock(previous, id);
    if (!original) {
      return;
    }
    const completedAt = completed ? new Date().toISOString() : null;
    const optimistic = { ...original, completedAt };
    setWeek(placeBlock(previous, optimistic));

    try {
      const updated = await api.updateDayPlanItem(id, { completedAt });
      const current = weekRef.current;
      if (current) {
        setWeek(placeBlock(current, fromDayPlanItem(updated, optimistic)));
      }
      if (completed) {
        toast('Concluído.', {
          action: {
            label: 'Desfazer',
            onClick: () => void setCompletedRef.current(id, false)
          }
        });
      }
    } catch {
      setWeek(previous);
      toast.error('Não foi possível atualizar a conclusão.');
    }
  }, [setWeek]);
  setCompletedRef.current = setBlockCompleted;

  const removePlannedBlock = useCallback(async (id: string) => {
    const previous = weekRef.current;
    if (!previous) {
      return;
    }
    const original = findBlock(previous, id);
    if (!original) {
      return;
    }
    setWeek(removeBlock(previous, id));

    try {
      await api.deleteDayPlanItem(id);
      toast('Removido do planejamento.', {
        action: {
          label: 'Desfazer',
          onClick: () =>
            void api
              .createDayPlanItem(original.date, {
                taskId: original.kind === 'task' ? original.sourceId : null,
                inboxItemId: original.kind === 'inbox' ? original.sourceId : null,
                startTime: original.startTime,
                endTime: original.endTime,
                blockType: 'task'
              })
              .then(reload)
        }
      });
    } catch {
      setWeek(previous);
      toast.error('Não foi possível remover o bloco.');
    }
  }, [reload, setWeek]);

  return {
    week,
    loading,
    error,
    reload,
    scheduleSource,
    moveBlock,
    resizeBlock,
    setBlockCompleted,
    removeBlock: removePlannedBlock
  };
}
