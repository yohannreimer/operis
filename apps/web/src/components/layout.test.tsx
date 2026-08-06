import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveShellRoute,
  getMobileMoreLinks,
  getMobilePrimaryLinks,
  Layout
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
  it('keeps the three daily routes in the primary mobile nav', () => {
    expect(getMobilePrimaryLinks().map((link) => link.label)).toEqual([
      'Hoje',
      'Agenda',
      'Tarefas'
    ]);
  });

  it('keeps Agenda on its stable route without restoring Inbox as a separate destination', () => {
    expect(getMobilePrimaryLinks().find((link) => link.label === 'Agenda')?.to).toBe('/agenda');
    expect(getMobilePrimaryLinks().some((link) => link.label === 'Inbox')).toBe(false);
    expect(getMobilePrimaryLinks()).toHaveLength(3);
    expect(getMobileMoreLinks()).toHaveLength(6);
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

  it('matches nested route prefixes before falling back to today', () => {
    expect(getActiveShellRoute('/projetos/proj_123')?.label).toBe('Projetos');
    expect(getActiveShellRoute('/frentes/ws_123')?.label).toBe('Frentes');
    expect(getActiveShellRoute('/desconhecida')?.label).toBe('Hoje');
    expect(getActiveShellRoute('/inbox')?.label).toBe('Hoje');
  });

  it('does not match sibling-looking route prefixes', () => {
    expect(getActiveShellRoute('/projetos-old')?.label).toBe('Hoje');
  });
});

describe('Layout mobile shell rendering', () => {
  it('renders bottom navigation and mobile more trigger', async () => {
    renderLayout('/hoje');

    expect(await screen.findByText('Hoje route body')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /navegação mobile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mais opções/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /capturar rápido/i })).toBeInTheDocument();
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

  it('submits quick capture from the mobile floating action', async () => {
    renderLayout('/hoje');

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
