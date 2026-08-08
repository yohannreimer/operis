import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, CalendarPlus, CheckCircle2, Copy, ExternalLink, MoreHorizontal, RotateCcw, Sun, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Project, TaskBacklogItem, Workspace, WaitingFollowupRadar } from '../../api';
import type { TaskDetailData, TaskUpdatePatch } from './use-task-backlog';
import { TaskConstraints } from './task-constraints';
import { TaskExecutionClarity } from './task-execution-clarity';
import { TaskHistory } from './task-history';
import { TaskProperties } from './task-properties';
import { TaskScheduleDialog } from './task-schedule-dialog';
import { TaskSteps } from './task-steps';

type Props = {
  task: TaskBacklogItem;
  detail: TaskDetailData;
  workspaces: Workspace[];
  projects: Project[];
  radar: WaitingFollowupRadar | null;
  mobile: boolean;
  loading: boolean;
  error: string | null;
  onClose(): void;
  onUpdate(patch: TaskUpdatePatch): Promise<unknown>;
  onPlanToday(): Promise<unknown>;
  onRemoveToday(): Promise<unknown>;
  onSchedule(date: string, start: string, end: string): Promise<unknown>;
  onComplete(): void;
  onReopen(): Promise<unknown>;
  onArchive(): void;
  onDelete(): void;
  onCreateStep(title: string): Promise<unknown>;
  onUpdateStep(id: string, patch: { title?: string; status?: 'backlog' | 'feito' }): Promise<unknown>;
  onReorderSteps(ids: string[]): Promise<unknown>;
  onDeleteStep(id: string): Promise<unknown>;
  onLoadRadar(): Promise<unknown>;
  onCreateRestriction(title: string, detail?: string): Promise<unknown>;
  onUpdateRestriction(id: string, patch: { status?: 'aberta' | 'resolvida' }): Promise<unknown>;
  onDeleteRestriction(id: string): Promise<unknown>;
  onFollowup(note?: string): Promise<unknown>;
  onClearWaiting(): Promise<unknown>;
  onOpenHistory(): Promise<unknown>;
  onRetryDetail(): Promise<unknown>;
};

export function TaskDetailPanel(props: Props) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [title, setTitle] = useState(props.task.title);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => { setTitle(props.task.title); if (props.mobile) panelRef.current?.focus(); }, [props.mobile, props.task.id, props.task.title]);
  const completed = props.task.status === 'feito';
  const stateLabel = completed
    ? 'Concluída'
    : props.task.status === 'arquivado'
      ? 'Arquivada'
      : props.task.status === 'andamento'
        ? 'Em andamento'
        : props.task.waitingOnPerson
          ? 'Aguardando'
          : props.task.horizon === 'future' ? 'Futuro' : 'Próximas';

  return (
    <aside ref={panelRef} className="task-backlog-detail" aria-label={`Detalhe de ${props.task.title}`} tabIndex={-1}>
      <header className="task-detail-topbar">
        <button type="button" className="task-detail-back" onClick={props.onClose} aria-label={props.mobile ? 'Voltar às tarefas' : 'Fechar detalhe'}>{props.mobile ? <ArrowLeft aria-hidden="true" /> : <X aria-hidden="true" />}{props.mobile ? 'Tarefas' : null}</button>
        <div className="task-detail-state"><span>{stateLabel}</span>{props.task.todayEntryId ? <span className="today"><Sun aria-hidden="true" /> Hoje</span> : null}</div>
        <details className="task-row-menu task-detail-menu"><summary aria-label="Mais ações"><MoreHorizontal aria-hidden="true" /></summary><div role="menu"><button type="button" role="menuitem" onClick={() => void navigator.clipboard.writeText(window.location.href)}><Copy aria-hidden="true" />Copiar referência</button>{props.task.projectId ? <Link role="menuitem" to={`/projetos/${props.task.projectId}`}><ExternalLink aria-hidden="true" />Abrir Projeto</Link> : null}<button type="button" role="menuitem" onClick={props.onArchive}><Archive aria-hidden="true" />Arquivar</button><button type="button" role="menuitem" className="danger" onClick={props.onDelete}><Trash2 aria-hidden="true" />Excluir</button></div></details>
      </header>

      <div className="task-detail-scroll">
        <textarea rows={2} className="task-detail-title" aria-label="Título da tarefa" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim() && title.trim() !== props.task.title) void props.onUpdate({ title: title.trim() }); }} />
        <div className="task-detail-primary-actions">
          <button type="button" className={props.task.todayEntryId ? 'active' : ''} onClick={() => void (props.task.todayEntryId ? props.onRemoveToday() : props.onPlanToday())}><Sun aria-hidden="true" />{props.task.todayEntryId ? 'Retirar de Hoje' : 'Planejar para Hoje'}</button>
          <button type="button" onClick={() => setScheduleOpen(true)}><CalendarPlus aria-hidden="true" />Agendar</button>
          {completed
            ? <button type="button" className="task-complete-action" onClick={() => void props.onReopen()}><RotateCcw aria-hidden="true" />Reabrir</button>
            : <button type="button" className="task-complete-action" onClick={props.onComplete}><CheckCircle2 aria-hidden="true" />Concluir</button>}
        </div>

        {props.error ? <div className="task-detail-error" role="alert">{props.error}<button type="button" onClick={() => void props.onRetryDetail()}>Tentar novamente</button></div> : null}
        <TaskExecutionClarity task={props.task} onUpdate={props.onUpdate} />
        {props.loading && !props.detail.loaded ? <div className="task-detail-skeleton" aria-label="Carregando detalhes"><span /><span /><span /></div> : <>
          <TaskSteps steps={props.detail.subtasks} onCreate={props.onCreateStep} onUpdate={props.onUpdateStep} onReorder={props.onReorderSteps} onDelete={props.onDeleteStep} onCompleteTask={props.onComplete} />
          <TaskConstraints task={props.task} restrictions={props.detail.restrictions} radar={props.radar} onLoadRadar={props.onLoadRadar} onCreateRestriction={props.onCreateRestriction} onUpdateRestriction={props.onUpdateRestriction} onDeleteRestriction={props.onDeleteRestriction} onFollowup={props.onFollowup} onClearWaiting={props.onClearWaiting} />
          <TaskProperties task={props.task} workspaces={props.workspaces} projects={props.projects} onUpdate={props.onUpdate} />
          <TaskHistory entries={props.detail.history} onOpen={props.onOpenHistory} />
        </>}
      </div>
      <TaskScheduleDialog open={scheduleOpen} taskTitle={props.task.title} estimatedMinutes={props.task.estimatedMinutes} onClose={() => setScheduleOpen(false)} onSchedule={props.onSchedule} />
    </aside>
  );
}
