import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  api,
  CommitmentLevel,
  MonthlyReview,
  StrategicReviewHistoryItem,
  StrategicReviewJournal,
  WeeklyAllocation,
  WeeklyReview,
  Workspace
} from '../api';
import { EmptyState, PremiumCard, PremiumHeader, PremiumPage, SkeletonBlock, TabSwitch } from '../components/premium-ui';
import { useShellContext } from '../components/shell-context';

type ReviewDraft = {
  nextPriority: string;
  strategicDecision: string;
  commitmentLevel: CommitmentLevel;
  actionItemsText: string;
  reflection: string;
};

type RitualPanel = 'planejamento' | 'revisao' | 'mensal' | 'historico';
type RitualFocusTarget = 'allocation' | 'weekly-priority' | 'weekly-decision' | 'weekly-actions' | 'weekly-save';

const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  nextPriority: '',
  strategicDecision: '',
  commitmentLevel: 'medio',
  actionItemsText: '',
  reflection: ''
};

const RITUAL_CLOSURE_STORAGE_KEY = 'execution-os.ritual-week-closures';

function currentWeekStartIso() {
  const base = new Date();
  const day = base.getDay();
  const diff = (day + 6) % 7;
  base.setDate(base.getDate() - diff);
  base.setHours(0, 0, 0, 0);
  return base.toISOString().slice(0, 10);
}

function currentMonthStartIso() {
  const base = new Date();
  base.setDate(1);
  base.setHours(0, 0, 0, 0);
  return base.toISOString().slice(0, 10);
}

function shiftIsoDate(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isIsoDateAfter(candidate: string, reference: string) {
  const candidateDate = new Date(`${candidate}T00:00:00`).getTime();
  const referenceDate = new Date(`${reference}T00:00:00`).getTime();
  if (!Number.isFinite(candidateDate) || !Number.isFinite(referenceDate)) {
    return false;
  }
  return candidateDate > referenceDate;
}

function weeklyReviewGateDate(weekStart: string) {
  const gate = new Date(`${weekStart}T20:00:00`);
  if (Number.isNaN(gate.getTime())) {
    return null;
  }
  gate.setDate(gate.getDate() + 4);
  return gate;
}

function isWeeklyReviewWindowOpen(weekStart: string) {
  const gate = weeklyReviewGateDate(weekStart);
  if (!gate) {
    return true;
  }
  return Date.now() >= gate.getTime();
}

function monthlyReviewGateDate(monthStart: string) {
  const gate = new Date(`${monthStart}T20:00:00`);
  if (Number.isNaN(gate.getTime())) {
    return null;
  }
  gate.setMonth(gate.getMonth() + 1, 0);
  gate.setHours(20, 0, 0, 0);
  return gate;
}

function isMonthlyReviewWindowOpen(monthStart: string) {
  const gate = monthlyReviewGateDate(monthStart);
  if (!gate) {
    return true;
  }
  return Date.now() >= gate.getTime();
}

function readClosedWeeks() {
  try {
    const raw = window.localStorage.getItem(RITUAL_CLOSURE_STORAGE_KEY);
    if (!raw) {
      return {} as Record<string, string>;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {} as Record<string, string>;
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
    ) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
}

function closureKeyFor(scopeId: string, weekStart: string) {
  return `${scopeId}:${weekStart}`;
}

function draftFromJournal(journal: StrategicReviewJournal | null): ReviewDraft {
  if (!journal?.review) {
    return { ...EMPTY_REVIEW_DRAFT };
  }

  return {
    nextPriority: journal.review.nextPriority ?? '',
    strategicDecision: journal.review.strategicDecision ?? '',
    commitmentLevel: journal.review.commitmentLevel ?? 'medio',
    actionItemsText: journal.review.actionItems.join('\n'),
    reflection: journal.review.reflection ?? ''
  };
}

function draftFromAutoDraft(autoDraft?: WeeklyReview['autoDraft'] | null): ReviewDraft {
  if (!autoDraft) {
    return { ...EMPTY_REVIEW_DRAFT };
  }

  return {
    nextPriority: autoDraft.nextPriority ?? '',
    strategicDecision: autoDraft.strategicDecision ?? '',
    commitmentLevel: autoDraft.commitmentLevel ?? 'medio',
    actionItemsText: (autoDraft.actionItems ?? []).join('\n'),
    reflection: autoDraft.reflection ?? ''
  };
}

function parseActionItems(text: string) {
  return text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

function workspaceModeLabel(mode?: Workspace['mode']) {
  if (mode === 'expansao') {
    return 'Expansão';
  }
  if (mode === 'standby') {
    return 'Standby';
  }
  return 'Manutenção';
}

function commitmentLabel(level?: CommitmentLevel | null) {
  if (level === 'alto') {
    return 'Compromisso alto';
  }
  if (level === 'medio') {
    return 'Compromisso médio';
  }
  if (level === 'baixo') {
    return 'Compromisso baixo';
  }
  return 'Compromisso n/d';
}

function formatDeltaPercent(value: number) {
  if (value > 0) {
    return `+${value} pp`;
  }
  if (value < 0) {
    return `${value} pp`;
  }
  return '0 pp';
}

export function RitualPage() {
  const { activeWorkspaceId, setActiveWorkspaceId, workspaces: sharedWorkspaces, refreshGlobal } = useShellContext();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [weeklyAllocation, setWeeklyAllocation] = useState<WeeklyAllocation | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const [monthlyReview, setMonthlyReview] = useState<MonthlyReview | null>(null);
  const [weeklyJournal, setWeeklyJournal] = useState<StrategicReviewJournal | null>(null);
  const [monthlyJournal, setMonthlyJournal] = useState<StrategicReviewJournal | null>(null);
  const [weeklyHistory, setWeeklyHistory] = useState<StrategicReviewHistoryItem[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<StrategicReviewHistoryItem[]>([]);

  const [weeklyDraft, setWeeklyDraft] = useState<ReviewDraft>({ ...EMPTY_REVIEW_DRAFT });
  const [monthlyDraft, setMonthlyDraft] = useState<ReviewDraft>({ ...EMPTY_REVIEW_DRAFT });
  const [allocationDraft, setAllocationDraft] = useState<Record<string, number>>({});
  const [allocationDirty, setAllocationDirty] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('all');
  const [weekStart, setWeekStart] = useState(() => currentWeekStartIso());
  const [monthStart, setMonthStart] = useState(() => currentMonthStartIso());
  const [ritualPanel, setRitualPanel] = useState<RitualPanel>('planejamento');

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ritualNotice, setRitualNotice] = useState<string | null>(null);
  const [closedWeeks, setClosedWeeks] = useState<Record<string, string>>(() => readClosedWeeks());
  const [guideAfterWeeklySave, setGuideAfterWeeklySave] = useState(false);
  const [highlightedChecklistKey, setHighlightedChecklistKey] = useState<string | null>(null);
  const allocationInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const weeklyPriorityRef = useRef<HTMLInputElement>(null);
  const weeklyDecisionRef = useRef<HTMLInputElement>(null);
  const weeklyActionsRef = useRef<HTMLTextAreaElement>(null);
  const weeklySaveRef = useRef<HTMLButtonElement>(null);
  const checklistFocusRef = useRef<HTMLDivElement>(null);

  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== 'geral'),
    [workspaces]
  );

  const selectedWorkspace =
    selectedWorkspaceId === 'all'
      ? null
      : visibleWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  async function load() {
    try {
      setError(null);
      const strategyWorkspaceId = selectedWorkspaceId === 'all' ? undefined : selectedWorkspaceId;
      const [
        workspaceData,
        allocationData,
        weeklyReviewData,
        monthlyReviewData,
        weeklyJournalData,
        monthlyJournalData,
        weeklyHistoryData,
        monthlyHistoryData
      ] = await Promise.all([
        api.getWorkspaces(),
        api.getWeeklyAllocation({
          weekStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getWeeklyReview({
          weekStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getMonthlyReview({
          monthStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getReviewJournal({
          periodType: 'weekly',
          periodStart: weekStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getReviewJournal({
          periodType: 'monthly',
          periodStart: monthStart,
          workspaceId: strategyWorkspaceId
        }),
        api.getReviewHistory({
          periodType: 'weekly',
          workspaceId: strategyWorkspaceId,
          limit: 8
        }),
        api.getReviewHistory({
          periodType: 'monthly',
          workspaceId: strategyWorkspaceId,
          limit: 8
        })
      ]);

      setWorkspaces(workspaceData);
      setWeeklyAllocation(allocationData);
      setWeeklyReview(weeklyReviewData);
      setMonthlyReview(monthlyReviewData);
      setWeeklyJournal(weeklyJournalData);
      setMonthlyJournal(monthlyJournalData);
      setWeeklyHistory(weeklyHistoryData);
      setMonthlyHistory(monthlyHistoryData);
      const weeklyDraftFromJournal = draftFromJournal(weeklyJournalData);
      const weeklyDraftAuto = draftFromAutoDraft(weeklyReviewData.autoDraft);
      const weeklyJournalSaved = Boolean(weeklyJournalData.review?.updatedAt);
      setWeeklyDraft(
        weeklyJournalSaved
          ? weeklyDraftFromJournal
          : {
              nextPriority: weeklyDraftFromJournal.nextPriority || weeklyDraftAuto.nextPriority,
              strategicDecision: weeklyDraftFromJournal.strategicDecision || weeklyDraftAuto.strategicDecision,
              commitmentLevel: weeklyDraftFromJournal.commitmentLevel || weeklyDraftAuto.commitmentLevel,
              actionItemsText: weeklyDraftFromJournal.actionItemsText || weeklyDraftAuto.actionItemsText,
              reflection: weeklyDraftFromJournal.reflection || weeklyDraftAuto.reflection
            }
      );
      setMonthlyDraft(draftFromJournal(monthlyJournalData));
      setAllocationDraft(
        Object.fromEntries(allocationData.rows.map((entry) => [entry.workspaceId, entry.plannedPercent]))
      );
      setAllocationDirty(false);

      const selectableWorkspaceIds = new Set(
        workspaceData.filter((workspace) => workspace.type !== 'geral').map((workspace) => workspace.id)
      );

      if (selectedWorkspaceId !== 'all' && !selectableWorkspaceIds.has(selectedWorkspaceId)) {
        setSelectedWorkspaceId('all');
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void load();
  }, [sharedWorkspaces.length, selectedWorkspaceId, weekStart, monthStart]);

  useEffect(() => {
    if (activeWorkspaceId === 'all') {
      setSelectedWorkspaceId('all');
      return;
    }

    const existsInVisibleList = visibleWorkspaces.some((workspace) => workspace.id === activeWorkspaceId);
    if (existsInVisibleList) {
      setSelectedWorkspaceId(activeWorkspaceId);
    }
  }, [activeWorkspaceId, visibleWorkspaces]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RITUAL_CLOSURE_STORAGE_KEY, JSON.stringify(closedWeeks));
    } catch {
      // Ignore persistence failures.
    }
  }, [closedWeeks]);

  function selectScope(workspaceId: string) {
    setRitualNotice(null);
    setSelectedWorkspaceId(workspaceId);
    setActiveWorkspaceId(workspaceId);
  }

  function nextWeeklyReviewFocusTarget(): RitualFocusTarget {
    if (!weeklyDraft.nextPriority.trim()) {
      return 'weekly-priority';
    }
    if (!weeklyDraft.strategicDecision.trim()) {
      return 'weekly-decision';
    }
    if (parseActionItems(weeklyDraft.actionItemsText).length === 0) {
      return 'weekly-actions';
    }
    return 'weekly-save';
  }

  function focusRitualTarget(target: RitualFocusTarget) {
    const focus = (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    if (target === 'allocation') {
      const firstWorkspaceId = weeklyAllocation?.rows[0]?.workspaceId;
      focus((firstWorkspaceId ? allocationInputRefs.current[firstWorkspaceId] : null) ?? null);
      return;
    }

    if (target === 'weekly-priority') {
      focus(weeklyPriorityRef.current);
      return;
    }

    if (target === 'weekly-decision') {
      focus(weeklyDecisionRef.current);
      return;
    }

    if (target === 'weekly-actions') {
      focus(weeklyActionsRef.current);
      return;
    }

    focus(weeklySaveRef.current);
  }

  function resolvePendingItem(itemKey: string, panel: RitualPanel) {
    setRitualPanel(panel);
    setRitualNotice(null);

    if (itemKey === 'monthly') {
      return;
    }

    let target: RitualFocusTarget = 'weekly-save';

    if (itemKey === 'allocation') {
      target = 'allocation';
    } else if (itemKey === 'review') {
      target = nextWeeklyReviewFocusTarget();
    } else if (itemKey === 'priority') {
      target = 'weekly-priority';
    } else if (itemKey === 'decision') {
      target = 'weekly-decision';
    } else if (itemKey === 'actions') {
      target = 'weekly-actions';
    }

    window.setTimeout(() => focusRitualTarget(target), 90);
  }

  function changeWeek(nextWeekStart: string, options?: { force?: boolean }) {
    const canForce = Boolean(options?.force);
    const movingForward = isIsoDateAfter(nextWeekStart, weekStart);

    if (!canForce && movingForward && !weekClosed) {
      setRitualNotice(
        !reviewWindowOpen && !weeklyReviewSaved
          ? 'A revisão desta semana abre na sexta às 20h. Feche a semana depois dessa janela.'
          : weeklyCompletionPercent < 100
            ? 'Antes de avançar, conclua 100% do checklist obrigatório desta semana.'
            : 'Checklist completo. Clique em "Fechar semana" para oficializar o ciclo e avançar.'
      );
      setRitualPanel('revisao');
      return;
    }

    setRitualNotice(null);
    setWeekStart(nextWeekStart);
  }

  function closeWeek() {
    if (!reviewWindowOpen && !weeklyReviewSaved) {
      setRitualNotice('Fechamento liberado na sexta às 20h (ou após salvar revisão antecipada).');
      setRitualPanel('revisao');
      return;
    }

    if (weeklyCompletionPercent < 100) {
      setRitualNotice('Sem fechamento: complete 100% do checklist obrigatório da semana.');
      setRitualPanel('revisao');
      return;
    }

    setClosedWeeks((current) => ({
      ...current,
      [currentClosureKey]: new Date().toISOString()
    }));
    setRitualNotice('Semana fechada com sucesso. Você já pode avançar para o próximo ciclo.');
    void refreshGlobal();
  }

  function updateAllocation(workspaceId: string, value: string) {
    const numeric = Number(value);
    const nextValue = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
    setAllocationDraft((current) => ({
      ...current,
      [workspaceId]: nextValue
    }));
    setAllocationDirty(true);
  }

  async function saveWeeklyAllocation() {
    if (!weeklyAllocation) {
      return;
    }

    try {
      setBusy(true);
      const allocations = weeklyAllocation.rows.map((row) => ({
        workspaceId: row.workspaceId,
        plannedPercent: allocationDraft[row.workspaceId] ?? 0
      }));

      const updated = await api.updateWeeklyAllocation(weekStart, {
        allocations
      });
      setWeeklyAllocation(updated);
      setAllocationDraft(
        Object.fromEntries(updated.rows.map((entry) => [entry.workspaceId, entry.plannedPercent]))
      );
      setAllocationDirty(false);
      await load();
      await refreshGlobal();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveWeeklyJournal(event: FormEvent) {
    event.preventDefault();

    try {
      setBusy(true);
      const strategyWorkspaceId = selectedWorkspaceId === 'all' ? undefined : selectedWorkspaceId;
      await api.updateReviewJournal('weekly', weekStart, {
        workspaceId: strategyWorkspaceId,
        nextPriority: weeklyDraft.nextPriority,
        strategicDecision: weeklyDraft.strategicDecision,
        commitmentLevel: weeklyDraft.commitmentLevel,
        actionItems: parseActionItems(weeklyDraft.actionItemsText),
        reflection: weeklyDraft.reflection
      });
      setRitualNotice(null);
      setRitualPanel('revisao');
      await load();
      await refreshGlobal();
      setGuideAfterWeeklySave(true);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function applyWeeklyAutoDraft() {
    if (!weeklyReview?.autoDraft) {
      return;
    }

    setWeeklyDraft(draftFromAutoDraft(weeklyReview.autoDraft));
    setRitualNotice('Rascunho automático aplicado. Revise e salve para fechar a semana.');
  }

  async function saveMonthlyJournal(event: FormEvent) {
    event.preventDefault();

    try {
      setBusy(true);
      const strategyWorkspaceId = selectedWorkspaceId === 'all' ? undefined : selectedWorkspaceId;
      await api.updateReviewJournal('monthly', monthStart, {
        workspaceId: strategyWorkspaceId,
        nextPriority: monthlyDraft.nextPriority,
        strategicDecision: monthlyDraft.strategicDecision,
        commitmentLevel: monthlyDraft.commitmentLevel,
        actionItems: parseActionItems(monthlyDraft.actionItemsText),
        reflection: monthlyDraft.reflection
      });
      await load();
      await refreshGlobal();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const weeklyAllocationRows = weeklyAllocation?.rows ?? [];
  const weeklyPlanConfigured =
    weeklyAllocationRows.length > 0 &&
    weeklyAllocationRows.some((entry) => (allocationDraft[entry.workspaceId] ?? entry.plannedPercent) > 0);
  const reviewWindowOpen = isWeeklyReviewWindowOpen(weekStart);
  const monthlyWindowOpen = isMonthlyReviewWindowOpen(monthStart);
  const weeklyReviewSaved = Boolean(weeklyJournal?.review?.updatedAt);
  const monthlyReviewSaved = Boolean(monthlyJournal?.review?.updatedAt);
  const reviewExpectedNow = reviewWindowOpen || weeklyReviewSaved;
  const weeklyChecklistBase = [
    {
      key: 'allocation',
      label: 'Planejamento semanal salvo',
      description: 'Distribuição de energia por frente definida.',
      panel: 'planejamento' as const,
      actionLabel: 'Ir para planejamento',
      done: weeklyPlanConfigured
    },
    ...(reviewExpectedNow
      ? [
          {
            key: 'review',
            label: 'Revisão semanal salva',
            description: 'Journal registrado no fim da semana.',
            panel: 'revisao' as const,
            actionLabel: 'Abrir revisão',
            done: weeklyReviewSaved
          }
        ]
      : [])
  ] as const;

  const weeklyChecklistReviewDetails = [
    {
      key: 'priority',
      label: 'Prioridade da próxima semana definida',
      description: 'Próxima alavanca estratégica documentada.',
      panel: 'revisao' as const,
      actionLabel: 'Definir prioridade',
      done: Boolean(weeklyJournal?.review?.nextPriority?.trim())
    },
    {
      key: 'decision',
      label: 'Decisão estratégica registrada',
      description: 'Escolha executiva explícita para o próximo ciclo.',
      panel: 'revisao' as const,
      actionLabel: 'Definir decisão',
      done: Boolean(weeklyJournal?.review?.strategicDecision?.trim())
    },
    {
      key: 'actions',
      label: 'Ações executáveis definidas',
      description: 'Checklist prático com ações da próxima semana.',
      panel: 'revisao' as const,
      actionLabel: 'Preencher ações',
      done: (weeklyJournal?.review?.actionItems.length ?? 0) > 0
    }
  ] as const;
  const weeklyClosingChecklist = weeklyReviewSaved
    ? [...weeklyChecklistBase, ...weeklyChecklistReviewDetails]
    : [...weeklyChecklistBase];
  const weeklyPendingItems = weeklyClosingChecklist.filter((item) => !item.done);
  const nextWeeklyPendingKey = weeklyPendingItems[0]?.key ?? null;
  const weeklyClosingDone = weeklyClosingChecklist.filter((item) => item.done).length;
  const weeklyCompletionPercent = Math.round((weeklyClosingDone / weeklyClosingChecklist.length) * 100);
  const currentClosureKey = closureKeyFor(selectedWorkspaceId, weekStart);
  const weekClosedAt = closedWeeks[currentClosureKey] ?? null;
  const weekClosed = Boolean(weekClosedAt && weeklyCompletionPercent === 100);
  const mandatoryPendingItems = [
    ...weeklyPendingItems,
    ...(!monthlyReviewSaved && monthlyWindowOpen
      ? [
          {
            key: 'monthly',
            label: 'Fechamento mensal pendente',
            description: 'Síntese executiva do mês para comparar planejado vs real.',
            panel: 'mensal' as const,
            actionLabel: 'Abrir fechamento mensal',
            done: false
          }
        ]
      : [])
  ];

  useEffect(() => {
    if (weeklyCompletionPercent === 100 || !closedWeeks[currentClosureKey]) {
      return;
    }

    setClosedWeeks((current) => {
      if (!current[currentClosureKey]) {
        return current;
      }
      const next = { ...current };
      delete next[currentClosureKey];
      return next;
    });
  }, [currentClosureKey, weeklyCompletionPercent, closedWeeks]);

  useEffect(() => {
    if (!guideAfterWeeklySave || ritualPanel !== 'revisao') {
      return;
    }

    checklistFocusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedChecklistKey(nextWeeklyPendingKey);
    setGuideAfterWeeklySave(false);

    if (!nextWeeklyPendingKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedChecklistKey((current) => (current === nextWeeklyPendingKey ? null : current));
    }, 2100);

    return () => window.clearTimeout(timeoutId);
  }, [guideAfterWeeklySave, ritualPanel, nextWeeklyPendingKey]);

  const scopeOptions = [
    { value: 'all', label: 'Visão geral' },
    ...visibleWorkspaces.map((workspace) => ({
      value: workspace.id,
      label: workspace.name
    }))
  ];

  const panelOptions: Array<{ value: RitualPanel; label: string }> = [
    { value: 'planejamento', label: 'Planejamento' },
    { value: 'revisao', label: 'Revisão semanal' },
    { value: 'mensal', label: 'Fechamento mensal' },
    { value: 'historico', label: 'Histórico' }
  ];

  const nextRequiredPanel: RitualPanel = !weeklyPlanConfigured
    ? 'planejamento'
    : reviewWindowOpen && !weeklyReviewSaved
      ? 'revisao'
      : monthlyWindowOpen && weeklyReviewSaved && !monthlyReviewSaved
        ? 'mensal'
        : 'historico';

  const nextRequiredCopy =
    nextRequiredPanel === 'planejamento'
      ? 'Definir energia por frente para iniciar a semana.'
      : nextRequiredPanel === 'revisao'
        ? 'Fechar a semana com decisão guiada e ações executáveis.'
        : nextRequiredPanel === 'mensal'
          ? 'Fechar o ciclo mensal e registrar ajuste estratégico.'
          : !reviewWindowOpen && !weeklyReviewSaved
            ? 'Sem pendências agora. A revisão semanal libera na sexta às 20h.'
            : !monthlyWindowOpen && !monthlyReviewSaved
              ? 'Sem pendências agora. O fechamento mensal libera no último dia do mês às 20h.'
            : 'Ritual completo. Revise histórico e padrões decisórios.';

  const ritualFlow = [
    {
      panel: 'planejamento' as const,
      label: 'Início da semana',
      title: 'Planejar energia',
      description: 'Alocação % por frente',
      done: weeklyPlanConfigured
    },
    {
      panel: 'revisao' as const,
      label: 'Fim da semana',
      title: 'Revisão executiva',
      description: 'Journal + compromissos',
      done: weeklyReviewSaved
    },
    {
      panel: 'mensal' as const,
      label: 'Fechamento de ciclo',
      title: 'Revisão mensal',
      description: monthlyWindowOpen ? 'Síntese + decisão do mês' : 'Disponível no fim do mês',
      done: monthlyReviewSaved || !monthlyWindowOpen
    }
  ];

  if (!ready) {
    return (
      <PremiumPage>
        <PremiumHeader
          eyebrow="Cadência"
          title="Ritual semanal"
          subtitle="Planejamento, revisão e fechamento com histórico contínuo."
        />
        <PremiumCard title="Ritmo da semana">
          <SkeletonBlock lines={4} />
        </PremiumCard>
      </PremiumPage>
    );
  }

  return (
    <PremiumPage>
      <PremiumHeader
        eyebrow="Cadência"
        title="Ritual semanal"
        subtitle="Planejamento, revisão e fechamento com histórico contínuo."
      />

      {error && <p className="surface-error">{error}</p>}
      {ritualNotice && <p className="ritual-notice">{ritualNotice}</p>}

      <PremiumCard title="Ritmo da semana" subtitle={`Escopo: ${selectedWorkspace?.name ?? 'Visão geral'}`}>
        <div className="ritual-scope-grid">
          <label>
            Escopo estratégico
            <select value={selectedWorkspaceId} onChange={(event) => selectScope(event.target.value)}>
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semana de referência
            <input type="date" value={weekStart} onChange={(event) => changeWeek(event.target.value)} />
          </label>
          <div className="inline-actions ritual-scope-actions">
            <button type="button" className="ghost-button" onClick={() => changeWeek(shiftIsoDate(weekStart, -7), { force: true })}>
              Semana anterior
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!weekClosed}
              onClick={() => changeWeek(shiftIsoDate(weekStart, 7))}
            >
              Próxima semana
            </button>
            <button type="button" className="ghost-button" onClick={() => changeWeek(currentWeekStartIso())}>
              Semana atual
            </button>
            <button type="button" className="ghost-button" onClick={() => setRitualPanel(nextRequiredPanel)}>
              Ir para etapa obrigatória
            </button>
            <button
              type="button"
              className={weekClosed ? 'ghost-button' : 'success-button'}
              disabled={weekClosed || weeklyCompletionPercent < 100 || (!reviewWindowOpen && !weeklyReviewSaved)}
              onClick={closeWeek}
              title={!reviewWindowOpen && !weeklyReviewSaved ? 'Disponível na sexta às 20h' : undefined}
            >
              {weekClosed ? 'Semana fechada' : 'Fechar semana'}
            </button>
          </div>
        </div>

        <div className="ritual-flow-board">
          {ritualFlow.map((step) => (
            <button
              key={step.panel}
              type="button"
              className={`ritual-flow-step ${ritualPanel === step.panel ? 'active' : ''} ${step.done ? 'done' : 'pending'}`}
              onClick={() => setRitualPanel(step.panel)}
            >
              <small>{step.label}</small>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
              <em>{step.done ? 'Concluída' : 'Pendente'}</em>
            </button>
          ))}
        </div>

          <div className="premium-metric-grid mini">
            <div className="premium-metric tone-default">
              <span>Planejamento semanal</span>
              <strong>{weeklyPlanConfigured ? 'Concluído' : 'Pendente'}</strong>
            </div>
          <div className="premium-metric tone-default">
            <span>Revisão semanal</span>
            <strong>{weeklyReviewSaved ? 'Concluída' : 'Pendente'}</strong>
          </div>
          <div className="premium-metric tone-default">
            <span>Fechamento mensal</span>
            <strong>{monthlyReviewSaved ? 'Concluído' : 'Pendente'}</strong>
          </div>
            <div className="premium-metric tone-default">
              <span>Completude do ritual</span>
              <strong>{weeklyCompletionPercent}%</strong>
              <small>
                {weeklyClosingDone}/{weeklyClosingChecklist.length} itens do encerramento semanal.
              </small>
            </div>
          </div>

        <p className="ritual-next-required">
          <strong>Próxima ação obrigatória:</strong> {nextRequiredCopy}
        </p>
        {mandatoryPendingItems.length > 0 && (
          <div className="ritual-pending-stack">
            <strong>Pendências obrigatórias agora</strong>
            <ul>
              {mandatoryPendingItems.map((item) => (
                <li key={`mandatory-${item.key}`}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => resolvePendingItem(item.key, item.panel)}
                  >
                    {item.actionLabel}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="ritual-week-lock">
          <strong>Status do ciclo:</strong>{' '}
          {weekClosed
            ? `Fechado em ${new Date(weekClosedAt as string).toLocaleString('pt-BR')}`
            : !reviewWindowOpen && !weeklyReviewSaved
              ? 'Aberto. Sem pendências de revisão até sexta às 20h.'
              : 'Aberto. Feche a semana para liberar o avanço.'}
        </p>

        <TabSwitch value={ritualPanel} onChange={setRitualPanel} options={panelOptions} />
      </PremiumCard>

      {ritualPanel === 'planejamento' && (
        <PremiumCard title="Planejamento da semana" subtitle={`Semana iniciando em ${weekStart}`}>
          <div className="inline-actions ritual-panel-actions">
            <button type="button" disabled={!allocationDirty || busy} onClick={saveWeeklyAllocation}>
              Salvar planejamento semanal
            </button>
          </div>

          {!weeklyAllocation || weeklyAllocation.rows.length === 0 ? (
            <EmptyState
              title="Sem frentes para planejar"
              description="Crie frentes para definir alocação de energia por contexto."
            />
          ) : (
            <div className="ritual-allocation-grid">
              {weeklyAllocation.rows.map((entry) => (
                <article
                  key={entry.workspaceId}
                  className="ritual-allocation-card"
                  style={{ borderTopColor: entry.workspaceColor ?? '#2563EB' }}
                >
                  <header>
                    <strong>{entry.workspaceName}</strong>
                    <small>{workspaceModeLabel(entry.workspaceMode)}</small>
                  </header>
                  <div className="ritual-allocation-body">
                    <label className="ritual-allocation-input-wrap">
                      <span>Planejado (%)</span>
                      <div className="inline-actions">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          ref={(node) => {
                            allocationInputRefs.current[entry.workspaceId] = node;
                          }}
                          value={allocationDraft[entry.workspaceId] ?? 0}
                          onChange={(event) => updateAllocation(entry.workspaceId, event.target.value)}
                          className="allocation-input"
                        />
                        <small>%</small>
                      </div>
                    </label>
                    <div className="ritual-allocation-kpi">
                      <span>Executado</span>
                      <strong>
                        {entry.actualPercent}% • {entry.actualHours}h
                      </strong>
                    </div>
                    <div className="ritual-allocation-kpi">
                      <span>Delta</span>
                      <strong className={entry.deltaPercent > 0 ? 'delta-positive' : entry.deltaPercent < 0 ? 'delta-negative' : ''}>
                        {formatDeltaPercent(entry.deltaPercent)}
                      </strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {weeklyAllocation && (
            <div className="premium-metric-grid mini">
              <div className="premium-metric tone-default">
                <span>Planejado total</span>
                <strong>{weeklyAllocation.totals.plannedPercent}%</strong>
              </div>
              <div className="premium-metric tone-default">
                <span>Horas executadas</span>
                <strong>{weeklyAllocation.totals.actualHours}h</strong>
              </div>
              <div className="premium-metric tone-warning">
                <span>Desconexas</span>
                <strong>{weeklyAllocation.totals.disconnectedPercent}%</strong>
              </div>
              <div className="premium-metric tone-default">
                <span>Frentes planejadas</span>
                <strong>{weeklyAllocation.rows.length}</strong>
              </div>
            </div>
          )}
        </PremiumCard>
      )}

      {ritualPanel === 'revisao' && (
        <>
          <PremiumCard
            title="Checklist obrigatório de encerramento"
            subtitle={`Semana ${weekStart} • ${weeklyClosingDone}/${weeklyClosingChecklist.length} itens concluídos`}
          >
            <div className="ritual-checklist-head">
              <strong>{weeklyCompletionPercent}%</strong>
              <small>Progresso real desta semana</small>
            </div>
            <div className="ritual-progress">
              <span style={{ width: `${weeklyCompletionPercent}%` }} />
            </div>
            {weeklyPendingItems.length > 0 ? (
              <div className="ritual-pending-stack" ref={checklistFocusRef}>
                <strong>{weeklyPendingItems.length} pendência(s) obrigatória(s)</strong>
                <ul>
                  {weeklyPendingItems.map((item) => (
                    <li
                      key={`pending-${item.key}`}
                      className={highlightedChecklistKey === item.key ? 'ritual-focus-pulse' : undefined}
                    >
                      <div>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        title={item.actionLabel}
                        onClick={() => resolvePendingItem(item.key, item.panel)}
                      >
                        Resolver agora
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="ritual-pending-empty">
                {reviewWindowOpen || weeklyReviewSaved
                  ? 'Sem pendências. Semana pronta para fechamento.'
                  : 'Sem pendências agora. Revisão obrigatória libera na sexta às 20h.'}
              </p>
            )}
            <ul className="ritual-checklist-list">
              {weeklyClosingChecklist.map((item) => (
                <li
                  key={item.key}
                  className={`${item.done ? 'done' : 'pending'} ${highlightedChecklistKey === item.key ? 'ritual-focus-pulse' : ''}`}
                >
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </div>
                  <span className={`status-tag ${item.done ? 'feito' : 'backlog'}`}>{item.done ? 'OK' : 'Pendente'}</span>
                </li>
              ))}
            </ul>
          </PremiumCard>

          <section className="premium-grid two">
            <PremiumCard title="Resumo da semana" subtitle="dados objetivos para fechar o ciclo">
            {!weeklyReview ? (
              <SkeletonBlock lines={6} />
            ) : (
              <>
                <div className="premium-metric-grid mini">
                  <div className="premium-metric tone-default">
                    <span>Tarefas A concluídas</span>
                    <strong>{weeklyReview.summary.completedA}</strong>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Deep Work</span>
                    <strong>{weeklyReview.summary.deepWorkHours}h</strong>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Frente dominante</span>
                    <strong>{weeklyReview.summary.dominantWorkspace?.workspaceName ?? 'n/d'}</strong>
                  </div>
                  <div className="premium-metric tone-warning">
                    <span>Frente negligenciada</span>
                    <strong>{weeklyReview.summary.neglectedWorkspace?.workspaceName ?? 'n/d'}</strong>
                  </div>
                  <div className="premium-metric tone-warning">
                    <span>Frentes fantasma</span>
                    <strong>{weeklyReview.summary.ghostProjectsCount}</strong>
                  </div>
                  <div className="premium-metric tone-default">
                    <span>Gargalo dominante</span>
                    <strong>
                      {weeklyReview.summary.dominantBottleneck
                        ? `${weeklyReview.summary.dominantBottleneck.label} (${weeklyReview.summary.dominantBottleneck.percent}%)`
                        : 'Sem padrão'}
                    </strong>
                  </div>
                </div>
                <div className="ritual-insight-box">
                  <strong>Pergunta de fechamento</strong>
                  <p>{weeklyReview.question}</p>
                </div>
              </>
            )}
            </PremiumCard>

            <PremiumCard title="Journal obrigatório" subtitle="fim da semana: decisão + compromisso">
              {weeklyReview?.autoDraft && !weeklyJournal?.review?.updatedAt && (
                <div className="ritual-insight-box">
                  <strong>Rascunho automático (motor explicável)</strong>
                  <p>
                    Confiança {weeklyReview.autoDraft.confidence} • Baseado em: {weeklyReview.autoDraft.dataUsed.join(' • ')}
                  </p>
                  <div className="inline-actions">
                    <button type="button" className="ghost-button" onClick={applyWeeklyAutoDraft}>
                      Aplicar rascunho automático
                    </button>
                  </div>
                </div>
              )}
              <form className="minimal-form ritual-journal-form" onSubmit={saveWeeklyJournal}>
              <label>
                Prioridade da próxima semana
                <input
                  ref={weeklyPriorityRef}
                  value={weeklyDraft.nextPriority}
                  onChange={(event) =>
                    setWeeklyDraft((current) => ({
                      ...current,
                      nextPriority: event.target.value
                    }))
                  }
                  placeholder="Ex: Fechar estratégia comercial da frente X"
                />
              </label>

              <label>
                Decisão estratégica
                <input
                  ref={weeklyDecisionRef}
                  value={weeklyDraft.strategicDecision}
                  onChange={(event) =>
                    setWeeklyDraft((current) => ({
                      ...current,
                      strategicDecision: event.target.value
                    }))
                  }
                  placeholder="Ex: Cortar escopo Y e focar no projeto Z"
                />
              </label>

              <label>
                Nível de compromisso
                <select
                  value={weeklyDraft.commitmentLevel}
                  onChange={(event) =>
                    setWeeklyDraft((current) => ({
                      ...current,
                      commitmentLevel: event.target.value as CommitmentLevel
                    }))
                  }
                >
                  <option value="alto">Alto</option>
                  <option value="medio">Médio</option>
                  <option value="baixo">Baixo</option>
                </select>
              </label>

              <label>
                Ações executáveis (uma por linha)
                <textarea
                  ref={weeklyActionsRef}
                  value={weeklyDraft.actionItemsText}
                  onChange={(event) =>
                    setWeeklyDraft((current) => ({
                      ...current,
                      actionItemsText: event.target.value
                    }))
                  }
                  placeholder={'1. Definir Top 3\n2. Reservar blocos de deep work\n3. Fechar 1 tarefa A crítica'}
                />
              </label>

              <label>
                Reflexão objetiva
                <textarea
                  value={weeklyDraft.reflection}
                  onChange={(event) =>
                    setWeeklyDraft((current) => ({
                      ...current,
                      reflection: event.target.value
                    }))
                  }
                  placeholder="O que funcionou, o que travou e qual correção entra na próxima semana"
                />
              </label>

              <div className="inline-actions ritual-form-actions">
                <button ref={weeklySaveRef} type="submit" disabled={busy}>
                  Salvar revisão semanal
                </button>
                {weeklyJournal?.review?.updatedAt && (
                  <small>Atualizada em {new Date(weeklyJournal.review.updatedAt).toLocaleString('pt-BR')}</small>
                )}
              </div>
              </form>
            </PremiumCard>
          </section>
        </>
      )}

      {ritualPanel === 'mensal' && (
        <PremiumCard title="Fechamento mensal" subtitle={`Mês iniciado em ${monthStart}`}>
          <div className="inline-actions ritual-panel-actions">
            <label>
              Mês de referência
              <input type="date" value={monthStart} onChange={(event) => setMonthStart(event.target.value)} />
            </label>
            <button type="button" className="ghost-button" onClick={() => setMonthStart(currentMonthStartIso())}>
              Mês atual
            </button>
          </div>

          {!monthlyReview ? (
            <SkeletonBlock lines={6} />
          ) : (
            <>
              <div className="premium-metric-grid mini">
                <div className="premium-metric tone-default">
                  <span>Tarefas A concluídas</span>
                  <strong>{monthlyReview.summary.completedA}</strong>
                </div>
                <div className="premium-metric tone-default">
                  <span>Deep Work</span>
                  <strong>{monthlyReview.summary.deepWorkHours}h</strong>
                </div>
                <div className="premium-metric tone-default">
                  <span>Horas executadas</span>
                  <strong>{monthlyReview.summary.actualHours}h</strong>
                </div>
                <div className="premium-metric tone-default">
                  <span>Construção vs operação</span>
                  <strong>
                    {monthlyReview.composition.constructionPercent}% / {monthlyReview.composition.operationPercent}%
                  </strong>
                </div>
                <div className="premium-metric tone-warning">
                  <span>Frentes fantasma</span>
                  <strong>{monthlyReview.summary.ghostProjectsCount}</strong>
                </div>
                <div className="premium-metric tone-default">
                  <span>Gargalo dominante</span>
                  <strong>
                    {monthlyReview.summary.dominantBottleneck
                      ? `${monthlyReview.summary.dominantBottleneck.label} (${monthlyReview.summary.dominantBottleneck.percent}%)`
                      : 'Sem padrão'}
                  </strong>
                </div>
              </div>
              <div className="ritual-insight-box">
                <strong>Pergunta de fechamento</strong>
                <p>{monthlyReview.question}</p>
              </div>
            </>
          )}

          <form className="minimal-form ritual-journal-form" onSubmit={saveMonthlyJournal}>
            <label>
              Prioridade do próximo mês
              <input
                value={monthlyDraft.nextPriority}
                onChange={(event) =>
                  setMonthlyDraft((current) => ({
                    ...current,
                    nextPriority: event.target.value
                  }))
                }
                placeholder="Qual frente ganha energia no próximo mês"
              />
            </label>

            <label>
              Decisão de fechamento
              <input
                value={monthlyDraft.strategicDecision}
                onChange={(event) =>
                  setMonthlyDraft((current) => ({
                    ...current,
                    strategicDecision: event.target.value
                  }))
                }
                placeholder="Ex: Encerrar projeto A e reativar projeto B"
              />
            </label>

            <label>
              Nível de compromisso
              <select
                value={monthlyDraft.commitmentLevel}
                onChange={(event) =>
                  setMonthlyDraft((current) => ({
                    ...current,
                    commitmentLevel: event.target.value as CommitmentLevel
                  }))
                }
              >
                <option value="alto">Alto</option>
                <option value="medio">Médio</option>
                <option value="baixo">Baixo</option>
              </select>
            </label>

            <label>
              Plano mensal executável (uma linha por ação)
              <textarea
                value={monthlyDraft.actionItemsText}
                onChange={(event) =>
                  setMonthlyDraft((current) => ({
                    ...current,
                    actionItemsText: event.target.value
                  }))
                }
                placeholder={'1. Reduzir projetos ativos para 3\n2. Garantir deep work no principal\n3. Fechar 1 meta crítica'}
              />
            </label>

            <label>
              Reflexão de fechamento
              <textarea
                value={monthlyDraft.reflection}
                onChange={(event) =>
                  setMonthlyDraft((current) => ({
                    ...current,
                    reflection: event.target.value
                  }))
                }
                placeholder="Qual padrão invisível apareceu neste mês?"
              />
            </label>

            <div className="inline-actions ritual-form-actions">
              <button type="submit" disabled={busy}>Salvar fechamento mensal</button>
              {monthlyJournal?.review?.updatedAt && (
                <small>Atualizada em {new Date(monthlyJournal.review.updatedAt).toLocaleString('pt-BR')}</small>
              )}
            </div>
          </form>
        </PremiumCard>
      )}

      {ritualPanel === 'historico' && (
        <section className="premium-grid two">
          <PremiumCard title="Histórico semanal" subtitle="decisões e compromissos das últimas semanas">
            {weeklyHistory.length === 0 ? (
              <EmptyState
                title="Sem histórico semanal"
                description="Salve sua primeira revisão semanal para iniciar trilha de evolução."
              />
            ) : (
              <div className="ritual-history-list">
                {weeklyHistory.map((entry) => (
                  <article key={entry.id} className="ritual-history-card">
                    <header>
                      <strong>{entry.periodStart}</strong>
                      <span className="priority-chip">{commitmentLabel(entry.commitmentLevel)}</span>
                    </header>
                    <p>{entry.nextPriority ?? 'Sem prioridade definida'}</p>
                    {entry.strategicDecision && <small>Decisão: {entry.strategicDecision}</small>}
                    {entry.actionItems.length > 0 && (
                      <ul>
                        {entry.actionItems.slice(0, 3).map((item, index) => (
                          <li key={`${entry.id}-weekly-${index}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}
          </PremiumCard>

          <PremiumCard title="Histórico mensal" subtitle="fechamentos de ciclo e decisões de energia">
            {monthlyHistory.length === 0 ? (
              <EmptyState
                title="Sem histórico mensal"
                description="Salve o primeiro fechamento mensal para formar curva estratégica."
              />
            ) : (
              <div className="ritual-history-list">
                {monthlyHistory.map((entry) => (
                  <article key={entry.id} className="ritual-history-card">
                    <header>
                      <strong>{entry.periodStart}</strong>
                      <span className="priority-chip">{commitmentLabel(entry.commitmentLevel)}</span>
                    </header>
                    <p>{entry.nextPriority ?? 'Sem prioridade definida'}</p>
                    {entry.strategicDecision && <small>Decisão: {entry.strategicDecision}</small>}
                    {entry.actionItems.length > 0 && (
                      <ul>
                        {entry.actionItems.slice(0, 3).map((item, index) => (
                          <li key={`${entry.id}-monthly-${index}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}
          </PremiumCard>
        </section>
      )}
    </PremiumPage>
  );
}
