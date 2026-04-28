import type { OperisBlock } from './operis-block-types';

function stripHtml(raw: string) {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(h1|h2|h3|p|div|li)>/gi, '\n')
    .replace(/<h1[^>]*>/gi, '# ')
    .replace(/<h2[^>]*>/gi, '## ')
    .replace(/<h3[^>]*>/gi, '### ')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function legacyContentToBlocks(raw?: string | null): OperisBlock[] {
  const text = stripHtml(raw ?? '');
  if (!text.trim()) {
    return [{ type: 'paragraph', content: '' }];
  }

  return text
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): OperisBlock => {
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        return {
          type: 'heading',
          props: { level: heading[1].length },
          content: heading[2].trim()
        };
      }

      const checklist = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (checklist) {
        return {
          type: 'checkListItem',
          props: { checked: checklist[1].toLowerCase() === 'x' },
          content: checklist[2].trim()
        };
      }

      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        return { type: 'bulletListItem', content: bullet[1].trim() };
      }

      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        return { type: 'numberedListItem', content: numbered[1].trim() };
      }

      return { type: 'paragraph', content: line };
    });
}
