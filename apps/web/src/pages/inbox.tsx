import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  api,
  InboxContext,
  InboxItem,
  InboxItemStatus,
  Task,
  Workspace,
} from '../api';
import { useShellContext } from '../components/shell-context';
import { PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
import { InboxInput } from '../components/inbox-input';
import { InboxGroup } from '../components/inbox-group';
import { InboxScheduleSheet } from '../components/inbox-schedule-sheet';
import { CreateTaskModal } from '../components/create-task-modal';

type Filter = 'hoje' | 'ontem' | 'semana' | 'tudo';

export function InboxPage() {
  const { workspaces } = useShellContext();
  const navigate = useNavigate();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [contexts, setContexts] = useState<InboxContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('hoje');
  const [bruteMode, setBruteMode] = useState(false);

  const [schedulingItem, setSchedulingItem] = useState<InboxItem | null>(null);
  const [convertingItem, setConvertingItem] = useState<InboxItem | null>(null);

  async function load() {
    try {
      const data = await api.getInbox(filter);
      setItems(data.items);
      setContexts(data.contexts);
    } catch {
      toast.error('Erro ao carregar inbox.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // ── Item actions ──────────────────────────────────────────────────────────

  async function handleCreate(content: string, workspaceId: string | null, inboxContextId: string | null) {
    try {
      const item = await api.createInboxItem({ content, workspaceId, inboxContextId });
      setItems((prev) => [item, ...prev]);
    } catch {
      toast.error('Erro ao criar item.');
    }
  }

  async function handleToggleDone(item: InboxItem) {
    const newStatus: InboxItemStatus = item.status === 'feito' ? 'pendente' : 'feito';
    try {
      const updated = await api.updateInboxItem(item.id, { status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao atualizar item.');
    }
  }

  async function handleEdit(item: InboxItem, newContent: string) {
    try {
      const updated = await api.updateInboxItem(item.id, { content: newContent });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao editar item.');
    }
  }

  async function handleDelete(item: InboxItem) {
    try {
      await api.deleteInboxItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch {
      toast.error('Erro ao deletar item.');
    }
  }

  async function handleWaiting(item: InboxItem, date: string, person?: string, note?: string) {
    try {
      const updated = await api.updateInboxItem(item.id, {
        status: 'aguardando',
        waitingDate: new Date(date).toISOString(),
        waitingPerson: person ?? null,
        waitingNote: note ?? null,
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao configurar espera.');
    }
  }

  async function handleScheduleNow(item: InboxItem) {
    try {
      const updated = await api.scheduleInboxItem(item.id, { mode: 'now' });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      navigate('/hoje');
    } catch {
      toast.error('Erro ao agendar item.');
    }
  }

  async function handleScheduleTime(item: InboxItem, isoTime: string) {
    try {
      const updated = await api.scheduleInboxItem(item.id, { mode: 'scheduled', scheduledAt: isoTime });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      toast.success('Agendado.');
    } catch {
      toast.error('Erro ao agendar item.');
    }
  }

  async function handleMoveContext(item: InboxItem, workspaceId: string | null, inboxContextId: string | null) {
    try {
      const updated = await api.updateInboxItem(item.id, { workspaceId, inboxContextId });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error('Erro ao mover item.');
    }
  }

  async function handleTaskCreated(task: Task) {
    if (!convertingItem) return;
    try {
      const updated = await api.convertInboxItem(convertingItem.id, task.id);
      setItems((prev) => prev.map((i) => (i.id === convertingItem.id ? updated : i)));
    } catch {
      // silently ignore — task was created
    }
    setConvertingItem(null);
  }

  async function handleAddContext() {
    const name = prompt('Nome do novo contexto:');
    if (!name?.trim()) return;
    try {
      const ctx = await api.createInboxContext(name.trim());
      setContexts((prev) => [...prev, ctx]);
      toast.success(`Contexto "${ctx.name}" criado.`);
    } catch {
      toast.error('Erro ao criar contexto.');
    }
  }

  // ── Grouping ──────────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const workspaceGroups = (workspaces as Workspace[]).map((w) => ({
      id: w.id,
      label: w.name,
      items: items.filter((i) => i.workspaceId === w.id),
    }));

    const contextGroups = contexts.map((c) => ({
      id: c.id,
      label: c.name,
      items: items.filter((i) => i.inboxContextId === c.id),
    }));

    const noContext = {
      id: 'no-context',
      label: 'Sem contexto',
      items: items.filter((i) => !i.workspaceId && !i.inboxContextId),
    };

    return [...workspaceGroups, ...contextGroups, noContext].filter((g) => g.items.length > 0);
  }, [items, workspaces, contexts]);

  const bruteItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items]
  );

  const pendingCount = items.filter((i) => i.status === 'pendente' || i.status === 'aguardando').length;

  const itemCallbacks = {
    onToggleDone: handleToggleDone,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onWaiting: handleWaiting,
    onSchedule: (item: InboxItem) => setSchedulingItem(item),
    onConvert: (item: InboxItem) => setConvertingItem(item),
    onMoveContext: handleMoveContext,
  };

  return (
    <PremiumPage>
      <PremiumHeader
        title="Inbox Operacional"
        subtitle={`${pendingCount} pendente${pendingCount !== 1 ? 's' : ''}`}
        actions={
          <div className="inbox-header-controls">
            <div className="inbox-filter-tabs">
              {(['hoje', 'ontem', 'semana', 'tudo'] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`inbox-filter-tab${filter === f ? ' active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`inbox-bruto-btn${bruteMode ? ' active' : ''}`}
              onClick={() => setBruteMode((v) => !v)}
              title="Lista cronológica sem agrupamento"
            >
              Bruto
            </button>
          </div>
        }
      />

      {/* Capture input — sempre visível */}
      <div className="inbox-capture-bar">
        <InboxInput
          workspaces={workspaces}
          contexts={contexts}
          onSubmit={handleCreate}
        />
      </div>

      {loading ? (
        <SkeletonBlock />
      ) : bruteMode ? (
        /* Modo bruto — lista cronológica plana */
        <div className="inbox-brute-list">
          {bruteItems.length === 0 ? (
            <div className="inbox-empty">Nenhum item nesse período.</div>
          ) : (
            <InboxGroup
              label=""
              items={bruteItems}
              contexts={contexts}
              workspaces={workspaces}
              {...itemCallbacks}
            />
          )}
        </div>
      ) : (
        /* Modo agrupado */
        <div className="inbox-groups">
          {groups.length === 0 ? (
            <div className="inbox-empty">
              Nenhum item {filter === 'hoje' ? 'hoje' : 'nesse período'}. Use o campo acima para capturar.
            </div>
          ) : (
            groups.map((group) => (
              <InboxGroup
                key={group.id}
                label={group.label}
                items={group.items}
                contexts={contexts}
                workspaces={workspaces}
                {...itemCallbacks}
              />
            ))
          )}

          <button
            type="button"
            className="inbox-add-context ghost-button"
            onClick={handleAddContext}
          >
            + Novo contexto
          </button>
        </div>
      )}

      {/* Schedule sheet */}
      <InboxScheduleSheet
        open={Boolean(schedulingItem)}
        onClose={() => setSchedulingItem(null)}
        onNow={() => schedulingItem && handleScheduleNow(schedulingItem)}
        onScheduled={(isoTime) => schedulingItem && handleScheduleTime(schedulingItem, isoTime)}
      />

      {/* Convert to task modal */}
      <CreateTaskModal
        open={Boolean(convertingItem)}
        onClose={() => setConvertingItem(null)}
        workspaces={workspaces}
        prefill={{
          title: convertingItem?.content,
          workspaceId: convertingItem?.workspaceId ?? undefined,
        }}
        onCreated={handleTaskCreated}
      />
    </PremiumPage>
  );
}
