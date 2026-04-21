#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  Memos by MelvinOS — VPS Deployment Bootstrap
#  Run once on a fresh Ubuntu 22.04/24.04 VPS to install Memos.
#  Usage:  sudo bash deploy.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

MEMOS_DIR="${MEMOS_DIR:-/opt/memos}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[Memos]${NC} $*"; }
warn() { echo -e "${YELLOW}[Warn]${NC}  $*"; }
err()  { echo -e "${RED}[Error]${NC} $*" >&2; exit 1; }
step() { echo -e "\n${CYAN}━━━  $*  ━━━${NC}"; }

[[ $EUID -eq 0 ]] || err "Run as root: sudo bash deploy.sh"

step "1 / 5  Install Docker"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version &>/dev/null || apt-get install -y docker-compose-plugin
log "Docker: $(docker --version)"

step "2 / 5  Clone / update repository"
if [[ -z "$REPO_URL" ]]; then
  read -rp "  Enter memos repo URL (e.g. https://github.com/c4saas/melvin-memos.git): " REPO_URL
fi

if [[ -d "$MEMOS_DIR/.git" ]]; then
  git -C "$MEMOS_DIR" fetch origin "$BRANCH"
  git -C "$MEMOS_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$MEMOS_DIR"
fi
cd "$MEMOS_DIR"

step "3 / 5  Configure environment"
if [[ ! -f .env ]]; then
  cp .env.example .env
  SESSION_SECRET=$(openssl rand -hex 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|"    .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENCRYPTION_KEY}|"    .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
  warn "Generated secrets written to $MEMOS_DIR/.env — keep that file safe."
  echo ""
  read -rp "  Public URL (e.g. https://memos.example.com — blank for IP-only): " APP_BASE_URL
  [[ -n "$APP_BASE_URL" ]] && sed -i "s|^APP_BASE_URL=.*|APP_BASE_URL=${APP_BASE_URL}|" .env
  echo ""
  read -rp "  Admin email (seeded as default user): " ADMIN_EMAIL
  [[ -n "$ADMIN_EMAIL" ]] && sed -i "s|^MEMOS_DEFAULT_EMAIL=.*|MEMOS_DEFAULT_EMAIL=${ADMIN_EMAIL}|" .env
  echo ""
  read -rp "  Initial login password (you'll change it after first login): " ADMIN_PW
  [[ -n "$ADMIN_PW" ]] && sed -i "s|^MEMOS_DEMO_PASSWORD=.*|MEMOS_DEMO_PASSWORD=${ADMIN_PW}|" .env
else
  log ".env already exists — skipping."
fi

step "4 / 5  Build & start"
docker compose -f "$COMPOSE_FILE" pull || true
docker compose -f "$COMPOSE_FILE" up -d

step "5 / 5  Wait for health"
HOST_PORT=$(grep '^HOST_PORT=' .env | cut -d= -f2 || echo 3100)
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${HOST_PORT}/api/health" &>/dev/null; then
    log "Memos is healthy."
    break
  fi
  sleep 3
  [[ $i -eq 30 ]] && warn "Health check timed out — check logs: docker compose logs memos"
done

PUBLIC_IP=$(curl -sf https://checkip.amazonaws.com || echo 'your-server-ip')
cat <<EOF

  ${GREEN}Memos is running!${NC}

  ┌─────────────────────────────────────────────────────┐
  │  Local:   http://localhost:${HOST_PORT}
  │  Public:  http://${PUBLIC_IP}:${HOST_PORT}
  └─────────────────────────────────────────────────────┘

  Update:   cd $MEMOS_DIR && git pull && docker compose -f $COMPOSE_FILE pull && docker compose -f $COMPOSE_FILE up -d
  Logs:     docker compose -f $COMPOSE_FILE logs -f memos
  Restart:  docker compose -f $COMPOSE_FILE restart memos
  Stop:     docker compose -f $COMPOSE_FILE down
  DB shell: docker compose -f $COMPOSE_FILE exec postgres psql -U memos -d memos

  Next: open the URL above, sign in, and configure Settings →
        Groq, Notion, Google/Outlook OAuth.

EOF
