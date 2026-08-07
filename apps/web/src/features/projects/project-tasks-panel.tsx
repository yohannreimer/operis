import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { CalendarPlus, Check, ExternalLink, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { api } from '../../api';
import type { ProjectCockpit } from './types';

export function ProjectTasksPanel({
  project,
  open,
  onClose,
  onReload,
  returnFocusRef
}: {
  project: ProjectCockpit;
  open: boolean;
  onClose: () => void;
  onReload: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      (returnFocusRef?.current ?? previous)?.focus?.();
    };
  }, [onClose, open, returnFocusRef]);

  if (!open) return null;

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) return;
    setBusyId('new');
    setError('');
    try {
      await api.createTask({
        workspaceId: project.workspace.id,
        projectId: project.id,
        title: title.trim(),
        definitionOfDone: `Concluir: ${title.trim()}`,
        taskType: 'b',
        energyLevel: 'media',
        executionKind: 'operacao',
        priority: 3,
        estimatedMinutes: 30
      });
      setTitle('');
      setCreating(false);
      onReload();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusyId('');
    }
  }

  async function moveToToday(taskId: string) {
    setBusyId(taskId);
    try { await api.updateTask(taskId, { status: 'hoje' }); onReload(); }
    finally { setBusyId(''); }
  }

  async function complete(taskId: string) {
    setBusyId(taskId);
    try { await api.completeTask(taskId, { completionMode: 'no_note' }); onReload(); }
    finally { setBusyId(''); }
  }

  return (
    <div className="project-tasks-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={panelRef} className="project-tasks-panel" role="dialog" aria-modal="true" aria-label={`Tarefas de ${project.title}`}>
        <header>
          <div><span>TAREFAS DO PROJETO</span><h2>{project.title}</h2><p>{project.tasks.filter((task) => task.status !== 'feito').length} abertas · {project.tasks.filter((task) => task.status === 'feito').length} concluídas</p></div>
          <button ref={closeRef} type="button" aria-label="Fechar tarefas" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="project-tasks-panel__toolbar">
          <button type="button" onClick={() => setCreating((value) => !value)}><Plus size={15} /> Nova tarefa</button>
          <Link to={`/tarefas?projectId=${project.id}`}>Abrir em Tarefas <ExternalLink size={14} /></Link>
        </div>
        {creating && <form className="project-task-create" onSubmit={createTask}><label><span>Título da tarefa</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="O que precisa ser feito?" /></label><div><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button type="submit" disabled={busyId === 'new'}>Adicionar tarefa</button></div></form>}
        {error && <p className="project-task-error" role="alert">{error}</p>}
        <div className="project-task-list">
          {project.tasks.map((task) => (
            <article key={task.id} data-complete={task.status === 'feito' || undefined}>
              <button type="button" className="project-task-check" aria-label={`Concluir ${task.title}`} disabled={task.status === 'feito' || busyId === task.id} onClick={() => void complete(task.id)}>{task.status === 'feito' && <Check size={13} />}</button>
              <div><strong>{task.title}</strong><small>{task.status === 'hoje' ? 'Em Hoje' : task.status === 'feito' ? 'Concluída' : task.dueDate ? `Prazo ${new Date(task.dueDate).toLocaleDateString('pt-BR')}` : 'Sem prazo'}</small></div>
              {task.status !== 'feito' && <button type="button" className="project-task-today" aria-label={`Mandar ${task.title} para Hoje`} disabled={task.status === 'hoje' || busyId === task.id} onClick={() => void moveToToday(task.id)}><CalendarPlus size={15} /><span>{task.status === 'hoje' ? 'Em Hoje' : 'Hoje'}</span></button>}
            </article>
          ))}
          {!project.tasks.length && <div className="project-task-empty"><p>Nenhuma tarefa vinculada. O motor e o movimento continuam funcionando sem uma lista extensa.</p></div>}
        </div>
      </aside>
    </div>
  );
}
