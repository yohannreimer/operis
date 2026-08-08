import { describe, expect, it } from 'vitest';

import {
  artifactLabel,
  createArtifactBlock,
  ensureArtifactContinuations,
  isArtifactBlock,
  mergeArtifactBlocks
} from './artifact-blocks';
import type { OperisBlock } from './editor/operis-block-types';

const artifact = {
  id: 'artifact-1',
  noteId: 'note-1',
  kind: 'diagram' as const,
  title: 'Funil',
  editVersion: 1,
  updatedAt: '2026-08-07T12:00:00.000Z'
};

describe('artifact block helpers', () => {
  it('builds a portable embedded artifact reference', () => {
    expect(createArtifactBlock(artifact)).toEqual({
      type: 'operisArtifact',
      props: { artifactId: artifact.id, artifactKind: 'diagram', title: 'Funil' },
      content: []
    });
    expect(artifactLabel('diagram')).toBe('Diagrama');
    expect(isArtifactBlock(createArtifactBlock(artifact))).toBe(true);
  });

  it('hydrates missing artifacts once and in visual-tool order', () => {
    const existing = [createArtifactBlock(artifact)];
    const artifacts = [
      { ...artifact, id: 'board-1', kind: 'whiteboard' as const },
      artifact,
      { ...artifact, id: 'map-1', kind: 'mindmap' as const }
    ];
    const merged = mergeArtifactBlocks(existing, artifacts);

    expect(merged).toHaveLength(6);
    expect(merged.map((block) => [block.type, block.props?.artifactId ?? null])).toEqual([
      ['operisArtifact', 'artifact-1'],
      ['paragraph', null],
      ['operisArtifact', 'map-1'],
      ['paragraph', null],
      ['operisArtifact', 'board-1'],
      ['paragraph', null]
    ]);
    expect(mergeArtifactBlocks(merged, artifacts)).toEqual(merged);
  });

  it('places exactly one editable paragraph after every artifact', () => {
    const paragraph = { type: 'paragraph', content: [] } as OperisBlock;
    const adjacent = [
      createArtifactBlock(artifact),
      createArtifactBlock({ ...artifact, id: 'map-1', kind: 'mindmap' as const })
    ];

    const normalized = ensureArtifactContinuations(adjacent);

    expect(normalized.map((block) => block.type)).toEqual([
      'operisArtifact', 'paragraph', 'operisArtifact', 'paragraph'
    ]);
    expect(ensureArtifactContinuations([createArtifactBlock(artifact), paragraph])).toEqual([
      createArtifactBlock(artifact), paragraph
    ]);
    expect(ensureArtifactContinuations(normalized)).toEqual(normalized);
  });
});
