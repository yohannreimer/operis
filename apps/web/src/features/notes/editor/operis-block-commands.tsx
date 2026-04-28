import type { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { getDefaultReactSlashMenuItems } from '@blocknote/react';
import type { DefaultReactSuggestionItem } from '@blocknote/react';
import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileText,
  Lightbulb,
  Link2,
  ListChecks,
  PanelTopOpen,
  RotateCcw,
  Save,
  Table2,
  Users
} from 'lucide-react';
import type { OperisBlock } from './operis-block-types';
import { OPERIS_BLOCK_SNIPPETS } from './operis-block-templates';

export type OperisEditorCommand = 'templates' | 'details' | 'save';

export type OperisBlockCommandGroup = 'Operis' | 'Estrutura' | 'Exportar';

export type OperisSlashMenuItem = DefaultReactSuggestionItem & {
  group: OperisBlockCommandGroup;
};

export type OperisBlockCommandCallbacks = {
  onCommand?: (command: OperisEditorCommand) => void;
};

type BuildOperisSlashMenuItemsOptions = OperisBlockCommandCallbacks & {
  editor?: BlockNoteEditor<any, any, any>;
};

function insertSnippet(editor: BlockNoteEditor<any, any, any> | undefined, blocks: OperisBlock[]) {
  if (!editor || blocks.length === 0) {
    return;
  }

  const [firstBlock, ...remainingBlocks] = blocks;
  const insertedBlock = insertOrUpdateBlockForSlashMenu(editor, firstBlock as PartialBlock<any, any, any>);

  if (remainingBlocks.length > 0) {
    const insertedBlocks = editor.insertBlocks(remainingBlocks as PartialBlock<any, any, any>[], insertedBlock, 'after');
    editor.setTextCursorPosition(insertedBlocks.at(-1) ?? insertedBlock);
  }
}

function insertBlock(editor: BlockNoteEditor<any, any, any> | undefined, block: OperisBlock) {
  if (!editor) {
    return;
  }

  insertOrUpdateBlockForSlashMenu(editor, block as PartialBlock<any, any, any>);
}

function callbackCommand(onCommand: OperisBlockCommandCallbacks['onCommand'], command: OperisEditorCommand) {
  return () => onCommand?.(command);
}

function icon(element: React.ReactNode) {
  return element as DefaultReactSuggestionItem['icon'];
}

export function buildOperisSlashMenuItems({
  editor,
  onCommand
}: BuildOperisSlashMenuItemsOptions = {}): OperisSlashMenuItem[] {
  return [
    {
      title: 'Decisão executiva',
      subtext: 'Registra uma decisão com motivo e próximo passo.',
      aliases: ['decisao', 'decisão', 'decision'],
      group: 'Operis',
      icon: icon(<ClipboardList size={18} />),
      onItemClick: () => insertSnippet(editor, OPERIS_BLOCK_SNIPPETS.decision)
    },
    {
      title: 'Próximo passo',
      subtext: 'Cria uma ação executiva aberta.',
      aliases: ['proximo', 'próximo', 'acao', 'ação'],
      group: 'Operis',
      icon: icon(<ListChecks size={18} />),
      onItemClick: () => insertSnippet(editor, OPERIS_BLOCK_SNIPPETS.nextStep)
    },
    {
      title: 'Risco',
      subtext: 'Destaca risco, impacto e mitigação.',
      aliases: ['risco', 'impacto', 'mitigacao', 'mitigação'],
      group: 'Operis',
      icon: icon(<AlertTriangle size={18} />),
      onItemClick: () => insertSnippet(editor, OPERIS_BLOCK_SNIPPETS.risk)
    },
    {
      title: 'Insight',
      subtext: 'Captura um aprendizado ou sinal relevante.',
      aliases: ['ideia', 'aprendizado', 'sinal'],
      group: 'Operis',
      icon: icon(<Lightbulb size={18} />),
      onItemClick: () => insertSnippet(editor, OPERIS_BLOCK_SNIPPETS.insight)
    },
    {
      title: 'Reunião',
      subtext: 'Estrutura participantes e pauta.',
      aliases: ['reuniao', 'reunião', 'meeting'],
      group: 'Operis',
      icon: icon(<Users size={18} />),
      onItemClick: () => insertSnippet(editor, OPERIS_BLOCK_SNIPPETS.meeting)
    },
    {
      title: 'Checklist executivo',
      subtext: 'Abre um checklist para revisão executiva.',
      aliases: ['checklist', 'executivo'],
      group: 'Operis',
      icon: icon(<CheckSquare size={18} />),
      onItemClick: () => insertSnippet(editor, OPERIS_BLOCK_SNIPPETS.executiveChecklist)
    },
    {
      title: 'Tarefa vinculada',
      subtext: 'Referência uma tarefa do sistema.',
      aliases: ['tarefa', 'task', 'vinculada'],
      group: 'Operis',
      icon: icon(<Link2 size={18} />),
      onItemClick: () =>
        insertBlock(editor, {
          type: 'operisLinkedTask',
          content: 'Título da tarefa vinculada',
          props: { status: 'open', taskId: '' }
        })
    },
    {
      title: 'Checklist comum',
      subtext: 'Insere um item marcável padrão.',
      aliases: ['todo', 'lista'],
      group: 'Estrutura',
      icon: icon(<CheckSquare size={18} />),
      onItemClick: () => insertBlock(editor, { type: 'checkListItem', props: { checked: false }, content: '' })
    },
    {
      title: 'Tabela',
      subtext: 'Cria uma tabela 3x2 para comparação rápida.',
      aliases: ['table', 'planilha'],
      group: 'Estrutura',
      icon: icon(<Table2 size={18} />),
      onItemClick: () =>
        insertBlock(editor, {
          type: 'table',
          content: {
            type: 'tableContent',
            rows: [{ cells: ['', '', ''] }, { cells: ['', '', ''] }]
          }
        })
    },
    {
      title: 'Retro',
      subtext: 'Insere a estrutura de retro rápida.',
      aliases: ['retrospectiva', 'review'],
      group: 'Estrutura',
      icon: icon(<RotateCcw size={18} />),
      onItemClick: () => insertSnippet(editor, OPERIS_BLOCK_SNIPPETS.retro)
    },
    {
      title: 'Data',
      subtext: 'Insere a data de hoje.',
      aliases: ['hoje', 'today'],
      group: 'Estrutura',
      icon: icon(<CalendarDays size={18} />),
      onItemClick: () =>
        insertBlock(editor, {
          type: 'paragraph',
          content: `Data: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date())}`
        })
    },
    {
      title: 'Templates',
      subtext: 'Abre os modelos salvos da nota.',
      aliases: ['modelo', 'modelos'],
      group: 'Exportar',
      icon: icon(<PanelTopOpen size={18} />),
      onItemClick: callbackCommand(onCommand, 'templates')
    },
    {
      title: 'Detalhes',
      subtext: 'Abre metadados e contexto da nota.',
      aliases: ['detalhes', 'meta', 'metadata'],
      group: 'Exportar',
      icon: icon(<FileText size={18} />),
      onItemClick: callbackCommand(onCommand, 'details')
    },
    {
      title: 'Salvar',
      subtext: 'Solicita salvamento da nota atual.',
      aliases: ['save', 'gravar'],
      group: 'Exportar',
      icon: icon(<Save size={18} />),
      onItemClick: callbackCommand(onCommand, 'save')
    }
  ];
}

export function getOperisSlashMenuItems(
  editor: BlockNoteEditor<any, any, any>,
  callbacks: OperisBlockCommandCallbacks = {}
) {
  return async (query: string) =>
    filterSuggestionItems(
      [...buildOperisSlashMenuItems({ ...callbacks, editor }), ...getDefaultReactSlashMenuItems(editor)],
      query
    );
}
