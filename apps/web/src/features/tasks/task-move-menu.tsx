import { ArrowDownToLine, CircleDot, Clock3, MoreHorizontal, Orbit } from 'lucide-react';

import type { TaskMovement } from './types';

const options: Array<{ id: TaskMovement; label: string; icon: typeof CircleDot }> = [
  { id: 'in_progress', label: 'Mover para Em andamento', icon: CircleDot },
  { id: 'next', label: 'Mover para Próximas', icon: ArrowDownToLine },
  { id: 'waiting', label: 'Mover para Aguardando', icon: Clock3 },
  { id: 'future', label: 'Mover para Futuro', icon: Orbit }
];

export function TaskMoveMenu({ current, onMove }: { current: TaskMovement | null; onMove(movement: TaskMovement): void }) {
  return (
    <details className="task-row-menu">
      <summary aria-label="Mover tarefa"><MoreHorizontal aria-hidden="true" /></summary>
      <div role="menu">
        {options.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            role="menuitem"
            key={id}
            disabled={current === id}
            onClick={(event) => {
              onMove(id);
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
          ><Icon aria-hidden="true" />{label}</button>
        ))}
      </div>
    </details>
  );
}
