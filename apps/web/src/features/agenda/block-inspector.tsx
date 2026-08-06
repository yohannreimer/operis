import { useMemo, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';

import { api, type CommitmentOccurrence } from '../../api';
import type { PlannerBlockModel } from './types';

type EditableBlock = PlannerBlockModel | CommitmentOccurrence;

type Values = {
  kind: 'commitment' | 'task' | 'inbox';
  title: string;
  date: string;
  startTime: string;
  durationMin: number;
  description: string;
  workspaceId: string;
  recurrenceEnd: string;
  recurring: boolean;
};

type Props = {
  mode: 'create' | 'edit';
  block?: EditableBlock;
  defaultDate?: string;
  defaultTime?: string;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  onSave?(values: Values, scope?: 'occurrence' | 'series'): void | Promise<void>;
};

function rawTime(value?: string | null) {
  return value?.match(/(?:T|^)(\d{2}:\d{2})/)?.[1] ?? '';
}

function blockDate(block?: EditableBlock) {
  return block?.date ?? '';
}

function blockTitle(block?: EditableBlock) {
  return block?.title ?? '';
}

function blockDuration(block?: EditableBlock) {
  if (!block) return 30;
  if ('durationMin' in block) return block.durationMin ?? 30;
  return block.plannedMinutes;
}

function isRecurring(block?: EditableBlock) {
  return Boolean(block && 'recurring' in block && block.recurring);
}

function commitmentId(block?: EditableBlock) {
  if (!block || !('commitmentId' in block)) return null;
  return block.commitmentId;
}

export function BlockInspector({
  mode,
  block,
  defaultDate = new Date().toISOString().slice(0, 10),
  defaultTime = '09:00',
  open = true,
  onOpenChange,
  onSave
}: Props) {
  const initial = useMemo<Values>(() => {
    const kind = block
      ? 'commitmentId' in block
        ? 'commitment'
        : block.kind
      : 'commitment';
    return {
      kind,
      title: blockTitle(block),
      date: blockDate(block) || defaultDate,
      startTime: rawTime(block?.startTime) || defaultTime,
      durationMin: blockDuration(block),
      description: '',
      workspaceId: block?.workspaceId ?? '',
      recurrenceEnd: '',
      recurring: isRecurring(block)
    };
  }, [block, defaultDate, defaultTime]);
  const [values, setValues] = useState(initial);
  const [advanced, setAdvanced] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function change<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function persist(scope?: 'occurrence' | 'series') {
    setSaving(true);
    try {
      if (onSave) {
        await onSave(values, scope);
      } else if (values.kind === 'commitment') {
        const id = commitmentId(block);
        if (id && scope === 'occurrence') {
          await api.createCommitmentException(id, {
            date: values.date,
            action: 'rescheduled',
            newDate: values.date,
            newTime: values.startTime
          });
        } else if (id) {
          await api.updateCommitment(id, {
            title: values.title,
            startTime: values.startTime,
            durationMin: values.durationMin,
            recurrenceEnd: values.recurrenceEnd || null
          });
        } else {
          await api.createCommitment({
            title: values.title,
            date: values.recurring ? null : values.date,
            startTime: values.startTime,
            durationMin: values.durationMin,
            recurrenceEnd: values.recurrenceEnd || null
          });
        }
      }
      toast.success(mode === 'create' ? 'Bloco criado.' : 'Alterações salvas.');
      setScopeOpen(false);
      onOpenChange?.(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isRecurring(block)) {
      setScopeOpen(true);
      return;
    }
    void persist();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="agenda-inspector-overlay" />
        <Dialog.Content className="agenda-inspector" aria-describedby={undefined}>
          <header className="agenda-inspector-header">
            <Dialog.Title>{mode === 'create' ? 'Novo bloco' : 'Editar bloco'}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Fechar inspetor"><X aria-hidden="true" /></button>
            </Dialog.Close>
          </header>
          <form className="agenda-inspector-form" onSubmit={submit}>
            <label>
              Tipo
              <select value={values.kind} onChange={(event) => change('kind', event.target.value as Values['kind'])}>
                <option value="commitment">Compromisso</option>
                <option value="task">Tarefa</option>
                <option value="inbox">Item rápido</option>
              </select>
            </label>
            <label>
              Título
              <input required value={values.title} onChange={(event) => change('title', event.target.value)} />
            </label>
            <div className="agenda-inspector-row">
              <label>
                Data
                <input type="date" value={values.date} onChange={(event) => change('date', event.target.value)} />
              </label>
              <label>
                Início
                <input type="time" value={values.startTime} onChange={(event) => change('startTime', event.target.value)} />
              </label>
              <label>
                Duração
                <select value={values.durationMin} onChange={(event) => change('durationMin', Number(event.target.value))}>
                  {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="agenda-more-options" onClick={() => setAdvanced((value) => !value)}>
              {advanced ? 'Menos opções' : 'Mais opções'}
              <ChevronDown aria-hidden="true" data-open={advanced || undefined} />
            </button>
            {advanced ? (
              <div className="agenda-advanced-fields">
                <label>
                  Descrição
                  <textarea value={values.description} onChange={(event) => change('description', event.target.value)} />
                </label>
                <label>
                  Frente
                  <input value={values.workspaceId} onChange={(event) => change('workspaceId', event.target.value)} placeholder="Sem frente" />
                </label>
                <label className="agenda-checkbox-row">
                  <input type="checkbox" checked={values.recurring} onChange={(event) => change('recurring', event.target.checked)} />
                  Repetir como rotina
                </label>
                {values.recurring ? (
                  <label>
                    Fim da recorrência
                    <input type="date" value={values.recurrenceEnd} onChange={(event) => change('recurrenceEnd', event.target.value)} />
                  </label>
                ) : null}
              </div>
            ) : null}
            <footer className="agenda-inspector-footer">
              <Dialog.Close asChild><button type="button">Cancelar</button></Dialog.Close>
              <button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </footer>
          </form>

          <Dialog.Root open={scopeOpen} onOpenChange={setScopeOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="agenda-scope-overlay" />
              <Dialog.Content className="agenda-scope-dialog" aria-describedby={undefined}>
                <Dialog.Title>Aplicar alteração</Dialog.Title>
                <p>Esta rotina se repete. Onde você quer aplicar a mudança?</p>
                <div>
                  <button type="button" onClick={() => void persist('occurrence')}>Somente esta ocorrência</button>
                  <button type="button" onClick={() => void persist('series')}>Toda a série</button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
