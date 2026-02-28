import { useEffect, useMemo, useState } from 'react';
import { Flame, ShieldAlert, TrendingUp } from 'lucide-react';

import { api, ExecutionScore, GamificationDetails } from '../api';
import { EmptyState, MetricCard, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock } from '../components/premium-ui';
import { todayIsoDate } from '../utils/date';

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
  const [executionScore, setExecutionScore] = useState<ExecutionScore | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReady(false);
    setError(null);
    Promise.all([api.getGamificationDetails(), api.getExecutionScore(todayIsoDate())])
      .then(([nextDetails, nextExecutionScore]) => {
        setDetails(nextDetails);
        setExecutionScore(nextExecutionScore);
      })
      .catch((requestError: Error) => setError(requestError.message))
      .finally(() => setReady(true));
  }, []);

  const rate = useMemo(() => completionRate(details), [details]);

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Performance"
          title="Gamificação e disciplina"
          subtitle="Métricas de consistência com leitura semanal clara."
        />

        <section className="premium-metric-grid">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="premium-metric tone-default">
              <SkeletonBlock height={12} />
              <SkeletonBlock height={24} />
              <SkeletonBlock height={10} />
            </div>
          ))}
        </section>

        <section className="premium-grid two">
          <PremiumCard title="Histórico semanal">
            <SkeletonBlock lines={5} />
          </PremiumCard>
          <PremiumCard title="Termômetro diário">
            <SkeletonBlock lines={5} />
          </PremiumCard>
        </section>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PremiumHeader
        eyebrow="Performance"
        title="Gamificação e disciplina"
        subtitle="Métricas de consistência com leitura semanal clara."
      />

      {error && <p className="surface-error">{error}</p>}

      <section className="premium-metric-grid">
        <MetricCard label="Score atual" value={details?.scoreAtual ?? 0} tone="accent" hint="acumulado" />
        <MetricCard label="Execution Score" value={executionScore?.score ?? 0} tone="accent" hint="dia atual" />
        <MetricCard label="Score semanal" value={details?.scoreSemanal ?? 0} hint="semana atual" />
        <MetricCard label="Streak geral" value={`${details?.streak ?? 0} dias`} tone="success" hint="constância" />
        <MetricCard label="Streak execução A" value={`${details?.streakExecucaoA ?? 0} dias`} tone="success" hint="Top 3 entregue" />
        <MetricCard label="Streak Deep Work" value={`${details?.streakDeepWork ?? 0} dias`} tone="success" hint="mínimo diário" />
        <MetricCard label="Dívida" value={details?.dividaExecucao ?? 0} tone="warning" hint="penalidade" />
      </section>

      <section className="premium-grid two">
        <PremiumCard title="Histórico semanal" subtitle="últimas 6 semanas">
          {!details?.history.length ? (
            <EmptyState
              title="Histórico ainda indisponível"
              description="Conforme você confirma blocos e conclui tarefas, a evolução semanal aparece aqui."
            />
          ) : (
            <div className="premium-bars">
              {details.history.map((entry) => (
                <div key={entry.weekStart} className="premium-bar-item">
                  <div className="premium-bar" style={{ height: `${Math.max(12, entry.score + 24)}px` }} />
                  <strong>{entry.score}</strong>
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          )}
        </PremiumCard>

        <PremiumCard title="Termômetro diário" subtitle="execução de hoje">
          <div className="premium-thermo">
            <div className="premium-thermo-head">
              <span className="thermo-label">Taxa de conclusão</span>
              <strong>{rate}%</strong>
            </div>
            <div className="meter-track">
              <div style={{ width: `${rate}%` }} />
            </div>
          </div>

          <ul className="premium-kv-list compact">
            <li>
              <span><TrendingUp size={15} /> Concluídas</span>
              <strong>{details?.today.completed ?? 0}</strong>
            </li>
            <li>
              <span><ShieldAlert size={15} /> Falhas</span>
              <strong>{details?.today.failed ?? 0}</strong>
            </li>
            <li>
              <span><Flame size={15} /> Adiadas</span>
              <strong>{details?.today.delayed ?? 0}</strong>
            </li>
          </ul>

          {executionScore && (
            <ul className="premium-kv-list compact">
              <li>
                <span>A concluídas</span>
                <strong>{executionScore.components.aCompletion.value}%</strong>
              </li>
              <li>
                <span>Deep Work</span>
                <strong>{executionScore.components.deepWork.value}%</strong>
              </li>
              <li>
                <span>Pontualidade</span>
                <strong>{executionScore.components.punctuality.value}%</strong>
              </li>
              <li>
                <span>Sem reagendar</span>
                <strong>{executionScore.components.nonReschedule.value}%</strong>
              </li>
              <li>
                <span>Conectadas a projeto</span>
                <strong>{executionScore.components.projectConnection.value}%</strong>
              </li>
            </ul>
          )}
        </PremiumCard>
      </section>

      <PremiumCard title="Quebras de compromisso" subtitle="histórico adulto dos últimos ciclos">
        {!details?.commitmentBreaks.length ? (
          <EmptyState
            title="Sem quebras recentes"
            description="Quando houver atraso/falha após compromisso, o histórico aparece aqui."
          />
        ) : (
          <ul className="premium-list dense">
            {details.commitmentBreaks.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.taskTitle}</strong>
                  <small>
                    {entry.workspaceName}
                    {entry.projectTitle ? ` • ${entry.projectTitle}` : ''} • {entry.reason} •{' '}
                    {new Date(entry.at).toLocaleString('pt-BR')}
                  </small>
                  <small>
                    Impacto {entry.impactScore} • {entry.recoverySuggestion}
                    {entry.afterTop3Commit && entry.committedAt
                      ? ` • compromisso Top 3 confirmado às ${new Date(entry.committedAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}`
                      : ''}
                  </small>
                </div>
                <div className="inline-actions">
                  <span className={`status-tag ${entry.type === 'delayed' ? 'backlog' : 'andamento'}`}>
                    {entry.type === 'delayed' ? 'adiada' : entry.type === 'not_confirmed' ? 'não confirmada' : 'falha'}
                  </span>
                  <span className={`status-tag ${entry.severity === 'alta' ? 'backlog' : 'andamento'}`}>
                    severidade {entry.severity}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PremiumCard>
    </PremiumPage>
  );
}
