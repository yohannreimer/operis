import { useState, type KeyboardEvent } from 'react';

import { api, type Note } from '../../api';
import { QUICK_CAPTURE_DRAFT_KEY, parseQuickCapture } from './capture';
import { legacyContentToBlocks } from './editor/legacy-content-migration';
import { serializeNoteBlocks } from './editor/operis-block-serializers';

type CaptureStatus = 'idle' | 'saving' | 'captured' | 'error';

function readDraft() {
  try {
    return window.localStorage.getItem(QUICK_CAPTURE_DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(value: string) {
  try {
    if (value) window.localStorage.setItem(QUICK_CAPTURE_DRAFT_KEY, value);
    else window.localStorage.removeItem(QUICK_CAPTURE_DRAFT_KEY);
  } catch {
    // Capture remains usable when storage is blocked by the browser.
  }
}

export function QuickCapture({
  onCaptured,
  onOpen
}: {
  onCaptured(note: Note): void;
  onOpen?(note: Note): void;
}) {
  const [value, setValue] = useState(() => (typeof window === 'undefined' ? '' : readDraft()));
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [lastCaptured, setLastCaptured] = useState<Note | null>(null);

  async function capture() {
    if (status === 'saving') return;

    let parsed;
    try {
      parsed = parseQuickCapture(value);
    } catch {
      return;
    }

    const blocks = parsed.body ? legacyContentToBlocks(parsed.body) : [];
    const serialized = serializeNoteBlocks(blocks);
    setStatus('saving');

    try {
      const note = await api.createNote({
        title: parsed.title,
        content: parsed.body ? serialized.html : null,
        contentBlocks: blocks,
        contentText: parsed.body ? serialized.text : null,
        contentHtml: parsed.body ? serialized.html : null,
        contentVersion: 1,
        type: 'geral',
        folderId: null
      });
      setValue('');
      setLastCaptured(note);
      setStatus('captured');
      writeDraft('');
      onCaptured(note);
    } catch {
      setStatus('error');
      writeDraft(value);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void capture();
  }

  return (
    <section className="notes-quick-capture" aria-label="Captura rápida">
      <textarea
        value={value}
        rows={2}
        placeholder="Capture uma ideia, frase ou lembrete…"
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setValue(nextValue);
          setStatus('idle');
          setLastCaptured(null);
          writeDraft(nextValue);
        }}
        onKeyDown={handleKeyDown}
      />
      <div className="notes-quick-capture-footer" aria-live="polite">
        <span>
          {status === 'saving' ? 'Capturando…' : null}
          {status === 'captured' ? 'Capturado' : null}
          {status === 'error' ? 'Não foi possível capturar.' : null}
          {status === 'idle' ? 'Enter captura · Shift + Enter quebra a linha' : null}
        </span>
        {status === 'error' ? (
          <button type="button" onClick={() => void capture()}>
            Tentar novamente
          </button>
        ) : null}
        {status === 'captured' && lastCaptured && onOpen ? (
          <button type="button" aria-label="Abrir nota capturada" onClick={() => onOpen(lastCaptured)}>
            Abrir nota
          </button>
        ) : null}
      </div>
    </section>
  );
}
