import { ArrowDownToLine, CircleDot, Clock3, MoreHorizontal, Orbit } from 'lucide-react';

import type { TaskMovement } from './types';
import { Button, IconButton, Popover } from '../../components/ui';

const options: Array<{ id: TaskMovement; label: string; icon: typeof CircleDot }> = [
  { id: 'in_progress', label: 'Mover para Em andamento', icon: CircleDot },
  { id: 'next', label: 'Mover para Próximas', icon: ArrowDownToLine },
  { id: 'waiting', label: 'Mover para Aguardando', icon: Clock3 },
  { id: 'future', label: 'Mover para Futuro', icon: Orbit }
];

export function TaskMoveMenu({ current, onMove }: { current: TaskMovement | null; onMove(movement: TaskMovement): void }) {
  return (
    <div className="task-row-menu">
      <Popover label="Mover tarefa" trigger={<IconButton type="button" label="Mover tarefa" icon={<MoreHorizontal />} />}>
        {options.map(({ id, label, icon: Icon }) => (
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            role="menuitem"
            key={id}
            disabled={current === id}
            onClick={() => {
              onMove(id);
            }}
          ><Icon aria-hidden="true" />{label}</Button>
        ))}
      </Popover>
    </div>
  );
}
