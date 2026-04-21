import { promises as fs } from 'fs';
import Groq from 'groq-sdk';
import { getSettings } from '../settings';
import { createLogger } from '../logger';

const log = createLogger('transcription');

export interface TranscriptSegment {
  speaker?: string;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  speakers: string[];
  durationSec?: number;
  language?: string;
}

export async function transcribeFile(audioPath: string): Promise<TranscriptResult> {
  const settings = await getSettings();
  const apiKey = settings.providers.groq.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('No transcription provider configured. Set providers.groq.apiKey in settings or GROQ_API_KEY env.');

  const client = new Groq({ apiKey });
  const model = settings.providers.groq.whisperModel;

  log.info('transcribing', { audioPath, model });

  const fileStream = await fs.readFile(audioPath);
  const blob = new Blob([fileStream], { type: 'audio/mpeg' });
  const file = new File([blob], 'audio.mp3', { type: 'audio/mpeg' });

  const result: any = await client.audio.transcriptions.create({
    file,
    model,
    response_format: 'verbose_json',
    language: 'en',
  });

  const segments: TranscriptSegment[] = (result.segments ?? []).map((s: any) => ({
    start: s.start ?? 0,
    end: s.end ?? 0,
    text: (s.text ?? '').trim(),
  }));

  return {
    text: result.text ?? segments.map(s => s.text).join(' '),
    segments,
    speakers: [],
    durationSec: result.duration,
    language: result.language,
  };
}
