import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { recurringCommitment } from './test-fixtures';
import { BlockInspector } from './block-inspector';

describe('BlockInspector', () => {
  it('shows only essential fields before advanced options', () => {
    render(
      <BlockInspector
        mode="create"
        defaultDate="2026-08-06"
        defaultTime="14:00"
      />
    );

    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Início')).toHaveValue('14:00');
    expect(screen.getByRole('button', { name: 'Mais opções' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Fim da recorrência')).not.toBeInTheDocument();
  });

  it('requires occurrence or series before changing a recurring commitment', () => {
    render(<BlockInspector mode="edit" block={recurringCommitment()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('dialog', { name: 'Aplicar alteração' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Somente esta ocorrência' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toda a série' })).toBeInTheDocument();
  });
});
