import type { NoteArtifactKind, NoteArtifactSummary } from './types';
import type { OperisBlock } from './editor/operis-block-types';

const artifactOrder: Record<NoteArtifactKind, number> = {
  diagram: 0,
  mindmap: 1,
  whiteboard: 2
};

const artifactLabels: Record<NoteArtifactKind, string> = {
  diagram: 'Diagrama',
  mindmap: 'Mapa mental',
  whiteboard: 'Quadro livre'
};

export function artifactLabel(kind: NoteArtifactKind): string {
  return artifactLabels[kind];
}

export function createArtifactBlock(artifact: NoteArtifactSummary): OperisBlock {
  return {
    type: 'operisArtifact',
    props: {
      artifactId: artifact.id,
      artifactKind: artifact.kind,
      title: artifact.title ?? ''
    },
    content: []
  };
}

export function isArtifactBlock(block: OperisBlock): boolean {
  return (
    block.type === 'operisArtifact' &&
    typeof block.props?.artifactId === 'string' &&
    block.props.artifactId.length > 0
  );
}

export function mergeArtifactBlocks(
  blocks: OperisBlock[],
  artifacts: NoteArtifactSummary[]
): OperisBlock[] {
  const referenced = new Set(
    blocks.filter(isArtifactBlock).map((block) => String(block.props?.artifactId))
  );
  const missing = artifacts
    .filter((artifact) => !referenced.has(artifact.id))
    .sort((left, right) => artifactOrder[left.kind] - artifactOrder[right.kind])
    .map(createArtifactBlock);

  return [...blocks, ...missing];
}
