# ─────────────────────────────────────────────────────────────
#  Memos by MelvinOS — meeting notetaker container
#  Multi-stage: builder → production (with Chromium + PulseAudio + ffmpeg)
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS production

# PulseAudio + ffmpeg for meeting-bot audio capture
RUN apt-get update && apt-get install -y --no-install-recommends \
    pulseaudio pulseaudio-utils \
    ffmpeg \
    xvfb \
    dbus-x11 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

COPY docker/entrypoint.sh /usr/local/bin/memos-entrypoint
RUN chmod +x /usr/local/bin/memos-entrypoint

ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3100 \
    APP_VERSION=${APP_VERSION} \
    RECORDINGS_DIR=/data/recordings \
    PULSE_MONITOR=virtual_speaker.monitor \
    PULSE_RUNTIME_PATH=/tmp/pulse \
    DISPLAY=:99

LABEL org.opencontainers.image.source="https://github.com/c4saas/melvin-memos" \
      org.opencontainers.image.title="Memos by MelvinOS" \
      org.opencontainers.image.version="${APP_VERSION}"

EXPOSE 3100

ENTRYPOINT ["/usr/local/bin/memos-entrypoint"]
CMD ["node", "dist/index.js"]
