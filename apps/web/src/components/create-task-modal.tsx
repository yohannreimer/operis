import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  Project,
  Task,
  TaskEnergy,
  TaskExecutionKind,
  TaskHorizon,
  TaskType,
  Workspace,
} from '../api';
import { Modal } from './modal';
import { Button, Field } from './ui';

type Props = {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  prefill?: { title?: string; workspaceId?: string };
  onCreated?: (task: Task) => void;
};

const TASK_TYPE_PRIORITY: Record<TaskType, number> = { a: 5, b: 3, c: 1 };

export function CreateTaskModal({ open, onClose, workspaces, prefill, onCreated }: Props) {
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [dod, setDod] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [estimatedMinutes, setEstimatedMinutes] = useState('60');
  const [taskType, setTaskType] = useState<TaskType>('b');
  const [energyLevel, setEnergyLevel] = useState<TaskEnergy>('media');
  const [executionKind, setExecutionKind] = useState<TaskExecutionKind>('operacao');
  const [horizon, setHorizon] = useState<TaskHorizon>('active');
  const [priority, setPriority] = useState(3);

  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? '');
      setWorkspaceId(prefill?.workspaceId ?? '');
      setProjectId('');
      setDod('');
      setEstimatedMinutes('60');
      setTaskType('b');
      setEnergyLevel('media');
      setExecutionKind('operacao');
      setHorizon('active');
      setPriority(3);
    }
  }, [open, prefill?.title, prefill?.workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      setProjectId('');
      return;
    }
    api.getProjects({ workspaceId }).then(setProjects).catch(() => {});
  }, [workspaceId]);

  const filteredProjects = useMemo(
    () => projects.filter((p) => p.workspaceId === workspaceId && p.status === 'ativo'),
    [projects, workspaceId]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId) {
      toast.error('Selecione uma frente.');
      return;
    }
    setBusy(true);
    try {
      const task = await api.createTask({
        workspaceId,
        projectId: projectId || null,
        title: title.trim(),
        definitionOfDone: dod.trim() || title.trim(),
        taskType,
        energyLevel,
        executionKind,
        horizon,
        priority,
        estimatedMinutes: Number(estimatedMinutes) || 60,
      });
      toast.success('Tarefa criada.');
      onCreated?.(task);
      onClose();
    } catch {
      toast.error('Erro ao criar tarefa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova tarefa" subtitle="Criar tarefa estruturada" size="lg">
      <form className="minimal-form create-task-modal-form" onSubmit={handleSubmit}>
        <Field label="Título" htmlFor="create-task-title">
          <input
            id="create-task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Verbo + objeto (ex: Fechar proposta comercial)"
            required
            autoFocus
          />
        </Field>

        <Field label="Definição de pronto" htmlFor="create-task-dod" hint="Opcional">
          <input
            id="create-task-dod"
            value={dod}
            onChange={(e) => setDod(e.target.value)}
            placeholder="Definição de pronto (opcional)"
          />
        </Field>

        <div className="row-2">
          <Field label="Frente" htmlFor="create-task-workspace">
            <select
              id="create-task-workspace"
              value={workspaceId}
              onChange={(e) => { setWorkspaceId(e.target.value); setProjectId(''); }}
              required
            >
              <option value="">Selecione uma frente</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Projeto" htmlFor="create-task-project">
            <select id="create-task-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Sem projeto</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tempo estimado (min)" htmlFor="create-task-duration">
          <input
            id="create-task-duration"
            type="number"
            min={1}
            step={1}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            required
          />
        </Field>

        <section className="compose-choice-group">
          <div className="compose-choice-label">Tipo (impacto)</div>
          <div className="compose-option-grid">
            {(
              [
                { value: 'a' as TaskType, title: 'Tipo A', subtitle: 'Alto impacto' },
                { value: 'b' as TaskType, title: 'Tipo B', subtitle: 'Importante' },
                { value: 'c' as TaskType, title: 'Tipo C', subtitle: 'Conveniência' },
              ]
            ).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="secondary"
                aria-pressed={taskType === opt.value}
                className={
                  taskType === opt.value
                    ? `compose-option-card active tone-${opt.value}`
                    : `compose-option-card tone-${opt.value}`
                }
                onClick={() => {
                  setTaskType(opt.value);
                  setPriority(TASK_TYPE_PRIORITY[opt.value]);
                }}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </Button>
            ))}
          </div>
        </section>

        <section className="compose-choice-group">
          <div className="compose-choice-label">Energia necessária</div>
          <div className="compose-option-grid">
            {(
              [
                { value: 'alta' as TaskEnergy, title: 'Alta energia', subtitle: 'Foco intenso' },
                { value: 'media' as TaskEnergy, title: 'Média energia', subtitle: 'Fluxo padrão' },
                { value: 'baixa' as TaskEnergy, title: 'Baixa energia', subtitle: 'Leve/rápida' },
              ]
            ).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="secondary"
                aria-pressed={energyLevel === opt.value}
                className={
                  energyLevel === opt.value
                    ? `compose-option-card active tone-energy-${opt.value}`
                    : `compose-option-card tone-energy-${opt.value}`
                }
                onClick={() => setEnergyLevel(opt.value)}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </Button>
            ))}
          </div>
        </section>

        <section className="compose-choice-group">
          <div className="compose-choice-label">Natureza</div>
          <div className="compose-option-grid two">
            {(
              [
                { value: 'construcao' as TaskExecutionKind, title: 'Construção', subtitle: 'Cria algo novo' },
                { value: 'otimizacao' as TaskExecutionKind, title: 'Otimização', subtitle: 'Melhora o que existe' },
                { value: 'operacao' as TaskExecutionKind, title: 'Operação', subtitle: 'Mantém funcionando' },
                { value: 'suporte' as TaskExecutionKind, title: 'Suporte', subtitle: 'Apoia outros' },
              ]
            ).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="secondary"
                aria-pressed={executionKind === opt.value}
                className={
                  executionKind === opt.value
                    ? 'compose-option-card active'
                    : 'compose-option-card'
                }
                onClick={() => setExecutionKind(opt.value)}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </Button>
            ))}
          </div>
        </section>

        <section className="compose-choice-group">
          <div className="compose-choice-label">Horizonte</div>
          <div className="compose-option-grid two">
            {(
              [
                { value: 'active' as TaskHorizon, title: 'Ativo', subtitle: 'Executar agora' },
                { value: 'future' as TaskHorizon, title: 'Futuro', subtitle: 'Backlog futuro' },
              ]
            ).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant="secondary"
                aria-pressed={horizon === opt.value}
                className={horizon === opt.value ? 'compose-option-card active' : 'compose-option-card'}
                onClick={() => setHorizon(opt.value)}
              >
                <strong>{opt.title}</strong>
                <small>{opt.subtitle}</small>
              </Button>
            ))}
          </div>
        </section>

        <div className="compose-footer">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>Criar tarefa</Button>
        </div>
      </form>
    </Modal>
  );
}
