#!/usr/bin/env bash
set -euo pipefail

output="backups/harbor-backup-$(date -u +%Y%m%d-%H%M%S).tgz"
live=false
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-harbor}"
source "$(dirname "$0")/harbor-env.sh"
ensure_env_secret HARBOR_RUNTIME_TOKEN

usage() {
  cat <<'USAGE'
Usage: scripts/harbor-export.sh [-o backup.tgz] [--live]

Creates a full Harbor backup containing the persistent appliance state:
  /config
  /workspace
  /home/agent

By default Harbor is stopped during export for SQLite consistency, then
restarted if it was running before the export. Use --live to skip the stop.

Options:
  -o, --output PATH  Backup archive path
  --live             Export without stopping Harbor first
  -h, --help         Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output)
      output="${2:?missing output path}"
      shift 2
      ;;
    --live)
      live=true
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

mkdir -p "$(dirname "$output")"

was_running=false
for service in harbor harbor-runtime; do
  container_id="$(docker compose ps -q "$service" 2>/dev/null || true)"
  if [[ -n "$container_id" ]] && [[ "$(docker inspect -f '{{.State.Running}}' "$container_id" 2>/dev/null || true)" == "true" ]]; then
    was_running=true
  fi
done

if [[ "$live" == false ]]; then
  docker compose stop harbor harbor-runtime >/dev/null
fi

cleanup() {
  if [[ "$live" == false && "$was_running" == true ]]; then
    docker compose up -d harbor-runtime harbor >/dev/null
  fi
}
trap cleanup EXIT

created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
version="$(git describe --tags --exact-match 2>/dev/null || echo dev)"

docker compose run --rm --no-deps --entrypoint sh harbor-runtime -c '
  set -eu
  cat > /tmp/harbor-backup-manifest.txt
  tar czf - -C / config workspace home/agent tmp/harbor-backup-manifest.txt
' > "$output" <<MANIFEST
Harbor backup
Created: $created_at
Source version: $version
Source commit: $commit
Contents: /config /workspace /home/agent
MANIFEST

printf 'Harbor backup written: %s\n' "$output"
printf 'Treat this archive as sensitive: it contains secrets, transcripts, auth, and workspace data.\n'
