/**
 * WhatsApp Audio Service
 *
 * Transcribes voice messages from WhatsApp using OpenAI Whisper API.
 * Falls back to null when no OPENAI_API_KEY is configured — the webhook
 * handler will then skip audio messages gracefully.
 *
 * Audio URLs come from Evolution API as signed temporary links.
 * We fetch the audio buffer and send it directly to Whisper.
 */

import OpenAI, { toFile } from 'openai';
import { env } from '../config.js';

const MAX_WHATSAPP_AUDIO_BYTES = 15 * 1024 * 1024;
const WHATSAPP_AUDIO_FETCH_TIMEOUT_MS = 15000;

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }

  const octets = normalized.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isSafeWhatsappAudioUrl(audioUrl: string) {
  try {
    const parsed = new URL(audioUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export class WhatsappAudioService {
  private readonly client: OpenAI | null;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    } else {
      this.client = null;
    }
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Transcribe an audio file from a URL using OpenAI Whisper.
   * Returns the transcribed text, or null if transcription fails.
   */
  async transcribeFromUrl(audioUrl: string): Promise<string | null> {
    if (!this.client) return null;
    if (!isSafeWhatsappAudioUrl(audioUrl)) return null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WHATSAPP_AUDIO_FETCH_TIMEOUT_MS);
      const response = await fetch(audioUrl, {
        redirect: 'error',
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) {
        return null;
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && Number(contentLength) > MAX_WHATSAPP_AUDIO_BYTES) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_WHATSAPP_AUDIO_BYTES) {
        return null;
      }

      const uint8Array = new Uint8Array(buffer);

      // Determine MIME type from URL (WhatsApp typically sends ogg/opus or mp4)
      const lowerUrl = audioUrl.toLowerCase().split('?')[0];
      let mimeType = 'audio/ogg';
      let filename = 'audio.ogg';
      if (lowerUrl.endsWith('.mp3')) {
        mimeType = 'audio/mpeg';
        filename = 'audio.mp3';
      } else if (lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.m4a')) {
        mimeType = 'audio/mp4';
        filename = 'audio.mp4';
      } else if (lowerUrl.endsWith('.wav')) {
        mimeType = 'audio/wav';
        filename = 'audio.wav';
      } else if (lowerUrl.endsWith('.webm')) {
        mimeType = 'audio/webm';
        filename = 'audio.webm';
      }

      const file = await toFile(uint8Array, filename, { type: mimeType });

      const transcription = await this.client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'pt',
        response_format: 'text'
      });

      return typeof transcription === 'string' ? transcription.trim() : null;
    } catch {
      return null;
    }
  }
}
