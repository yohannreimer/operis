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

  // ── Context reorder ───────────────────────────────────────────────────────

  async function handleMoveContextGroup(contextId: string, direction: 'up' | 'down') {
    const idx = contexts.findIndex((c) => c.id === contextId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= contexts.length) return;

    // Swap positions
    const newContexts = [...contexts];
    const posA = newContexts[idx].position;
    const posB = newContexts[swapIdx].position;
    newContexts[idx] = { ...newContexts[idx], position: posB };
    newContexts[swapIdx] = { ...newContexts[swapIdx], position: posA };
    // Sort by position
    newContexts.sort((a, b) => a.position - b.position);
    setContexts(newContexts);

    try {
      await Promise.all([
        api.updateInboxContext(contexts[idx].id, { position: posB }),
        api.updateInboxContext(contexts[swapIdx].id, { position: posA }),
      ]);
    } catch {
      toast.error('Erro ao reordenar contexto.');
      setContexts(contexts); // revert
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

  const groups = useMemo(() => {
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

  // Only context-type groups that are actually visible (have items)
  const visibleContextGroupIds = useMemo(
    () => groups.filter((g) => g.type === 'context').map((g) => g.id),
    [groups]
  );

  const bruteItems = useMemo(
    () => [...filteredItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filteredItems]
  );

  const pendingCount = items.filter((i) => i.status === 'pendente' || i.status === 'aguardando').length;

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
          {groups.length === 0 ? (
            <div className="inbox-empty">
              Nenhum item {filter === 'hoje' ? 'hoje' : 'nesse período'}. Use o campo acima para capturar.
            </div>
          ) : (
            groups.map((group) => {
              const isContext = group.type === 'context';
              const ctxIdx = isContext ? visibleContextGroupIds.indexOf(group.id) : -1;
              return (
                <InboxGroup
                  key={group.id}
                  label={group.label}
                  items={group.items}
                  contexts={contexts}
                  workspaces={workspaces}
                  collapsed={collapsedGroups.has(group.id)}
                  onToggleCollapse={() => toggleCollapse(group.id)}
                  canMoveUp={isContext && ctxIdx > 0}
                  canMoveDown={isContext && ctxIdx < visibleContextGroupIds.length - 1}
                  onMoveUp={isContext ? () => handleMoveContextGroup(group.id, 'up') : undefined}
                  onMoveDown={isContext ? () => handleMoveContextGroup(group.id, 'down') : undefined}
                  {...itemCallbacks}
                />
              );
            })
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
