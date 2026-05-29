#!/usr/bin/env bash
set -euo pipefail

backup=""
yes=false
start_after=true

usage() {
  cat <<'USAGE'
Usage: scripts/harbor-import.sh BACKUP.tgz --yes [--no-start]

Restores a full Harbor backup into the Docker Compose volumes for:
  /config
  /workspace
  /home/agent

This is destructive: existing Harbor volume contents are removed before the
backup is extracted.

Options:
  --yes       Required to run non-interactively
  --no-start  Do not start Harbor after restore
  -h, --help  Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      yes=true
      shift
      ;;
    --no-start)
      start_after=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$backup" ]]; then
        echo "Unexpected argument: $1" >&2
        usage >&2
        exit 2
      fi
      backup="$1"
      shift
      ;;
  esac
done

if [[ -z "$backup" ]]; then
  usage >&2
  exit 2
fi

if [[ ! -f "$backup" ]]; then
  echo "Backup not found: $backup" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

for required in config/ workspace/ home/agent/; do
  if ! tar tzf "$backup" | grep -q "^$required"; then
    echo "Backup does not look like a Harbor full backup; missing $required" >&2
    exit 1
  fi
done

if [[ "$yes" != true ]]; then
  echo "This will stop Harbor and replace /config, /workspace, and /home/agent from:" >&2
  echo "  $backup" >&2
  read -r -p "Continue? Type 'restore' to proceed: " answer
  if [[ "$answer" != "restore" ]]; then
    echo "Restore cancelled." >&2
    exit 1
  fi
fi

docker compose stop harbor >/dev/null

docker compose run --rm --no-deps --entrypoint sh harbor -c '
  set -eu
  rm -rf /config/* /config/.[!.]* /config/..?* \
         /workspace/* /workspace/.[!.]* /workspace/..?* \
         /home/agent/* /home/agent/.[!.]* /home/agent/..?* 2>/dev/null || true
  tar xzf - -C /
  chown -R agent:agent /config /workspace /home/agent
' < "$backup"

if [[ "$start_after" == true ]]; then
  docker compose up -d harbor >/dev/null
  echo "Harbor restored and started."
else
  echo "Harbor restored. Start it with: docker compose up -d harbor"
fi
