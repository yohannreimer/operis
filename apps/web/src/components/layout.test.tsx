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

  it('does not match sibling-looking route prefixes', () => {
    expect(getActiveShellRoute('/projetos-old')?.label).toBe('Inbox');
  });
});
