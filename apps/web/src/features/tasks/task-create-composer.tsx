import { FormEvent, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Project, Workspace } from '../../api';

type CreateValues = {
  title: string;
  workspaceId?: string | null;
  projectId?: string | null;
  dueDate?: string | null;
};

type Props = {
  open: boolean;
  resolvedWorkspaceId: string | null;
  workspaces: Workspace[];
  projects: Project[];
  onClose(): void;
  onCreated(taskId: string): void;
  onCreate(values: CreateValues): Promise<{ id: string }>;
};

export function TaskCreateComposer({
  open, resolvedWorkspaceId, workspaces, projects, onClose, onCreated, onCreate
}: Props) {
  const [title, setTitle] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setWorkspaceId((current) => current || resolvedWorkspaceId || '');
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open, resolvedWorkspaceId]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = title.trim();
    if (normalized.split(/\s+/).length < 2) {
      setError('Use verbo + objeto no título da tarefa.');
      inputRef.current?.focus();
      return;
    }
    if (!workspaceId && !resolvedWorkspaceId) {
      setError('Crie uma Frente antes de adicionar uma tarefa complexa.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const task = await onCreate({
        title: normalized,
        workspaceId: workspaceId || resolvedWorkspaceId,
        projectId: projectId || null,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null
      });
      setTitle('');
      setProjectId('');
      setDueDate('');
      setContextOpen(false);
      onCreated(task.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a tarefa.');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const compatibleProjects = projects.filter((project) => project.workspaceId === (workspaceId || resolvedWorkspaceId));

  return (
    <form className="task-create-composer" onSubmit={submit} aria-label="Nova tarefa complexa">
      <div className="task-create-primary">
        <span className="task-create-prompt" aria-hidden="true">↳</span>
        <label className="sr-only" htmlFor="task-create-title">Título da tarefa</label>
        <input
          id="task-create-title"
          ref={inputRef}
          value={title}
          onChange={(event) => { setTitle(event.target.value); setError(''); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); onClose(); }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Qual trabalho precisa avançar?"
          disabled={busy}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !title.trim()}>{busy ? 'Criando…' : 'Criar'}</button>
        <button type="button" className="task-icon-button" aria-label="Cancelar nova tarefa" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>

      {error ? <p className="task-inline-error" role="alert">{error}</p> : null}
      {!resolvedWorkspaceId && workspaces.length === 0 ? (
        <p className="task-create-no-front">Tarefas complexas precisam de uma Frente. <Link to="/frentes">Criar a primeira Frente</Link></p>
      ) : null}

      <button
        type="button"
        className="task-create-context-toggle"
        aria-expanded={contextOpen}
        onClick={() => setContextOpen((current) => !current)}
      >
        Adicionar contexto <ChevronDown aria-hidden="true" />
      </button>

      {contextOpen ? (
        <div className="task-create-context">
          <label>
            <span>Frente</span>
            <select value={workspaceId || resolvedWorkspaceId || ''} onChange={(event) => { setWorkspaceId(event.target.value); setProjectId(''); }}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <label>
            <span>Projeto</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Sem projeto</option>
              {compatibleProjects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </label>
          <label>
            <span><CalendarDays aria-hidden="true" /> Prazo</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
        </div>
      ) : null}
    </form>
  );
}
