import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, CalendarPlus, CheckCircle2, Copy, ExternalLink, MoreHorizontal, RotateCcw, Sun, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Project, TaskBacklogItem, Workspace, WaitingFollowupRadar } from '../../api';
import { Button, IconButton, Popover } from '../../components/ui';
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
        {props.mobile ? (
          <Button type="button" variant="tertiary" size="sm" className="task-detail-back" leadingIcon={<ArrowLeft />} onClick={props.onClose}>Tarefas</Button>
        ) : (
          <IconButton type="button" className="task-detail-back" label="Fechar detalhe" icon={<X />} onClick={props.onClose} />
        )}
        <div className="task-detail-state"><span>{stateLabel}</span>{props.task.todayEntryId ? <span className="today"><Sun aria-hidden="true" /> Hoje</span> : null}</div>
        <div className="task-detail-menu">
          <Popover label="Mais ações" trigger={<IconButton type="button" label="Mais ações" icon={<MoreHorizontal />} />}>
            <Button type="button" variant="tertiary" size="sm" role="menuitem" leadingIcon={<Copy />} onClick={() => void navigator.clipboard.writeText(window.location.href)}>Copiar referência</Button>
            {props.task.projectId ? <Link role="menuitem" to={`/projetos/${props.task.projectId}`}><ExternalLink aria-hidden="true" />Abrir Projeto</Link> : null}
            <Button type="button" variant="tertiary" size="sm" role="menuitem" leadingIcon={<Archive />} onClick={props.onArchive}>Arquivar</Button>
            <Button type="button" variant="danger" size="sm" role="menuitem" leadingIcon={<Trash2 />} onClick={props.onDelete}>Excluir</Button>
          </Popover>
        </div>
      </header>

      <div className="task-detail-scroll">
        <textarea rows={2} className="task-detail-title" aria-label="Título da tarefa" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim() && title.trim() !== props.task.title) void props.onUpdate({ title: title.trim() }); }} />
        <div className="task-detail-primary-actions">
          <Button type="button" variant="secondary" size="sm" className={props.task.todayEntryId ? 'active' : ''} leadingIcon={<Sun />} onClick={() => void (props.task.todayEntryId ? props.onRemoveToday() : props.onPlanToday())}>{props.task.todayEntryId ? 'Retirar de Hoje' : 'Planejar para Hoje'}</Button>
          <Button type="button" variant="secondary" size="sm" leadingIcon={<CalendarPlus />} onClick={() => setScheduleOpen(true)}>Agendar</Button>
          {completed
            ? <Button type="button" variant="secondary" size="sm" className="task-complete-action" leadingIcon={<RotateCcw />} onClick={() => void props.onReopen()}>Reabrir</Button>
            : <Button type="button" variant="secondary" size="sm" className="task-complete-action" leadingIcon={<CheckCircle2 />} onClick={props.onComplete}>Concluir</Button>}
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
