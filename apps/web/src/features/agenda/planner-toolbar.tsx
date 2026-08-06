import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

type Props = {
  query: string;
  onQueryChange(value: string): void;
  workspace: string;
  workspaces: Array<{ id: string; name: string }>;
  onWorkspaceChange(value: string): void;
  collapsed: boolean;
  onToggleCollapsed(): void;
};

export function PlannerToolbar({
  query,
  onQueryChange,
  workspace,
  workspaces,
  onWorkspaceChange,
  collapsed,
  onToggleCollapsed
}: Props) {
  return (
    <div className="agenda-rail-toolbar">
      {!collapsed ? (
        <>
          <label className="agenda-rail-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Buscar itens para planejar</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Buscar"
            />
          </label>
          <label className="agenda-rail-filter">
            <span className="sr-only">Filtrar por frente</span>
            <select value={workspace} onChange={(event) => onWorkspaceChange(event.target.value)}>
              <option value="">Todas as frentes</option>
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <button
        type="button"
        className="agenda-rail-toggle"
        aria-label={collapsed ? 'Expandir itens para planejar' : 'Recolher itens para planejar'}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </button>
    </div>
  );
}
