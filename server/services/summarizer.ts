import Anthropic from '@anthropic-ai/sdk';
import { getSettings } from '../settings';
import { createLogger } from '../logger';
import { recordError } from './error-log';

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

interface SummarizerContext {
  title?: string;
  date: string;
  durationSec?: number;
  meetingId?: string;
}

type RawSummary = Omit<MeetingSummary, 'fullMarkdown' | 'title' | 'date'> & { title?: string };

/**
 * Pull a JSON object out of an LLM response. Models sometimes wrap output in
 * ```json ... ``` fences or prepend "Here's your summary:" — we extract the
 * first {...} block and try to parse that. Returns null if no parseable JSON
 * is found.
 */
function extractJson(raw: string): RawSummary | null {
  if (!raw) return null;

  // Strip code fences first.
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

  // Try the cleaned string directly.
  try { return JSON.parse(s); } catch {}

  // Find the first { ... matching last }, then narrow if that fails.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = s.slice(first, last + 1);
    try { return JSON.parse(candidate); } catch {}
  }
  return null;
}

export async function summarizeTranscript(
  transcript: string,
  context: SummarizerContext,
): Promise<MeetingSummary> {
  const settings = await getSettings();

  const userMessage = [
    context.title ? `Meeting title: ${context.title}` : '',
    `Date: ${context.date}`,
    context.durationSec ? `Duration: ${Math.round(context.durationSec / 60)} min` : '',
    '',
    '--- TRANSCRIPT ---',
    transcript,
  ].filter(Boolean).join('\n');

  // Try Ollama first (the default cheap path).
  try {
    const parsed = await summarizeWithOllama(userMessage, settings.providers.ollama);
    return finalize(parsed, context);
  } catch (err) {
    const ollamaErr = err instanceof Error ? err.message : String(err);
    log.warn('ollama summary failed, considering fallback', { err: ollamaErr });
    await recordError({
      kind: 'summarizer.ollama',
      meetingId: context.meetingId,
      message: ollamaErr,
      context: { provider: 'ollama', model: settings.providers.ollama.summaryModel },
    }).catch(() => {});

    // Fall back to Anthropic if a key is configured.
    const anthropicKey = settings.providers.anthropic.apiKey;
    if (anthropicKey) {
      log.info('falling back to anthropic for summary');
      try {
        const parsed = await summarizeWithAnthropic(userMessage, anthropicKey);
        return finalize(parsed, context);
      } catch (err2) {
        const anthErr = err2 instanceof Error ? err2.message : String(err2);
        log.error('anthropic fallback also failed', { err: anthErr });
        await recordError({
          kind: 'summarizer.anthropic',
          meetingId: context.meetingId,
          message: anthErr,
          context: { provider: 'anthropic' },
        }).catch(() => {});
        throw new Error(`Both Ollama and Anthropic summarization failed. Ollama: ${ollamaErr}. Anthropic: ${anthErr}`);
      }
    }

    // No fallback configured — surface a more actionable error.
    throw new Error(
      `Summarizer failed: ${ollamaErr}. Add an Anthropic API key in Settings → Providers → Anthropic for automatic fallback.`,
    );
  }
}

async function summarizeWithOllama(
  userMessage: string,
  ollama: { baseUrl: string; summaryModel: string; apiKey: string | null },
): Promise<RawSummary> {
  const baseUrl = ollama.baseUrl.replace(/\/+$/, '');
  const model = ollama.summaryModel;
  const isCloud = /ollama\.com/i.test(baseUrl);

  log.info('summarizing via ollama', { baseUrl, model, isCloud, transcriptChars: userMessage.length });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ollama.apiKey) headers['Authorization'] = `Bearer ${ollama.apiKey}`;

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
    throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json() as { message?: { content?: string } };
  const content = data.message?.content ?? '';
  const parsed = extractJson(content);
  if (!parsed) {
    log.error('ollama returned unparseable content', { contentHead: content.slice(0, 800) });
    throw new Error(`Ollama returned unparseable content (head: ${content.slice(0, 120)}${content.length > 120 ? '…' : ''})`);
  }
  return parsed;
}

async function summarizeWithAnthropic(userMessage: string, apiKey: string): Promise<RawSummary> {
  const client = new Anthropic({ apiKey });
  log.info('summarizing via anthropic', { transcriptChars: userMessage.length });

  // tool_use forces structured JSON output — no chance of code fences or prose preamble.
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [{
      name: 'submit_summary',
      description: 'Submit the structured meeting summary.',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' },
          attendees: { type: 'array', items: { type: 'string' } },
          executiveSummary: { type: 'string' },
          discussionPoints: { type: 'array', items: { type: 'string' } },
          decisions: { type: 'array', items: { type: 'string' } },
          actionItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                owner: { type: 'string' },
                task: { type: 'string' },
                deadline: { type: 'string' },
              },
              required: ['task'],
            },
          },
          nextSteps: { type: 'array', items: { type: 'string' } },
        },
        required: ['attendees', 'executiveSummary', 'discussionPoints', 'decisions', 'actionItems', 'nextSteps'],
      },
    }],
    tool_choice: { type: 'tool', name: 'submit_summary' },
  });

  const toolUse = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw new Error('Anthropic returned no tool_use block');
  return toolUse.input as RawSummary;
}

function finalize(parsed: RawSummary, context: SummarizerContext): MeetingSummary {
  const summary: MeetingSummary = {
    title: parsed.title ?? context.title ?? 'Untitled Meeting',
    date: context.date,
    attendees: parsed.attendees ?? [],
    executiveSummary: parsed.executiveSummary ?? '',
    discussionPoints: parsed.discussionPoints ?? [],
    decisions: parsed.decisions?.length ? parsed.decisions : ['None'],
    actionItems: parsed.actionItems ?? [],
    nextSteps: parsed.nextSteps?.length ? parsed.nextSteps : ['None'],
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
