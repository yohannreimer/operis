import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { GitBranch, Mic, Network, PencilRuler, Plus } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

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
  onCommand,
  onStartDictation
}: {
  note: Note;
  onChange(value: OperisBlockEditorValue & { title: string }): void;
  onOpenArtifact(artifactId: string, blockId?: string): void;
  onCommand?(command: OperisEditorCommand): void;
  onStartDictation?(): void;
}) {
  const [title, setTitle] = useState(note.title);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
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

  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    if (!titleElement) return;
    titleElement.style.height = '0px';
    titleElement.style.height = `${titleElement.scrollHeight}px`;
  }, [title]);

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
      <textarea
        ref={titleRef}
        rows={1}
        className="note-document-title"
        aria-label="Título da nota"
        value={title}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
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
      <div className="note-document-insert">
        <button
          type="button"
          className="note-document-insert-trigger"
          aria-label="Inserir no documento"
          aria-expanded={insertMenuOpen}
          onClick={() => setInsertMenuOpen((open) => !open)}
        >
          <Plus size={17} />
        </button>
        {insertMenuOpen ? (
          <div className="note-document-insert-menu" role="menu" aria-label="Inserir no documento">
            <button type="button" role="menuitem" onClick={() => { const editor = editorRef.current; if (editor) void insertArtifact('insertDiagram', editor); setInsertMenuOpen(false); }}><GitBranch size={15} />Diagrama</button>
            <button type="button" role="menuitem" onClick={() => { const editor = editorRef.current; if (editor) void insertArtifact('insertMindmap', editor); setInsertMenuOpen(false); }}><Network size={15} />Mapa mental</button>
            <button type="button" role="menuitem" onClick={() => { const editor = editorRef.current; if (editor) void insertArtifact('insertWhiteboard', editor); setInsertMenuOpen(false); }}><PencilRuler size={15} />Quadro livre</button>
            <button type="button" role="menuitem" onClick={() => { onStartDictation?.(); setInsertMenuOpen(false); }}><Mic size={15} />Ditado</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
