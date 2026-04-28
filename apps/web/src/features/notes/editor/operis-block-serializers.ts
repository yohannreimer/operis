import type { OperisBlock, SerializedNoteBlocks } from './operis-block-types';

type SerializedBlock = SerializedNoteBlocks;

function inlineText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '');
        }

        return '';
      })
      .join('');
  }

  return '';
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
  return String(value ?? fallback).trim();
}

function boundedHeadingLevel(value: unknown) {
  const level = Number(value ?? 1);
  if (!Number.isFinite(level)) {
    return 1;
  }

  return Math.max(1, Math.min(6, Math.floor(level)));
}

function serializeBlock(block: OperisBlock): SerializedBlock {
  const p = blockProps(block);
  const text = inlineText(block.content);

  switch (block.type) {
    case 'heading': {
      const level = boundedHeadingLevel(p.level);
      const markdownLevel = Math.min(3, level);

      return {
        text,
        html: `<h${level}>${escapeHtml(text)}</h${level}>`,
        markdown: `${'#'.repeat(markdownLevel)} ${text}`,
        whatsapp: `*${text}*`
      };
    }

    case 'checkListItem': {
      const checked = Boolean(p.checked);

      return {
        text: `${checked ? '[x]' : '[ ]'} ${text}`,
        html: `<label><input type="checkbox"${checked ? ' checked' : ''} disabled> ${escapeHtml(text)}</label>`,
        markdown: `- [${checked ? 'x' : ' '}] ${text}`,
        whatsapp: `${checked ? '[x]' : '[ ]'} ${text}`
      };
    }

    case 'bulletListItem':
      return {
        text: `- ${text}`,
        html: `<ul><li>${escapeHtml(text)}</li></ul>`,
        markdown: `- ${text}`,
        whatsapp: `- ${text}`
      };

    case 'numberedListItem':
      return {
        text: `1. ${text}`,
        html: `<ol><li>${escapeHtml(text)}</li></ol>`,
        markdown: `1. ${text}`,
        whatsapp: `1. ${text}`
      };

    case 'operisDecision': {
      const title = propText(p.title, text);
      const reason = propText(p.reason);
      const nextStep = propText(p.nextStep);
      const lines = [
        `Decisão: ${title}`,
        reason ? `Motivo: ${reason}` : '',
        nextStep ? `Próximo passo: ${nextStep}` : ''
      ].filter(Boolean);

      return {
        text: lines.join('\n'),
        html: `<section data-operis-block="decision"><strong>Decisão:</strong> ${escapeHtml(title)}${
          reason ? `<p>Motivo: ${escapeHtml(reason)}</p>` : ''
        }${nextStep ? `<p>Próximo passo: ${escapeHtml(nextStep)}</p>` : ''}</section>`,
        markdown: `> ${lines.join('\n> ')}`,
        whatsapp: `*Decisão:* ${title}${reason ? `\nMotivo: ${reason}` : ''}${
          nextStep ? `\nPróximo passo: ${nextStep}` : ''
        }`
      };
    }

    case 'operisNextStep': {
      const value = propText(p.text, text);
      const done = p.status === 'done';

      return {
        text: `Próximo passo: ${value}`,
        html: `<section data-operis-block="next-step">${done ? 'Feito' : 'Aberto'}: ${escapeHtml(value)}</section>`,
        markdown: `- [${done ? 'x' : ' '}] ${value}`,
        whatsapp: `${done ? '[x]' : '[ ]'} Próximo passo: ${value}`
      };
    }

    case 'operisRisk': {
      const risk = propText(p.risk, text);
      const impact = propText(p.impact);
      const mitigation = propText(p.mitigation);
      const lines = [
        `Risco: ${risk}`,
        impact ? `Impacto: ${impact}` : '',
        mitigation ? `Mitigação: ${mitigation}` : ''
      ].filter(Boolean);

      return {
        text: lines.join('\n'),
        html: `<section data-operis-block="risk">${lines.map(escapeHtml).join('<br>')}</section>`,
        markdown: `> ${lines.join('\n> ')}`,
        whatsapp: lines.join('\n')
      };
    }

    case 'operisInsight': {
      const value = propText(p.text, text);

      return {
        text: `Insight: ${value}`,
        html: `<blockquote data-operis-block="insight">${escapeHtml(value)}</blockquote>`,
        markdown: `> Insight: ${value}`,
        whatsapp: `*Insight:* ${value}`
      };
    }

    case 'operisMeeting': {
      const title = propText(p.title, 'Reunião');
      const participants = propText(p.participants);
      const agenda = propText(p.agenda);
      const lines = [
        title,
        participants ? `Participantes: ${participants}` : '',
        agenda ? `Pauta: ${agenda}` : ''
      ].filter(Boolean);

      return {
        text: lines.join('\n'),
        html: `<section data-operis-block="meeting"><h2>${escapeHtml(title)}</h2>${lines
          .slice(1)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('')}</section>`,
        markdown: `## ${title}${lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : ''}`,
        whatsapp: `*${title}*${lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : ''}`
      };
    }

    case 'operisExecutiveChecklist': {
      const label = propText(p.label, 'Checklist executivo');

      return {
        text: label,
        html: `<section data-operis-block="executive-checklist"><strong>${escapeHtml(label)}</strong></section>`,
        markdown: `### ${label}`,
        whatsapp: `*${label}*`
      };
    }

    case 'operisLinkedTask': {
      const title = propText(p.title, text);
      const status = propText(p.status);

      return {
        text: `Tarefa vinculada: ${title}`,
        html: `<section data-operis-block="linked-task">${escapeHtml(title)}${
          status ? ` · ${escapeHtml(status)}` : ''
        }</section>`,
        markdown: `- Tarefa vinculada: ${title}`,
        whatsapp: `Tarefa vinculada: ${title}`
      };
    }

    default:
      return {
        text,
        html: `<p>${escapeHtml(text)}</p>`,
        markdown: text,
        whatsapp: text
      };
  }
}

function flattenBlocks(blocks: OperisBlock[]): OperisBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children ?? [])]);
}

export function serializeNoteBlocks(blocks: OperisBlock[] = []): SerializedNoteBlocks {
  const rows = flattenBlocks(blocks).map(serializeBlock);

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
