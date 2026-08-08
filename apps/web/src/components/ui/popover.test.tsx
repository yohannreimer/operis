import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Popover } from './popover';

describe('Popover', () => {
  it('opens a contextual menu, closes with Escape and returns focus', async () => {
    render(
      <Popover label="Opções da tarefa" trigger={<button type="button">Mais</button>}>
        <button type="button">Arquivar</button>
      </Popover>
    );

    const trigger = screen.getByRole('button', { name: 'Mais' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Opções da tarefa' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
