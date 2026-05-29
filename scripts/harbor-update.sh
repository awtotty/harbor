#!/usr/bin/env bash
set -euo pipefail

target=""
yes=false
backup=true
backup_path=""
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-harbor}"

usage() {
  cat <<'USAGE'
Usage: scripts/harbor-update.sh [--target vX.Y.Z] [--yes] [--no-backup]

Updates a source-checkout Harbor deployment to a GitHub release tag, rebuilds
with version metadata, and restarts Docker Compose.

By default the latest v* tag from origin is used and a pre-update backup is
created with scripts/harbor-export.sh.

Options:
  --target TAG   Release tag to update to, e.g. v0.1.0
  --yes, -y      Do not prompt for confirmation
  --no-backup    Skip pre-update backup
  -h, --help     Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      target="${2:?missing target tag}"
      shift 2
      ;;
    --yes|-y)
      yes=true
      shift
      ;;
    --no-backup)
      backup=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit, stash, or discard local changes before updating." >&2
  exit 1
fi

current_ref="$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)"
current_commit="$(git rev-parse --short HEAD)"

git fetch --tags origin

if [[ -z "$target" ]]; then
  target="$(git tag --list 'v*' --sort=-v:refname | head -n 1)"
fi

if [[ -z "$target" ]]; then
  echo "No v* release tags found." >&2
  exit 1
fi

if ! git rev-parse -q --verify "refs/tags/$target" >/dev/null; then
  echo "Unknown tag: $target" >&2
  exit 1
fi

target_commit="$(git rev-parse --short "$target^{commit}")"

cat <<SUMMARY
Harbor update

Current: $current_ref ($current_commit)
Target:  $target ($target_commit)
Backup:  $backup

This will checkout the target tag, rebuild Harbor, and restart Docker Compose.
SUMMARY

if [[ "$yes" != true ]]; then
  read -r -p "Continue? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Update cancelled."; exit 1 ;;
  esac
fi

if [[ "$backup" == true ]]; then
  backup_path="backups/pre-update-${current_ref}-$(date -u +%Y%m%d-%H%M%S).tgz"
  scripts/harbor-export.sh -o "$backup_path"
fi

git switch --detach "$target"

export HARBOR_VERSION="$target"
export HARBOR_COMMIT="$(git rev-parse --short HEAD)"
export HARBOR_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

docker compose build \
  --build-arg HARBOR_VERSION="$HARBOR_VERSION" \
  --build-arg HARBOR_COMMIT="$HARBOR_COMMIT" \
  --build-arg HARBOR_BUILT_AT="$HARBOR_BUILT_AT" \
  harbor

docker compose stop harbor
docker compose up -d harbor

echo "Waiting for Harbor health check..."
for _ in $(seq 1 30); do
  if docker compose exec -T harbor curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
    echo "Harbor updated to $HARBOR_VERSION ($HARBOR_COMMIT)."
    if [[ -n "$backup_path" ]]; then
      echo "Pre-update backup: $backup_path"
    fi
    exit 0
  fi
  sleep 2
done

echo "Harbor did not become healthy within the timeout." >&2
if [[ -n "$backup_path" ]]; then
  echo "Rollback option: git switch --detach $current_ref && scripts/harbor-import.sh '$backup_path' --yes" >&2
fi
exit 1
