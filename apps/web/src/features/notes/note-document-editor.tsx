import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { useCallback, useRef, useState } from 'react';

import { api, type Note, type NoteArtifactKind } from '../../api';
import { ArtifactBlockProvider } from './artifact-block';
import { createArtifactBlock } from './artifact-blocks';
import {
  OperisBlockEditor,
  type OperisBlock,
  type OperisBlockEditorValue,
  type OperisEditorCommand,
  serializeNoteBlocks
} from './editor';
import './editor/operis-block-editor-styles';

type Editor = BlockNoteEditor<any, any, any>;

function emptyArtifactData(kind: NoteArtifactKind): Record<string, unknown> {
  if (kind === 'diagram') {
    return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  }
  if (kind === 'mindmap') {
    return { nodeData: { id: 'root', topic: 'Ideia central', children: [] } };
  }
  return { elements: [], appState: {}, files: {} };
}

const commandKinds: Partial<Record<OperisEditorCommand, NoteArtifactKind>> = {
  insertDiagram: 'diagram',
  insertMindmap: 'mindmap',
  insertWhiteboard: 'whiteboard'
};

export function NoteDocumentEditor({
  note,
  onChange,
  onOpenArtifact,
  onCommand
}: {
  note: Note;
  onChange(value: OperisBlockEditorValue & { title: string }): void;
  onOpenArtifact(artifactId: string, blockId?: string): void;
  onCommand?(command: OperisEditorCommand): void;
}) {
  const [title, setTitle] = useState(note.title);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const latestValue = useRef<OperisBlockEditorValue>({
    blocks: (note.contentBlocks ?? []) as OperisBlock[],
    ...serializeNoteBlocks((note.contentBlocks ?? []) as OperisBlock[])
  });

  const emitDocument = useCallback((editor: Editor, nextTitle = title) => {
    const blocks = editor.document as unknown as OperisBlock[];
    const value = { blocks, ...serializeNoteBlocks(blocks) };
    latestValue.current = value;
    onChange({ ...value, title: nextTitle });
  }, [onChange, title]);

  async function insertArtifact(command: OperisEditorCommand, editor: Editor) {
    const kind = commandKinds[command];
    if (!kind) return;
    setArtifactError(null);
    const artifact = await api.createNoteArtifact(note.id, {
      kind,
      title: null,
      data: emptyArtifactData(kind)
    });

    try {
      const inserted = insertOrUpdateBlockForSlashMenu(
        editor,
        createArtifactBlock(artifact) as PartialBlock<any, any, any>
      );
      emitDocument(editor);
      onOpenArtifact(artifact.id, inserted.id);
    } catch (error) {
      await api.deleteNoteArtifact(note.id, artifact.id).catch(() => undefined);
      setArtifactError(error instanceof Error ? error.message : 'Não foi possível inserir o bloco.');
    }
  }

  const deleteArtifact = useCallback(async (artifactId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    setArtifactError(null);
    try {
      await api.deleteNoteArtifact(note.id, artifactId);
      const block = (editor.document as unknown as OperisBlock[]).find(
        (candidate) => candidate.type === 'operisArtifact' && candidate.props?.artifactId === artifactId
      );
      if (block?.id) editor.removeBlocks([block.id]);
      emitDocument(editor);
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : 'Não foi possível excluir o artefato.');
    }
  }, [emitDocument, note.id]);

  return (
    <section className="note-document-paper">
      <input
        className="note-document-title"
        aria-label="Título da nota"
        value={title}
        onChange={(event) => {
          const nextTitle = event.currentTarget.value;
          setTitle(nextTitle);
          onChange({ ...latestValue.current, title: nextTitle });
        }}
      />
      {artifactError ? (
        <div className="note-document-artifact-error" role="alert">
          {artifactError} <button type="button" onClick={() => setArtifactError(null)}>Fechar</button>
        </div>
      ) : null}
      <ArtifactBlockProvider
        onOpen={(artifactId) => {
          const block = (editorRef.current?.document as unknown as OperisBlock[] | undefined)?.find(
            (candidate) => candidate.type === 'operisArtifact' && candidate.props?.artifactId === artifactId
          );
          onOpenArtifact(artifactId, block?.id);
        }}
        onDelete={(artifactId) => void deleteArtifact(artifactId)}
      >
        <OperisBlockEditor
          noteId={note.id}
          initialBlocks={(note.contentBlocks ?? []) as OperisBlock[]}
          legacyContent={note.content}
          documentKey={`${note.id}:${note.editVersion}`}
          onReady={(editor) => { editorRef.current = editor; }}
          onChange={(value) => {
            latestValue.current = value;
            onChange({ ...value, title });
          }}
          onCommand={(command, editor) => {
            if (commandKinds[command]) void insertArtifact(command, editor);
            else onCommand?.(command);
          }}
        />
      </ArtifactBlockProvider>
    </section>
  );
}
