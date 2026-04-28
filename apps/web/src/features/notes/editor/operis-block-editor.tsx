import { SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useMemo } from 'react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { legacyContentToBlocks } from './legacy-content-migration';
import type { OperisBlock, OperisBlockEditorValue } from './operis-block-types';
import { getOperisSlashMenuItems, type OperisEditorCommand } from './operis-block-commands';
import { operisBlockSchema } from './operis-block-schema';
import { serializeNoteBlocks } from './operis-block-serializers';

export type OperisBlockEditorProps = {
  noteId: string | number | null | undefined;
  initialBlocks?: OperisBlock[] | null;
  legacyContent?: string | null;
  onChange?: (value: OperisBlockEditorValue) => void;
  onCommand?: (command: OperisEditorCommand) => void;
};

function initialDocument(initialBlocks?: OperisBlock[] | null, legacyContent?: string | null) {
  if (initialBlocks?.length) {
    return initialBlocks;
  }

  return legacyContentToBlocks(legacyContent);
}

export function OperisBlockEditor({
  noteId,
  initialBlocks,
  legacyContent,
  onChange,
  onCommand
}: OperisBlockEditorProps) {
  const initialContent = useMemo(
    () => initialDocument(initialBlocks, legacyContent),
    [initialBlocks, legacyContent, noteId]
  );
  const editor = useCreateBlockNote(
    {
      initialContent: initialContent as any,
      schema: operisBlockSchema
    },
    [noteId]
  );

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
      <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
    </BlockNoteView>
  );
}
