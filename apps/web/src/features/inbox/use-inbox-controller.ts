import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type {
  InboxContext,
  InboxItem,
  InboxItemStatus,
  Workspace
} from '../../api';
import { api } from '../../api';

export type InboxControllerOptions = {
  filter?: 'hoje' | 'ontem' | 'semana' | 'tudo';
  view?: 'all' | 'unprocessed';
  date?: string;
};

export type InboxController = {
  items: InboxItem[];
  contexts: InboxContext[];
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  create(content: string, workspaceId?: string | null, inboxContextId?: string | null): Promise<void>;
  toggleDone(item: InboxItem): Promise<void>;
  edit(item: InboxItem, content: string): Promise<void>;
  setWaiting(item: InboxItem, date: string, person?: string, note?: string): Promise<void>;
  moveContext(item: InboxItem, workspaceId: string | null, inboxContextId: string | null): Promise<void>;
  remove(item: InboxItem): Promise<void>;
  convert(item: InboxItem, taskId: string): Promise<void>;
  execute(item: InboxItem): Promise<void>;
};

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useInboxController(options: InboxControllerOptions = {}): InboxController {
  const { filter, view = 'all', date } = options;
  const [items, setItems] = useState<InboxItem[]>([]);
  const [contexts, setContexts] = useState<InboxContext[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [inboxResult, workspacesResult] = await Promise.allSettled([
      api.getInbox({ filter, view, date }),
      api.getWorkspaces()
    ]);

    if (inboxResult.status === 'fulfilled') {
      setItems(inboxResult.value.items);
      setContexts(inboxResult.value.contexts);
    } else {
      setError(message(inboxResult.reason, 'Não foi possível carregar o Inbox.'));
    }
    if (workspacesResult.status === 'fulfilled') {
      setWorkspaces(workspacesResult.value);
    }
    setLoading(false);
  }, [date, filter, view]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (
    content: string,
    workspaceId: string | null = null,
    inboxContextId: string | null = null
  ) => {
    try {
      const item = await api.createInboxItem({ content, workspaceId, inboxContextId });
      setItems((current) => [item, ...current]);
    } catch (cause) {
      toast.error(message(cause, 'Erro ao criar item.'));
    }
  }, []);

  const updateItem = useCallback(async (
    item: InboxItem,
    patch: Partial<{
      content: string;
      status: InboxItemStatus;
      workspaceId: string | null;
      inboxContextId: string | null;
      waitingDate: string | null;
      waitingPerson: string | null;
      waitingNote: string | null;
      convertedTaskId: string | null;
    }>,
    fallback: string
  ) => {
    const previousItems = items;
    setItems((current) => current.map((candidate) => candidate.id === item.id
      ? { ...candidate, ...patch }
      : candidate));
    try {
      const updated = await api.updateInboxItem(item.id, patch);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
    } catch (cause) {
      setItems(previousItems);
      toast.error(message(cause, fallback));
    }
  }, [items]);

  const toggleDone = useCallback(async (item: InboxItem) => {
    await updateItem(item, {
      status: item.status === 'feito' ? 'pendente' : 'feito'
    }, 'Erro ao atualizar item.');
  }, [updateItem]);

  const edit = useCallback(async (item: InboxItem, content: string) => {
    await updateItem(item, { content }, 'Erro ao editar item.');
  }, [updateItem]);

  const setWaiting = useCallback(async (
    item: InboxItem,
    waitingDate: string,
    person?: string,
    note?: string
  ) => {
    await updateItem(item, {
      status: 'aguardando',
      waitingDate: new Date(`${waitingDate}T00:00:00.000Z`).toISOString(),
      waitingPerson: person ?? null,
      waitingNote: note ?? null
    }, 'Erro ao configurar espera.');
  }, [updateItem]);

  const moveContext = useCallback(async (
    item: InboxItem,
    workspaceId: string | null,
    inboxContextId: string | null
  ) => {
    await updateItem(item, { workspaceId, inboxContextId }, 'Erro ao mover item.');
  }, [updateItem]);

  const remove = useCallback(async (item: InboxItem) => {
    const previousItems = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      await api.deleteInboxItem(item.id);
      toast.success('Item removido.');
    } catch (cause) {
      setItems(previousItems);
      toast.error(message(cause, 'Erro ao deletar item.'));
    }
  }, [items]);

  const convert = useCallback(async (item: InboxItem, taskId: string) => {
    const previousItems = items;
    setItems((current) => current.map((candidate) => candidate.id === item.id
      ? { ...candidate, status: 'convertido', convertedTaskId: taskId }
      : candidate));
    try {
      const updated = await api.convertInboxItem(item.id, taskId);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
    } catch (cause) {
      setItems(previousItems);
      toast.error(message(cause, 'Erro ao transformar em tarefa.'));
    }
  }, [items]);

  const execute = useCallback(async (item: InboxItem) => {
    try {
      await api.executeInboxItem(item.id);
      await reload();
      toast.success('Execução iniciada.');
    } catch (cause) {
      toast.error(message(cause, 'Erro ao iniciar execução.'));
    }
  }, [reload]);

  return {
    items,
    contexts,
    workspaces,
    loading,
    error,
    reload,
    create,
    toggleDone,
    edit,
    setWaiting,
    moveContext,
    remove,
    convert,
    execute
  };
}
