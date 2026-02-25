import { useEffect, useMemo, useState } from 'react';

import { api, DayPlan, GamificationDetails, Task } from '../api';
import { useShellContext } from '../components/shell-context';
import { todayIsoDate } from '../utils/date';
import { workspaceQuery } from '../utils/workspace';

type DashboardData = {
  tasks: Task[];
  todayPlan: DayPlan | null;
  gamification: GamificationDetails | null;
};

export function DashboardPage() {
  const { activeWorkspaceId } = useShellContext();
  const workspaceId = workspaceQuery(activeWorkspaceId);

  const [data, setData] = useState<DashboardData>({
    tasks: [],
    todayPlan: null,
    gamification: null
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getTasks(workspaceId ? { workspaceId } : undefined),
      api.getDayPlan(todayIsoDate()),
      api.getGamificationDetails()
    ])
      .then(([tasks, todayPlan, gamification]) => {
        setData({ tasks, todayPlan, gamification });
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, [activeWorkspaceId]);

  const activeTasks = data.tasks.filter((task) => task.status !== 'arquivado');
  const todayTasks = activeTasks.filter((task) => task.status === 'hoje');
  const backlogTasks = activeTasks.filter((task) => task.status === 'backlog');
  const futureTasks = activeTasks.filter((task) => (task.horizon ?? 'active') === 'future');
  const waitingTasks = activeTasks.filter((task) => Boolean(task.waitingOnPerson));

  const doneToday = data.gamification?.today.completed ?? 0;
  const todayFailures = (data.gamification?.today.failed ?? 0) + (data.gamification?.today.delayed ?? 0);
  const totalTrackedToday = doneToday + todayFailures;
  const executionRate = totalTrackedToday ? Math.round((doneToday / totalTrackedToday) * 100) : 0;

  const topPriorities = useMemo(
    () => [...todayTasks, ...backlogTasks].sort((a, b) => b.priority - a.priority).slice(0, 6),
    [todayTasks, backlogTasks]
  );

  return (
    <section className="page-stack">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Dashboard Executivo</p>
          <h3>Painel estratégico de execução diária</h3>
          <p>
            Contexto selecionado com foco em planejamento do dia, risco de atraso e próximas prioridades.
          </p>
        </div>

        <div className="hero-meter">
          <span>Taxa de execução do dia</span>
          <strong>{executionRate}%</strong>
          <div className="meter-track">
            <div style={{ width: `${executionRate}%` }} />
          </div>
        </div>
      </header>

      {error && <p className="surface-error">{error}</p>}

      <section className="metric-grid">
        <article className="metric-card">
          <span>Score atual</span>
          <strong>{data.gamification?.scoreAtual ?? 0}</strong>
          <small>métrica acumulada</small>
        </article>
        <article className="metric-card">
          <span>Streak</span>
          <strong>{data.gamification?.streak ?? 0} dias</strong>
          <small>constância de execução</small>
        </article>
        <article className="metric-card">
          <span>Blocos hoje</span>
          <strong>{data.todayPlan?.items.length ?? 0}</strong>
          <small>agenda monitorada</small>
        </article>
        <article className="metric-card danger">
          <span>Dívida execução</span>
          <strong>{data.gamification?.dividaExecucao ?? 0}</strong>
          <small>pontos perdidos</small>
        </article>
      </section>

      <section className="three-col-grid">
        <article className="surface-card">
          <div className="section-title">
            <h4>Foco de hoje</h4>
            <small>{todayTasks.length} tarefas</small>
          </div>

          {todayTasks.length === 0 ? (
            <p className="empty-state">Nenhuma tarefa em hoje neste contexto.</p>
          ) : (
            <ul className="task-list">
              {todayTasks.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <small>prioridade {task.priority}</small>
                  </div>
                  <span className={`status-tag ${task.status}`}>{task.status}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>Backlog crítico</h4>
            <small>{backlogTasks.length} tarefas</small>
          </div>

          {backlogTasks.length === 0 ? (
            <p className="empty-state">Sem backlog pendente.</p>
          ) : (
            <ul className="task-list">
              {backlogTasks.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <small>prioridade {task.priority}</small>
                  </div>
                  <span className="priority-chip">P{task.priority}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>Radar de risco</h4>
            <small>itens sensíveis</small>
          </div>

          <ul className="compact-list">
            <li>
              <strong>{waitingTasks.length}</strong>
              <span>Aguardando terceiros</span>
            </li>
            <li>
              <strong>{futureTasks.length}</strong>
              <span>Marcadas como futuro</span>
            </li>
            <li>
              <strong>{data.gamification?.today.pendingConfirmations ?? 0}</strong>
              <span>Pendente confirmação</span>
            </li>
            <li>
              <strong>{todayFailures}</strong>
              <span>Falhas/adiamentos hoje</span>
            </li>
          </ul>
        </article>
      </section>

      <section className="surface-card">
        <div className="section-title">
          <h4>Prioridades estratégicas imediatas</h4>
          <small>top 6 por prioridade</small>
        </div>

        {topPriorities.length === 0 ? (
          <p className="empty-state">Sem prioridades definidas neste contexto.</p>
        ) : (
          <ul className="task-list">
            {topPriorities.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    {task.status} • horizonte {task.horizon ?? 'active'} • prioridade {task.priority}
                  </small>
                </div>
                <span className={`status-tag ${task.status}`}>{task.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
