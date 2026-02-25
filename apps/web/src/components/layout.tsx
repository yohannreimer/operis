import { FormEvent, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { api, Gamification, Workspace } from '../api';
import { ShellContext } from './shell-context';

const links = [
  { to: '/', label: 'Dashboard', caption: 'Controle executivo' },
  { to: '/hoje', label: 'Hoje', caption: 'Lista + timeline' },
  { to: '/amanha', label: 'Amanhã', caption: 'Planejamento visual' },
  { to: '/workspaces', label: 'Workspaces', caption: 'Empresas e pessoal' },
  { to: '/projetos', label: 'Projetos', caption: 'Estrutura e progresso' },
  { to: '/tarefas', label: 'Tarefas', caption: 'Operação completa' },
  { to: '/gamificacao', label: 'Gamificação', caption: 'Pressão e score' }
] as const;

function formatToday() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });
}

function workspaceTypeLabel(type: Workspace['type']) {
  if (type === 'empresa') {
    return 'Empresa';
  }

  if (type === 'pessoal') {
    return 'Pessoal';
  }

  return 'Geral';
}

export function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [gamification, setGamification] = useState<Gamification | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('all');
  const [quickCapture, setQuickCapture] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  const visibleWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== 'geral'),
    [workspaces]
  );

  async function refreshGlobal() {
    const [workspaceData, gamificationData] = await Promise.all([
      api.getWorkspaces(),
      api.getGamification()
    ]);

    const selectableWorkspaceIds = new Set(
      workspaceData.filter((workspace) => workspace.type !== 'geral').map((workspace) => workspace.id)
    );

    setWorkspaces(workspaceData);
    setGamification(gamificationData);

    if (activeWorkspaceId !== 'all' && !selectableWorkspaceIds.has(activeWorkspaceId)) {
      setActiveWorkspaceId('all');
    }
  }

  useEffect(() => {
    refreshGlobal().catch((error: Error) => {
      setStatusMessage(error.message);
    });
  }, []);

  async function handleQuickCapture(event: FormEvent) {
    event.preventDefault();

    if (!quickCapture.trim()) {
      return;
    }

    try {
      await api.createInboxItem(quickCapture.trim(), 'app');
      setQuickCapture('');
      setStatusMessage('Item capturado na fila de tarefas.');
      window.setTimeout(() => setStatusMessage(null), 2200);
    } catch (error) {
      setStatusMessage((error as Error).message);
      window.setTimeout(() => setStatusMessage(null), 2800);
    }
  }

  const outletContext: ShellContext = {
    activeWorkspaceId,
    setActiveWorkspaceId,
    workspaces,
    gamification,
    refreshGlobal
  };

  return (
    <div className="app-shell">
      <aside className={isMenuOpen ? 'app-sidebar open' : 'app-sidebar'}>
        <div className="brand-block">
          <p className="brand-kicker">Execution OS</p>
          <h1>Estratégia em execução real</h1>
          <span>Planeje. Execute. Meça. Evolua.</span>
        </div>

        <nav className="main-nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'main-nav-link active' : 'main-nav-link')}
              end={link.to === '/'}
              onClick={() => setIsMenuOpen(false)}
            >
              <strong>{link.label}</strong>
              <small>{link.caption}</small>
            </NavLink>
          ))}
        </nav>

        <section className="sidebar-score">
          <p>Pressão semanal</p>
          <strong>{gamification?.scoreSemanal ?? 0}</strong>
          <span>Streak {gamification?.streak ?? 0} dias</span>
        </section>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            className="menu-toggle"
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            Menu
          </button>

          <div className="topbar-title">
            <p>Centro de comando</p>
            <h2>{formatToday()}</h2>
          </div>

          <form className="quick-capture" onSubmit={handleQuickCapture}>
            <input
              value={quickCapture}
              onChange={(event) => setQuickCapture(event.target.value)}
              placeholder="capturar fechar proposta da empresa B"
            />
            <button type="submit">Capturar</button>
          </form>
        </header>

        <section className="workspace-strip">
          <button
            type="button"
            className={activeWorkspaceId === 'all' ? 'workspace-chip active' : 'workspace-chip'}
            onClick={() => setActiveWorkspaceId('all')}
          >
            Todos
          </button>

          {visibleWorkspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className={activeWorkspaceId === workspace.id ? 'workspace-chip active' : 'workspace-chip'}
              onClick={() => setActiveWorkspaceId(workspace.id)}
              title={workspaceTypeLabel(workspace.type)}
            >
              {workspace.name}
            </button>
          ))}

          <div className="workspace-indicator">
            <span>Contexto ativo:</span>
            <strong>{activeWorkspace ? activeWorkspace.name : 'Visão Geral'}</strong>
          </div>
        </section>

        {statusMessage && <p className="status-toast">{statusMessage}</p>}

        <main className="app-content">
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}
