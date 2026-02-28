import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  CircleHelp,
  Command,
  Copy,
  Gauge,
  Inbox,
  Keyboard,
  LaptopMinimalCheck,
  Layers3,
  LayoutDashboard,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

import { api, Gamification, Workspace } from '../api';
import { ShellContext } from './shell-context';

type NavItem = {
  to: string;
  label: string;
  caption: string;
  icon: typeof LayoutDashboard;
};

type CommandItem = {
  id: string;
  group: 'Navegação' | 'Contexto' | 'Ações rápidas';
  label: string;
  hint: string;
  keywords: string;
  icon: typeof LayoutDashboard;
  run: () => Promise<void> | void;
};

type ShortcutItem = {
  keys: string;
  label: string;
};

const SIDEBAR_STORAGE_KEY = 'execution-os.sidebar-collapsed';
const RECENT_COMMAND_STORAGE_KEY = 'execution-os.recent-commands';
const RITUAL_CLOSURE_STORAGE_KEY = 'execution-os.ritual-week-closures';
const BACKEND_COMMAND = 'npm run dev:api';
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function readStoredSidebarState() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readStoredRecentCommands() {
  try {
    const value = window.localStorage.getItem(RECENT_COMMAND_STORAGE_KEY);
    if (!value) {
      return [] as string[];
    }

    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, 10);
  } catch {
    return [] as string[];
  }
}

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

const links: NavItem[] = [
  { to: '/', label: 'Dashboard', caption: 'Resumo geral', icon: LayoutDashboard },
  { to: '/hoje', label: 'Hoje', caption: 'Execução diária', icon: CalendarCheck2 },
  { to: '/amanha', label: 'Amanhã', caption: 'Agenda futura', icon: CalendarDays },
  { to: '/ritual', label: 'Ritual', caption: 'Planejamento semanal', icon: LaptopMinimalCheck },
  { to: '/workspaces', label: 'Frentes', caption: 'Contextos', icon: Layers3 },
  { to: '/projetos', label: 'Projetos', caption: 'Entregas', icon: BriefcaseBusiness },
  { to: '/tarefas', label: 'Tarefas', caption: 'Backlog e detalhe', icon: ListTodo },
  { to: '/gamificacao', label: 'Gamificação', caption: 'Performance', icon: Gauge }
];

const GO_ROUTE_MAP: Record<string, string> = {
  d: '/',
  h: '/hoje',
  a: '/amanha',
  r: '/ritual',
  f: '/workspaces',
  w: '/workspaces',
  p: '/projetos',
  t: '/tarefas',
  g: '/gamificacao'
};

function formatToday() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  const tag = element.tagName;
  return element.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const commandInputRef = useRef<HTMLInputElement>(null);
  const quickCaptureInputRef = useRef<HTMLInputElement>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredSidebarState());
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [gamification, setGamification] = useState<Gamification | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('all');
  const [quickCapture, setQuickCapture] = useState('');
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [goPrefixActive, setGoPrefixActive] = useState(false);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>(() => readStoredRecentCommands());
  const [ritualPendingCount, setRitualPendingCount] = useState(0);
  const [ritualWeekClosed, setRitualWeekClosed] = useState(false);
  const [ritualPendingLabel, setRitualPendingLabel] = useState<string | null>(null);
  const [ritualReviewWindowOpen, setRitualReviewWindowOpen] = useState(true);
  const goPrefixTimeoutRef = useRef<number | null>(null);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== 'geral'),
    [workspaces]
  );

  const activeRoute =
    links.find((link) => (link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to))) ??
    links[0];
  const isTaskTableFocusRoute =
    location.pathname === '/tarefas' && new URLSearchParams(location.search).get('focus') === '1';

  async function refreshGlobal() {
    const weekStart = currentWeekStartIso();
    const monthStart = currentMonthStartIso();
    const [workspaceData, gamificationData, weeklyAllocation, weeklyJournal, monthlyJournal] = await Promise.all([
      api.getWorkspaces(),
      api.getGamification(),
      api.getWeeklyAllocation({ weekStart }),
      api.getReviewJournal({
        periodType: 'weekly',
        periodStart: weekStart
      }),
      api.getReviewJournal({
        periodType: 'monthly',
        periodStart: monthStart
      })
    ]);

    const selectableWorkspaceIds = new Set(
      workspaceData.filter((workspace) => workspace.type !== 'geral').map((workspace) => workspace.id)
    );

    setWorkspaces(workspaceData);
    setGamification(gamificationData);

    const planningDone = weeklyAllocation.rows.some((entry) => entry.plannedPercent > 0);
    const reviewDone = Boolean(weeklyJournal.review?.updatedAt);
    const reviewWindowOpen = isWeeklyReviewWindowOpen(weekStart);
    const monthlyDone = Boolean(monthlyJournal.review?.updatedAt);
    const monthlyWindowOpen = isMonthlyReviewWindowOpen(monthStart);
    const pendingLabels: string[] = [];

    if (!planningDone) {
      pendingLabels.push('Definir planejamento semanal');
    }

    if (reviewWindowOpen && !reviewDone) {
      pendingLabels.push('Salvar revisão semanal');
    }

    if (monthlyWindowOpen && !monthlyDone) {
      pendingLabels.push('Salvar fechamento mensal');
    }

    const pendingCount = pendingLabels.length;
    const closedWeeks = readClosedWeeks();
    const isClosed = Boolean(closedWeeks[`all:${weekStart}`] && pendingCount === 0);

    setRitualPendingCount(pendingCount);
    setRitualWeekClosed(isClosed);
    setRitualPendingLabel(pendingLabels[0] ?? null);
    setRitualReviewWindowOpen(reviewWindowOpen);

    if (activeWorkspaceId !== 'all' && !selectableWorkspaceIds.has(activeWorkspaceId)) {
      setActiveWorkspaceId('all');
    }
  }

  useEffect(() => {
    refreshGlobal().catch((error: Error) => {
      toast.error(error.message);
    });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore persistence failures.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        RECENT_COMMAND_STORAGE_KEY,
        JSON.stringify(recentCommandIds.slice(0, 10))
      );
    } catch {
      // Ignore persistence failures.
    }
  }, [recentCommandIds]);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (goPrefixTimeoutRef.current) {
        window.clearTimeout(goPrefixTimeoutRef.current);
      }
    };
  }, []);

  const pingApi = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        cache: 'no-store'
      });
      setApiOnline(response.ok);
    } catch {
      setApiOnline(false);
    }
  }, []);

  useEffect(() => {
    void pingApi();
    const intervalId = window.setInterval(() => {
      void pingApi();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [pingApi]);

  async function handleQuickCapture(event: FormEvent) {
    event.preventDefault();

    if (!quickCapture.trim()) {
      return;
    }

    try {
      await api.createInboxItem(quickCapture.trim(), 'app');
      setQuickCapture('');
      toast.success('Capturado na inbox.');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const closeCommandPalette = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery('');
    setCommandBusy(false);
    setCommandIndex(0);
  }, []);

  const openCommandPalette = useCallback(() => {
    setCommandOpen(true);
    setCommandQuery('');
    setCommandIndex(0);
  }, []);

  const copyBackendCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(BACKEND_COMMAND);
      toast.success('Comando do backend copiado.');
    } catch {
      toast.error('Não foi possível copiar o comando.');
    }
  }, []);

  const focusCaptureInput = useCallback(() => {
    quickCaptureInputRef.current?.focus();
  }, []);

  const openTaskComposer = useCallback(() => {
    navigate('/tarefas?compose=1');
  }, [navigate]);

  const openTaskFocus = useCallback(() => {
    navigate('/tarefas?focus=1');
  }, [navigate]);

  const toggleTaskComposer = useCallback(() => {
    if (location.pathname !== '/tarefas') {
      navigate('/tarefas?compose=1');
      return;
    }

    const params = new URLSearchParams(location.search);
    const isComposeOpen = params.get('compose') === '1';

    if (isComposeOpen) {
      params.delete('compose');
    } else {
      params.set('compose', '1');
    }

    const query = params.toString();
    navigate(query ? `/tarefas?${query}` : '/tarefas');
  }, [location.pathname, location.search, navigate]);

  const toggleTaskFocus = useCallback(() => {
    if (location.pathname !== '/tarefas') {
      navigate('/tarefas?focus=1');
      return;
    }

    const params = new URLSearchParams(location.search);
    const isFocusOpen = params.get('focus') === '1';

    if (isFocusOpen) {
      params.delete('focus');
    } else {
      params.set('focus', '1');
    }

    const query = params.toString();
    navigate(query ? `/tarefas?${query}` : '/tarefas');
  }, [location.pathname, location.search, navigate]);

  const cycleWorkspace = useCallback(
    (direction: 'next' | 'prev') => {
      const ordered = ['all', ...visibleWorkspaces.map((workspace) => workspace.id)];
      const currentIndex = Math.max(0, ordered.indexOf(activeWorkspaceId));
      const nextIndex =
        direction === 'next'
          ? (currentIndex + 1) % ordered.length
          : (currentIndex - 1 + ordered.length) % ordered.length;
      setActiveWorkspaceId(ordered[nextIndex]);
    },
    [activeWorkspaceId, visibleWorkspaces]
  );

  const navigationCommands: CommandItem[] = useMemo(
    () =>
      links.map((link) => ({
        id: `nav-${link.to}`,
        group: 'Navegação',
        label: `Ir para ${link.label}`,
        hint: link.caption,
        keywords: `${link.label} ${link.caption} ${link.to}`.toLowerCase(),
        icon: link.icon,
        run: () => {
          navigate(link.to);
          closeCommandPalette();
        }
      })),
    [navigate]
  );

  const workspaceCommands: CommandItem[] = useMemo(
    () =>
      visibleWorkspaces.map((workspace) => ({
        id: `ws-${workspace.id}`,
        group: 'Contexto',
        label: `Contexto: ${workspace.name}`,
        hint: 'trocar frente ativa',
        keywords: `frente workspace contexto ${workspace.name}`.toLowerCase(),
        icon: Layers3,
        run: () => {
          setActiveWorkspaceId(workspace.id);
          closeCommandPalette();
        }
      })),
    [visibleWorkspaces]
  );

  const actionCommands: CommandItem[] = useMemo(
    () => [
      {
        id: 'action-new-task',
        group: 'Ações rápidas',
        label: 'Nova tarefa instantânea',
        hint: 'abre modal de criação na aba tarefas',
        keywords: 'nova tarefa criar task compose inbox backlog'.toLowerCase(),
        icon: ListTodo,
        run: () => {
          openTaskComposer();
          closeCommandPalette();
        }
      },
      {
        id: 'action-task-focus',
        group: 'Ações rápidas',
        label: 'Foco na lista de tarefas',
        hint: 'abre tabela virtualizada em tela limpa',
        keywords: 'tarefas foco tabela virtualizada execucao profunda'.toLowerCase(),
        icon: ListTodo,
        run: () => {
          openTaskFocus();
          closeCommandPalette();
        }
      },
      {
        id: 'action-focus-capture',
        group: 'Ações rápidas',
        label: 'Focar campo de captura',
        hint: 'atalho para registrar rápido',
        keywords: 'captura inbox foco input rapido'.toLowerCase(),
        icon: Inbox,
        run: () => {
          quickCaptureInputRef.current?.focus();
          closeCommandPalette();
        }
      },
      {
        id: 'action-toggle-sidebar',
        group: 'Ações rápidas',
        label: sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar',
        hint: 'ajusta densidade da navegação',
        keywords: 'sidebar menu layout densidade colapsar expandir'.toLowerCase(),
        icon: sidebarCollapsed ? PanelLeftOpen : PanelLeftClose,
        run: () => {
          setSidebarCollapsed((current) => !current);
          closeCommandPalette();
        }
      },
      {
        id: 'action-context-all',
        group: 'Ações rápidas',
        label: 'Contexto: todos',
        hint: 'volta para visão geral',
        keywords: 'contexto todos geral reset'.toLowerCase(),
        icon: Layers3,
        run: () => {
          setActiveWorkspaceId('all');
          closeCommandPalette();
        }
      },
      {
        id: 'action-copy-backend',
        group: 'Ações rápidas',
        label: 'Copiar comando do backend',
        hint: BACKEND_COMMAND,
        keywords: 'backend api comando terminal copiar'.toLowerCase(),
        icon: Copy,
        run: async () => {
          await copyBackendCommand();
          closeCommandPalette();
        }
      },
      {
        id: 'action-shortcuts',
        group: 'Ações rápidas',
        label: 'Abrir atalhos de teclado',
        hint: 'cheatsheet global',
        keywords: 'atalhos teclado cheatsheet ajuda'.toLowerCase(),
        icon: Keyboard,
        run: () => {
          setShortcutsOpen(true);
          closeCommandPalette();
        }
      }
    ],
    [closeCommandPalette, copyBackendCommand, openTaskComposer, openTaskFocus, sidebarCollapsed]
  );

  const commandItems = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    const items = [...navigationCommands, ...workspaceCommands, ...actionCommands];

    if (!query) {
      const recentItems = recentCommandIds
        .map((commandId) => items.find((item) => item.id === commandId))
        .filter((item): item is CommandItem => Boolean(item));
      const remaining = items.filter((item) => !recentCommandIds.includes(item.id));
      return [...recentItems, ...remaining].slice(0, 12);
    }

    return items
      .filter((item) => item.keywords.includes(query) || item.label.toLowerCase().includes(query))
      .slice(0, 12);
  }, [commandQuery, navigationCommands, workspaceCommands, actionCommands, recentCommandIds]);

  const captureCommand: CommandItem | null = useMemo(() => {
    const text = commandQuery.trim();
    if (text.length < 3) {
      return null;
    }

    return {
      id: 'capture',
      group: 'Ações rápidas',
      label: `Capturar: ${text}`,
      hint: 'enviar para inbox',
      keywords: `capturar inbox ${text}`.toLowerCase(),
      icon: Inbox,
      run: async () => {
        await api.createInboxItem(text, 'app');
        toast.success('Capturado via Command Palette.');
        closeCommandPalette();
      }
    };
  }, [commandQuery, closeCommandPalette]);

  const visibleCommands = captureCommand ? [captureCommand, ...commandItems] : commandItems;
  const commandIndexById = useMemo(
    () => new Map(visibleCommands.map((item, index) => [item.id, index])),
    [visibleCommands]
  );
  const groupedCommands = useMemo(() => {
    const groups: Array<{ key: CommandItem['group']; items: CommandItem[] }> = [
      { key: 'Ações rápidas', items: [] },
      { key: 'Navegação', items: [] },
      { key: 'Contexto', items: [] }
    ];

    visibleCommands.forEach((item) => {
      const targetGroup = groups.find((group) => group.key === item.group);
      if (targetGroup) {
        targetGroup.items.push(item);
      }
    });

    return groups.filter((group) => group.items.length > 0);
  }, [visibleCommands]);

  async function runCommand(item: CommandItem) {
    try {
      setCommandBusy(true);
      await item.run();
      setRecentCommandIds((current) => [item.id, ...current.filter((entry) => entry !== item.id)].slice(0, 10));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCommandBusy(false);
    }
  }

  function onCommandSubmit(event: FormEvent) {
    event.preventDefault();
    const selected = visibleCommands[commandIndex] ?? visibleCommands[0];
    if (!selected) {
      return;
    }
    void runCommand(selected);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (commandOpen) {
          closeCommandPalette();
        } else {
          openCommandPalette();
        }
        return;
      }

      if (event.key === 'Escape') {
        if (commandOpen) {
          closeCommandPalette();
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        }
        return;
      }

      if (commandOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCommandIndex((current) => {
            if (!visibleCommands.length) {
              return 0;
            }
            return current >= visibleCommands.length - 1 ? 0 : current + 1;
          });
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCommandIndex((current) => {
            if (!visibleCommands.length) {
              return 0;
            }
            return current <= 0 ? visibleCommands.length - 1 : current - 1;
          });
        }

        return;
      }

      const key = event.key.toLowerCase();
      const typing = isTypingTarget(event.target);

      if (!typing && event.key === '?') {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (typing) {
        return;
      }

      if (goPrefixActive) {
        setGoPrefixActive(false);
        if (goPrefixTimeoutRef.current) {
          window.clearTimeout(goPrefixTimeoutRef.current);
          goPrefixTimeoutRef.current = null;
        }

        const route = GO_ROUTE_MAP[key];
        if (route) {
          event.preventDefault();
          navigate(route);
        }
        return;
      }

      if (key === 'g') {
        event.preventDefault();
        setGoPrefixActive(true);
        if (goPrefixTimeoutRef.current) {
          window.clearTimeout(goPrefixTimeoutRef.current);
        }
        goPrefixTimeoutRef.current = window.setTimeout(() => {
          setGoPrefixActive(false);
          goPrefixTimeoutRef.current = null;
        }, 900);
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        openCommandPalette();
        return;
      }

      if (key === 'c') {
        event.preventDefault();
        focusCaptureInput();
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        toggleTaskComposer();
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        toggleTaskFocus();
        return;
      }

      if (key === 's') {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        cycleWorkspace('prev');
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        cycleWorkspace('next');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    commandOpen,
    visibleCommands,
    closeCommandPalette,
    openCommandPalette,
    shortcutsOpen,
    goPrefixActive,
    navigate,
    focusCaptureInput,
    toggleTaskComposer,
    toggleTaskFocus,
    cycleWorkspace
  ]);

  useEffect(() => {
    if (!commandOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      commandInputRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [commandOpen]);

  useEffect(() => {
    if (!commandOpen) {
      return;
    }
    setCommandIndex(0);
  }, [commandOpen, commandQuery]);

  useEffect(() => {
    if (commandIndex >= visibleCommands.length) {
      setCommandIndex(0);
    }
  }, [visibleCommands.length, commandIndex]);

  const shortcuts: ShortcutItem[] = [
    { keys: 'Cmd/Ctrl + K', label: 'Abrir Command Palette' },
    { keys: '/', label: 'Abrir Command Palette (modo rápido)' },
    { keys: '?', label: 'Abrir painel de atalhos' },
    { keys: 'C', label: 'Focar campo de captura' },
    { keys: 'N', label: 'Abrir/fechar nova tarefa' },
    { keys: 'F', label: 'Entrar/sair do foco total da tabela' },
    { keys: 'S', label: 'Colapsar/expandir sidebar' },
    { keys: '[ / ]', label: 'Trocar contexto (frente)' },
    { keys: 'G depois D/H/A/R/F/P/T/G', label: 'Ir para páginas rapidamente' }
  ];

  const outletContext: ShellContext = {
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaces,
    gamification,
    refreshGlobal
  };

  const shellClassName = sidebarCollapsed
    ? 'app-shell premium-shell sidebar-collapsed'
    : 'app-shell premium-shell';
  const sidebarClassName = [
    'app-sidebar premium-sidebar',
    isMenuOpen ? 'open' : '',
    sidebarCollapsed ? 'collapsed' : ''
  ]
    .filter(Boolean)
    .join(' ');

  if (isTaskTableFocusRoute) {
    return (
      <div className="task-focus-layout">
        <main className="task-focus-main">
          <Outlet context={outletContext} />
        </main>

        {commandOpen && (
          <div className="command-backdrop" role="presentation" onClick={closeCommandPalette}>
            <section className="command-palette" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <form onSubmit={onCommandSubmit} className="command-search">
                <Search size={16} />
                <input
                  ref={commandInputRef}
                  value={commandQuery}
                  onChange={(event) => setCommandQuery(event.target.value)}
                  placeholder="Buscar tela, frente ou digite para capturar..."
                />
              </form>

              <div className="command-hint-row">
                <span>Setas navegam • Enter executa item ativo</span>
                <span>Esc fecha • ? atalhos</span>
              </div>

              <ul className="command-results">
                {visibleCommands.length === 0 ? (
                  <li className="command-empty">Nenhum comando encontrado.</li>
                ) : (
                  groupedCommands.map((group) => (
                    <li key={group.key} className="command-group-block">
                      <p className="command-group-label">{group.key}</p>
                      <div className="command-group-items">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const index = commandIndexById.get(item.id) ?? 0;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={index === commandIndex ? 'active' : undefined}
                              onMouseEnter={() => setCommandIndex(index)}
                              onFocus={() => setCommandIndex(index)}
                              onClick={() => void runCommand(item)}
                              disabled={commandBusy}
                            >
                              <span className="command-result-icon">
                                <Icon size={14} />
                              </span>
                              <span>
                                <strong>{item.label}</strong>
                                <small>{item.hint}</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        )}

        <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="radix-overlay" />
            <Dialog.Content className="radix-shortcuts-dialog">
              <Dialog.Title>Atalhos globais</Dialog.Title>
              <Dialog.Description>
                Fluxo de produtividade premium com navegação instantânea.
              </Dialog.Description>

              <ul className="shortcut-list">
                {shortcuts.map((shortcut) => (
                  <li key={shortcut.keys}>
                    <span>{shortcut.label}</span>
                    <kbd>{shortcut.keys}</kbd>
                  </li>
                ))}
              </ul>

              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setShortcutsOpen(false);
                    openCommandPalette();
                  }}
                >
                  Abrir palette
                </button>
                <Dialog.Close asChild>
                  <button type="button">Fechar</button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  return (
    <div className={shellClassName}>
      <aside className={sidebarClassName}>
        <div className="brand-block premium-brand">
          <p className="brand-kicker">Execution OS</p>
          <h1>
            <Sparkles size={15} />
            <span className="brand-title-text">Operação Premium</span>
          </h1>
          <span>Clareza de contexto + ritmo de execução</span>
        </div>

        <nav className="main-nav premium-nav">
          {links.map((link) => {
            const Icon = link.icon;
            const isRitualLink = link.to === '/ritual';
            const showRitualBadge = isRitualLink && ritualPendingCount > 0;
            const resolvedCaption = isRitualLink
              ? showRitualBadge
                ? `${ritualPendingCount} pendência(s) • ${ritualPendingLabel ?? 'abrir para resolver'}`
                : ritualWeekClosed
                  ? 'Semana fechada'
                  : ritualReviewWindowOpen
                    ? 'Semana em dia'
                    : 'Sem pendências até sexta 20h'
              : link.caption;

            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? 'main-nav-link active premium-nav-link' : 'main-nav-link premium-nav-link')}
                end={link.to === '/'}
                onClick={() => setIsMenuOpen(false)}
                title={sidebarCollapsed ? link.label : undefined}
              >
                <div className="premium-nav-icon">
                  <Icon size={16} />
                  {isRitualLink && showRitualBadge && <span className="premium-nav-dot" />}
                </div>
                <div className="premium-nav-copy">
                  <div className="premium-nav-title-row">
                    <strong>{link.label}</strong>
                    {showRitualBadge && <span className="premium-nav-badge">{ritualPendingCount}</span>}
                  </div>
                  <small>{resolvedCaption}</small>
                </div>
              </NavLink>
            );
          })}
        </nav>

        <section className="sidebar-score premium-score-card">
          <p>Score semanal</p>
          <strong>{gamification?.scoreSemanal ?? 0}</strong>
          <span>Streak {gamification?.streak ?? 0} dias</span>
        </section>
      </aside>

      {isMenuOpen && <button type="button" className="sidebar-backdrop" onClick={() => setIsMenuOpen(false)} />}

      <div className="app-main premium-main">
        <header className="app-topbar premium-topbar">
          <button
            className="menu-toggle"
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            Menu
          </button>

          <button
            type="button"
            className="ghost-button sidebar-collapse-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            title={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>

          <div className="topbar-title premium-route-title">
            <p>{activeRoute.label}</p>
            <h2>{formatToday()}</h2>
          </div>

          <form className="quick-capture premium-capture" onSubmit={handleQuickCapture}>
            <input
              ref={quickCaptureInputRef}
              value={quickCapture}
              onChange={(event) => setQuickCapture(event.target.value)}
              placeholder="Capturar ideia, pendência ou decisão"
            />
            <button type="submit">Capturar</button>
            <button
              type="button"
              className="ghost-button command-k-trigger"
              onClick={openCommandPalette}
            >
              <Command size={14} /> Cmd/Ctrl+K
            </button>
            <button
              type="button"
              className="ghost-button command-k-trigger"
              onClick={() => setShortcutsOpen(true)}
            >
              <CircleHelp size={14} /> Atalhos
            </button>
          </form>
        </header>

        <section className="workspace-strip premium-workspace-strip">
          <label className="premium-context-picker">
            <span>Frente ativa</span>
            <select value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
              <option value="all">Visão geral</option>
              {visibleWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>

          <div className="workspace-indicator premium-context-info">
            <span>Frente:</span>
            <strong>{activeWorkspace ? activeWorkspace.name : 'Visão Geral'}</strong>
          </div>

          <div className="system-meta-cluster">
            <span
              className={
                apiOnline === null
                  ? 'system-chip pending'
                  : apiOnline
                    ? 'system-chip online'
                    : 'system-chip offline'
              }
            >
              <LaptopMinimalCheck size={14} />
              {apiOnline === null ? 'Verificando API' : apiOnline ? 'API online' : 'API offline'}
            </span>
            <span className="system-chip subtle">Streak {gamification?.streak ?? 0}d</span>
          </div>
        </section>

        {apiOnline === false && (
          <section className="system-alert">
            <div>
              <strong>Backend indisponível neste momento</strong>
              <p>Suba a API para carregar tarefas, projetos e métricas em tempo real.</p>
            </div>
            <div className="inline-actions">
              <code>{BACKEND_COMMAND}</code>
              <button type="button" className="ghost-button" onClick={() => void copyBackendCommand()}>
                <Copy size={14} /> Copiar
              </button>
              <button type="button" onClick={() => void pingApi()}>
                Testar novamente
              </button>
            </div>
          </section>
        )}

        <main className="app-content premium-content">
          <Outlet context={outletContext} />
        </main>
      </div>

      {commandOpen && (
        <div className="command-backdrop" role="presentation" onClick={closeCommandPalette}>
          <section className="command-palette" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={onCommandSubmit} className="command-search">
              <Search size={16} />
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Buscar tela, frente ou digite para capturar..."
              />
            </form>

            <div className="command-hint-row">
              <span>Setas navegam • Enter executa item ativo</span>
              <span>Esc fecha • ? atalhos</span>
            </div>

            <ul className="command-results">
              {visibleCommands.length === 0 ? (
                <li className="command-empty">Nenhum comando encontrado.</li>
              ) : (
                groupedCommands.map((group) => (
                  <li key={group.key} className="command-group-block">
                    <p className="command-group-label">{group.key}</p>
                    <div className="command-group-items">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const index = commandIndexById.get(item.id) ?? 0;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={index === commandIndex ? 'active' : undefined}
                            onMouseEnter={() => setCommandIndex(index)}
                            onFocus={() => setCommandIndex(index)}
                            onClick={() => void runCommand(item)}
                            disabled={commandBusy}
                          >
                            <span className="command-result-icon">
                              <Icon size={14} />
                            </span>
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.hint}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      )}

      <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="radix-overlay" />
          <Dialog.Content className="radix-shortcuts-dialog">
            <Dialog.Title>Atalhos globais</Dialog.Title>
            <Dialog.Description>
              Fluxo de produtividade premium com navegação instantânea.
            </Dialog.Description>

            <ul className="shortcut-list">
              {shortcuts.map((shortcut) => (
                <li key={shortcut.keys}>
                  <span>{shortcut.label}</span>
                  <kbd>{shortcut.keys}</kbd>
                </li>
              ))}
            </ul>

            <div className="inline-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setShortcutsOpen(false);
                  openCommandPalette();
                }}
              >
                Abrir palette
              </button>
              <Dialog.Close asChild>
                <button type="button">Fechar</button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
