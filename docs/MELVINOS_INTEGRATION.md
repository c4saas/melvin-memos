# Wiring Memos into MelvinOS

This document shows how to swap / supplement MelvinOS's existing Recall.ai
integration with Memos.

## 1. Add a client service in MelvinOS

Create `opt/melvinos/server/memos-service.ts`:

```ts
import { getPlatformSettings } from './storage';

export class MemosService {
  constructor(private baseUrl: string, private apiKey: string) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Memos ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  sendBot(meetingUrl: string, title?: string) {
    return this.req<{ meetingId: string; status: string }>('/api/v1/bots', {
      method: 'POST',
      body: JSON.stringify({ meetingUrl, title }),
    });
  }

  listRecent(since?: Date) {
    const q = since ? `?since=${since.toISOString()}` : '';
    return this.req<Array<{ id: string; title: string; status: string; summary: string | null; notionPageUrl: string | null }>>(
      `/api/v1/meetings/recent${q}`,
    );
  }

  getTranscript(id: string) {
    return this.req<{ transcript: string; summary: string; actionItems: unknown[] }>(
      `/api/v1/meetings/${id}/transcript`,
    );
  }
}

export async function getMemos(): Promise<MemosService | null> {
  const s = await getPlatformSettings();
  const cfg = (s?.data as any)?.integrations?.memos;
  if (!cfg?.baseUrl || !cfg?.apiKey) return null;
  return new MemosService(cfg.baseUrl, cfg.apiKey);
}
```

## 2. Add an agent tool

Mirror `recall-create-bot`:

```ts
// opt/melvinos/server/agent/tools/memos-send-bot.ts
export const memosSendBotTool = {
  name: 'memos_send_bot',
  description: 'Send the MelvinOS meeting notetaker to a live meeting URL.',
  input_schema: { /* meetingUrl, title */ },
  async execute(args, ctx) {
    const memos = await getMemos();
    if (!memos) return { error: 'Memos not configured' };
    return memos.sendBot(args.meetingUrl, args.title);
  },
};
```

Register it in `opt/melvinos/server/agent/tools/index.ts` alongside the existing
Recall tools. The agent can choose either — or you can remove the Recall tools
entirely if Memos is fully replacing Recall.

## 3. Schema: add `integrations.memos` to platform settings

In `opt/melvinos/shared/schema.ts`, extend the platform settings schema:

```ts
memos: z.object({
  baseUrl: z.string().nullable().default('http://melvin-memos:3100'),
  apiKey:  z.string().nullable().default(null),
  enabled: z.boolean().default(false),
}).default({}),
```

Then expose an admin UI section for pasting the API key.

## 4. Network

Memos attaches to `melvinos_melvinos_net`, so MelvinOS reaches it at
`http://melvin-memos:3100`. No port exposure on the host is required for
MelvinOS ↔ Memos traffic — only for browser access.
