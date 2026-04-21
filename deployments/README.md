# Memos — Deployment Variants

Each subdirectory holds a `.env.example` that seeds a different kind of deployment:

| Variant | Who it's for | Key settings |
|---|---|---|
| `demo/` | Public demo instance for prospects | `MEMOS_DEMO_PASSWORD` set, `BRAND_TAGLINE` shows "Demo" |
| `personal/` | Austin's personal account | No demo password, pinned domain |
| `partner/` | White-label reseller template | Custom `BRAND_*` vars, `BRAND_HIDE_POWERED_BY=1` |

## Bring up a new deployment

```bash
# 1. Pick a variant:
mkdir -p /opt/memos-acme && cd /opt/memos-acme

# 2. Copy compose + env:
cp /opt/melvin-memos/docker-compose.prod.yml ./docker-compose.yml
cp /opt/melvin-memos/deployments/partner/.env.example ./.env

# 3. Fill in .env — secrets + branding — then:
docker compose pull
docker compose up -d
```

## Rolling out a version bump across all deployments

After `scripts/release.sh 0.2.0` in the main repo:

```bash
for d in /opt/memos-*; do
  (cd "$d" && sed -i "s|APP_VERSION=.*|APP_VERSION=0.2.0|" .env && docker compose pull && docker compose up -d)
done
```

Or set `APP_VERSION=latest` and just `docker compose pull` + `up -d` whenever
a new image ships.

## Whitelabel checklist

- [ ] `BRAND_NAME` — shows on login, sidebar, page titles, emails
- [ ] `BRAND_SHORT` — small-space variant (nav, manifest)
- [ ] `BRAND_TAGLINE` — subtitle under the logo
- [ ] `BRAND_PRIMARY_HSL` — HSL string, e.g. `"210 100% 50%"` (used for buttons, focus ring, sidebar highlight)
- [ ] `BRAND_ACCENT_HSL` — secondary gradient color
- [ ] `BRAND_LOGO_URL` — 96×96 min, square, PNG/SVG. Used in sidebar + login.
- [ ] `BRAND_FAVICON_URL` — 32×32 PNG.
- [ ] `BRAND_SUPPORT_EMAIL` — shown on error pages / support links
- [ ] `BRAND_PRODUCT_URL` — partner website
- [ ] `BRAND_HIDE_POWERED_BY=1` — removes the small "Powered by MelvinOS" footer (reseller partners only; requires license tier)

## Staging tests before rolling out a release

1. Bump version in the demo `.env` first.
2. `docker compose pull && docker compose up -d` on the demo host.
3. Smoke-test: login, connect a calendar, send the notetaker to a test meeting.
4. Roll the same tag out to personal, then partners.
