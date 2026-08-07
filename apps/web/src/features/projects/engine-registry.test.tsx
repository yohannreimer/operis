import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectMethodology } from '../../api';
import { getEngineDefinition, ProjectMethodologyPicker } from './engine-registry';

describe('project engine registry', () => {
  it('shows seven primary intents and keeps advanced engines behind Ver todos', () => {
    render(<ProjectMethodologyPicker value={null} onChange={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: /escolher/i })).toHaveLength(7);
    expect(screen.queryByText('Runway')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ver todos/i }));
    expect(screen.getByText('Runway')).toBeVisible();
  });

  it.each([
    ['delivery', 'entrega'],
    ['launch', 'campanha'],
    ['discovery', 'exploracao'],
    ['growth', 'exploracao']
  ])('maps legacy %s to %s', (legacy, canonical) => {
    expect(getEngineDefinition(legacy as ProjectMethodology).canonicalMethodology).toBe(canonical);
  });

  it('uses the approved intent labels instead of technical engine names', () => {
    render(<ProjectMethodologyPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Atingir uma meta')).toBeVisible();
    expect(screen.getByText('Entregar algo')).toBeVisible();
    expect(screen.getByText('Validar uma ideia')).toBeVisible();
  });
});
