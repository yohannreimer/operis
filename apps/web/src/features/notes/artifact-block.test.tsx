import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ArtifactBlock, ArtifactBlockProvider } from './artifact-block';

describe('ArtifactBlock', () => {
  it('opens the referenced artifact from its document preview', () => {
    const onOpen = vi.fn();
    render(
      <ArtifactBlockProvider onOpen={onOpen}>
        <ArtifactBlock artifactId="artifact-1" artifactKind="diagram" title="Funil" />
      </ArtifactBlockProvider>
    );

    expect(screen.getByText('Diagrama')).toBeInTheDocument();
    expect(screen.getByText('Funil')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diagrama Funil em foco' }));
    expect(onOpen).toHaveBeenCalledWith('artifact-1');
  });
});
