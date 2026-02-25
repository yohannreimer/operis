import { useEffect, useMemo, useState } from 'react';

import { api, GamificationDetails } from '../api';

function completionRate(details: GamificationDetails | null) {
  if (!details) {
    return 0;
  }

  const done = details.today.completed;
  const fail = details.today.failed + details.today.delayed;
  const total = done + fail;
  if (!total) {
    return 0;
  }

  return Math.round((done / total) * 100);
}

export function GamificacaoPage() {
  const [details, setDetails] = useState<GamificationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getGamificationDetails()
      .then(setDetails)
      .catch((requestError: Error) => setError(requestError.message));
  }, []);

  const rate = useMemo(() => completionRate(details), [details]);

  return (
    <section className="page-stack">
      <header className="page-header-premium">
        <div>
          <p className="eyebrow">Gamificação</p>
          <h3>Métrica real de disciplina e execução</h3>
          <p>Painel semanal com histórico, risco e comportamento operacional.</p>
        </div>
      </header>

      {error && <p className="surface-error">{error}</p>}

      <section className="metric-grid">
        <article className="metric-card">
          <span>Score atual</span>
          <strong>{details?.scoreAtual ?? 0}</strong>
          <small>acumulado do sistema</small>
        </article>
        <article className="metric-card">
          <span>Score semanal</span>
          <strong>{details?.scoreSemanal ?? 0}</strong>
          <small>semana corrente</small>
        </article>
        <article className="metric-card">
          <span>Streak</span>
          <strong>{details?.streak ?? 0} dias</strong>
          <small>dias seguidos pontuando</small>
        </article>
        <article className="metric-card danger">
          <span>Dívida de execução</span>
          <strong>{details?.dividaExecucao ?? 0}</strong>
          <small>penalidade acumulada</small>
        </article>
      </section>

      <section className="two-col-grid large">
        <article className="surface-card">
          <div className="section-title">
            <h4>Histórico das últimas semanas</h4>
            <small>baseado em eventos de execução</small>
          </div>

          <div className="performance-bars">
            {(details?.history ?? []).map((entry) => (
              <div className="performance-item" key={entry.weekStart}>
                <div className="performance-bar" style={{ height: `${Math.max(10, entry.score + 20)}px` }} />
                <strong>{entry.score}</strong>
                <span>{entry.label}</span>
              </div>
            ))}
          </div>

          <hr className="surface-divider" />

          <div className="today-summary-grid">
            <div>
              <span>Hoje concluídas</span>
              <strong>{details?.today.completed ?? 0}</strong>
            </div>
            <div>
              <span>Hoje adiadas</span>
              <strong>{details?.today.delayed ?? 0}</strong>
            </div>
            <div>
              <span>Hoje falhas</span>
              <strong>{details?.today.failed ?? 0}</strong>
            </div>
            <div>
              <span>Pendente confirmação</span>
              <strong>{details?.today.pendingConfirmations ?? 0}</strong>
            </div>
          </div>
        </article>

        <article className="surface-card">
          <div className="section-title">
            <h4>Termômetro de execução diária</h4>
            <small>taxa de acerto do dia</small>
          </div>

          <div className="hero-meter">
            <span>Taxa de conclusão</span>
            <strong>{rate}%</strong>
            <div className="meter-track">
              <div style={{ width: `${rate}%` }} />
            </div>
          </div>

          <hr className="surface-divider" />

          <ul className="score-rules">
            <li>
              <span>Concluir no horário</span>
              <strong className="up">+10</strong>
            </li>
            <li>
              <span>Concluir atrasado</span>
              <strong className="up">+5</strong>
            </li>
            <li>
              <span>Adiar</span>
              <strong className="down">-5</strong>
            </li>
            <li>
              <span>Não confirmar</span>
              <strong className="down">-8</strong>
            </li>
          </ul>

          <hr className="surface-divider" />

          <div className="risk-card">
            <span className={`risk-badge ${details && details.dividaExecucao > 60 ? 'high' : 'mid'}`}>
              {details && details.dividaExecucao > 60 ? 'Risco alto' : 'Risco moderado'}
            </span>
            <p>
              Foque em reduzir adiar/não confirmar para derrubar a dívida de execução nas próximas semanas.
            </p>
          </div>
        </article>
      </section>
    </section>
  );
}
