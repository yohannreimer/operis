import { useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, RotateCcw } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { TaskActionView, TaskBacklogFilters } from './types';
import { TaskCompletionModal } from '../../components/task-completion-modal';
import { useShellContext } from '../../components/shell-context';
import { localDateKey } from '../../utils/date';
import { applyTaskView, parseTaskSearchParams, writeTaskSearchParams } from './task-backlog-model';
import { TaskBacklogToolbar } from './task-backlog-toolbar';
import { TaskCreateComposer } from './task-create-composer';
import { TaskDetailPanel } from './task-detail-panel';
import { TaskGroupList } from './task-group-list';
import { useTaskBacklog } from './use-task-backlog';
import './tasks.css';

function usePhoneViewport() {
  const [mobile, setMobile] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

const emptyCopy: Record<TaskActionView, { title: string; text: string }> = {
  all: { title: 'Nenhum trabalho complexo por aqui', text: 'Crie uma tarefa quando algo precisar de resultado, contexto ou mais de um passo.' },
  waiting: { title: 'Nada aguardando', text: 'Nenhuma tarefa depende de resposta ou entrega externa.' },
  blocked: { title: 'Nenhum bloqueio aberto', text: 'O trabalho ativo está livre de restrições internas.' },
  overdue: { title: 'Nada atrasado', text: 'Os prazos abertos estão em dia.' },
  no_next_step: { title: 'Tudo tem direção', text: 'Cada tarefa ativa possui um próximo passo claro.' }
};

export function TaskBacklogPage() {
  const { taskId = null } = useParams<{ taskId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const shell = useShellContext();
  const mobile = usePhoneViewport();
  const date = localDateKey();
  const filters = useMemo(() => parseTaskSearchParams(searchParams), [searchParams]);
  const [composerOpen, setComposerOpen] = useState(() => searchParams.get('compose') === '1');
  const [completionTaskId, setCompletionTaskId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(0);
  const controller = useTaskBacklog({ date, activeWorkspaceId: shell.activeWorkspaceId, filters, selectedTaskId: taskId });

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (next.get('compose') === '1') { setComposerOpen(true); next.delete('compose'); changed = true; }
    if (next.has('focus')) { next.delete('focus'); changed = true; }
    if (changed) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const counts = useMemo(() => {
    const open = controller.tasks.filter((task) => task.status !== 'feito' && task.status !== 'arquivado');
    return {
      all: open.length,
      waiting: applyTaskView(open, 'waiting', date).length,
      blocked: applyTaskView(open, 'blocked', date).length,
      overdue: applyTaskView(open, 'overdue', date).length,
      no_next_step: applyTaskView(open, 'no_next_step', date).length
    };
  }, [controller.tasks, date]);

  function updateFilters(next: TaskBacklogFilters) {
    setSearchParams(writeTaskSearchParams(next, searchParams), { replace: true });
  }

  function openTask(id: string) {
    scrollRef.current = listRef.current?.scrollTop ?? window.scrollY;
    const query = searchParams.toString();
    navigate(`/tarefas/${id}${query ? `?${query}` : ''}`);
  }

  function closeDetail() {
    const closingId = taskId;
    const query = searchParams.toString();
    navigate(`/tarefas${query ? `?${query}` : ''}`);
    window.setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = scrollRef.current;
      document.querySelector<HTMLElement>(`[data-task-id="${closingId}"] .task-backlog-row-main`)?.focus();
    }, 30);
  }

  async function safe<T>(operation: () => Promise<T>) {
    try { return await operation(); } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
      return undefined;
    }
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'Escape' && document.querySelector('[role="dialog"]')) return;
      if (event.key === '/') { event.preventDefault(); document.querySelector<HTMLInputElement>('.task-backlog-search input')?.focus(); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); setComposerOpen(true); }
      if (event.key === 'Escape' && taskId) { event.preventDefault(); closeDetail(); }
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const index = Math.max(0, controller.visibleTasks.findIndex((task) => task.id === taskId));
        const next = event.key === 'j' ? Math.min(controller.visibleTasks.length - 1, index + 1) : Math.max(0, index - 1);
        const candidate = controller.visibleTasks[next];
        if (candidate) openTask(candidate.id);
      }
      if (event.key === 'Enter' && taskId === null && controller.visibleTasks[0]) openTask(controller.visibleTasks[0].id);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const selected = controller.selectedTask;
  const completionTask = controller.tasks.find((task) => task.id === completionTaskId) ?? null;
  const hasFilters = filters.query || filters.workspaceId || filters.projectId || filters.priority || filters.due !== 'all' || filters.today !== null || filters.horizon || filters.completion !== 'open';

  return (
    <main className={`task-backlog-page ${selected ? 'has-detail' : ''} ${mobile && selected ? 'mobile-detail-open' : ''}`}>
      <section className="task-backlog-master" aria-label="Backlog de tarefas">
        <TaskBacklogToolbar filters={filters} workspaces={controller.workspaces} projects={controller.projects} counts={counts} onFiltersChange={updateFilters} onNewTask={() => setComposerOpen(true)} />
        <TaskCreateComposer open={composerOpen} resolvedWorkspaceId={controller.resolvedWorkspaceId} workspaces={controller.workspaces} projects={controller.projects} onClose={() => setComposerOpen(false)} onCreate={controller.createTask} onCreated={(id) => { setComposerOpen(false); openTask(id); }} />

        <div ref={listRef} className="task-backlog-list-scroll">
          {controller.loading ? <div className="task-list-skeleton" aria-label="Carregando tarefas">{[1, 2, 3, 4, 5].map((item) => <span key={item} />)}</div> : controller.error ? <div className="task-backlog-empty error" role="alert"><RotateCcw aria-hidden="true" /><h2>O backlog não carregou</h2><p>{controller.error}</p><button type="button" onClick={() => void controller.reload()}>Tentar novamente</button></div> : controller.visibleTasks.length === 0 ? <div className="task-backlog-empty"><Inbox aria-hidden="true" /><h2>{hasFilters ? 'Nenhuma tarefa corresponde aos filtros' : emptyCopy[filters.view].title}</h2><p>{hasFilters ? 'Limpe a busca ou ajuste os filtros para recuperar o contexto.' : emptyCopy[filters.view].text}</p>{hasFilters ? <button type="button" onClick={() => updateFilters({ ...filters, query: '', workspaceId: null, projectId: null, priority: null, due: 'all', today: null })}>Limpar filtros</button> : filters.view === 'all' ? <button type="button" onClick={() => setComposerOpen(true)}>Criar tarefa</button> : <button type="button" onClick={() => updateFilters({ ...filters, view: 'all' })}>Voltar para Todas</button>}</div> : <TaskGroupList groups={controller.groups} date={date} selectedTaskId={taskId} busyTaskIds={controller.busyTaskIds} collapsedGroups={controller.collapsedGroups} onToggleGroup={controller.toggleGroup} onOpen={(task) => openTask(task.id)} onComplete={(task) => { if (task.status === 'feito') void safe(() => controller.reopenTask(task.id)); else setCompletionTaskId(task.id); }} onMove={async (task, movement, waiting) => { await safe(() => controller.moveTask(task.id, movement, waiting)); }} />}
        </div>
        <p className="sr-only" role="status" aria-live="polite">{controller.announcement}</p>
      </section>

      {selected && controller.detail ? <TaskDetailPanel
        task={selected}
        detail={controller.detail}
        workspaces={controller.workspaces}
        projects={controller.projects}
        radar={controller.waitingRadar[selected.workspaceId] ?? null}
        mobile={mobile}
        loading={controller.detailLoading}
        error={controller.detailError}
        onClose={closeDetail}
        onUpdate={(patch) => safe(() => controller.updateTask(selected.id, patch)) as Promise<unknown>}
        onPlanToday={() => safe(() => controller.planForToday(selected)) as Promise<unknown>}
        onRemoveToday={() => safe(() => controller.removeFromToday(selected)) as Promise<unknown>}
        onSchedule={(day, start, end) => safe(() => controller.scheduleTask(selected.id, day, start, end)) as Promise<unknown>}
        onComplete={() => setCompletionTaskId(selected.id)}
        onReopen={() => safe(() => controller.reopenTask(selected.id)) as Promise<unknown>}
        onArchive={() => { if (window.confirm(`Arquivar “${selected.title}”?`)) void safe(() => controller.archiveTask(selected.id)).then((result) => { if (result) closeDetail(); }); }}
        onDelete={() => { if (window.confirm(`Excluir “${selected.title}” e suas etapas, restrições e sessões relacionadas?`)) void safe(() => controller.deleteTask(selected.id)).then((result) => { if (result) closeDetail(); }); }}
        onCreateStep={(title) => safe(() => controller.createStep(selected.id, title)) as Promise<unknown>}
        onUpdateStep={(id, patch) => safe(() => controller.updateStep(selected.id, id, patch)) as Promise<unknown>}
        onReorderSteps={(ids) => safe(() => controller.reorderSteps(selected.id, ids)) as Promise<unknown>}
        onDeleteStep={(id) => safe(() => controller.deleteStep(selected.id, id)) as Promise<unknown>}
        onLoadRadar={() => safe(() => controller.loadWaitingRadar(selected.workspaceId)) as Promise<unknown>}
        onCreateRestriction={(title, detail) => safe(() => controller.createRestriction(selected.id, title, detail)) as Promise<unknown>}
        onUpdateRestriction={(id, patch) => safe(() => controller.updateRestriction(selected.id, id, patch)) as Promise<unknown>}
        onDeleteRestriction={(id) => safe(() => controller.deleteRestriction(selected.id, id)) as Promise<unknown>}
        onFollowup={(note) => safe(() => controller.registerWaitingFollowup(selected.id, note)) as Promise<unknown>}
        onClearWaiting={() => safe(() => controller.clearWaiting(selected.id)) as Promise<unknown>}
        onOpenHistory={() => safe(() => controller.loadDetail(selected.id)) as Promise<unknown>}
        onRetryDetail={() => safe(() => controller.loadDetail(selected.id, true)) as Promise<unknown>}
      /> : null}

      <TaskCompletionModal
        open={Boolean(completionTask)}
        taskTitle={completionTask?.title ?? ''}
        onClose={() => setCompletionTaskId(null)}
        onConfirm={async (completion) => {
          if (!completionTask) return;
          const result = await safe(() => controller.completeTask(completionTask.id, completion));
          if (result) { setCompletionTaskId(null); if (taskId === completionTask.id) closeDetail(); }
        }}
      />
    </main>
  );
}
