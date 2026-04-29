import { BlockNoteSchema, defaultBlockSpecs, type BlockNoteEditor } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Lightbulb,
  Link2,
  ListChecks,
  Users
} from 'lucide-react';
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

type BlockChromeProps = {
  tone: 'decision' | 'next-step' | 'risk' | 'insight' | 'meeting' | 'checklist' | 'task';
  icon: React.ReactNode;
  label: string;
  caption: string;
  children?: React.ReactNode;
};

function BlockChrome({ tone, icon, label, caption, children }: BlockChromeProps) {
  return (
    <div className="operis-block-head">
      <span className={`operis-block-icon operis-block-icon-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="operis-block-kicker">{label}</span>
        <span className="operis-block-caption">{caption}</span>
      </span>
      {children ? <span className="operis-block-head-action">{children}</span> : null}
    </div>
  );
}

function StatusToggle({
  block,
  editor
}: {
  block: { props: Record<string, string> };
  editor: BlockNoteEditor<any, any, any>;
}) {
  const done = block.props.status === 'done';

  return (
    <button
      type="button"
      className={`operis-block-status ${done ? 'done' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        editor.updateBlock(block as any, {
          props: {
            ...block.props,
            status: done ? 'open' : 'done'
          }
        } as any);
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {done ? 'Feito' : 'Aberto'}
    </button>
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
        <BlockChrome
          tone="decision"
          icon={<ClipboardCheck size={16} />}
          label="Decisão"
          caption="Escolha tomada, motivo e saída operacional"
        />
        <div className="operis-block-title" ref={contentRef} />
        <div className="operis-block-fields">
          <PropEditor
            block={block}
            editor={editor}
            field="reason"
            label="Motivo"
            placeholder="Contexto, trade-off ou critério usado"
            multiline
          />
          <PropEditor
            block={block}
            editor={editor}
            field="nextStep"
            label="Próximo passo"
            placeholder="Ação, dono ou data de revisão"
          />
        </div>
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
    render: ({ block, editor, contentRef }) => (
      <section className="operis-block-card operis-block-next-step">
        <BlockChrome
          tone="next-step"
          icon={<CheckCircle2 size={16} />}
          label="Próximo passo"
          caption="Ação executável derivada da nota"
        >
          <StatusToggle block={block} editor={editor} />
        </BlockChrome>
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
        <BlockChrome
          tone="risk"
          icon={<AlertTriangle size={16} />}
          label="Risco"
          caption="Sinal, impacto provável e resposta"
        />
        <div className="operis-block-title" ref={contentRef} />
        <div className="operis-block-fields operis-block-fields-two">
          <PropEditor
            block={block}
            editor={editor}
            field="impact"
            label="Impacto"
            placeholder="O que muda se acontecer"
            multiline
          />
          <PropEditor
            block={block}
            editor={editor}
            field="mitigation"
            label="Mitigação"
            placeholder="Como reduzir ou contornar"
            multiline
          />
        </div>
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
        <BlockChrome
          tone="insight"
          icon={<Lightbulb size={16} />}
          label="Insight"
          caption="Aprendizado, padrão percebido ou hipótese"
        />
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
        <BlockChrome
          tone="meeting"
          icon={<Users size={16} />}
          label={block.props.title || 'Reunião'}
          caption="Resumo, pessoas envolvidas e pauta"
        />
        <div className="operis-block-title" ref={contentRef} />
        <div className="operis-block-fields">
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
            placeholder="Pontos tratados ou decisões esperadas"
            multiline
          />
        </div>
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
        <BlockChrome
          tone="checklist"
          icon={<ListChecks size={16} />}
          label={block.props.label}
          caption="Critérios de revisão antes de avançar"
        />
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
        <BlockChrome
          tone="task"
          icon={<Link2 size={16} />}
          label="Tarefa vinculada"
          caption="Conexão manual com uma tarefa do Operis"
        />
        <div className="operis-block-title" ref={contentRef} />
        <div className="operis-block-fields operis-block-fields-two">
          <PropEditor block={block} editor={editor} field="status" label="Status" placeholder="open, doing ou done" />
          <PropEditor block={block} editor={editor} field="taskId" label="ID da tarefa" placeholder="ID interno" />
        </div>
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
