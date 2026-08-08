import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TodayEntry } from './types';
import { RolloverReview } from './rollover-review';

const oldEntry: TodayEntry = {
  id: 'daily_old',
  kind: 'inbox',
  sourceId: 'inbox_1',
  date: '2026-08-07',
  title: 'Responder cliente',
  position: 0,
  completedAt: null,
  context: 'Comercial'
};

describe('RolloverReview', () => {
  it('renders compact neutral decisions for yesterday', () => {
    render(<RolloverReview items={[oldEntry]} targetDate="2026-08-08" onResolve={vi.fn()} />);

    expect(screen.getByRole('button', { name: /manter em hoje/i })).toHaveClass('ui-button--tertiary');
    expect(screen.getByRole('button', { name: /concluir/i })).toHaveClass('ui-button--tertiary');
    expect(screen.getByText('Pendente de ontem').closest('section')).toHaveClass('rollover-review');
  });
});
