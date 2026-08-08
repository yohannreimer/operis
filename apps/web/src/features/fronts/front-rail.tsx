import { AlertCircle, ChevronRight, Layers3, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { FrontOverviewListItem } from '../projects/types';
import { Button } from '../../components/ui';

export function FrontRail({
  fronts,
  selectedId,
  onSelect,
  onCreate
}: {
  fronts: FrontOverviewListItem[];
  selectedId?: string;
  onSelect: (frontId: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="front-rail" aria-label="Frentes">
      <header className="front-rail__header">
        <div>
          <span>EXECUÇÃO</span>
          <h2>Frentes</h2>
        </div>
        <Button type="button" variant="secondary" size="sm" className="front-new-button" leadingIcon={<Plus />} onClick={onCreate}>Nova Frente</Button>
      </header>
      <nav>
        {fronts.map((front) => {
          const selected = front.id === selectedId;
          return (
            <Link
              key={front.id}
              to={`/frentes/${front.id}`}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(front.id)}
            >
              <span className="front-rail__marker" style={{ backgroundColor: front.color ?? '#777' }} />
              <span className="front-rail__copy">
                <strong>{front.name}</strong>
                <small>{front.activeProjects} {front.activeProjects === 1 ? 'projeto ativo' : 'projetos ativos'}</small>
              </span>
              {front.attention ? <AlertCircle className={`front-health-${front.health}`} size={16} /> : <ChevronRight size={15} />}
            </Link>
          );
        })}
      </nav>
      {!fronts.length && (
        <div className="front-rail__empty">
          <Layers3 size={22} />
          <p>Crie uma Frente para agrupar Projetos e responsabilidades.</p>
        </div>
      )}
    </aside>
  );
}
