/**
 * Embeddings service — uses Ollama's /api/embeddings endpoint.
 * Works with both local Ollama and Ollama Cloud (https://ollama.com).
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { embeddings, meetings } from '../../shared/schema';
import { getSettings } from '../settings';
import { createLogger } from '../logger';

const log = createLogger('embeddings');

const DEFAULT_MODEL = 'nomic-embed-text';
const MAX_CHUNK_CHARS = 1800;
const MIN_CHUNK_CHARS = 80;

interface EmbeddingClientConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

async function getEmbeddingClient(): Promise<EmbeddingClientConfig> {
  const s = await getSettings();
  const baseUrl = s.providers.ollama.baseUrl.replace(/\/+$/, '') || 'http://ollama:11434';
  return {
    baseUrl,
    apiKey: s.providers.ollama.apiKey,
    // Allow user to override via summaryModel? No, use a dedicated embed model.
    model: DEFAULT_MODEL,
  };
}

export async function embed(text: string): Promise<number[]> {
  const client = await getEmbeddingClient();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (client.apiKey) headers['Authorization'] = `Bearer ${client.apiKey}`;

  const resp = await fetch(`${client.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: client.model, prompt: text.slice(0, 8000) }),
  });
  if (resp.status === 404) {
    // Ollama Cloud does not expose /api/embeddings. Make the caller aware without
    // spamming a stack trace.
    throw new Error(
      'Embeddings endpoint not available on this Ollama host. ' +
      'Run a local Ollama (http://ollama:11434) for semantic search, or use a different provider.',
    );
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Embeddings error ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json() as { embedding?: number[] };
  if (!Array.isArray(data.embedding)) throw new Error('Embeddings: no vector returned');
  return data.embedding;
}

/**
 * Split a text into chunks suitable for embedding.
 * Paragraph-aware: splits on double-newlines, then combines small paragraphs
 * so each chunk is ~300-1800 chars.
 */
export function chunkText(text: string): string[] {
  if (!text) return [];
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';
  for (const p of paragraphs) {
    if (buffer.length + p.length + 2 <= MAX_CHUNK_CHARS) {
      buffer = buffer ? `${buffer}\n\n${p}` : p;
    } else {
      if (buffer) chunks.push(buffer);
      if (p.length > MAX_CHUNK_CHARS) {
        // Further split long paragraphs on sentence boundaries
        const sentences = p.match(/[^.!?]+[.!?]+\s?/g) ?? [p];
        let sBuf = '';
        for (const s of sentences) {
          if (sBuf.length + s.length <= MAX_CHUNK_CHARS) {
            sBuf += s;
          } else {
            if (sBuf) chunks.push(sBuf.trim());
            sBuf = s;
          }
        }
        if (sBuf) chunks.push(sBuf.trim());
        buffer = '';
      } else {
        buffer = p;
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.filter(c => c.length >= MIN_CHUNK_CHARS);
}

/**
 * Re-index a meeting's embeddings. Called after summarization completes.
 * Deletes stale rows + inserts fresh ones.
 */
export async function indexMeeting(meetingId: string): Promise<{ chunks: number; source: 'skipped' | 'indexed' }> {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!m) return { chunks: 0, source: 'skipped' };
  if (!m.summary && !m.transcript) return { chunks: 0, source: 'skipped' };

  const client = await getEmbeddingClient();
  const sources: Array<{ label: 'summary' | 'transcript'; chunks: string[] }> = [];
  if (m.summary) sources.push({ label: 'summary', chunks: chunkText(m.summary) });
  if (m.transcript) sources.push({ label: 'transcript', chunks: chunkText(m.transcript) });

  // Delete old rows for this meeting
  await db.delete(embeddings).where(eq(embeddings.meetingId, meetingId));

  let total = 0;
  for (const s of sources) {
    for (let i = 0; i < s.chunks.length; i++) {
      const chunk = s.chunks[i];
      try {
        const vec = await embed(chunk);
        await db.insert(embeddings).values({
          userId: m.userId,
          meetingId,
          chunkIndex: total,
          source: s.label,
          text: chunk,
          vector: vec,
          model: client.model,
        });
        total++;
      } catch (err) {
        log.warn('embed chunk failed', { meetingId, source: s.label, i, err: err instanceof Error ? err.message : err });
      }
    }
  }

  log.info('indexed meeting', { meetingId, chunks: total });
  return { chunks: total, source: 'indexed' };
}

function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export interface SearchHit {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  source: 'summary' | 'transcript';
  snippet: string;
  score: number;
}

/**
 * Semantic search across a user's meetings. Loads all of the user's embeddings
 * into memory (each vector is ~3KB; 1000 chunks ~= 3MB — fine).
 * For scale beyond ~10k chunks/user, move to pgvector.
 */
export async function semanticSearch(userId: string, query: string, limit = 12): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const qvec = await embed(query.trim());

  const rows = await db
    .select({
      meetingId: embeddings.meetingId,
      source: embeddings.source,
      text: embeddings.text,
      vector: embeddings.vector,
    })
    .from(embeddings)
    .where(eq(embeddings.userId, userId));

  if (rows.length === 0) return [];

  const scored = rows.map(r => ({
    meetingId: r.meetingId,
    source: r.source as 'summary' | 'transcript',
    text: r.text,
    score: cosine(qvec, r.vector as number[]),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate per meeting, keep the highest-scoring chunk
  const best = new Map<string, typeof scored[number]>();
  for (const s of scored) {
    const prev = best.get(s.meetingId);
    if (!prev || s.score > prev.score) best.set(s.meetingId, s);
  }
  const top = Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter(s => s.score > 0.25);

  if (top.length === 0) return [];

  // Load meeting metadata for the hit set
  const meetingIds = top.map(h => h.meetingId);
  const mRows = await db.select({
    id: meetings.id,
    title: meetings.title,
    startAt: meetings.startAt,
  }).from(meetings).where(and(eq(meetings.userId, userId)));
  const byId = new Map(mRows.map(m => [m.id, m]));

  return top
    .map(h => {
      const m = byId.get(h.meetingId);
      if (!m) return null;
      return {
        meetingId: h.meetingId,
        meetingTitle: m.title,
        meetingDate: m.startAt.toISOString(),
        source: h.source,
        snippet: h.text.slice(0, 260),
        score: h.score,
      } satisfies SearchHit;
    })
    .filter((x): x is SearchHit => x != null);
}
