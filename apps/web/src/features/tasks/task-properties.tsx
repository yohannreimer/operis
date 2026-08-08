import { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

import type { Project, TaskBacklogItem, Workspace } from '../../api';
import type { TaskUpdatePatch } from './use-task-backlog';

export function TaskProperties({ task, workspaces, projects, onUpdate }: {
  task: TaskBacklogItem;
  workspaces: Workspace[];
  projects: Project[];
  onUpdate(patch: TaskUpdatePatch): Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const compatible = projects.filter((project) => project.workspaceId === task.workspaceId);
  return (
    <section className="task-detail-section task-properties">
      <button type="button" className="task-section-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span><SlidersHorizontal aria-hidden="true" /><strong>Propriedades</strong></span><ChevronDown aria-hidden="true" /></button>
      {open ? <div className="task-properties-grid">
        <label><span>Frente</span><select value={task.workspaceId} onChange={(e) => void onUpdate({ workspaceId: e.target.value, projectId: null })}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Projeto</span><select value={task.projectId ?? ''} onChange={(e) => void onUpdate({ projectId: e.target.value || null })}><option value="">Sem projeto</option>{compatible.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label><span>Prazo</span><input type="date" value={task.dueDate?.slice(0, 10) ?? ''} onChange={(e) => void onUpdate({ dueDate: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null })} /></label>
        <label><span>Prioridade</span><select value={task.priority} onChange={(e) => void onUpdate({ priority: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Estimativa</span><input key={`${task.id}:${task.estimatedMinutes}`} type="number" min="5" step="5" defaultValue={task.estimatedMinutes ?? ''} onBlur={(e) => void onUpdate({ estimatedMinutes: e.target.value ? Number(e.target.value) : null })} placeholder="min" /></label>
        <label><span>Energia</span><select value={task.energyLevel ?? 'media'} onChange={(e) => void onUpdate({ energyLevel: e.target.value as TaskBacklogItem['energyLevel'] })}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
        <label><span>Natureza</span><select value={task.executionKind ?? 'operacao'} onChange={(e) => void onUpdate({ executionKind: e.target.value as TaskBacklogItem['executionKind'] })}><option value="construcao">Construção</option><option value="otimizacao">Otimização</option><option value="operacao">Operação</option><option value="suporte">Suporte</option></select></label>
        <label><span>Horizonte</span><select value={task.horizon ?? 'active'} onChange={(e) => void onUpdate({ horizon: e.target.value as TaskBacklogItem['horizon'] })}><option value="active">Ativo</option><option value="future">Futuro</option></select></label>
      </div> : null}
    </section>
  );
}
