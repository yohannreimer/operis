import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { api, type MethodologyData, type ProjectMethodology, type Workspace } from '../../api';
import {
  getEngineDefinition,
  ProjectMethodologyPicker,
  type ProjectWizardValues
} from './engine-registry';
import './projects.css';

const DRAFT_KEY = 'operis:project-wizard-draft';

type StoredDraft = {
  creationKey: string;
  step: 1 | 2 | 3;
  values: ProjectWizardValues;
};

function createKey() {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readDraft(): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    return parsed.creationKey && parsed.values ? parsed : null;
  } catch {
    return null;
  }
}

function initialValues(workspaceId = ''): ProjectWizardValues {
  return {
    methodology: null,
    title: '',
    workspaceId,
    objective: '',
    timeHorizonEnd: '',
    methodologyData: {},
    nextMove: '',
    nextMoveDestination: 'project'
  };
}

function initialMethodologyData(methodology: ProjectMethodology): MethodologyData {
  const canonical = getEngineDefinition(methodology).canonicalMethodology;
  if (canonical === 'entrega' || canonical === 'autoridade') return { milestones: [], blockers: [] };
  if (canonical === 'pipeline' || canonical === 'captacao' || canonical === 'sistema_receita') return { stages: [], deals: [] };
  if (canonical === 'exploracao' || canonical === 'mentoria') return { discoveries: [], blockers: [] };
  if (canonical === 'campanha' || canonical === 'runway') return { dailyTasks: [], blockers: [] };
  if (canonical === 'decisao' || canonical === 'cenario') return { options: [], criteria: [], blockers: [] };
  if (canonical === 'okr') return { krs: [], blockers: [] };
  if (canonical === 'funil') return { funilStages: [], blockers: [] };
  return { blockers: [] };
}

export function ProjectWizard({
  open,
  workspaces,
  onClose,
  onCreated
}: {
  open: boolean;
  workspaces: Workspace[];
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}) {
  const navigate = useNavigate();
  const stored = useRef(readDraft()).current;
  const [creationKey] = useState(() => stored?.creationKey ?? createKey());
  const [step, setStep] = useState<1 | 2 | 3>(() => stored?.step ?? 1);
  const [values, setValues] = useState<ProjectWizardValues>(() =>
    stored?.values ?? initialValues(workspaces[0]?.id)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');

  useEffect(() => {
    if (!values.workspaceId && workspaces[0]?.id) {
      setValues((current) => ({ ...current, workspaceId: workspaces[0].id }));
    }
  }, [values.workspaceId, workspaces]);

  useEffect(() => {
    if (!open) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ creationKey, step, values } satisfies StoredDraft));
  }, [creationKey, open, step, values]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open, submitting]);

  if (!open) return null;

  function selectMethodology(methodology: ProjectMethodology) {
    setValues((current) => ({
      ...current,
      methodology,
      methodologyData: initialMethodologyData(methodology)
    }));
    setErrors({});
  }

  function continueWizard() {
    if (step === 1) {
      if (!values.methodology) {
        setErrors({ methodology: 'Escolha o tipo de avanço que este Projeto precisa.' });
        return;
      }
      setErrors({});
      setStep(2);
      return;
    }
    if (step === 2) {
      const nextErrors: Record<string, string> = {};
      if (values.title.trim().length < 2) nextErrors.title = 'Dê um nome ao Projeto.';
      if (!values.workspaceId) nextErrors.workspaceId = 'Escolha uma Frente.';
      if (values.methodology) Object.assign(nextErrors, getEngineDefinition(values.methodology).validateSetup(values));
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors);
        return;
      }
      setErrors({});
      setStep(3);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!values.methodology) return;
    if (values.nextMove.trim().length < 2) {
      setErrors({ nextMove: 'Defina o primeiro movimento executável.' });
      return;
    }
    setSubmitting(true);
    setRequestError('');
    try {
      const result = await api.createExecutionProject({
        workspaceId: values.workspaceId,
        methodology: values.methodology,
        title: values.title.trim(),
        objective: values.objective.trim(),
        timeHorizonEnd: values.timeHorizonEnd || null,
        methodologyData: values.methodologyData,
        nextMove: values.nextMove.trim(),
        nextMoveDestination: values.nextMoveDestination
      }, creationKey);
      if (!result.project?.id || !result.activeMove?.id) {
        throw new Error('O Projeto foi recebido sem o primeiro movimento. Tente novamente.');
      }
      sessionStorage.removeItem(DRAFT_KEY);
      onCreated?.(result.project.id);
      navigate(`/projetos/${result.project.id}`);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Não foi possível criar o Projeto.');
    } finally {
      setSubmitting(false);
    }
  }

  const definition = values.methodology ? getEngineDefinition(values.methodology) : null;

  return (
    <div className="project-wizard-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <form className="project-wizard" role="dialog" aria-modal="true" aria-label="Criar Projeto" onSubmit={submit}>
        <header className="project-wizard__header">
          <div className="project-wizard__eyebrow">NOVO PROJETO · {step}/3</div>
          <button type="button" className="project-wizard__close" aria-label="Fechar" onClick={onClose} disabled={submitting}>
            <X size={18} />
          </button>
        </header>

        <div className="project-wizard__progress" aria-hidden="true">
          {[1, 2, 3].map((item) => <span key={item} data-active={item <= step || undefined} />)}
        </div>

        <main className="project-wizard__body">
          {step === 1 && (
            <section className="project-wizard__step">
              <div className="project-wizard__intro">
                <p>Comece pela intenção, não pela ferramenta.</p>
                <h2>O que você quer mover?</h2>
              </div>
              <ProjectMethodologyPicker value={values.methodology} onChange={selectMethodology} />
              {errors.methodology && <p className="project-field-error">{errors.methodology}</p>}
            </section>
          )}

          {step === 2 && (
            <section className="project-wizard__step project-wizard__step--narrow">
              <div className="project-wizard__intro">
                <p>{definition?.intentLabel} · {definition?.methodLabel}</p>
                <h2>Dê uma direção nítida</h2>
              </div>
              <label className="project-field">
                <span>Nome do Projeto</span>
                <input autoFocus value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} placeholder="Ex: Novo site da Prymeira" />
                {errors.title && <small>{errors.title}</small>}
              </label>
              <label className="project-field">
                <span>Frente</span>
                <select value={values.workspaceId} onChange={(event) => setValues({ ...values, workspaceId: event.target.value })}>
                  <option value="">Escolha uma Frente</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
                {errors.workspaceId && <small>{errors.workspaceId}</small>}
              </label>
              <label className="project-field">
                <span>Direção do Projeto</span>
                <textarea value={values.objective} onChange={(event) => setValues({ ...values, objective: event.target.value })} placeholder="Quando este Projeto estiver bem-sucedido, o que será verdade?" rows={3} />
                {errors.objective && <small>{errors.objective}</small>}
              </label>
              <label className="project-field project-field--compact">
                <span>Prazo <em>opcional</em></span>
                <input type="date" value={values.timeHorizonEnd} onChange={(event) => setValues({ ...values, timeHorizonEnd: event.target.value })} />
              </label>
            </section>
          )}

          {step === 3 && (
            <section className="project-wizard__step project-wizard__step--narrow">
              <div className="project-wizard__intro">
                <p>Projeto bom começa em movimento.</p>
                <h2>Qual é o primeiro movimento?</h2>
              </div>
              <label className="project-field">
                <span>Primeiro movimento</span>
                <input autoFocus value={values.nextMove} onChange={(event) => setValues({ ...values, nextMove: event.target.value })} placeholder="Uma ação concreta que faz o Projeto avançar" />
                {errors.nextMove && <small>{errors.nextMove}</small>}
              </label>
              <fieldset className="project-destination">
                <legend>Onde essa ação entra agora?</legend>
                {([
                  ['project', 'Manter só no Projeto', 'Fica como movimento ativo, sem criar tarefa.'],
                  ['backlog', 'Adicionar ao backlog', 'Cria uma tarefa ligada ao Projeto.'],
                  ['today', 'Mandar para Hoje', 'Entra na sua lista de execução de hoje.']
                ] as const).map(([destination, title, description]) => (
                  <label key={destination} data-selected={values.nextMoveDestination === destination || undefined}>
                    <input type="radio" name="destination" value={destination} checked={values.nextMoveDestination === destination} onChange={() => setValues({ ...values, nextMoveDestination: destination })} />
                    <span className="project-destination__check">{values.nextMoveDestination === destination && <Check size={13} />}</span>
                    <span><strong>{title}</strong><small>{description}</small></span>
                  </label>
                ))}
              </fieldset>
              {requestError && <p className="project-wizard__error" role="alert">{requestError}</p>}
            </section>
          )}
        </main>

        <footer className="project-wizard__footer">
          {step > 1 ? (
            <button type="button" className="project-wizard__back" onClick={() => setStep((step - 1) as 1 | 2)} disabled={submitting}>
              <ArrowLeft size={16} /> Voltar
            </button>
          ) : <span />}
          {step < 3 ? (
            <button type="button" className="project-wizard__next" onClick={continueWizard}>
              Continuar <ArrowRight size={16} />
            </button>
          ) : (
            <button type="submit" className="project-wizard__next" disabled={submitting}>
              {submitting ? 'Criando…' : 'Criar Projeto'} <ArrowRight size={16} />
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
