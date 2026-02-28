import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  VisibilityState,
  useReactTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, CheckCircle2, ChevronsUpDown, Filter, Rows2, Rows3, Trash2 } from 'lucide-react';

import { Task, TaskEnergy, TaskExecutionKind, TaskStatus, TaskType } from '../api';

type TaskIntelligenceTableProps = {
  tasks: Task[];
  selectedTaskId: string;
  busy: boolean;
  onSelectTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
};

const columnHelper = createColumnHelper<Task>();
const TASK_TABLE_COLUMNS_KEY = 'execution-os.tasks.table-columns';
const TASK_TABLE_FOCUS_KEY = 'execution-os.tasks.table-focus';
const TASK_TABLE_DENSITY_KEY = 'execution-os.tasks.table-density';
const TASK_TABLE_SORTING_KEY = 'execution-os.tasks.table-sorting';
const TASK_TABLE_FILTERS_KEY = 'execution-os.tasks.table-filters';
const TASK_TABLE_VIEWS_KEY = 'execution-os.tasks.table-views-v2';
const TASK_TABLE_ACTIVE_VIEW_KEY = 'execution-os.tasks.table-active-view-v2';

type TableFocusMode = 'all' | 'critical' | 'overdue' | 'waiting' | 'restricted' | 'flow';
type TableDensity = 'comfortable' | 'compact';

type AdvancedFilters = {
  workspaceId: 'all' | string;
  projectId: 'all' | '__none' | string;
  taskType: 'all' | TaskType;
  energyLevel: 'all' | TaskEnergy;
  executionKind: 'all' | TaskExecutionKind;
  status: 'all' | TaskStatus;
  connection: 'all' | 'connected' | 'disconnected';
};

type TableSnapshot = {
  focusMode: TableFocusMode;
  density: TableDensity;
  columnVisibility: VisibilityState;
  sorting: SortingState;
  filters: AdvancedFilters;
};

type SavedView = TableSnapshot & {
  id: string;
  name: string;
  updatedAt: string;
};

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  waiting: false
};

const DEFAULT_SORTING: SortingState = [
  { id: 'priority', desc: true },
  { id: 'title', desc: false }
];

const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  workspaceId: 'all',
  projectId: 'all',
  taskType: 'all',
  energyLevel: 'all',
  executionKind: 'all',
  status: 'all',
  connection: 'all'
};

const FOCUS_MODES: Array<{ value: TableFocusMode; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'critical', label: 'P4/P5' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'restricted', label: 'Restrições' },
  { value: 'flow', label: 'Em fluxo' }
];

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  const tag = element.tagName;
  return element.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isFocusMode(value: unknown): value is TableFocusMode {
  return (
    value === 'all' ||
    value === 'critical' ||
    value === 'overdue' ||
    value === 'waiting' ||
    value === 'restricted' ||
    value === 'flow'
  );
}

function isDensity(value: unknown): value is TableDensity {
  return value === 'comfortable' || value === 'compact';
}

function safeParse(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readStoredColumns(): VisibilityState {
  const parsed = safeParse(window.localStorage.getItem(TASK_TABLE_COLUMNS_KEY));
  if (!parsed || typeof parsed !== 'object') {
    return DEFAULT_COLUMN_VISIBILITY;
  }

  return {
    ...DEFAULT_COLUMN_VISIBILITY,
    ...(parsed as VisibilityState)
  };
}

function normalizeSorting(value: unknown): SortingState {
  if (!Array.isArray(value)) {
    return DEFAULT_SORTING;
  }

  const normalized = value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const candidate = entry as { id?: unknown; desc?: unknown };
      if (typeof candidate.id !== 'string') {
        return null;
      }
      return {
        id: candidate.id,
        desc: Boolean(candidate.desc)
      };
    })
    .filter((entry): entry is { id: string; desc: boolean } => Boolean(entry));

  return normalized.length ? normalized : DEFAULT_SORTING;
}

function readStoredSorting(): SortingState {
  return normalizeSorting(safeParse(window.localStorage.getItem(TASK_TABLE_SORTING_KEY)));
}

function sanitizeFilters(value: unknown): AdvancedFilters {
  if (!value || typeof value !== 'object') {
    return DEFAULT_ADVANCED_FILTERS;
  }

  const candidate = value as Partial<AdvancedFilters>;

  return {
    workspaceId: typeof candidate.workspaceId === 'string' ? candidate.workspaceId : 'all',
    projectId: typeof candidate.projectId === 'string' ? candidate.projectId : 'all',
    taskType: candidate.taskType === 'a' || candidate.taskType === 'b' || candidate.taskType === 'c' ? candidate.taskType : 'all',
    energyLevel:
      candidate.energyLevel === 'alta' || candidate.energyLevel === 'media' || candidate.energyLevel === 'baixa'
        ? candidate.energyLevel
        : 'all',
    executionKind:
      candidate.executionKind === 'construcao' || candidate.executionKind === 'operacao'
        ? candidate.executionKind
        : 'all',
    status:
      candidate.status === 'backlog' ||
      candidate.status === 'hoje' ||
      candidate.status === 'andamento' ||
      candidate.status === 'feito' ||
      candidate.status === 'arquivado'
        ? candidate.status
        : 'all',
    connection:
      candidate.connection === 'connected' || candidate.connection === 'disconnected' ? candidate.connection : 'all'
  };
}

function readStoredFilters(): AdvancedFilters {
  return sanitizeFilters(safeParse(window.localStorage.getItem(TASK_TABLE_FILTERS_KEY)));
}

function readStoredFocus(): TableFocusMode {
  const value = window.localStorage.getItem(TASK_TABLE_FOCUS_KEY);
  return isFocusMode(value) ? value : 'all';
}

function readStoredDensity(): TableDensity {
  const value = window.localStorage.getItem(TASK_TABLE_DENSITY_KEY);
  return isDensity(value) ? value : 'comfortable';
}

function sanitizeView(value: unknown): SavedView | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<SavedView>;
  if (typeof candidate.id !== 'string' || !candidate.id) {
    return null;
  }

  const name = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : 'Visão';

  return {
    id: candidate.id,
    name,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    focusMode: isFocusMode(candidate.focusMode) ? candidate.focusMode : 'all',
    density: isDensity(candidate.density) ? candidate.density : 'comfortable',
    columnVisibility:
      candidate.columnVisibility && typeof candidate.columnVisibility === 'object'
        ? ({ ...DEFAULT_COLUMN_VISIBILITY, ...(candidate.columnVisibility as VisibilityState) } as VisibilityState)
        : DEFAULT_COLUMN_VISIBILITY,
    sorting: normalizeSorting(candidate.sorting),
    filters: sanitizeFilters(candidate.filters)
  };
}

function readStoredViews(): SavedView[] {
  const parsed = safeParse(window.localStorage.getItem(TASK_TABLE_VIEWS_KEY));
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map(sanitizeView).filter((view): view is SavedView => Boolean(view));
}

function readStoredActiveViewId(): string | null {
  const value = window.localStorage.getItem(TASK_TABLE_ACTIVE_VIEW_KEY);
  return value && value.trim() ? value : null;
}

function formatDueDate(task: Task) {
  if (!task.dueDate) {
    return { label: 'Sem data', overdue: false };
  }

  const due = new Date(task.dueDate);
  const overdue = due.getTime() < Date.now() && task.status !== 'feito';
  return {
    label: due.toLocaleDateString('pt-BR'),
    overdue
  };
}

function generateViewId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function snapshotsEqual(left: TableSnapshot, right: TableSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function TaskIntelligenceTable({
  tasks,
  selectedTaskId,
  busy,
  onSelectTask,
  onCompleteTask,
  onDeleteTask
}: TaskIntelligenceTableProps) {
  const [sorting, setSorting] = useState<SortingState>(() => readStoredSorting());
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => readStoredColumns());
  const [focusMode, setFocusMode] = useState<TableFocusMode>(() => readStoredFocus());
  const [density, setDensity] = useState<TableDensity>(() => readStoredDensity());
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(() => readStoredFilters());
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => readStoredViews());
  const [activeViewId, setActiveViewId] = useState<string | null>(() => readStoredActiveViewId());

  const workspaceOptions = useMemo(() => {
    const byId = new Map<string, string>();

    for (const task of tasks) {
      const workspaceName = task.workspace?.name ?? 'Frente';
      byId.set(task.workspaceId, workspaceName);
    }

    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [tasks]);

  const projectOptions = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; workspaceName: string }>();

    for (const task of tasks) {
      if (!task.projectId || !task.project?.title) {
        continue;
      }

      if (advancedFilters.workspaceId !== 'all' && task.workspaceId !== advancedFilters.workspaceId) {
        continue;
      }

      byId.set(task.projectId, {
        id: task.projectId,
        title: task.project.title,
        workspaceName: task.workspace?.name ?? 'Frente'
      });
    }

    return Array.from(byId.values()).sort((left, right) => left.title.localeCompare(right.title, 'pt-BR'));
  }, [tasks, advancedFilters.workspaceId]);

  useEffect(() => {
    if (advancedFilters.workspaceId !== 'all') {
      const hasWorkspace = workspaceOptions.some((workspace) => workspace.id === advancedFilters.workspaceId);
      if (!hasWorkspace) {
        setAdvancedFilters((current) => ({ ...current, workspaceId: 'all', projectId: 'all' }));
        return;
      }
    }

    if (advancedFilters.projectId !== 'all' && advancedFilters.projectId !== '__none') {
      const hasProject = projectOptions.some((project) => project.id === advancedFilters.projectId);
      if (!hasProject) {
        setAdvancedFilters((current) => ({ ...current, projectId: 'all' }));
      }
    }
  }, [advancedFilters.workspaceId, advancedFilters.projectId, workspaceOptions, projectOptions]);

  const tableTasks = useMemo(() => {
    const now = Date.now();

    return tasks.filter((task) => {
      if (advancedFilters.workspaceId !== 'all' && task.workspaceId !== advancedFilters.workspaceId) {
        return false;
      }

      if (advancedFilters.projectId === '__none' && task.projectId) {
        return false;
      }

      if (
        advancedFilters.projectId !== 'all' &&
        advancedFilters.projectId !== '__none' &&
        task.projectId !== advancedFilters.projectId
      ) {
        return false;
      }

      if (advancedFilters.taskType !== 'all' && (task.taskType ?? 'b') !== advancedFilters.taskType) {
        return false;
      }

      if (advancedFilters.energyLevel !== 'all' && (task.energyLevel ?? 'media') !== advancedFilters.energyLevel) {
        return false;
      }

      if (advancedFilters.executionKind !== 'all' && (task.executionKind ?? 'operacao') !== advancedFilters.executionKind) {
        return false;
      }

      if (advancedFilters.status !== 'all' && task.status !== advancedFilters.status) {
        return false;
      }

      if (advancedFilters.connection === 'connected' && !task.projectId) {
        return false;
      }

      if (advancedFilters.connection === 'disconnected' && task.projectId) {
        return false;
      }

      if (focusMode === 'critical') {
        return task.priority >= 4 && task.status !== 'feito';
      }

      if (focusMode === 'overdue') {
        return Boolean(task.dueDate) && new Date(task.dueDate as string).getTime() < now && task.status !== 'feito';
      }

      if (focusMode === 'waiting') {
        return Boolean(task.waitingOnPerson?.trim()) && task.status !== 'feito';
      }

      if (focusMode === 'restricted') {
        const hasOpenRestriction = (task.restrictions ?? []).some((restriction) => restriction.status === 'aberta');
        return hasOpenRestriction && task.status !== 'feito';
      }

      if (focusMode === 'flow') {
        return task.status === 'hoje' || task.status === 'andamento';
      }

      return true;
    });
  }, [tasks, focusMode, advancedFilters]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('title', {
        id: 'title',
        header: 'Título',
        cell: (info) => {
          const task = info.row.original;
          return (
            <div className="smart-title-cell">
              <strong>{task.title}</strong>
              <small>
                {task.workspace?.name ?? 'Sem frente'} • {task.project?.title ?? 'Sem projeto'}
              </small>
            </div>
          );
        }
      }),
      columnHelper.accessor('priority', {
        id: 'priority',
        header: 'Prioridade',
        cell: (info) => {
          const task = info.row.original;
          return <span className={`priority-chip priority-${task.priority}`}>P{task.priority}</span>;
        }
      }),
      columnHelper.accessor((task) => task.taskType ?? 'b', {
        id: 'taskType',
        header: 'Tipo',
        cell: (info) => `Tipo ${String(info.getValue()).toUpperCase()}`
      }),
      columnHelper.accessor((task) => task.energyLevel ?? 'media', {
        id: 'energyLevel',
        header: 'Energia',
        cell: (info) => {
          const value = info.getValue();
          return value === 'alta' ? 'Alta' : value === 'baixa' ? 'Baixa' : 'Média';
        }
      }),
      columnHelper.accessor((task) => task.executionKind ?? 'operacao', {
        id: 'executionKind',
        header: 'Natureza',
        cell: (info) => (info.getValue() === 'construcao' ? 'Construção' : 'Operação')
      }),
      columnHelper.accessor((task) => task.estimatedMinutes ?? null, {
        id: 'estimatedMinutes',
        header: 'Tempo',
        cell: (info) => {
          const value = info.getValue();
          return value ? `${value} min` : <span className="smart-muted">-</span>;
        }
      }),
      columnHelper.accessor((task) => task.workspace?.name ?? '', {
        id: 'workspace',
        header: 'Frente',
        cell: (info) => info.getValue() || <span className="smart-muted">-</span>
      }),
      columnHelper.accessor((task) => task.project?.title ?? '', {
        id: 'project',
        header: 'Projeto',
        cell: (info) => info.getValue() || <span className="smart-muted">-</span>
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (info) => {
          const task = info.row.original;
          return <span className={`status-tag ${task.status}`}>{task.status}</span>;
        }
      }),
      columnHelper.accessor((task) => task.horizon ?? 'active', {
        id: 'horizon',
        header: 'Horizonte',
        cell: (info) => (info.getValue() === 'future' ? 'futuro' : 'ativo')
      }),
      columnHelper.accessor('dueDate', {
        id: 'dueDate',
        header: 'Prazo',
        cell: (info) => {
          const task = info.row.original;
          const due = formatDueDate(task);

          if (!task.dueDate) {
            return <span className="smart-muted">Sem data</span>;
          }

          return <span className={due.overdue ? 'smart-overdue' : undefined}>{due.label}</span>;
        }
      }),
      columnHelper.accessor((task) => task.waitingOnPerson ?? '', {
        id: 'waiting',
        header: 'Aguardando',
        cell: (info) => {
          const value = info.getValue();
          return value ? <span>{value}</span> : <span className="smart-muted">-</span>;
        }
      }),
      columnHelper.accessor(
        (task) => (task.restrictions ?? []).filter((restriction) => restriction.status === 'aberta').length,
        {
          id: 'restrictions',
          header: 'Restrições',
          cell: (info) => {
            const value = info.getValue();
            if (value <= 0) {
              return <span className="smart-muted">-</span>;
            }

            return <span className="restriction-chip">{value} aberta(s)</span>;
          }
        }
      ),
      columnHelper.display({
        id: 'actions',
        header: 'Ações',
        enableSorting: false,
        cell: (info) => {
          const task = info.row.original;

          return (
            <div className="inline-actions">
              <button
                type="button"
                className="ghost-button smart-row-action"
                disabled={busy || task.status === 'feito'}
                onClick={(event) => {
                  event.stopPropagation();
                  void onCompleteTask(task.id);
                }}
              >
                <CheckCircle2 size={14} />
                Concluir
              </button>
              <button
                type="button"
                className="text-button smart-row-action danger"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  void onDeleteTask(task.id);
                }}
              >
                <Trash2 size={14} />
                Excluir
              </button>
            </div>
          );
        }
      })
    ],
    [busy, onCompleteTask, onDeleteTask]
  );

  const currentSnapshot = useMemo<TableSnapshot>(
    () => ({
      focusMode,
      density,
      columnVisibility: { ...columnVisibility },
      sorting: [...sorting],
      filters: { ...advancedFilters }
    }),
    [focusMode, density, columnVisibility, sorting, advancedFilters]
  );

  const activeView = useMemo(
    () => (activeViewId ? savedViews.find((view) => view.id === activeViewId) ?? null : null),
    [savedViews, activeViewId]
  );

  const activeViewDirty = useMemo(() => {
    if (!activeView) {
      return false;
    }

    const viewSnapshot: TableSnapshot = {
      focusMode: activeView.focusMode,
      density: activeView.density,
      columnVisibility: activeView.columnVisibility,
      sorting: activeView.sorting,
      filters: activeView.filters
    };

    return !snapshotsEqual(viewSnapshot, currentSnapshot);
  }, [activeView, currentSnapshot]);

  function applySnapshot(snapshot: TableSnapshot) {
    setFocusMode(snapshot.focusMode);
    setDensity(snapshot.density);
    setColumnVisibility({ ...snapshot.columnVisibility });
    setSorting([...snapshot.sorting]);
    setAdvancedFilters({ ...snapshot.filters });
  }

  function handleViewSelect(value: string) {
    if (value === '__default') {
      setActiveViewId(null);
      return;
    }

    const next = savedViews.find((view) => view.id === value);
    if (!next) {
      return;
    }

    applySnapshot(next);
    setActiveViewId(next.id);
  }

  function saveAsNewView() {
    const suggestedName = activeView ? `${activeView.name} (cópia)` : 'Nova visão';
    const name = window.prompt('Nome da visão:', suggestedName);
    if (!name?.trim()) {
      return;
    }

    const nextView: SavedView = {
      id: generateViewId(),
      name: name.trim(),
      updatedAt: new Date().toISOString(),
      ...currentSnapshot
    };

    setSavedViews((current) => [nextView, ...current]);
    setActiveViewId(nextView.id);
  }

  function updateActiveView() {
    if (!activeViewId) {
      return;
    }

    setSavedViews((current) =>
      current.map((view) =>
        view.id === activeViewId
          ? {
              ...view,
              ...currentSnapshot,
              updatedAt: new Date().toISOString()
            }
          : view
      )
    );
  }

  function deleteActiveView() {
    if (!activeViewId) {
      return;
    }

    const shouldDelete = window.confirm('Excluir visão salva atual?');
    if (!shouldDelete) {
      return;
    }

    setSavedViews((current) => current.filter((view) => view.id !== activeViewId));
    setActiveViewId(null);
  }

  function clearAdvancedFilters() {
    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(TASK_TABLE_COLUMNS_KEY, JSON.stringify(columnVisibility));
      window.localStorage.setItem(TASK_TABLE_SORTING_KEY, JSON.stringify(sorting));
      window.localStorage.setItem(TASK_TABLE_FILTERS_KEY, JSON.stringify(advancedFilters));
      window.localStorage.setItem(TASK_TABLE_FOCUS_KEY, focusMode);
      window.localStorage.setItem(TASK_TABLE_DENSITY_KEY, density);
    } catch {
      // Ignore persistence failures.
    }
  }, [columnVisibility, sorting, advancedFilters, focusMode, density]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TASK_TABLE_VIEWS_KEY, JSON.stringify(savedViews));
    } catch {
      // Ignore persistence failures.
    }
  }, [savedViews]);

  useEffect(() => {
    try {
      if (activeViewId) {
        window.localStorage.setItem(TASK_TABLE_ACTIVE_VIEW_KEY, activeViewId);
      } else {
        window.localStorage.removeItem(TASK_TABLE_ACTIVE_VIEW_KEY);
      }
    } catch {
      // Ignore persistence failures.
    }
  }, [activeViewId]);

  const table = useReactTable({
    data: tableTasks,
    columns,
    state: {
      sorting,
      columnVisibility
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const rows = table.getRowModel().rows;
  const visibleColumnIds = table.getVisibleLeafColumns().map((column) => column.id);
  const columnTemplateById: Record<string, string> = {
    title: 'minmax(220px, 1.6fr)',
    priority: '92px',
    taskType: '90px',
    energyLevel: '96px',
    executionKind: '110px',
    estimatedMinutes: '96px',
    workspace: '120px',
    project: '140px',
    status: '110px',
    horizon: '94px',
    dueDate: '98px',
    waiting: '130px',
    restrictions: '130px',
    actions: '220px'
  };
  const columnMinWidthById: Record<string, number> = {
    title: 220,
    priority: 92,
    taskType: 90,
    energyLevel: 96,
    executionKind: 110,
    estimatedMinutes: 96,
    workspace: 120,
    project: 140,
    status: 110,
    horizon: 94,
    dueDate: 98,
    waiting: 130,
    restrictions: 130,
    actions: 220
  };
  const gridTemplate = visibleColumnIds
    .map((columnId) => columnTemplateById[columnId] ?? '1fr')
    .join(' ');
  const tableMinWidth = visibleColumnIds.reduce(
    (total, columnId) => total + (columnMinWidthById[columnId] ?? 120),
    0
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowEstimate = density === 'compact' ? 48 : 56;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimate,
    overscan: 8
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, rowEstimate, rows.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (document.querySelector('.modal-card, .command-palette, .radix-shortcuts-dialog')) {
        return;
      }

      if (!rows.length) {
        return;
      }

      if (event.key.toLowerCase() === 'j' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const selectedIndex = rows.findIndex((row) => row.original.id === selectedTaskId);
        if (selectedIndex < 0) {
          onSelectTask(rows[0].original.id);
          return;
        }
        const baseIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const nextIndex =
          event.key.toLowerCase() === 'j'
            ? Math.min(rows.length - 1, baseIndex + 1)
            : Math.max(0, baseIndex - 1);
        onSelectTask(rows[nextIndex].original.id);
        return;
      }

      if (event.key === 'Enter' && selectedTaskId) {
        const selectedExists = rows.some((row) => row.original.id === selectedTaskId);
        if (selectedExists) {
          event.preventDefault();
          onSelectTask(selectedTaskId);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rows, selectedTaskId, onSelectTask]);

  return (
    <section className="smart-table-shell" aria-label="Tabela inteligente de tarefas">
      <header className="smart-toolbar">
        <div className="smart-toolbar-main">
          <div className="smart-viewbar">
            <span className="smart-view-label">Visão</span>
            <select value={activeViewId ?? '__default'} onChange={(event) => handleViewSelect(event.target.value)}>
              <option value="__default">Padrão</option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
            <button type="button" className="ghost-button smart-view-action" onClick={saveAsNewView}>
              Salvar nova
            </button>
            <button
              type="button"
              className="ghost-button smart-view-action"
              disabled={!activeViewId || !activeViewDirty}
              onClick={updateActiveView}
            >
              Atualizar
            </button>
            <button
              type="button"
              className="ghost-button smart-view-action"
              disabled={!activeViewId}
              onClick={deleteActiveView}
            >
              Excluir
            </button>
            {activeView && activeViewDirty && <span className="smart-view-dirty">Alterada</span>}
          </div>

          <span>{rows.length} tarefas na visão atual</span>

          <div className="smart-focus-filters">
            {FOCUS_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={focusMode === mode.value ? 'smart-focus-chip active' : 'smart-focus-chip'}
                onClick={() => setFocusMode(mode.value)}
              >
                <Filter size={12} />
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="smart-toolbar-actions">
          <button type="button" className="ghost-button smart-view-action" onClick={clearAdvancedFilters}>
            Limpar filtros
          </button>

          <div className="smart-density-switch" role="group" aria-label="Densidade da tabela">
            <button
              type="button"
              className={density === 'comfortable' ? 'smart-density-chip active' : 'smart-density-chip'}
              onClick={() => setDensity('comfortable')}
              title="Densidade confortável"
            >
              <Rows3 size={13} />
            </button>
            <button
              type="button"
              className={density === 'compact' ? 'smart-density-chip active' : 'smart-density-chip'}
              onClick={() => setDensity('compact')}
              title="Densidade compacta"
            >
              <Rows2 size={13} />
            </button>
          </div>

          <details className="smart-columns-menu">
            <summary>Colunas</summary>
            <div>
              {table
                .getAllLeafColumns()
                .filter((column) => column.id !== 'actions')
                .map((column) => (
                  <label key={column.id}>
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                    />
                    {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
                  </label>
                ))}
            </div>
          </details>
        </div>
      </header>

      <div className="smart-advanced-filters" role="group" aria-label="Filtros avançados da tabela">
        <select
          value={advancedFilters.workspaceId}
          onChange={(event) =>
            setAdvancedFilters((current) => ({
              ...current,
              workspaceId: event.target.value,
              projectId: 'all'
            }))
          }
        >
          <option value="all">Todas frentes</option>
          {workspaceOptions.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>

        <select
          value={advancedFilters.projectId}
          onChange={(event) =>
            setAdvancedFilters((current) => ({
              ...current,
              projectId: event.target.value
            }))
          }
        >
          <option value="all">Todos projetos</option>
          <option value="__none">Sem projeto</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title} ({project.workspaceName})
            </option>
          ))}
        </select>

        <select
          value={advancedFilters.taskType}
          onChange={(event) =>
            setAdvancedFilters((current) => ({
              ...current,
              taskType: event.target.value as AdvancedFilters['taskType']
            }))
          }
        >
          <option value="all">Todos tipos</option>
          <option value="a">Tipo A</option>
          <option value="b">Tipo B</option>
          <option value="c">Tipo C</option>
        </select>

        <select
          value={advancedFilters.energyLevel}
          onChange={(event) =>
            setAdvancedFilters((current) => ({
              ...current,
              energyLevel: event.target.value as AdvancedFilters['energyLevel']
            }))
          }
        >
          <option value="all">Toda energia</option>
          <option value="alta">Energia alta</option>
          <option value="media">Energia média</option>
          <option value="baixa">Energia baixa</option>
        </select>

        <select
          value={advancedFilters.executionKind}
          onChange={(event) =>
            setAdvancedFilters((current) => ({
              ...current,
              executionKind: event.target.value as AdvancedFilters['executionKind']
            }))
          }
        >
          <option value="all">Toda natureza</option>
          <option value="construcao">Construção</option>
          <option value="operacao">Operação</option>
        </select>

        <select
          value={advancedFilters.status}
          onChange={(event) =>
            setAdvancedFilters((current) => ({
              ...current,
              status: event.target.value as AdvancedFilters['status']
            }))
          }
        >
          <option value="all">Todos status</option>
          <option value="backlog">Backlog</option>
          <option value="hoje">Hoje</option>
          <option value="andamento">Andamento</option>
          <option value="feito">Concluídas</option>
        </select>

        <select
          value={advancedFilters.connection}
          onChange={(event) =>
            setAdvancedFilters((current) => ({
              ...current,
              connection: event.target.value as AdvancedFilters['connection']
            }))
          }
        >
          <option value="all">Conexão livre</option>
          <option value="connected">Com projeto</option>
          <option value="disconnected">Desconexas</option>
        </select>
      </div>

      <div className="smart-table-scroll">
        <div className="smart-table-grid" style={{ minWidth: `${tableMinWidth}px` }}>
          <div className="smart-table-head" style={{ gridTemplateColumns: gridTemplate }}>
            {table.getFlatHeaders().map((header) => {
              const sort = header.column.getIsSorted();
              const canSort = header.column.getCanSort();
              return (
                <button
                  key={header.id}
                  type="button"
                  className={`smart-head-cell col-${header.column.id}`}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                >
                  <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                  {canSort ? sort === 'asc' ? (
                    <ArrowUp size={13} />
                  ) : sort === 'desc' ? (
                    <ArrowDown size={13} />
                  ) : (
                    <ChevronsUpDown size={13} />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div ref={scrollRef} className={density === 'compact' ? 'smart-table-body compact' : 'smart-table-body'}>
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                const selected = row.original.id === selectedTaskId;

                return (
                  <article
                    key={row.id}
                    className={
                      selected
                        ? density === 'compact'
                          ? 'smart-table-row selected compact'
                          : 'smart-table-row selected'
                        : density === 'compact'
                          ? 'smart-table-row compact'
                          : 'smart-table-row'
                    }
                    style={{ transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: gridTemplate }}
                    onClick={() => onSelectTask(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className={
                          density === 'compact'
                            ? `smart-cell compact col-${cell.column.id}`
                            : `smart-cell col-${cell.column.id}`
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <footer className="smart-hints">
        <span>J/K navega na tabela</span>
        <span>Enter abre detalhe</span>
        <span>Visões salvas mantêm colunas + filtros + foco</span>
      </footer>
    </section>
  );
}
