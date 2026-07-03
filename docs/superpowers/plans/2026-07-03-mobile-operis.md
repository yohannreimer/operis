# Operis Mobile Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-native logged-in Operis experience with bottom navigation, quick capture, a mobile "Mais" drawer, and usable small-screen layouts for the main daily workflows.

**Architecture:** Keep the current React routes and desktop premium shell intact. Add mobile navigation primitives inside `Layout`, backed by small pure helpers that tests can verify, and layer mobile CSS after the current premium shell rules so phone behavior wins without restructuring the app.

**Tech Stack:** React 18, Vite, React Router, Vitest, Testing Library, CSS media queries, lucide-react icons.

---

## File Structure

- Modify `apps/web/src/components/layout.tsx`
  - Export small route helper functions.
  - Add mobile bottom navigation.
  - Add mobile "Mais" drawer.
  - Reuse the existing quick capture state and submission flow through a fixed mobile capture action.
- Create `apps/web/src/components/layout.test.tsx`
  - Unit-test route splitting and active-route behavior.
  - Render-test the mobile shell elements that must always exist in the logged-in layout.
  - Render-test capture submission through the floating mobile action.
- Modify `apps/web/src/styles.css`
  - Add stable phone shell dimensions.
  - Add bottom nav, mobile capture, mobile drawer, topbar, modal, command palette, header, grid, toolbar, Inbox, Hoje, Tarefas, Agenda, and secondary-route safeguards.
- Verify with existing commands:
  - `npm run test --workspace @execution-os/web -- layout.test.tsx`
  - `npm run typecheck --workspace @execution-os/web`
  - `npm run build --workspace @execution-os/web`

---

### Task 1: Add Testable Mobile Navigation Helpers

**Files:**
- Modify: `apps/web/src/components/layout.tsx`
- Create: `apps/web/src/components/layout.test.tsx`

- [ ] **Step 1: Write the failing helper tests**

Create `apps/web/src/components/layout.test.tsx` with:

```tsx
import { describe, expect, it } from 'vitest';
import {
  getActiveShellRoute,
  getMobileMoreLinks,
  getMobilePrimaryLinks
} from './layout';

describe('Layout mobile navigation helpers', () => {
  it('keeps the four daily routes in the primary mobile nav', () => {
    expect(getMobilePrimaryLinks().map((link) => link.label)).toEqual([
      'Inbox',
      'Hoje',
      'Agenda',
      'Tarefas'
    ]);
  });

  it('moves secondary routes into the mobile more drawer', () => {
    expect(getMobileMoreLinks().map((link) => link.label)).toEqual([
      'Frentes',
      'Projetos',
      'Notas',
      'Hábitos',
      'Dashboard',
      'Configurações'
    ]);
  });

  it('matches nested route prefixes before falling back to inbox', () => {
    expect(getActiveShellRoute('/projetos/proj_123')?.label).toBe('Projetos');
    expect(getActiveShellRoute('/frentes/ws_123')?.label).toBe('Frentes');
    expect(getActiveShellRoute('/desconhecida')?.label).toBe('Inbox');
  });
});
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run:

```bash
npm run test --workspace @execution-os/web -- layout.test.tsx
```

Expected: FAIL because `getActiveShellRoute`, `getMobilePrimaryLinks`, and `getMobileMoreLinks` are not exported from `layout.tsx`.

- [ ] **Step 3: Export helper constants and functions**

In `apps/web/src/components/layout.tsx`, replace the private `links` declaration and active-route expression with:

```tsx
// Also add Settings to the lucide-react import list.
export const shellLinks: NavItem[] = [
  { to: '/inbox', label: 'Inbox', caption: 'Captura rápida', icon: Inbox },
  { to: '/hoje', label: 'Hoje', caption: 'Execução diária', icon: CalendarCheck2 },
  { to: '/agenda', label: 'Agenda', caption: 'Compromissos', icon: CalendarClock },
  { to: '/habitos', label: 'Hábitos', caption: 'RPG de vida', icon: Target },
  { to: '/frentes', label: 'Frentes', caption: 'Estratégia e frentes', icon: Building2 },
  { to: '/projetos', label: 'Projetos', caption: 'Entregas ativas', icon: BriefcaseBusiness },
  { to: '/tarefas', label: 'Tarefas', caption: 'Backlog e inbox', icon: ListTodo },
  { to: '/notas', label: 'Notas', caption: 'Segundo cérebro', icon: NotebookPen },
  { to: '/', label: 'Dashboard', caption: 'Métricas e ritual', icon: LayoutDashboard },
  { to: '/configuracoes', label: 'Configurações', caption: 'Conta e sistema', icon: Settings }
];

export function getMobilePrimaryLinks() {
  const primaryRoutes = ['/inbox', '/hoje', '/agenda', '/tarefas'];
  return primaryRoutes
    .map((route) => shellLinks.find((link) => link.to === route))
    .filter((link): link is NavItem => Boolean(link));
}

export function getMobileMoreLinks() {
  const moreRoutes = ['/frentes', '/projetos', '/notas', '/habitos', '/', '/configuracoes'];
  return moreRoutes
    .map((route) => shellLinks.find((link) => link.to === route))
    .filter((link): link is NavItem => Boolean(link));
}

export function getActiveShellRoute(pathname: string) {
  return (
    shellLinks.find((link) => (link.to === '/' ? pathname === '/' : pathname.startsWith(link.to))) ??
    shellLinks[0]
  );
}
```

Then update references:

```tsx
const activeRoute = getActiveShellRoute(location.pathname);
```

Replace all `links.map` and navigation command uses with `shellLinks.map`.

- [ ] **Step 4: Run the helper test and verify it passes**

Run:

```bash
npm run test --workspace @execution-os/web -- layout.test.tsx
```

Expected: PASS for the three helper tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx
git commit -m "test: cover mobile shell route helpers"
```

---

### Task 2: Render Mobile Bottom Nav, More Drawer, And Floating Capture

**Files:**
- Modify: `apps/web/src/components/layout.tsx`
- Modify: `apps/web/src/components/layout.test.tsx`

- [ ] **Step 1: Add render tests for mobile shell controls**

Extend `apps/web/src/components/layout.test.tsx` with:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { Layout } from './layout';

const apiMock = vi.hoisted(() => ({
  createInboxItem: vi.fn(),
  getGamification: vi.fn(),
  getReviewJournal: vi.fn(),
  getWeeklyAllocation: vi.fn(),
  getWorkspaces: vi.fn()
}));

vi.mock('../api', () => ({
  api: apiMock
}));

function renderLayout(path = '/inbox') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="inbox" element={<div>Inbox route body</div>} />
          <Route path="hoje" element={<div>Hoje route body</div>} />
          <Route path="agenda" element={<div>Agenda route body</div>} />
          <Route path="tarefas" element={<div>Tarefas route body</div>} />
          <Route path="projetos" element={<div>Projetos route body</div>} />
          <Route index element={<div>Dashboard route body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiMock.createInboxItem.mockResolvedValue({ id: 'inbox_1' });
  apiMock.getWorkspaces.mockResolvedValue([
    { id: 'ws_1', name: 'Empresa', type: 'empresa', color: '#f97316' }
  ]);
  apiMock.getGamification.mockResolvedValue({ scoreSemanal: 12, streak: 3 });
  apiMock.getWeeklyAllocation.mockResolvedValue({ rows: [] });
  apiMock.getReviewJournal.mockResolvedValue({ review: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

describe('Layout mobile shell rendering', () => {
  it('renders bottom navigation and mobile more trigger', async () => {
    renderLayout('/hoje');

    expect(await screen.findByText('Hoje route body')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /navegação mobile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mais opções/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capturar rápido/i })).toBeInTheDocument();
  });

  it('opens the mobile more drawer with secondary routes', async () => {
    renderLayout('/inbox');

    fireEvent.click(screen.getByRole('button', { name: /mais opções/i }));

    expect(await screen.findByRole('dialog', { name: /mais opções/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /projetos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /notas/i })).toBeInTheDocument();
  });

  it('submits quick capture from the mobile floating action', async () => {
    renderLayout('/inbox');

    fireEvent.click(screen.getByRole('button', { name: /capturar rápido/i }));
    fireEvent.change(await screen.findByPlaceholderText(/capturar ideia/i), {
      target: { value: 'Comprar cabo USB-C' }
    });
    fireEvent.click(screen.getByRole('button', { name: /^capturar$/i }));

    await waitFor(() => {
      expect(apiMock.createInboxItem).toHaveBeenCalledWith({
        content: 'Comprar cabo USB-C',
        source: 'app'
      });
    });
  });
});
```

- [ ] **Step 2: Run the render tests and verify they fail**

Run:

```bash
npm run test --workspace @execution-os/web -- layout.test.tsx
```

Expected: FAIL because the mobile bottom nav, mobile more drawer, and floating capture action do not exist.

- [ ] **Step 3: Add state and reusable link groups**

In `apps/web/src/components/layout.tsx`, add the menu icon import:

```tsx
  Menu,
  Plus,
  X
```

Add state inside `Layout`:

```tsx
const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
```

Add memoized link groups below `activeRoute`:

```tsx
const mobilePrimaryLinks = useMemo(() => getMobilePrimaryLinks(), []);
const mobileMoreLinks = useMemo(() => getMobileMoreLinks(), []);
const isMobilePrimaryActive = mobilePrimaryLinks.some((link) => activeRoute.to === link.to);
```

Update the existing route-change effect:

```tsx
useEffect(() => {
  setIsMenuOpen(false);
  setMobileMoreOpen(false);
}, [location.pathname]);
```

- [ ] **Step 4: Render mobile drawer, bottom nav, and floating capture**

In `apps/web/src/components/layout.tsx`, after the desktop sidebar block and before `<div className="app-main premium-main">`, add:

```tsx
{mobileMoreOpen && (
  <button
    type="button"
    className="mobile-shell-backdrop"
    aria-label="Fechar mais opções"
    onClick={() => setMobileMoreOpen(false)}
  />
)}

<aside
  className={mobileMoreOpen ? 'mobile-more-drawer open' : 'mobile-more-drawer'}
  role="dialog"
  aria-modal="true"
  aria-label="Mais opções"
>
  <div className="mobile-more-head">
    <div>
      <strong>Operis</strong>
      <span>Mais opções</span>
    </div>
    <button
      type="button"
      className="ghost-button mobile-icon-button"
      aria-label="Fechar mais opções"
      onClick={() => setMobileMoreOpen(false)}
    >
      <X size={16} />
    </button>
  </div>

  <nav className="mobile-more-nav" aria-label="Rotas secundárias">
    {mobileMoreLinks.map((link) => {
      const Icon = link.icon;
      return (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => (isActive ? 'mobile-more-link active' : 'mobile-more-link')}
          end={link.to === '/'}
          onClick={() => setMobileMoreOpen(false)}
        >
          <span className="mobile-more-icon">
            <Icon size={16} />
          </span>
          <span>
            <strong>{link.label}</strong>
            <small>{link.caption}</small>
          </span>
        </NavLink>
      );
    })}
  </nav>

  <section className="mobile-more-score">
    <div>
      <span>Pontos da semana</span>
      <strong>{gamification?.scoreSemanal ?? 0}</strong>
    </div>
    <div>
      <span>Streak</span>
      <strong>{gamification?.streak ?? 0}d</strong>
    </div>
  </section>
</aside>
```

Before the command palette block near the end of the normal shell return, add:

```tsx
<button
  type="button"
  className="mobile-capture-fab"
  aria-label="Capturar rápido"
  onClick={focusCaptureInput}
>
  <Plus size={22} />
</button>

<nav className="mobile-bottom-nav" aria-label="Navegação mobile">
  {mobilePrimaryLinks.map((link) => {
    const Icon = link.icon;
    return (
      <NavLink
        key={link.to}
        to={link.to}
        className={({ isActive }) => (isActive ? 'mobile-bottom-link active' : 'mobile-bottom-link')}
        end={link.to === '/'}
      >
        <Icon size={18} />
        <span>{link.label}</span>
      </NavLink>
    );
  })}
  <button
    type="button"
    className={isMobilePrimaryActive ? 'mobile-bottom-link' : 'mobile-bottom-link active'}
    aria-label="Mais opções"
    onClick={() => setMobileMoreOpen(true)}
  >
    <Menu size={18} />
    <span>Mais</span>
  </button>
</nav>
```

- [ ] **Step 5: Run the render tests and verify they pass**

Run:

```bash
npm run test --workspace @execution-os/web -- layout.test.tsx
```

Expected: PASS for helper and mobile shell render tests.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx
git commit -m "feat: add mobile shell navigation"
```

---

### Task 3: Style The Phone Shell

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add mobile shell CSS after current premium shell rules**

Append this block near the end of `apps/web/src/styles.css`, before the final component-specific sections if possible:

```css
.mobile-bottom-nav,
.mobile-capture-fab,
.mobile-more-drawer,
.mobile-shell-backdrop {
  display: none;
}

@media (max-width: 760px) {
  :root {
    --mobile-bottom-nav-height: 72px;
    --mobile-safe-bottom: env(safe-area-inset-bottom, 0px);
  }

  html,
  body,
  #root {
    min-height: 100%;
    overflow-x: hidden;
  }

  body {
    background: var(--bg);
  }

  .premium-shell,
  .premium-shell.sidebar-collapsed {
    display: block;
    min-height: 100vh;
  }

  .premium-sidebar,
  .sidebar-backdrop {
    display: none;
  }

  .premium-main {
    min-height: 100vh;
    padding: 10px 10px calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom) + 18px);
    overflow-x: hidden;
  }

  .premium-topbar {
    position: sticky;
    top: 0;
    z-index: 30;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
  }

  .menu-toggle,
  .sidebar-collapse-toggle {
    display: none;
  }

  .topbar-workspace-selector {
    min-width: 0;
    width: 100%;
    padding: 7px 9px;
  }

  .topbar-workspace-selector svg {
    flex-shrink: 0;
  }

  .topbar-workspace-selector select {
    min-width: 0;
    width: 100%;
    font-size: 0.78rem;
  }

  .topbar-capture-wrap {
    display: none;
  }

  .system-chip {
    width: 34px;
    height: 34px;
    justify-content: center;
    padding: 0;
  }

  .topbar-capture-expanded {
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom) + 10px);
    z-index: 70;
  }

  .quick-capture.premium-capture {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--border-hover);
    border-radius: 14px;
    background: var(--surface-elevated);
    box-shadow: var(--shadow-lg);
  }

  .quick-capture.premium-capture input {
    min-height: 42px;
  }

  .quick-capture.premium-capture button {
    min-height: 42px;
    padding-inline: 12px;
  }

  .premium-content {
    margin-top: 10px;
  }

  .mobile-capture-fab {
    position: fixed;
    right: 18px;
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom) + 14px);
    z-index: 55;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    padding: 0;
    border-radius: 18px;
    border: 1px solid rgba(249, 115, 22, 0.45);
    background: var(--primary);
    color: #fff;
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.34);
  }

  .mobile-bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    height: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom));
    padding: 7px 8px calc(7px + var(--mobile-safe-bottom));
    border-top: 1px solid var(--border);
    background: rgba(35, 35, 40, 0.96);
    backdrop-filter: blur(18px);
    box-shadow: 0 -12px 28px rgba(0, 0, 0, 0.28);
  }

  .mobile-bottom-link {
    min-width: 0;
    min-height: 52px;
    padding: 6px 4px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    text-decoration: none;
    display: grid;
    place-items: center;
    gap: 3px;
    font-size: 0.66rem;
    font-weight: 700;
    line-height: 1;
    box-shadow: none;
  }

  .mobile-bottom-link svg {
    flex-shrink: 0;
  }

  .mobile-bottom-link.active {
    background: var(--primary-soft);
    color: var(--primary);
  }

  .mobile-shell-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: block;
    border: 0;
    border-radius: 0;
    background: rgba(0, 0, 0, 0.45);
  }

  .mobile-more-drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 81;
    display: grid;
    gap: 12px;
    max-height: min(78vh, 620px);
    padding: 14px 14px calc(18px + var(--mobile-safe-bottom));
    border: 1px solid var(--border-hover);
    border-radius: 18px 18px 0 0;
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    transform: translateY(105%);
    transition: transform 180ms var(--ease-out);
  }

  .mobile-more-drawer.open {
    transform: translateY(0);
  }

  .mobile-more-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .mobile-more-head strong,
  .mobile-more-head span {
    display: block;
  }

  .mobile-more-head span {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .mobile-icon-button {
    width: 38px;
    height: 38px;
    padding: 0;
  }

  .mobile-more-nav {
    display: grid;
    gap: 7px;
    overflow-y: auto;
  }

  .mobile-more-link {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-height: 58px;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-soft);
    color: var(--text);
    text-decoration: none;
  }

  .mobile-more-link.active {
    border-color: rgba(249, 115, 22, 0.4);
    background: var(--primary-soft);
    color: var(--primary);
  }

  .mobile-more-link strong,
  .mobile-more-link small {
    display: block;
  }

  .mobile-more-link small {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.76rem;
  }

  .mobile-more-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.06);
  }

  .mobile-more-score {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .mobile-more-score div {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-soft);
    padding: 10px;
  }

  .mobile-more-score span,
  .mobile-more-score strong {
    display: block;
  }

  .mobile-more-score span {
    color: var(--muted);
    font-size: 0.72rem;
  }

  .mobile-more-score strong {
    margin-top: 3px;
    font-size: 1.1rem;
  }
}
```

- [ ] **Step 2: Run the existing layout test**

Run:

```bash
npm run test --workspace @execution-os/web -- layout.test.tsx
```

Expected: PASS. CSS does not affect jsdom layout, but this catches accidental class or render regressions.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/web/src/styles.css
git commit -m "style: add phone shell layout"
```

---

### Task 4: Add Mobile Layout Safeguards For Main Workflows

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add workflow-level mobile CSS**

Append this block after the phone shell CSS:

```css
@media (max-width: 760px) {
  .premium-page {
    gap: 10px;
  }

  .premium-header {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
  }

  .premium-header h2 {
    font-size: 1.38rem;
    line-height: 1.15;
  }

  .premium-subtitle {
    font-size: 0.86rem;
  }

  .premium-header-actions,
  .inline-actions,
  .smart-toolbar-actions,
  .project-header-actions,
  .notes-app-topbar .inline-actions {
    width: 100%;
    justify-content: stretch;
  }

  .premium-header-actions > *,
  .inline-actions > button,
  .smart-toolbar-actions > button,
  .project-header-actions > button,
  .notes-app-topbar .inline-actions > button {
    min-width: 0;
    flex: 1 1 auto;
  }

  .premium-grid,
  .premium-grid.two,
  .premium-grid.two-wide,
  .premium-metric-grid,
  .premium-metric-grid.mini,
  .today-layout,
  .project-screen,
  .two-col-grid,
  .three-col-grid,
  .task-workbench,
  .task-detail-extensions,
  .process-settings-grid,
  .task-create-grid,
  .delivery-os-grid,
  .project-redesign-hero,
  .notes-app-body,
  .notes-studio-layout,
  .notes-context-grid {
    grid-template-columns: 1fr !important;
  }

  .premium-card,
  .premium-metric,
  .task-master-pane,
  .task-detail-pane,
  .project-redesign-side,
  .notes-app-shell {
    min-width: 0;
  }

  .system-alert {
    align-items: stretch;
    gap: 10px;
  }

  .system-alert .inline-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .system-alert code {
    overflow-x: auto;
    white-space: nowrap;
  }

  .command-backdrop {
    padding: 8vh 10px 0;
  }

  .command-palette {
    width: 100%;
    max-height: 78vh;
    border-radius: 14px;
  }

  .command-search {
    grid-template-columns: 20px minmax(0, 1fr);
  }

  .radix-shortcuts-dialog {
    width: calc(100vw - 20px);
    max-width: none;
  }

  .modal-backdrop {
    padding: 10px;
  }

  .modal,
  .task-modal,
  .habit-modal {
    width: 100%;
    max-width: none;
    max-height: calc(100vh - 20px);
  }

  .filters-row,
  .task-list-filters,
  .pool-filter-row,
  .smart-advanced-filters,
  .compose-option-grid,
  .compose-option-grid.two,
  .compose-option-grid.three,
  .project-picker-grid,
  .ritual-scope-grid,
  .ritual-flow-board,
  .ritual-allocation-body,
  .project-redesign-hero-metrics,
  .executive-week-metrics {
    grid-template-columns: 1fr !important;
  }

  .smart-table-shell,
  .notes-table-builder-grid,
  .scheduler-grid,
  .agenda-board,
  .week-strip {
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .smart-table-head,
  .smart-table-row {
    min-width: 880px;
  }

  .scheduler-grid {
    min-width: 680px;
  }

  .agenda-week-nav,
  .hoje-date-nav,
  .notes-writer-toolbar,
  .notes-writer-modebar,
  .notes-document-commandbar {
    width: 100%;
    flex-wrap: wrap;
  }

  .hoje-date-input {
    width: 100%;
  }

  .hoje-hero {
    padding: 14px;
  }

  .hoje-deep-work-banner-head,
  .hoje-capacity-callout,
  .self-deception-head,
  .ritual-checklist-list li,
  .ritual-pending-stack li {
    flex-direction: column;
    align-items: flex-start;
  }

  .inbox-item-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .inbox-item-action-btn,
  .habit-date-nav-btn,
  .agenda-week-nav-btn {
    min-width: 38px;
    min-height: 38px;
  }
}

@media (max-width: 380px) {
  .premium-main {
    padding-inline: 8px;
  }

  .premium-topbar {
    gap: 6px;
  }

  .system-chip {
    width: 32px;
    height: 32px;
  }

  .mobile-bottom-link {
    font-size: 0.61rem;
  }

  .mobile-capture-fab {
    right: 14px;
    width: 52px;
    height: 52px;
  }

  .quick-capture.premium-capture {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Run tests after CSS safeguards**

Run:

```bash
npm run test --workspace @execution-os/web -- layout.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/web/src/styles.css
git commit -m "style: improve mobile workflow layouts"
```

---

### Task 5: Typecheck, Build, And Browser Verify

**Files:**
- No planned source edits unless verification reveals a concrete issue.

- [ ] **Step 1: Run web typecheck**

Run:

```bash
npm run typecheck --workspace @execution-os/web
```

Expected: PASS with TypeScript reporting no errors.

- [ ] **Step 2: Run web build**

Run:

```bash
npm run build --workspace @execution-os/web
```

Expected: PASS and Vite emits production assets.

- [ ] **Step 3: Start the demo app**

Run:

```bash
npm run demo:prymeira
```

Expected: API starts on `http://localhost:3000` and web starts on `http://localhost:5178`.

- [ ] **Step 4: Verify desktop viewport**

Open `http://localhost:5178/inbox` at 1440x900.

Expected:

- desktop sidebar is visible;
- bottom nav is hidden;
- floating capture button is hidden;
- topbar controls fit in one row;
- navigating to `/hoje`, `/agenda`, `/tarefas`, and `/projetos` still works.

- [ ] **Step 5: Verify phone viewport**

Open `http://localhost:5178/inbox` at 390x844.

Expected:

- desktop sidebar is hidden;
- bottom nav is visible with Inbox, Hoje, Agenda, Tarefas, Mais;
- floating capture button is visible;
- tapping the capture button opens the quick capture panel;
- entering `Teste mobile capture` and submitting captures without layout jump;
- tapping Mais opens the drawer with Frentes, Projetos, Notas, Hábitos, Dashboard;
- tapping Projetos closes the drawer and navigates.

- [ ] **Step 6: Verify narrow phone viewport**

Open `http://localhost:5178/hoje` at 360x780.

Expected:

- no horizontal page overflow from the shell;
- topbar workspace selector and status chip fit;
- headers and action buttons stack cleanly;
- dense grids either stack or scroll inside their component;
- bottom nav does not cover the final content.

- [ ] **Step 7: Fix concrete verification issues**

If verification finds a named issue, change only the affected selector or component. For example, if `.agenda-week-nav` overflows at 360px, add:

```css
@media (max-width: 760px) {
  .agenda-week-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
  }

  .agenda-week-nav-label {
    min-width: 100%;
  }
}
```

Run the relevant verification command again after each fix.

- [ ] **Step 8: Commit verification fixes**

If Step 7 changed files, run:

```bash
git add apps/web/src/styles.css apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx
git commit -m "fix: polish mobile shell verification issues"
```

If Step 7 did not change files, skip this commit.

---

## Self-Review

- Spec coverage: bottom nav, quick capture, More drawer, desktop preservation, mobile layout rules, error alert stacking, and phone viewport verification are covered by Tasks 1-5.
- Red-flag scan: no forbidden planning tokens are present.
- Type consistency: helper names in tests match exports from `layout.tsx`; CSS class names in tests match the render plan.
