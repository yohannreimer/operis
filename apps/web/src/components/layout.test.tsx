import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveShellRoute,
  getMobileMoreLinks,
  getMobilePrimaryLinks,
  Layout,
  shellGroups,
  shellLinks
} from './layout';

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

function renderLayout(path = '/hoje') {
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

describe('Layout mobile navigation helpers', () => {
  it('groups the desktop shell by intent', () => {
    expect(shellGroups.map((group) => group.label)).toEqual(['Planejar', 'Organizar', 'Evoluir']);
    expect(shellGroups[0].links.map((link) => link.label)).toEqual(['Hoje', 'Agenda']);
    expect(shellGroups[1].links.map((link) => link.label)).toEqual(['Tarefas', 'Projetos', 'Frentes', 'Notas']);
    expect(shellGroups[2].links.map((link) => link.label)).toEqual(['Hábitos', 'Dashboard']);
  });

  it('keeps the four execution routes in the primary mobile nav', () => {
    expect(getMobilePrimaryLinks().map((link) => link.label)).toEqual([
      'Hoje',
      'Agenda',
      'Tarefas',
      'Hábitos'
    ]);
  });

  it('keeps Agenda on its stable route without restoring Inbox as a separate destination', () => {
    expect(getMobilePrimaryLinks().find((link) => link.label === 'Agenda')?.to).toBe('/agenda');
    expect(getMobilePrimaryLinks().some((link) => link.label === 'Inbox')).toBe(false);
    expect(getMobilePrimaryLinks()).toHaveLength(4);
    expect(getMobileMoreLinks()).toHaveLength(4);
  });

  it('moves secondary routes into the mobile more drawer', () => {
    expect(getMobileMoreLinks().map((link) => link.label)).toEqual([
      'Projetos',
      'Frentes',
      'Notas',
      'Dashboard'
    ]);
  });

  it('matches nested route prefixes before falling back to today', () => {
    expect(getActiveShellRoute('/projetos/proj_123')?.label).toBe('Projetos');
    expect(getActiveShellRoute('/frentes/ws_123')?.label).toBe('Frentes');
    expect(getActiveShellRoute('/desconhecida')?.label).toBe('Hoje');
    expect(getActiveShellRoute('/inbox')?.label).toBe('Hoje');
    expect(getActiveShellRoute('/dashboard')?.label).toBe('Dashboard');
  });

  it('does not match sibling-looking route prefixes', () => {
    expect(getActiveShellRoute('/projetos-old')?.label).toBe('Hoje');
  });
});

describe('Layout mobile shell rendering', () => {
  it('renders route content without the global top HUD', async () => {
    const { container } = renderLayout('/hoje');

    expect(await screen.findByText('Hoje route body')).toBeInTheDocument();
    expect(container.querySelector('.app-topbar')).not.toBeInTheDocument();
    expect(container.querySelector('.topbar-capture-expanded')).not.toBeInTheDocument();
  });

  it('keeps the command palette available from the keyboard', async () => {
    renderLayout('/hoje');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByRole('dialog', { name: 'Comandos' })).toBeInTheDocument();
  });

  it('renders bottom navigation and mobile more trigger', async () => {
    renderLayout('/hoje');

    expect(await screen.findByText('Hoje route body')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /navegação mobile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mais opções/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Capturar' })).toHaveTextContent('Capturar');
  });

  it('opens the mobile more drawer with secondary routes', async () => {
    renderLayout('/hoje');

    const moreTrigger = screen.getByRole('button', { name: /mais opções/i });
    fireEvent.click(moreTrigger);

    expect(await screen.findByRole('dialog', { name: /mais opções/i })).toBeInTheDocument();
    expect(moreTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /projetos/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /notas/i })).toBeInTheDocument();
  });

  it('hides Settings from desktop, mobile and user-visible route collections', async () => {
    renderLayout('/hoje');

    expect(shellLinks.some((link) => link.to === '/configuracoes')).toBe(false);
    expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /mais opções/i }));
    expect(await screen.findByRole('dialog', { name: /mais opções/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();
  });

  it('closes the mobile more drawer from the close button', async () => {
    renderLayout('/hoje');

    const moreTrigger = screen.getByRole('button', { name: /mais opções/i });
    fireEvent.click(moreTrigger);

    expect(await screen.findByRole('dialog', { name: /mais opções/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /fechar mais opções/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /mais opções/i })).not.toBeInTheDocument();
    });
    expect(moreTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the mobile more drawer when the viewport leaves the phone breakpoint', async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    let matches = true;

    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((media: string) => ({
        matches,
        media,
        onchange: null,
        addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            listeners.add(listener);
          }
        }),
        removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            listeners.delete(listener);
          }
        }),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );

    renderLayout('/hoje');

    const moreTrigger = screen.getByRole('button', { name: /mais opções/i });
    fireEvent.click(moreTrigger);

    expect(await screen.findByRole('dialog', { name: /mais opções/i })).toBeInTheDocument();

    matches = false;
    listeners.forEach((listener) => {
      listener({ matches } as MediaQueryListEvent);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /mais opções/i })).not.toBeInTheDocument();
    });
    expect(moreTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the mobile more drawer after navigating to a secondary route', async () => {
    renderLayout('/hoje');

    fireEvent.click(screen.getByRole('button', { name: /mais opções/i }));
    expect(await screen.findByRole('dialog', { name: /mais opções/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /projetos/i }));

    expect(await screen.findByText('Projetos route body')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /mais opções/i })).not.toBeInTheDocument();
    });
  });

  it('submits global capture with Enter', async () => {
    renderLayout('/hoje');

    fireEvent.click(screen.getByRole('button', { name: 'Capturar' }));
    expect(await screen.findByRole('dialog', { name: 'Capturar' })).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Captura rápida' });
    fireEvent.change(input, { target: { value: 'Comprar cabo USB-C' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(apiMock.createInboxItem).toHaveBeenCalledWith({
        content: 'Comprar cabo USB-C',
        source: 'app'
      });
    });
  });

  it('opens quick capture from the global C shortcut', async () => {
    renderLayout('/hoje');

    fireEvent.keyDown(window, { key: 'c' });

    expect(await screen.findByRole('dialog', { name: 'Capturar' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Captura rápida' })).toHaveFocus();
  });
});
