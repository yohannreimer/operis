import { Plus, Search } from 'lucide-react';

import type { Project, Workspace } from '../../api';
import { Button } from '../../components/ui';
import { TaskFiltersPopover } from './task-filters-popover';
import type { TaskActionView, TaskBacklogFilters } from './types';

const views: Array<{ id: TaskActionView; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'blocked', label: 'Bloqueadas' },
  { id: 'overdue', label: 'Atrasadas' },
  { id: 'no_next_step', label: 'Sem próximo passo' }
];

type Props = {
  filters: TaskBacklogFilters;
  workspaces: Workspace[];
  projects: Project[];
  counts: Record<TaskActionView, number>;
  onFiltersChange(filters: TaskBacklogFilters): void;
  onNewTask(): void;
};

export function TaskBacklogToolbar({ filters, workspaces, projects, counts, onFiltersChange, onNewTask }: Props) {
  return (
    <header className="task-backlog-toolbar">
      <div className="task-backlog-heading-row">
        <h1>Tarefas</h1>
        <label className="task-backlog-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar tarefas</span>
          <input value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} placeholder="Buscar" />
          <kbd>/</kbd>
        </label>
        <TaskFiltersPopover filters={filters} workspaces={workspaces} projects={projects} onChange={onFiltersChange} />
        <Button type="button" variant="secondary" className="task-new-button" leadingIcon={<Plus />} onClick={onNewTask}>Nova tarefa</Button>
      </div>
      <nav className="task-action-views" aria-label="Visões de tarefas">
        {views.map((view) => (
          <button
            type="button"
            key={view.id}
            className={filters.view === view.id ? 'active' : ''}
            aria-pressed={filters.view === view.id}
            onClick={() => onFiltersChange({ ...filters, view: view.id })}
          >
            {view.label}<span>{counts[view.id]}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
