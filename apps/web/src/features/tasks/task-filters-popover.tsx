import { SlidersHorizontal, X } from 'lucide-react';

import type { Project, Workspace } from '../../api';
import { Button, Popover } from '../../components/ui';
import type { TaskBacklogFilters } from './types';

type Props = {
  filters: TaskBacklogFilters;
  workspaces: Workspace[];
  projects: Project[];
  onChange(filters: TaskBacklogFilters): void;
};

export function TaskFiltersPopover({ filters, workspaces, projects, onChange }: Props) {
  const activeCount = [filters.workspaceId, filters.projectId, filters.priority, filters.horizon]
    .filter(Boolean).length + (filters.due !== 'all' ? 1 : 0) + (filters.today !== null ? 1 : 0) + (filters.completion !== 'open' ? 1 : 0);
  const set = <K extends keyof TaskBacklogFilters>(key: K, value: TaskBacklogFilters[K]) =>
    onChange({ ...filters, [key]: value });
  return (
    <Popover
      label="Filtros de tarefas"
      trigger={<Button type="button" variant="secondary" className="task-filters-trigger" leadingIcon={<SlidersHorizontal />}>Filtros {activeCount ? <span>{activeCount}</span> : null}</Button>}
    >
      <div className="task-filters-panel">
        <header><strong>Filtrar backlog</strong><span>{activeCount} ativos</span></header>
        <label><span>Frente</span><select value={filters.workspaceId ?? ''} onChange={(e) => set('workspaceId', e.target.value || null)}><option value="">Todas</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Projeto</span><select value={filters.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}><option value="">Todos</option>{projects.filter((item) => !filters.workspaceId || item.workspaceId === filters.workspaceId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <div className="task-filter-pair">
          <label><span>Prioridade</span><select value={filters.priority ?? ''} onChange={(e) => set('priority', e.target.value ? Number(e.target.value) : null)}><option value="">Todas</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Prazo</span><select value={filters.due} onChange={(e) => set('due', e.target.value as TaskBacklogFilters['due'])}><option value="all">Qualquer</option><option value="overdue">Atrasadas</option><option value="today">Hoje</option><option value="week">Próximos 7 dias</option><option value="none">Sem prazo</option></select></label>
        </div>
        <div className="task-filter-pair">
          <label><span>Planejamento</span><select value={filters.today === null ? '' : filters.today ? '1' : '0'} onChange={(e) => set('today', e.target.value === '' ? null : e.target.value === '1')}><option value="">Todos</option><option value="1">Em Hoje</option><option value="0">Fora de Hoje</option></select></label>
          <label><span>Arquivo</span><select value={filters.completion} onChange={(e) => set('completion', e.target.value as TaskBacklogFilters['completion'])}><option value="open">Abertas</option><option value="done">Concluídas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select></label>
        </div>
        {activeCount ? <Button type="button" variant="tertiary" size="sm" className="task-clear-filters" leadingIcon={<X />} onClick={() => onChange({ ...filters, workspaceId: null, projectId: null, priority: null, due: 'all', today: null, horizon: null, completion: 'open' })}>Limpar filtros</Button> : null}
      </div>
    </Popover>
  );
}
