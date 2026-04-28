import type { OperisBlock, SerializedNoteBlocks } from './operis-block-types';

type SerializedBlock = SerializedNoteBlocks;
type RenderContext = {
  depth: number;
};

type InlineRender = SerializedNoteBlocks;

function textInline(value: string): InlineRender {
  return {
    text: value,
    html: escapeHtml(value),
    markdown: value,
    whatsapp: value
  };
}

function mergeInline(parts: InlineRender[]): InlineRender {
  return {
    text: parts.map((part) => part.text).join(''),
    html: parts.map((part) => part.html).join(''),
    markdown: parts.map((part) => part.markdown).join(''),
    whatsapp: parts.map((part) => part.whatsapp).join('')
  };
}

function renderInline(content: unknown): InlineRender {
  if (typeof content === 'string') {
    return textInline(content);
  }

  if (Array.isArray(content)) {
    return mergeInline(
      content.map((part) => {
        if (typeof part === 'string') {
          return textInline(part);
        }

        if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          (part as { type: unknown }).type === 'link'
        ) {
          const link = part as { content?: unknown; href?: unknown; url?: unknown };
          const href = String(link.href ?? link.url ?? '').trim();
          const label = renderInline(link.content);

          if (!href) {
            return label;
          }

          return {
            text: label.text,
            html: `<a href="${escapeHtml(href)}">${label.html}</a>`,
            markdown: `[${label.text}](${href})`,
            whatsapp: `${label.text} (${href})`
          };
        }

        if (part && typeof part === 'object' && 'content' in part) {
          return renderInline((part as { content: unknown }).content);
        }

        if (part && typeof part === 'object' && 'text' in part) {
          return textInline(String((part as { text: unknown }).text ?? ''));
        }

        return textInline('');
      })
    );
  }

  return textInline('');
}

function escapeHtml(raw: string) {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function blockProps(block: OperisBlock) {
  return block.props ?? {};
}

function propText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback.trim();
}

function primaryText(contentText: string, propValue: unknown, fallback = '') {
  return propText(contentText, propText(propValue, fallback));
}

function indent(depth: number) {
  return '  '.repeat(Math.max(0, depth));
}

function boundedHeadingLevel(value: unknown) {
  const level = Number(value ?? 1);
  if (!Number.isFinite(level)) {
    return 1;
  }

  return Math.max(1, Math.min(6, Math.floor(level)));
}

function mergeParentAndChildren(parent: SerializedBlock, children: SerializedBlock[]): SerializedBlock {
  if (children.length === 0) {
    return parent;
  }

  const childText = children.map((child) => child.text).filter(Boolean).join('\n');
  const childHtml = children.map((child) => child.html).filter(Boolean).join('\n');
  const childMarkdown = children.map((child) => child.markdown).filter(Boolean).join('\n');
  const childWhatsapp = children.map((child) => child.whatsapp).filter(Boolean).join('\n');

  return {
    text: [parent.text, childText].filter(Boolean).join('\n'),
    html: [parent.html, childHtml].filter(Boolean).join('\n'),
    markdown: [parent.markdown, childMarkdown].filter(Boolean).join('\n'),
    whatsapp: [parent.whatsapp, childWhatsapp].filter(Boolean).join('\n')
  };
}

function childHtml(children: SerializedBlock[]) {
  return children.map((child) => child.html).filter(Boolean).join('\n');
}

function serializeBlock(block: OperisBlock, context: RenderContext): SerializedBlock {
  const p = blockProps(block);
  const inline = renderInline(block.content);
  const text = inline.text;
  const children = (block.children ?? []).map((child) =>
    serializeBlock(child, {
      depth: context.depth + 1
    })
  );

  switch (block.type) {
    case 'heading': {
      const level = boundedHeadingLevel(p.level);
      const markdownLevel = Math.min(3, level);

      return mergeParentAndChildren({
        text,
        html: `<h${level}>${inline.html}</h${level}>`,
        markdown: `${'#'.repeat(markdownLevel)} ${inline.markdown}`,
        whatsapp: `*${inline.whatsapp}*`
      }, children);
    }

    case 'checkListItem': {
      const checked = Boolean(p.checked);
      const prefix = indent(context.depth);
      const nestedHtml = childHtml(children);

      return mergeParentAndChildren({
        text: `${prefix}${checked ? '[x]' : '[ ]'} ${text}`,
        html: `<label><input type="checkbox"${
          checked ? ' checked' : ''
        } disabled> ${inline.html}</label>${nestedHtml ? `<div class="note-block-children">${nestedHtml}</div>` : ''}`,
        markdown: `${prefix}- [${checked ? 'x' : ' '}] ${inline.markdown}`,
        whatsapp: `${prefix}${checked ? '[x]' : '[ ]'} ${inline.whatsapp}`
      }, children.map((child) => ({ ...child, html: '' })));
    }

    case 'bulletListItem': {
      const prefix = indent(context.depth);
      const nestedHtml = childHtml(children);
      return mergeParentAndChildren({
        text: `${prefix}- ${text}`,
        html: `<ul><li>${inline.html}${nestedHtml ? `\n${nestedHtml}` : ''}</li></ul>`,
        markdown: `${prefix}- ${inline.markdown}`,
        whatsapp: `${prefix}- ${inline.whatsapp}`
      }, children.map((child) => ({ ...child, html: '' })));
    }

    case 'numberedListItem': {
      const prefix = indent(context.depth);
      const nestedHtml = childHtml(children);
      return mergeParentAndChildren({
        text: `${prefix}1. ${text}`,
        html: `<ol><li>${inline.html}${nestedHtml ? `\n${nestedHtml}` : ''}</li></ol>`,
        markdown: `${prefix}1. ${inline.markdown}`,
        whatsapp: `${prefix}1. ${inline.whatsapp}`
      }, children.map((child) => ({ ...child, html: '' })));
    }

    case 'operisDecision': {
      const title = primaryText(text, p.title);
      const reason = propText(p.reason);
      const nextStep = propText(p.nextStep);
      const lines = [
        `Decisão: ${title}`,
        reason ? `Motivo: ${reason}` : '',
        nextStep ? `Próximo passo: ${nextStep}` : ''
      ].filter(Boolean);

      return mergeParentAndChildren({
        text: lines.join('\n'),
        html: `<section data-operis-block="decision"><strong>Decisão:</strong> ${escapeHtml(title)}${
          reason ? `<p>Motivo: ${escapeHtml(reason)}</p>` : ''
        }${nextStep ? `<p>Próximo passo: ${escapeHtml(nextStep)}</p>` : ''}</section>`,
        markdown: `> ${lines.join('\n> ')}`,
        whatsapp: `*Decisão:* ${title}${reason ? `\nMotivo: ${reason}` : ''}${
          nextStep ? `\nPróximo passo: ${nextStep}` : ''
        }`
      }, children);
    }

    case 'operisNextStep': {
      const value = primaryText(text, p.text);
      const done = p.status === 'done';

      return mergeParentAndChildren({
        text: `Próximo passo: ${value}`,
        html: `<section data-operis-block="next-step">${done ? 'Feito' : 'Aberto'}: ${escapeHtml(value)}</section>`,
        markdown: `- [${done ? 'x' : ' '}] ${value}`,
        whatsapp: `${done ? '[x]' : '[ ]'} Próximo passo: ${value}`
      }, children);
    }

    case 'operisRisk': {
      const risk = primaryText(text, p.risk);
      const impact = propText(p.impact);
      const mitigation = propText(p.mitigation);
      const lines = [
        `Risco: ${risk}`,
        impact ? `Impacto: ${impact}` : '',
        mitigation ? `Mitigação: ${mitigation}` : ''
      ].filter(Boolean);

      return mergeParentAndChildren({
        text: lines.join('\n'),
        html: `<section data-operis-block="risk">${lines.map(escapeHtml).join('<br>')}</section>`,
        markdown: `> ${lines.join('\n> ')}`,
        whatsapp: lines.join('\n')
      }, children);
    }

    case 'operisInsight': {
      const value = primaryText(text, p.text);

      return mergeParentAndChildren({
        text: `Insight: ${value}`,
        html: `<blockquote data-operis-block="insight">${escapeHtml(value)}</blockquote>`,
        markdown: `> Insight: ${value}`,
        whatsapp: `*Insight:* ${value}`
      }, children);
    }

    case 'operisMeeting': {
      const title = primaryText(text, p.title, 'Reunião');
      const participants = propText(p.participants);
      const agenda = propText(p.agenda);
      const lines = [
        title,
        participants ? `Participantes: ${participants}` : '',
        agenda ? `Pauta: ${agenda}` : ''
      ].filter(Boolean);

      return mergeParentAndChildren({
        text: lines.join('\n'),
        html: `<section data-operis-block="meeting"><h2>${escapeHtml(title)}</h2>${lines
          .slice(1)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('')}</section>`,
        markdown: `## ${title}${lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : ''}`,
        whatsapp: `*${title}*${lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : ''}`
      }, children);
    }

    case 'operisExecutiveChecklist': {
      const label = primaryText(text, p.label, 'Checklist executivo');

      return mergeParentAndChildren({
        text: label,
        html: `<section data-operis-block="executive-checklist"><strong>${escapeHtml(label)}</strong></section>`,
        markdown: `### ${label}`,
        whatsapp: `*${label}*`
      }, children);
    }

    case 'operisLinkedTask': {
      const title = primaryText(text, p.title);
      const status = propText(p.status);

      return mergeParentAndChildren({
        text: `Tarefa vinculada: ${title}`,
        html: `<section data-operis-block="linked-task">${escapeHtml(title)}${
          status ? ` · ${escapeHtml(status)}` : ''
        }</section>`,
        markdown: `- Tarefa vinculada: ${title}`,
        whatsapp: `Tarefa vinculada: ${title}`
      }, children);
    }

    default:
      return mergeParentAndChildren({
        text,
        html: `<p>${inline.html}</p>`,
        markdown: inline.markdown,
        whatsapp: inline.whatsapp
      }, children);
  }
}

export function serializeNoteBlocks(blocks: OperisBlock[] = []): SerializedNoteBlocks {
  const rows = blocks.map((block) => serializeBlock(block, { depth: 0 }));

  return {
    text: rows
      .map((row) => row.text)
      .filter(Boolean)
      .join('\n\n'),
    html: rows
      .map((row) => row.html)
      .filter(Boolean)
      .join('\n'),
    markdown: rows
      .map((row) => row.markdown)
      .filter(Boolean)
      .join('\n\n'),
    whatsapp: rows
      .map((row) => row.whatsapp)
      .filter(Boolean)
      .join('\n\n')
  };
}
