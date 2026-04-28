import { BlockNoteSchema, defaultBlockSpecs, type BlockNoteEditor } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';
import type React from 'react';

type PropEditorProps = {
  block: { props: Record<string, string> };
  editor: BlockNoteEditor<any, any, any>;
  field: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

function PropEditor({ block, editor, field, label, placeholder, multiline = false }: PropEditorProps) {
  const value = block.props[field] ?? '';
  const commonProps = {
    className: 'operis-block-field-input',
    value,
    placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      editor.updateBlock(block as any, {
        props: {
          ...block.props,
          [field]: event.currentTarget.value
        }
      } as any);
    },
    onMouseDown: (event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      event.stopPropagation();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      event.stopPropagation();
    }
  };

  return (
    <label className="operis-block-field">
      <span className="operis-block-field-label">{label}</span>
      {multiline ? <textarea {...commonProps} rows={2} /> : <input {...commonProps} />}
    </label>
  );
}

const OperisDecision = createReactBlockSpec(
  {
    type: 'operisDecision',
    propSchema: {
      title: { default: '' },
      reason: { default: '' },
      nextStep: { default: '' }
    },
    content: 'inline'
  },
  {
    render: ({ block, editor, contentRef }) => (
      <section className="operis-block-card operis-block-decision">
        <div className="operis-block-kicker">Decisão</div>
        <div className="operis-block-title" ref={contentRef} />
        <PropEditor
          block={block}
          editor={editor}
          field="reason"
          label="Motivo"
          placeholder="Contexto da decisão"
          multiline
        />
        <PropEditor
          block={block}
          editor={editor}
          field="nextStep"
          label="Próximo passo"
          placeholder="Ação recomendada"
        />
      </section>
    )
  }
);

const OperisNextStep = createReactBlockSpec(
  {
    type: 'operisNextStep',
    propSchema: {
      text: { default: '' },
      status: { default: 'open', values: ['open', 'done'] }
    },
    content: 'inline'
  },
  {
    render: ({ block, contentRef }) => (
      <section className="operis-block-card operis-block-next-step">
        <div className="operis-block-kicker">{block.props.status === 'done' ? 'Próximo passo feito' : 'Próximo passo'}</div>
        <div className="operis-block-title" ref={contentRef} />
      </section>
    )
  }
);

const OperisRisk = createReactBlockSpec(
  {
    type: 'operisRisk',
    propSchema: {
      risk: { default: '' },
      impact: { default: '' },
      mitigation: { default: '' }
    },
    content: 'inline'
  },
  {
    render: ({ block, editor, contentRef }) => (
      <section className="operis-block-card operis-block-risk">
        <div className="operis-block-kicker">Risco</div>
        <div className="operis-block-title" ref={contentRef} />
        <PropEditor
          block={block}
          editor={editor}
          field="impact"
          label="Impacto"
          placeholder="Impacto esperado"
          multiline
        />
        <PropEditor
          block={block}
          editor={editor}
          field="mitigation"
          label="Mitigação"
          placeholder="Plano de mitigação"
          multiline
        />
      </section>
    )
  }
);

const OperisInsight = createReactBlockSpec(
  {
    type: 'operisInsight',
    propSchema: {
      text: { default: '' }
    },
    content: 'inline'
  },
  {
    render: ({ contentRef }) => (
      <blockquote className="operis-block-card operis-block-insight">
        <div className="operis-block-kicker">Insight</div>
        <div className="operis-block-title" ref={contentRef} />
      </blockquote>
    )
  }
);

const OperisMeeting = createReactBlockSpec(
  {
    type: 'operisMeeting',
    propSchema: {
      title: { default: 'Reunião' },
      participants: { default: '' },
      agenda: { default: '' }
    },
    content: 'inline'
  },
  {
    render: ({ block, editor, contentRef }) => (
      <section className="operis-block-card operis-block-meeting">
        <div className="operis-block-kicker">{block.props.title || 'Reunião'}</div>
        <div className="operis-block-title" ref={contentRef} />
        <PropEditor
          block={block}
          editor={editor}
          field="participants"
          label="Participantes"
          placeholder="Quem participou"
        />
        <PropEditor
          block={block}
          editor={editor}
          field="agenda"
          label="Pauta"
          placeholder="Pontos principais"
          multiline
        />
      </section>
    )
  }
);

const OperisExecutiveChecklist = createReactBlockSpec(
  {
    type: 'operisExecutiveChecklist',
    propSchema: {
      label: { default: 'Checklist executivo' }
    },
    content: 'inline'
  },
  {
    render: ({ block, contentRef }) => (
      <section className="operis-block-card operis-block-executive-checklist">
        <div className="operis-block-kicker">{block.props.label}</div>
        <div className="operis-block-title" ref={contentRef} />
      </section>
    )
  }
);

const OperisLinkedTask = createReactBlockSpec(
  {
    type: 'operisLinkedTask',
    propSchema: {
      title: { default: '' },
      status: { default: 'open' },
      taskId: { default: '' }
    },
    content: 'inline'
  },
  {
    render: ({ block, editor, contentRef }) => (
      <section className="operis-block-card operis-block-linked-task">
        <div className="operis-block-kicker">Tarefa vinculada</div>
        <div className="operis-block-title" ref={contentRef} />
        <PropEditor block={block} editor={editor} field="status" label="Status" placeholder="Status da tarefa" />
        <PropEditor block={block} editor={editor} field="taskId" label="ID" placeholder="ID interno" />
      </section>
    )
  }
);

export const operisBlockSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    operisDecision: OperisDecision(),
    operisNextStep: OperisNextStep(),
    operisRisk: OperisRisk(),
    operisInsight: OperisInsight(),
    operisMeeting: OperisMeeting(),
    operisExecutiveChecklist: OperisExecutiveChecklist(),
    operisLinkedTask: OperisLinkedTask()
  }
});

export type OperisBlockNoteSchema = typeof operisBlockSchema;
