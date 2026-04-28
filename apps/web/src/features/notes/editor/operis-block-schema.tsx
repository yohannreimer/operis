import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';

function Field({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) {
    return null;
  }

  return (
    <div className="operis-block-field">
      <span className="operis-block-field-label">{label}</span>
      <span>{value}</span>
    </div>
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
    render: ({ block, contentRef }) => (
      <section className="operis-block-card operis-block-decision">
        <div className="operis-block-kicker">Decisão</div>
        <div className="operis-block-title" ref={contentRef} />
        <Field label="Motivo" value={block.props.reason} />
        <Field label="Próximo passo" value={block.props.nextStep} />
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
    render: ({ block, contentRef }) => (
      <section className="operis-block-card operis-block-risk">
        <div className="operis-block-kicker">Risco</div>
        <div className="operis-block-title" ref={contentRef} />
        <Field label="Impacto" value={block.props.impact} />
        <Field label="Mitigação" value={block.props.mitigation} />
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
    render: ({ block, contentRef }) => (
      <section className="operis-block-card operis-block-meeting">
        <div className="operis-block-kicker">{block.props.title || 'Reunião'}</div>
        <div className="operis-block-title" ref={contentRef} />
        <Field label="Participantes" value={block.props.participants} />
        <Field label="Pauta" value={block.props.agenda} />
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
    render: ({ block, contentRef }) => (
      <section className="operis-block-card operis-block-linked-task">
        <div className="operis-block-kicker">Tarefa vinculada</div>
        <div className="operis-block-title" ref={contentRef} />
        <Field label="Status" value={block.props.status} />
        <Field label="ID" value={block.props.taskId} />
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
