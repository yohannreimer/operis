import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CheckSquare2, GripVertical, Inbox } from 'lucide-react';

import type { AgendaWeek } from '../../api';
import { PlannerToolbar } from './planner-toolbar';

type Sources = AgendaWeek['unscheduled'];

function DraggableSource({
  id,
  kind,
  title,
  detail
}: {
  id: string;
  kind: 'task' | 'inbox';
  title: string;
  detail: string;
}) {
  const draggable = useDraggable({
    id: `source:${kind}:${id}`,
    data: { type: 'source', kind, sourceId: id, title }
  });
  const Icon = kind === 'task' ? CheckSquare2 : Inbox;

  return (
    <button
      ref={draggable.setNodeRef}
      type="button"
      className="agenda-source-row"
      aria-label={`Planejar ${title}`}
      style={{ opacity: draggable.isDragging ? 0.45 : 1 }}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      <Icon size={15} aria-hidden="true" />
      <span className="agenda-source-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <GripVertical size={14} aria-hidden="true" />
    </button>
  );
}

export function UnscheduledRail({ sources }: { sources: Sources }) {
  const [query, setQuery] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const normalized = query.trim().toLocaleLowerCase('pt-BR');

  const workspaces = useMemo(() => {
    const entries = new Map<string, string>();
    sources.tasks.forEach((task) => {
      if (task.workspaceId && task.workspaceName) entries.set(task.workspaceId, task.workspaceName);
    });
    return Array.from(entries, ([id, name]) => ({ id, name }));
  }, [sources.tasks]);

  const tasks = sources.tasks.filter(
    (task) =>
      (!normalized || task.title.toLocaleLowerCase('pt-BR').includes(normalized)) &&
      (!workspace || task.workspaceId === workspace)
  );
  const inbox = sources.inbox.filter(
    (item) => !normalized || item.title.toLocaleLowerCase('pt-BR').includes(normalized)
  );

  return (
    <aside
      className="agenda-unscheduled-rail"
      data-collapsed={collapsed || undefined}
      aria-label="Para planejar"
    >
      <PlannerToolbar
        query={query}
        onQueryChange={setQuery}
        workspace={workspace}
        workspaces={workspaces}
        onWorkspaceChange={setWorkspace}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
      {!collapsed ? (
        <div className="agenda-source-groups">
          <section aria-labelledby="agenda-tasks-heading">
            <h2 id="agenda-tasks-heading">Tarefas</h2>
            {tasks.map((task) => (
              <DraggableSource
                key={task.id}
                id={task.id}
                kind="task"
                title={task.title}
                detail={`${task.plannedMinutes}/${task.estimatedMinutes} min planejados`}
              />
            ))}
            {!tasks.length ? <p className="agenda-source-empty">Nenhuma tarefa.</p> : null}
          </section>
          <section aria-labelledby="agenda-inbox-heading">
            <h2 id="agenda-inbox-heading">Inbox</h2>
            {inbox.map((item) => (
              <DraggableSource
                key={item.id}
                id={item.id}
                kind="inbox"
                title={item.title}
                detail="15 min ao planejar"
              />
            ))}
            {!inbox.length ? <p className="agenda-source-empty">Inbox em dia.</p> : null}
          </section>
        </div>
      ) : null}
    </aside>
  );
}
