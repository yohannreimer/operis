import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import {
  api,
  type Note,
  type NoteFolder,
  type NoteType,
  type Project,
  type Task,
  type Workspace
} from '../../api';

const noteTypes: Array<{ value: NoteType; label: string }> = [
  { value: 'geral', label: 'Geral' },
  { value: 'pessoas', label: 'Pessoas' },
  { value: 'conteudo', label: 'Conteúdo' },
  { value: 'produto', label: 'Produto' },
  { value: 'referencia', label: 'Referência' },
  { value: 'inbox', label: 'Inbox' }
];

export function NoteDetailsPanel({
  note,
  onChange,
  onClose
}: {
  note: Note;
  onChange(patch: Partial<Note>): void;
  onClose(): void;
}) {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    void Promise.allSettled([
      api.getNoteFolders(),
      api.getWorkspaces(),
      api.getProjects(),
      api.getTasks()
    ]).then(([folderResult, workspaceResult, projectResult, taskResult]) => {
      if (folderResult.status === 'fulfilled') setFolders(folderResult.value);
      if (workspaceResult.status === 'fulfilled') setWorkspaces(workspaceResult.value);
      if (projectResult.status === 'fulfilled') setProjects(projectResult.value);
      if (taskResult.status === 'fulfilled') setTasks(taskResult.value);
    });
  }, []);

  return (
    <aside className="note-side-panel" aria-label="Detalhes da nota">
      <header>
        <div>
          <span>Contexto</span>
          <h2>Detalhes da nota</h2>
        </div>
        <button type="button" aria-label="Fechar detalhes" onClick={onClose}>
          <X size={17} />
        </button>
      </header>

      <label>
        Tipo
        <select
          value={note.type}
          onChange={(event) => onChange({ type: event.currentTarget.value as NoteType })}
        >
          {noteTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </label>

      <label>
        Pasta
        <select
          value={note.folderId ?? ''}
          onChange={(event) => onChange({ folderId: event.currentTarget.value || null })}
        >
          <option value="">Sem pasta</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </label>

      <label>
        Tags
        <input
          value={note.tags.join(', ')}
          placeholder="vendas, reunião"
          onChange={(event) =>
            onChange({
              tags: event.currentTarget.value
                .split(',')
                .map((tag) => tag.trim().toLowerCase())
                .filter(Boolean)
            })
          }
        />
      </label>

      <div className="note-side-panel-divider" />

      <label>
        Frente <small>opcional</small>
        <select
          value={note.workspaceId ?? ''}
          onChange={(event) => onChange({ workspaceId: event.currentTarget.value || null })}
        >
          <option value="">Nenhuma</option>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </label>

      <label>
        Projeto <small>opcional</small>
        <select
          value={note.projectId ?? ''}
          onChange={(event) => onChange({ projectId: event.currentTarget.value || null })}
        >
          <option value="">Nenhum</option>
          {projects
            .filter((project) => !note.workspaceId || project.workspaceId === note.workspaceId)
            .map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
      </label>

      <label>
        Tarefa <small>opcional</small>
        <select
          value={note.taskId ?? ''}
          onChange={(event) => onChange({ taskId: event.currentTarget.value || null })}
        >
          <option value="">Nenhuma</option>
          {tasks
            .filter((task) => !note.projectId || task.projectId === note.projectId)
            .map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
      </label>
    </aside>
  );
}
