import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  DeepWorkSession,
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
import { CreateTaskModal } from '../components/create-task-modal';

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

type Filter = 'hoje' | 'ontem' | 'semana' | 'tudo';

export function InboxPage() {
  const { workspaces } = useShellContext();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [contexts, setContexts] = useState<InboxContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('hoje');
  const [bruteMode, setBruteMode] = useState(false);

  // Deep work execution state
  const [activeSession, setActiveSession] = useState<DeepWorkSession | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [convertingItem, setConvertingItem] = useState<InboxItem | null>(null);

  // Collapse state — set of collapsed group IDs
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Group display order — persisted to localStorage (covers workspaces + contexts)
  const [groupOrder, setGroupOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('inbox.groupOrder') ?? '[]'); } catch { return []; }
  });

  function persistGroupOrder(order: string[]) {
    setGroupOrder(order);
    try { localStorage.setItem('inbox.groupOrder', JSON.stringify(order)); } catch { /* ignore */ }
  }

  // Visibility filters
  const [showDone, setShowDone] = useState(false);
  const [showWaiting, setShowWaiting] = useState(true);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

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

  // Close filter menu on outside click
  useEffect(() => {
    if (!showFilterMenu) return;
    function handle(e: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showFilterMenu]);

  // ── Deep work timer ───────────────────────────────────────────────────────

  // Poll for active session on mount
  useEffect(() => {
    api.getActiveDeepWork().then((s) => setActiveSession(s)).catch(() => {});
  }, []);

  // Tick timer while session is active
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeSession?.state === 'active') {
      timerRef.current = setInterval(() => setNowMs(Date.now()), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeSession?.id, activeSession?.state]);

  const elapsedSeconds = useCallback(() => {
    if (!activeSession || activeSession.state !== 'active') return 0;
    return Math.max(0, Math.floor((nowMs - new Date(activeSession.startedAt).getTime()) / 1000));
  }, [activeSession, nowMs])();

  const progressPct = activeSession
    ? Math.min(100, Math.round((elapsedSeconds / (activeSession.targetMinutes * 60)) * 100))
    : 0;

  async function handleExecute(item: InboxItem) {
    if (!item.workspaceId) {
      toast.error('Atribua uma frente ao item antes de executar.');
      return;
    }
    if (activeSession?.state === 'active') {
      toast.error('Já há uma sessão de execução ativa.');
      return;
    }
    setBusy(true);
    try {
      const { session, task } = await api.executeInboxItem(item.id);
      setActiveSession(session);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'convertido' as InboxItemStatus, convertedTaskId: task.id } : i)));
      toast.success(`Executando: ${task.title}`);
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao iniciar execução.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSessionStop() {
    if (!activeSession) return;
    setBusy(true);
    try {
      await api.stopDeepWork(activeSession.id, { switchedTask: false, notes: 'Encerrado pelo inbox.' });
      setActiveSession(null);
      toast.success('Sessão encerrada.');
    } catch {
      toast.error('Erro ao encerrar sessão.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSessionInterrupt() {
    if (!activeSession) return;
    setBusy(true);
    try {
      const updated = await api.registerDeepWorkInterruption(activeSession.id);
      setActiveSession(updated);
      toast('Interrupção registrada.');
    } catch {
      toast.error('Erro ao registrar interrupção.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSessionDone() {
    if (!activeSession) return;
    setBusy(true);
    try {
      await api.stopDeepWork(activeSession.id, { switchedTask: false, notes: 'Concluído pelo inbox.' });
      if (activeSession.taskId) {
        await api.completeTask(activeSession.taskId, { strictMode: false, completionMode: 'no_note' });
      }
      setActiveSession(null);
      toast.success('Tarefa concluída! Tempo contabilizado.');
    } catch {
      toast.error('Erro ao concluir tarefa.');
    } finally {
      setBusy(false);
    }
  }

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

  // ── Group reorder ─────────────────────────────────────────────────────────

  function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    // Work on the ordered visible group IDs
    const visibleIds = orderedGroups.map((g) => g.id);
    const idx = visibleIds.indexOf(groupId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= visibleIds.length) return;

    const newIds = [...visibleIds];
    [newIds[idx], newIds[swapIdx]] = [newIds[swapIdx], newIds[idx]];
    persistGroupOrder(newIds);

    // Best-effort: persist context positions to backend
    const aId = visibleIds[idx];
    const bId = visibleIds[swapIdx];
    const aCtx = contexts.find((c) => c.id === aId);
    const bCtx = contexts.find((c) => c.id === bId);
    if (aCtx && bCtx) {
      // Assign index-based positions so they're always unique
      Promise.all([
        api.updateInboxContext(aId, { position: swapIdx }),
        api.updateInboxContext(bId, { position: idx }),
      ]).catch(() => {});
    }
  }

  // ── Item reorder within group ─────────────────────────────────────────────

  async function handleMoveItem(item: InboxItem, direction: 'up' | 'down') {
    // Find all items in the same group, in current display order
    const groupItems = items.filter((i) => {
      if (item.workspaceId) return i.workspaceId === item.workspaceId;
      if (item.inboxContextId) return i.inboxContextId === item.inboxContextId;
      return !i.workspaceId && !i.inboxContextId;
    });
    const idx = groupItems.findIndex((i) => i.id === item.id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= groupItems.length) return;

    // Optimistic update: swap in items array
    const swapItem = groupItems[swapIdx];
    setItems((prev) => {
      const next = [...prev];
      const idxA = next.findIndex((i) => i.id === item.id);
      const idxB = next.findIndex((i) => i.id === swapItem.id);
      if (idxA === -1 || idxB === -1) return prev;
      // Give them explicit positions based on their new indices
      next[idxA] = { ...next[idxA], position: idxB };
      next[idxB] = { ...next[idxB], position: idxA };
      return next;
    });

    try {
      await Promise.all([
        api.updateInboxItem(item.id, { position: swapIdx }),
        api.updateInboxItem(swapItem.id, { position: idx }),
      ]);
    } catch {
      toast.error('Erro ao reordenar item.');
      await load();
    }
  }

  // ── Grouping ──────────────────────────────────────────────────────────────

  // Client-side visibility filter
  const filteredItems = useMemo(
    () => items.filter((i) => {
      if (!showDone && i.status === 'feito') return false;
      if (!showWaiting && i.status === 'aguardando') return false;
      return true;
    }),
    [items, showDone, showWaiting]
  );

  const rawGroups = useMemo(() => {
    const workspaceGroups = (workspaces as Workspace[]).map((w) => ({
      id: w.id,
      label: w.name,
      type: 'workspace' as const,
      items: filteredItems.filter((i) => i.workspaceId === w.id),
    }));

    const contextGroups = contexts.map((c) => ({
      id: c.id,
      label: c.name,
      type: 'context' as const,
      items: filteredItems.filter((i) => i.inboxContextId === c.id),
    }));

    const noContext = {
      id: 'no-context',
      label: 'Sem contexto',
      type: 'noContext' as const,
      items: filteredItems.filter((i) => !i.workspaceId && !i.inboxContextId),
    };

    return [...workspaceGroups, ...contextGroups, noContext].filter((g) => g.items.length > 0);
  }, [filteredItems, workspaces, contexts]);

  // Apply groupOrder: known IDs first (in saved order), new IDs appended at end
  const orderedGroups = useMemo(() => {
    const byId = new Map(rawGroups.map((g) => [g.id, g]));
    const known = groupOrder.flatMap((id) => { const g = byId.get(id); return g ? [g] : []; });
    const newOnes = rawGroups.filter((g) => !groupOrder.includes(g.id));
    return [...known, ...newOnes];
  }, [rawGroups, groupOrder]);

  const bruteItems = useMemo(
    () => [...filteredItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filteredItems]
  );

  const itemCallbacksWithReorder = (groupItems: InboxItem[]) => ({
    onMoveItemUp: (item: InboxItem) => {
      const idx = groupItems.findIndex((i) => i.id === item.id);
      if (idx > 0) handleMoveItem(item, 'up');
    },
    onMoveItemDown: (item: InboxItem) => {
      const idx = groupItems.findIndex((i) => i.id === item.id);
      if (idx < groupItems.length - 1) handleMoveItem(item, 'down');
    },
    canMoveItemUp: (item: InboxItem) => groupItems.findIndex((i) => i.id === item.id) > 0,
    canMoveItemDown: (item: InboxItem) => {
      const idx = groupItems.findIndex((i) => i.id === item.id);
      return idx < groupItems.length - 1 && idx !== -1;
    },
  });

  const pendingCount = items.filter((i) => i.status === 'pendente' || i.status === 'aguardando').length;

  // Sync new group IDs into order on first appearance
  useEffect(() => {
    const newIds = rawGroups.map((g) => g.id).filter((id) => !groupOrder.includes(id));
    if (newIds.length > 0) persistGroupOrder([...groupOrder, ...newIds]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawGroups]);

  function toggleCollapse(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const itemCallbacks = {
    onToggleDone: handleToggleDone,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onWaiting: handleWaiting,
    onExecute: handleExecute,
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

            {/* Visibility filter popover */}
            <div className="inbox-vis-filter-wrapper" ref={filterMenuRef}>
              <button
                type="button"
                className={`inbox-vis-filter-btn${showFilterMenu || !showDone || !showWaiting ? ' active' : ''}`}
                onClick={() => setShowFilterMenu((v) => !v)}
                aria-label="Filtros de visibilidade"
                title="Filtros de visibilidade"
              >
                <SlidersHorizontal size={13} />
              </button>
              {showFilterMenu && (
                <div className="inbox-vis-filter-menu">
                  <label className="inbox-vis-filter-item">
                    <input
                      type="checkbox"
                      checked={showDone}
                      onChange={(e) => setShowDone(e.target.checked)}
                    />
                    Mostrar concluídos
                  </label>
                  <label className="inbox-vis-filter-item">
                    <input
                      type="checkbox"
                      checked={showWaiting}
                      onChange={(e) => setShowWaiting(e.target.checked)}
                    />
                    Mostrar aguardando
                  </label>
                </div>
              )}
            </div>
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
          {orderedGroups.length === 0 ? (
            <div className="inbox-empty">
              Nenhum item {filter === 'hoje' ? 'hoje' : 'nesse período'}. Use o campo acima para capturar.
            </div>
          ) : (
            orderedGroups.map((group, idx) => (
              <InboxGroup
                key={group.id}
                label={group.label}
                items={group.items}
                contexts={contexts}
                workspaces={workspaces}
                collapsed={collapsedGroups.has(group.id)}
                onToggleCollapse={() => toggleCollapse(group.id)}
                canMoveUp={idx > 0}
                canMoveDown={idx < orderedGroups.length - 1}
                onMoveUp={() => handleMoveGroup(group.id, 'up')}
                onMoveDown={() => handleMoveGroup(group.id, 'down')}
                {...itemCallbacks}
                {...itemCallbacksWithReorder(group.items)}
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

      {/* Active execution banner */}
      {activeSession?.state === 'active' && (
        <div className="inbox-execution-banner">
          <div className="inbox-execution-banner-inner">
            <div className="inbox-execution-info">
              <span className="inbox-execution-dot" />
              <span className="inbox-execution-title">{activeSession.task?.title ?? 'Executando...'}</span>
              <strong className="inbox-execution-timer">{formatDuration(elapsedSeconds)}</strong>
            </div>
            <div className="inbox-execution-progress">
              <div className="inbox-execution-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="inbox-execution-actions">
              <button
                type="button"
                className="inbox-execution-btn success"
                disabled={busy}
                onClick={handleSessionDone}
              >
                ✓ Concluir
              </button>
              <button
                type="button"
                className="inbox-execution-btn warning"
                disabled={busy}
                onClick={handleSessionInterrupt}
              >
                ⚡ Interrupção
              </button>
              <button
                type="button"
                className="inbox-execution-btn ghost"
                disabled={busy}
                onClick={handleSessionStop}
              >
                Encerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </PremiumPage>
  );
}
