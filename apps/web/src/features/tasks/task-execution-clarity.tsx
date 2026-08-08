import { useEffect, useState } from 'react';
import { Check, Flag, Footprints } from 'lucide-react';

import type { TaskBacklogItem } from '../../api';

export function TaskExecutionClarity({ task, onUpdate }: {
  task: TaskBacklogItem;
  onUpdate(patch: { definitionOfDone?: string | null; nextStep?: string | null }): Promise<unknown>;
}) {
  const [done, setDone] = useState(task.definitionOfDone ?? '');
  const [next, setNext] = useState(task.nextStep ?? '');
  const [saving, setSaving] = useState<'done' | 'next' | null>(null);
  useEffect(() => { setDone(task.definitionOfDone ?? ''); setNext(task.nextStep ?? ''); }, [task.id, task.definitionOfDone, task.nextStep]);

  async function save(field: 'done' | 'next') {
    const value = field === 'done' ? done : next;
    const original = field === 'done' ? task.definitionOfDone ?? '' : task.nextStep ?? '';
    if (value.trim() === original.trim()) return;
    setSaving(field);
    try {
      await onUpdate(field === 'done'
        ? { definitionOfDone: value.trim() || null }
        : { nextStep: value.trim() || null });
    } finally { setSaving(null); }
  }

  return (
    <section className="task-clarity" aria-labelledby="task-clarity-title">
      <h2 id="task-clarity-title"><Flag aria-hidden="true" /> Clareza de execução</h2>
      <label className="task-clarity-field">
        <span><Check aria-hidden="true" /><strong>Definição de pronto</strong><small>Qual resultado encerra este trabalho?</small></span>
        <textarea value={done} onChange={(event) => setDone(event.target.value)} onBlur={() => void save('done')} placeholder="Quando saberei que realmente terminou?" rows={2} maxLength={280} />
        {saving === 'done' ? <em>Salvando…</em> : null}
      </label>
      <label className="task-clarity-field primary">
        <span><Footprints aria-hidden="true" /><strong>Próximo passo</strong><small>A ação concreta que destrava movimento agora.</small></span>
        <textarea value={next} onChange={(event) => setNext(event.target.value)} onBlur={() => void save('next')} placeholder="Ex.: enviar rascunho para revisão" rows={2} maxLength={500} />
        {saving === 'next' ? <em>Salvando…</em> : null}
      </label>
    </section>
  );
}
