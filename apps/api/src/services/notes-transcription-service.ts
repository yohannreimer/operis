export type NotesTranscriptionMode = 'transcript' | 'note';

export type NotesTranscriptionResult = {
  transcript: string | null;
  titleSuggestion?: string | null;
  structuredContent?: string | null;
  tags: string[];
  confidence?: number | null;
  durationMs?: number | null;
  usage?: Record<string, unknown> | null;
};

type OpenRouterResponse = {
  text?: unknown;
  usage?: unknown;
};

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: unknown;
};

type FetchLike = typeof fetch;

export function audioFormatFromMimeType(mimeType?: string | null) {
  const normalized = (mimeType ?? '').toLowerCase();

  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('flac')) return 'flac';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('webm')) return 'webm';

  return 'webm';
}

export function normalizeOpenRouterTranscriptionResponse(
  payload: OpenRouterResponse
): NotesTranscriptionResult {
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const usage =
    payload.usage && typeof payload.usage === 'object'
      ? (payload.usage as Record<string, unknown>)
      : null;
  const durationMs = typeof usage?.seconds === 'number' ? Math.round(usage.seconds * 1000) : null;

  return {
    transcript: text || null,
    structuredContent: text || null,
    tags: [],
    confidence: null,
    durationMs,
    usage
  };
}

export async function transcribeWithOpenRouter(input: {
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType?: string | null;
  language?: string | null;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}): Promise<NotesTranscriptionResult> {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), input.timeoutMs);
  const fetcher = input.fetchImpl ?? fetch;

  try {
    const response = await fetcher('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
        'http-referer': 'https://operis.app',
        'x-title': 'Operis OS'
      },
      body: JSON.stringify({
        model: input.model,
        input_audio: {
          data: input.audioBase64,
          format: audioFormatFromMimeType(input.mimeType)
        },
        language: input.language?.split('-')[0],
        temperature: 0
      }),
      signal: abortController.signal
    });

    const rawText = await response.text();
    let parsed: OpenRouterResponse = {};
    try {
      parsed = rawText.trim().length > 0 ? (JSON.parse(rawText) as OpenRouterResponse) : {};
    } catch {
      parsed = { text: rawText };
    }

    if (!response.ok) {
      throw new Error(
        `OpenRouter STT retornou erro (${response.status}): ${rawText.slice(0, 600)}`
      );
    }

    const normalized = normalizeOpenRouterTranscriptionResponse(parsed);
    if (!normalized.transcript) {
      throw new Error('OpenRouter STT retornou resposta sem texto transcrito.');
    }

    return normalized;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function cleanupDictationTextLocally(raw: string) {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\b(n[eé]|né|ah|hã|hum|hmm|uhm|tipo assim|tipo|sabe|tá ligado)\b[,.!?]?\s*/gi, '')
    .replace(/\b(\w+)(,\s*\1\b)+/gi, '$1')
    .replace(/\b(de|que|para|pra|com|e),?\s+\1\b/gi, '$1')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([.!?])\s*([a-zá-ú])/g, (_match, end, next) => `${end} ${String(next).toUpperCase()}`)
    .trim();
}

export async function cleanupDictationWithOpenRouter(input: {
  apiKey?: string | null;
  model: string;
  text: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}) {
  const fallback = cleanupDictationTextLocally(input.text);

  if (!input.apiKey) {
    return {
      text: fallback,
      provider: 'local',
      model: 'local-dictation-cleanup',
      usage: null
    };
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), input.timeoutMs);
  const fetcher = input.fetchImpl ?? fetch;

  try {
    const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
        'http-referer': 'https://operis.app',
        'x-title': 'Operis OS'
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Voce e um limpador de texto ditado em portugues do Brasil. Sua unica tarefa: apagar vicios de fala e muletas como "ne", "ah", "hum", "tipo", "sabe", repeticoes, falsos comecos e gerundios desnecessarios quando forem apenas ruido oral. Corrija pontuacao, concordancia basica e deixe a frase escrita de forma funcional e clara. Preserve sentido, tom, nomes, numeros e informacoes. Nao resuma, nao aumente, nao explique e nao invente nada. Responda somente com o texto final limpo.'
          },
          {
            role: 'user',
            content: input.text
          }
        ]
      }),
      signal: abortController.signal
    });

    const rawText = await response.text();
    let parsed: OpenRouterChatResponse = {};
    try {
      parsed = rawText.trim().length > 0 ? (JSON.parse(rawText) as OpenRouterChatResponse) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      throw new Error(`OpenRouter retornou erro (${response.status}): ${rawText.slice(0, 600)}`);
    }

    const cleaned = String(parsed.choices?.[0]?.message?.content ?? '').trim();
    if (!cleaned) {
      throw new Error('OpenRouter retornou limpeza vazia.');
    }

    return {
      text: cleaned,
      provider: 'openrouter',
      model: input.model,
      usage:
        parsed.usage && typeof parsed.usage === 'object'
          ? (parsed.usage as Record<string, unknown>)
          : null
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
