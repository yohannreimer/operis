import { fireEvent, render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { Button, IconButton } from './button';

describe('Button', () => {
  it('uses a neutral primary variant and keeps its accessible name while loading', () => {
    render(<Button loading>Salvar projeto</Button>);

    const button = screen.getByRole('button', { name: 'Salvar projeto' });
    expect(button).toHaveClass('ui-button', 'ui-button--primary');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('supports secondary, tertiary and danger variants', () => {
    render(
      <>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="tertiary">Editar</Button>
        <Button variant="danger">Excluir</Button>
      </>
    );

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('ui-button--secondary');
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveClass('ui-button--tertiary');
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass('ui-button--danger');
  });

  it('renders an icon action with a required accessible label', () => {
    const onClick = vi.fn();
    render(<IconButton label="Nova tarefa" icon={<Plus />} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
