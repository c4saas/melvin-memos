import { getSettings } from '../settings';
import { createLogger } from '../logger';

const log = createLogger('summarizer');

export interface MeetingSummary {
  title: string;
  date: string;
  attendees: string[];
  executiveSummary: string;
  discussionPoints: string[];
  decisions: string[];
  actionItems: Array<{ owner?: string; task: string; deadline?: string }>;
  nextSteps: string[];
  fullMarkdown: string;
}

const SYSTEM_PROMPT = `You are a meeting notetaker. Given a raw meeting transcript, produce a clean, actionable meeting summary.

Return ONLY valid JSON — no preamble, no code fences — matching this schema:
{
  "title": string,
  "attendees": string[],
  "executiveSummary": string (3-5 sentences),
  "discussionPoints": string[] (main topics discussed),
  "decisions": string[] ("None" as a single entry if none),
  "actionItems": [{ "owner": string, "task": string, "deadline": string }],
  "nextSteps": string[]
}

Rules:
- Attendees: infer from transcript. Use first names if clear.
- Tone: executive, terse, factual. No fluff.
- Action items: every task with a clear owner and deadline if stated.
- If a section has no content, use a single-element array with "None".`;

export async function summarizeTranscript(
  transcript: string,
  context: { title?: string; date: string; durationSec?: number },
): Promise<MeetingSummary> {
  const settings = await getSettings();
  const baseUrl = settings.providers.ollama.baseUrl.replace(/\/+$/, '');
  const model = settings.providers.ollama.summaryModel;
  const apiKey = settings.providers.ollama.apiKey;
  const isCloud = /ollama\.com/i.test(baseUrl);

  log.info('summarizing via ollama', { baseUrl, model, isCloud, transcriptChars: transcript.length });

  const userMessage = [
    context.title ? `Meeting title: ${context.title}` : '',
    `Date: ${context.date}`,
    context.durationSec ? `Duration: ${Math.round(context.durationSec / 60)} min` : '',
    '',
    '--- TRANSCRIPT ---',
    transcript,
  ].filter(Boolean).join('\n');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      options: { temperature: 0.3, num_ctx: 16384 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as { message?: { content?: string } };
  const content = data.message?.content ?? '';

  let parsed: Omit<MeetingSummary, 'fullMarkdown' | 'title' | 'date'> & { title?: string };
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    log.error('failed to parse summary JSON', { content: content.slice(0, 500) });
    throw new Error('Ollama returned invalid JSON');
  }

  const summary: MeetingSummary = {
    title: parsed.title ?? context.title ?? 'Untitled Meeting',
    date: context.date,
    attendees: parsed.attendees ?? [],
    executiveSummary: parsed.executiveSummary ?? '',
    discussionPoints: parsed.discussionPoints ?? [],
    decisions: parsed.decisions ?? ['None'],
    actionItems: parsed.actionItems ?? [],
    nextSteps: parsed.nextSteps ?? ['None'],
    fullMarkdown: '',
  };

  summary.fullMarkdown = renderMarkdown(summary);
  return summary;
}

function renderMarkdown(s: MeetingSummary): string {
  const parts: string[] = [];
  parts.push(`# Meeting Info`);
  parts.push(`- **Title:** ${s.title}`);
  parts.push(`- **Date:** ${s.date}`);
  if (s.attendees.length) parts.push(`- **Attendees:** ${s.attendees.join(', ')}`);
  parts.push(``);
  parts.push(`# Executive Summary`);
  parts.push(s.executiveSummary);
  parts.push(``);
  parts.push(`# Key Discussion Points`);
  for (const p of s.discussionPoints) parts.push(`- ${p}`);
  parts.push(``);
  parts.push(`# Decisions Made`);
  for (const d of s.decisions) parts.push(`- ${d}`);
  parts.push(``);
  parts.push(`# Action Items`);
  if (s.actionItems.length === 0) {
    parts.push(`- None`);
  } else {
    for (const a of s.actionItems) {
      const owner = a.owner ? `[${a.owner}] ` : '';
      const deadline = a.deadline ? ` (${a.deadline})` : '';
      parts.push(`- ${owner}${a.task}${deadline}`);
    }
  }
  parts.push(``);
  parts.push(`# Next Steps`);
  for (const n of s.nextSteps) parts.push(`- ${n}`);
  return parts.join('\n');
}
