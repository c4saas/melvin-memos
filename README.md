# Memos by MelvinOS

AI meeting notetaker — joins Google Meet / Zoom / Teams, records, transcribes
with Whisper (Groq), summarizes with Ollama, and syncs to Notion.
Fireflies/Recall.ai-style workflow, self-hostable, fully whitelabelable.

[![CI](https://github.com/c4saas/melvin-memos/actions/workflows/ci.yml/badge.svg)](https://github.com/c4saas/melvin-memos/actions/workflows/ci.yml)

---

## What it does

- **Auto-joins** scheduled meetings from connected Google / Outlook calendars.
- **Sends the notetaker** to any meeting URL on demand via UI or API.
- **Records** audio in-container (Chromium + PulseAudio + ffmpeg).
- **Transcribes** with Groq Whisper.
- **Summarizes** with a local Ollama model (default `llama3.1:8b`).
- **Syncs to Notion** — creates a page in a meetings database.
- **Whitelabel** — brand name, colors, logo, tagline, all driven by env vars.
- **Integration API** — `/api/v1/*` for MelvinOS or any upstream to drive it.

## Repos

| Repo | Purpose |
|---|---|
| **[c4saas/melvin-memos](https://github.com/c4saas/melvin-memos)** | Source code, Dockerfile, release workflow. |
| **[c4saas/memos-commercial](https://github.com/c4saas/memos-commercial)** | Customer-facing compose file; pulls pinned GHCR images. Updated automatically by the release workflow. |

## Quick start (dev — build from source)

```bash
cp .env.example .env
# edit .env — generate secrets with: openssl rand -hex 32
docker compose up -d --build
docker exec memos_ollama ollama pull llama3.1:8b
open http://localhost:3100
```

## Production deploy (fresh VPS)

```bash
curl -fsSL https://raw.githubusercontent.com/c4saas/memos-commercial/main/deploy.sh | sudo bash
```

Or manually — see [deployments/README.md](deployments/README.md).

## Whitelabeling for a reseller partner

Every brand element is env-driven. Copy `deployments/partner/.env.example`,
fill in `BRAND_NAME`, `BRAND_LOGO_URL`, `BRAND_PRIMARY_HSL`,
`BRAND_HIDE_POWERED_BY=1`, and the partner gets a standalone branded product.

No source changes, no custom build. See [deployments/README.md](deployments/README.md).

## Deployment variants

| Variant | `.env` template | Notes |
|---|---|---|
| Demo | [deployments/demo/](deployments/demo/) | Public prospect-facing demo. Seeded demo user. |
| Personal (Austin) | [deployments/personal/](deployments/personal/) | Your personal instance. |
| Partner | [deployments/partner/](deployments/partner/) | Reseller template. Custom brand, hide "Powered by". |

## Release

```bash
./scripts/release.sh 0.2.0
```

1. Bumps `package.json`.
2. Tags `v0.2.0` and pushes.
3. GitHub Action builds `ghcr.io/c4saas/melvin-memos:0.2.0` + `:latest`.
4. CI auto-bumps `memos-commercial/docker-compose.yml` to the new version.

Customers upgrade:

```bash
cd /opt/memos && git pull && docker compose pull && docker compose up -d
```

Same flow as MelvinOS.

## Integration API (for MelvinOS and other upstreams)

All endpoints require `Authorization: Bearer mm_...`:

- `POST /api/v1/bots` — send the notetaker to a meeting URL now
- `GET /api/v1/meetings/recent` — recent meetings with summaries
- `GET /api/v1/meetings/:id/transcript` — full transcript + action items

See [docs/MELVINOS_INTEGRATION.md](docs/MELVINOS_INTEGRATION.md) for MelvinOS
side wiring (~30 lines of glue code).

## Production features

- Session store in Postgres (`connect-pg-simple`) — survives restarts.
- AES-256-GCM at-rest encryption for all provider secrets (Groq, Notion,
  Anthropic, OAuth client secrets, webhook secrets) + OAuth access/refresh tokens.
- Rate limiting on `/api/auth/login` (20 / 15 min).
- bcrypt password hashing (cost 12).
- Error messages redacted — internals go to logs, clients get `"internal error"`.
- Health check endpoint for load balancers.
- Secure cookies when `TRUST_PROXY=1` + `NODE_ENV=production`.

## Project layout

```
server/             Express + Drizzle + bot orchestration
  bot/              Playwright drivers + PulseAudio audio capture
  integrations/     Google + Microsoft calendar OAuth
  routes/           /api/*
  services/         transcription + summarizer + Notion sync + calendar poller
  settings.ts       encrypted platform settings read/write
  crypto.ts         AES-256-GCM helper
  branding.ts       env-driven whitelabel config
client/             React + Tailwind (MelvinOS design system)
shared/             Drizzle + Zod schemas
deployments/        per-variant .env templates
docker-compose.yml      dev (builds from source)
docker-compose.prod.yml customer/personal/partner (GHCR image)
Dockerfile              multi-stage: builder → playwright + pulse + ffmpeg
```

## Licence

MIT (see [LICENSE](LICENSE)).
