export const QUICK_CAPTURE_DRAFT_KEY = 'operis.notes.quick-capture.draft';
export const QUICK_CAPTURE_TITLE_LIMIT = 96;

export type QuickCaptureParts = {
  title: string;
  body: string;
};

export function parseQuickCapture(raw: string): QuickCaptureParts {
  const value = raw.trim();
  if (!value) {
    throw new Error('empty_capture');
  }

  const firstLineBreak = value.indexOf('\n');
  const firstSentenceMatch = value.match(/^.*?[.!?](?:\s|$)/u);
  const sentenceEnd = firstSentenceMatch?.[0].trimEnd().length ?? Number.POSITIVE_INFINITY;
  const naturalEnd = Math.min(
    firstLineBreak < 0 ? Number.POSITIVE_INFINITY : firstLineBreak,
    sentenceEnd
  );
  const titleEnd = Math.min(
    Number.isFinite(naturalEnd) ? naturalEnd : value.length,
    QUICK_CAPTURE_TITLE_LIMIT
  );
  const title = value.slice(0, titleEnd).trim();
  const body = value.slice(titleEnd).replace(/^\s+/u, '').trim();

  return { title, body };
}
