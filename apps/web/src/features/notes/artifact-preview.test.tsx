import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NoteArtifact } from '../../api';
import { ArtifactPreview } from './artifact-preview';

vi.mock('../../components/diagram-canvas', () => ({
  DiagramCanvas: ({ readOnly, preview }: { readOnly?: boolean; preview?: boolean }) => (
    <div data-testid="diagram-preview" data-read-only={String(readOnly)} data-preview={String(preview)} />
  )
}));
vi.mock('../../components/mindmap-canvas', () => ({
  MindMapCanvas: ({ readOnly, preview }: { readOnly?: boolean; preview?: boolean }) => (
    <div data-testid="mindmap-preview" data-read-only={String(readOnly)} data-preview={String(preview)} />
  )
}));
vi.mock('../../components/whiteboard-canvas', () => ({
  WhiteboardCanvas: ({ readOnly, preview }: { readOnly?: boolean; preview?: boolean }) => (
    <div data-testid="whiteboard-preview" data-read-only={String(readOnly)} data-preview={String(preview)} />
  )
}));

function artifact(kind: NoteArtifact['kind']): NoteArtifact {
  return {
    id: `${kind}-1`,
    noteId: 'note-1',
    kind,
    title: kind === 'diagram' ? 'Funil' : null,
    data: kind === 'mindmap'
      ? { nodeData: { id: 'root', topic: 'Ideia', children: [] } }
      : kind === 'whiteboard'
        ? { elements: [], files: {} }
        : { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    editVersion: 1,
    createdAt: '2026-08-07T12:00:00.000Z',
    updatedAt: '2026-08-07T12:00:00.000Z'
  };
}

describe('ArtifactPreview', () => {
  it.each([
    ['diagram', 'diagram-preview'],
    ['mindmap', 'mindmap-preview'],
    ['whiteboard', 'whiteboard-preview']
  ] as const)('dispatches %s data to a compact read-only renderer', async (kind, testId) => {
    render(<ArtifactPreview artifact={artifact(kind)} />);

    const renderer = await screen.findByTestId(testId);
    expect(renderer).toHaveAttribute('data-read-only', 'true');
    expect(renderer).toHaveAttribute('data-preview', 'true');
    expect(renderer.closest('[inert]')).not.toBeNull();
  });

  it('names the visual preview from its kind and title', async () => {
    render(<ArtifactPreview artifact={artifact('diagram')} />);
    expect(await screen.findByLabelText('Prévia do diagrama Funil')).toBeVisible();
  });
});
