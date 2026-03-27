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

    try {
      // Fetch the audio buffer from the signed URL
      const response = await fetch(audioUrl);
      if (!response.ok) {
        return null;
      }

      const buffer = await response.arrayBuffer();
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
