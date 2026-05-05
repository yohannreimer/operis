import { describe, expect, it, vi } from 'vitest';
import {
  audioFormatFromMimeType,
  normalizeOpenRouterTranscriptionResponse,
  transcribeWithOpenRouter
} from './notes-transcription-service.js';

describe('notes-transcription-service', () => {
  it('maps browser recording MIME types to OpenRouter audio formats', () => {
    expect(audioFormatFromMimeType('audio/webm;codecs=opus')).toBe('webm');
    expect(audioFormatFromMimeType('audio/mp4')).toBe('m4a');
    expect(audioFormatFromMimeType('audio/mpeg')).toBe('mp3');
    expect(audioFormatFromMimeType('')).toBe('webm');
  });

  it('normalizes the OpenRouter transcription response', () => {
    expect(
      normalizeOpenRouterTranscriptionResponse({
        text: '  Texto transcrito  ',
        usage: { seconds: 1.25, cost: 0.001 }
      })
    ).toEqual({
      transcript: 'Texto transcrito',
      structuredContent: 'Texto transcrito',
      tags: [],
      confidence: null,
      durationMs: 1250,
      usage: { seconds: 1.25, cost: 0.001 }
    });
  });

  it('sends base64 audio to OpenRouter using the STT endpoint contract', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ text: 'Olá mundo', usage: { seconds: 2 } })
    })) as unknown as typeof fetch;

    const result = await transcribeWithOpenRouter({
      apiKey: 'or_test',
      model: 'openai/whisper-large-v3',
      audioBase64: 'UklGRiQA',
      mimeType: 'audio/webm;codecs=opus',
      language: 'pt-BR',
      timeoutMs: 1000,
      fetchImpl
    });

    expect(result.transcript).toBe('Olá mundo');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer or_test',
          'content-type': 'application/json'
        }),
        body: JSON.stringify({
          model: 'openai/whisper-large-v3',
          input_audio: {
            data: 'UklGRiQA',
            format: 'webm'
          },
          language: 'pt',
          temperature: 0
        })
      })
    );
  });
});
