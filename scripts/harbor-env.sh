#!/usr/bin/env bash

ensure_env_secret() {
  local key="$1" env_file="${2:-.env}"
  if [[ -f "$env_file" ]] && grep -qE "^${key}=.[[:print:]]*" "$env_file"; then return; fi
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to generate $key" >&2
    exit 1
  fi
  touch "$env_file"
  if grep -qE "^${key}=" "$env_file"; then
    local value
    value="$(openssl rand -hex 32)"
    sed -i.bak "s/^${key}=.*/${key}=${value}/" "$env_file"
  else
    printf '%s=%s\n' "$key" "$(openssl rand -hex 32)" >> "$env_file"
  fi
  echo "Generated $key in $env_file"
}
