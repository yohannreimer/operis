import { SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useEffect, useMemo } from 'react';
import type { BlockNoteEditor } from '@blocknote/core';
import { legacyContentToBlocks } from './legacy-content-migration';
import type { OperisBlock, OperisBlockEditorValue } from './operis-block-types';
import { getOperisSlashMenuItems, type OperisEditorCommand } from './operis-block-commands';
import { operisBlockSchema } from './operis-block-schema';
import { serializeNoteBlocks } from './operis-block-serializers';

export type OperisBlockEditorProps = {
  noteId: string | number | null | undefined;
  initialBlocks?: OperisBlock[] | null;
  legacyContent?: string | null;
  documentKey?: string | number;
  onChange?: (value: OperisBlockEditorValue) => void;
  onCommand?: (command: OperisEditorCommand, editor: BlockNoteEditor<any, any, any>) => void;
  onReady?: (editor: BlockNoteEditor<any, any, any>) => void;
};

function initialDocument(initialBlocks?: OperisBlock[] | null, legacyContent?: string | null) {
  if (initialBlocks?.length) {
    return initialBlocks;
  }

  return legacyContentToBlocks(legacyContent);
}

function contentSignature(initialBlocks?: OperisBlock[] | null, legacyContent?: string | null) {
  if (initialBlocks?.length) {
    return JSON.stringify(initialBlocks);
  }

  return legacyContent ?? '';
}

export function OperisBlockEditor({
  noteId,
  initialBlocks,
  legacyContent,
  documentKey,
  onChange,
  onCommand,
  onReady
}: OperisBlockEditorProps) {
  const documentKeyOrSignature = useMemo(
    () => documentKey ?? contentSignature(initialBlocks, legacyContent),
    [documentKey, initialBlocks, legacyContent]
  );
  const initialContent = useMemo(
    () => initialDocument(initialBlocks, legacyContent),
    [initialBlocks, legacyContent, documentKeyOrSignature]
  );
  const editor = useCreateBlockNote(
    {
      initialContent: initialContent as any,
      schema: operisBlockSchema
    },
    [noteId, documentKeyOrSignature]
  );

  useEffect(() => {
    onReady?.(editor);
  }, [editor, onReady]);

  const getItems = useMemo(() => getOperisSlashMenuItems(editor, { onCommand }), [editor, onCommand]);

  return (
    <BlockNoteView
      editor={editor}
      slashMenu={false}
      onChange={() => {
        const blocks = editor.document as unknown as OperisBlock[];
        onChange?.({
          blocks,
          ...serializeNoteBlocks(blocks)
        });
      }}
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={getItems}
        shouldOpen={(tr) => !tr.selection.$from.parent.type.isInGroup('tableContent')}
      />
    </BlockNoteView>
  );
}
