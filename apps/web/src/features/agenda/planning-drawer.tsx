import { useMemo, useState } from 'react';
import { CheckSquare2, ChevronUp, Inbox, Search, X } from 'lucide-react';

import type { AgendaWeek } from '../../api';
import { Button, IconButton } from '../../components/ui';
import type { PlannerSource } from './types';

type Props = {
  sources: AgendaWeek['unscheduled'];
  onSchedule(source: PlannerSource, time: string): void | Promise<void>;
};

type DrawerHeight = 'peek' | 'half' | 'full';

export function PlanningDrawer({ sources, onSchedule }: Props) {
  const [height, setHeight] = useState<DrawerHeight>('peek');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<(PlannerSource & { title: string }) | null>(null);
  const [time, setTime] = useState('09:00');
  const normalized = query.trim().toLocaleLowerCase('pt-BR');

  const items = useMemo(
    () => [
      ...sources.inbox.map((item) => ({ kind: 'inbox' as const, sourceId: item.id, title: item.title, detail: '15 min' })),
      ...sources.tasks.map((item) => ({ kind: 'task' as const, sourceId: item.id, title: item.title, detail: `${item.remainingMinutes} min restantes` }))
    ].filter((item) => !normalized || item.title.toLocaleLowerCase('pt-BR').includes(normalized)),
    [normalized, sources]
  );

  function expand() {
    setHeight((current) => current === 'peek' ? 'half' : 'full');
  }

  return (
    <aside className="agenda-planning-drawer" data-height={height} aria-label="Itens para planejar">
      <IconButton type="button" className="agenda-drawer-handle" onClick={expand} label="Expandir itens para planejar" icon={<ChevronUp />} />
      <header>
        <div>
          <span className="agenda-eyebrow">Inbox + tarefas</span>
          <strong>Para planejar</strong>
        </div>
        {height !== 'peek' ? <IconButton type="button" label="Recolher itens para planejar" onClick={() => setHeight('peek')} icon={<X />} /> : null}
      </header>
      {height !== 'peek' ? (
        <>
          <label className="agenda-drawer-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Buscar itens</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
          </label>
          <div className="agenda-drawer-items">
            {items.map((item) => {
              const Icon = item.kind === 'task' ? CheckSquare2 : Inbox;
              return (
                <Button
                  type="button"
                  variant="tertiary"
                  key={`${item.kind}:${item.sourceId}`}
                  aria-label={`Agendar ${item.title}`}
                  onClick={() => setSelected(item)}
                >
                  <Icon aria-hidden="true" />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                </Button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="agenda-drawer-peek-items">
          {items.slice(0, 3).map((item) => (
            <Button type="button" variant="secondary" size="sm" key={`${item.kind}:${item.sourceId}`} aria-label={`Agendar ${item.title}`} onClick={() => { setSelected(item); setHeight('half'); }}>
              {item.title}
            </Button>
          ))}
        </div>
      )}
      {selected ? (
        <div className="agenda-time-picker" role="group" aria-label={`Horário de ${selected.title}`}>
          <div><strong>{selected.title}</strong><IconButton type="button" label="Cancelar horário" onClick={() => setSelected(null)} icon={<X />} /></div>
          <label>
            Horário
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <Button type="button" onClick={() => { void onSchedule(selected, time); setSelected(null); }}>Confirmar horário</Button>
        </div>
      ) : null}
    </aside>
  );
}
