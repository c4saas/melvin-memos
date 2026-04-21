#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Memos by MelvinOS — Release Helper
#
#  Usage:  ./scripts/release.sh 0.2.0
#
#  This script:
#    1. Bumps version in package.json
#    2. Commits the version bump
#    3. Creates an annotated git tag (v0.2.0)
#    4. Pushes to origin — triggering the Release workflow
#       which builds + publishes the Docker image to GHCR
#       and auto-bumps the memos-commercial compose file.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="${1:?Usage: ./scripts/release.sh <version> (e.g. 0.2.0)}"
TAG="v${VERSION}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver (e.g. 0.2.0)" >&2
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on main (currently on $BRANCH)" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is not clean. Commit or stash first." >&2
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: tag $TAG already exists" >&2
  exit 1
fi

echo "Releasing Memos ${TAG}..."

if command -v npm &>/dev/null; then
  npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
else
  sed -i "s/\"version\": \"[0-9][0-9.]*\"/\"version\": \"${VERSION}\"/" package.json
fi
echo "  package.json → ${VERSION}"

git add package.json
[ -f package-lock.json ] && git add package-lock.json
git commit -m "release: v${VERSION}"

git tag -a "$TAG" -m "Release ${VERSION}"
git push origin main --follow-tags

cat <<EOF

Release ${TAG} pushed.

GitHub Actions will:
  1. Build ghcr.io/c4saas/melvin-memos:${VERSION} + :latest
  2. Create a GitHub Release with changelog
  3. Auto-bump memos-commercial docker-compose.yml to ${VERSION}

Monitor: https://github.com/c4saas/melvin-memos/actions

Customer update flow:
  Change version to ${VERSION} in their docker-compose.yml, then:
    docker compose pull && docker compose up -d
EOF
