#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=.env

confirm() {
  local prompt="$1" default="${2:-Y}" answer
  if [[ "$default" == "Y" ]]; then
    read -r -p "$prompt [Y/n] " answer
    [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
  else
    read -r -p "$prompt [y/N] " answer
    [[ "$answer" =~ ^[Yy] ]]
  fi
}

require_command() {
  local command="$1" message="$2"
  if command -v "$command" >/dev/null 2>&1; then return 0; fi
  echo
  echo "$command is not available."
  echo
  echo "$message"
  echo
  exit 1
}

random_secret() {
  openssl rand -base64 24 | tr -d '\n'
}

upsert_env() {
  local key="$1" value="$2"
  if [[ -f "$ENV_FILE" ]] && grep -qE "^${key}=" "$ENV_FILE"; then
    local escaped
    escaped="$(printf '%s' "$value" | sed 's/[&/]/\\&/g')"
    sed -i.bak "s/^${key}=.*/${key}=${escaped}/" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

prompt_password() {
  local password confirm_password
  while true; do
    echo
    echo "Choose a Harbor web password. Press Enter to generate a random password."
    read -r -s -p "Password: " password
    echo
    if [[ -z "$password" ]]; then
      password="$(random_secret)"
      echo "Generated password: $password"
      echo "Save this somewhere safe."
      HARBOR_SETUP_PASSWORD="$password"
      return
    fi
    if [[ "$password" == "harbor" ]]; then
      echo "The password 'harbor' is reserved for local development. Choose a different password."
      continue
    fi
    read -r -s -p "Confirm password: " confirm_password
    echo
    if [[ "$password" == "$confirm_password" ]]; then
      HARBOR_SETUP_PASSWORD="$password"
      return
    fi
    echo "Passwords did not match. Try again."
  done
}

detect_tailscale_ip() {
  if command -v tailscale >/dev/null 2>&1; then
    tailscale ip -4 2>/dev/null | head -n 1 || true
  fi
}

prompt_bind_host() {
  local tailscale_ip choice custom
  tailscale_ip="$(detect_tailscale_ip)"
  echo
  echo "Where should Harbor listen?"
  echo
  if [[ -n "$tailscale_ip" ]]; then
    echo "1) Tailscale — $tailscale_ip, private Tailnet access (recommended)"
    echo "2) Localhost only — same machine only"
    echo "3) Custom"
    read -r -p "Choose [1]: " choice
    choice="${choice:-1}"
    case "$choice" in
      1) HARBOR_SETUP_BIND_HOST="$tailscale_ip" ;;
      2) HARBOR_SETUP_BIND_HOST="127.0.0.1" ;;
      3) read -r -p "Bind host/IP: " custom; HARBOR_SETUP_BIND_HOST="$custom" ;;
      *) echo "Invalid choice" >&2; exit 1 ;;
    esac
  else
    echo "1) Localhost only — same machine only (recommended)"
    echo "2) Custom"
    read -r -p "Choose [1]: " choice
    choice="${choice:-1}"
    case "$choice" in
      1) HARBOR_SETUP_BIND_HOST="127.0.0.1" ;;
      2) read -r -p "Bind host/IP: " custom; HARBOR_SETUP_BIND_HOST="$custom" ;;
      *) echo "Invalid choice" >&2; exit 1 ;;
    esac
  fi

  if [[ "$HARBOR_SETUP_BIND_HOST" == "0.0.0.0" ]]; then
    echo
    echo "0.0.0.0 exposes Harbor on every interface. Only use this behind a trusted firewall or reverse proxy."
    confirm "Continue with 0.0.0.0?" N || exit 1
  fi
}

prompt_dev_bind_host() {
  echo
  echo "Agent-started web apps can use ports 3000-3099."
  echo "Keeping those ports on localhost avoids conflicts and unintended exposure."
  if confirm "Expose dev ports on the same host as Harbor?" N; then
    HARBOR_SETUP_DEV_BIND_HOST="$HARBOR_SETUP_BIND_HOST"
  else
    HARBOR_SETUP_DEV_BIND_HOST="127.0.0.1"
  fi
}

prepare_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then return; fi
  local backup_file=".env.bak_$(date -u +%Y%m%d-%H%M%S)"
  echo
  echo ".env already exists."
  echo "Continuing will move it to $backup_file and create a new .env from this setup flow."
  confirm "Continue?" Y || exit 1
  mv "$ENV_FILE" "$backup_file"
  echo "Previous .env saved as $backup_file"
}

write_env() {
  : > "$ENV_FILE"

  upsert_env HARBOR_PASSWORD "$HARBOR_SETUP_PASSWORD"
  upsert_env HARBOR_PRODUCTION true
  upsert_env HARBOR_BIND_HOST "$HARBOR_SETUP_BIND_HOST"
  upsert_env HARBOR_PORT 8080
  upsert_env HARBOR_DEV_BIND_HOST "$HARBOR_SETUP_DEV_BIND_HOST"
  upsert_env HARBOR_CONFIG_DIR /config
  upsert_env HARBOR_WORKSPACE_DIR /workspace
  upsert_env HARBOR_TERMINAL_USER agent
  upsert_env HARBOR_UPDATER_TOKEN "$(openssl rand -hex 32)"
  upsert_env HARBOR_UPDATER_URL http://harbor-updater:8787
  upsert_env PI_CODING_AGENT_DIR /config/pi-agent
  upsert_env PI_CODING_AGENT_SESSION_DIR /config/sessions
}

start_harbor() {
  export HARBOR_VERSION="$(git describe --tags --exact-match 2>/dev/null || echo dev)"
  export HARBOR_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  export HARBOR_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker compose --profile updater up --build -d
}

main() {
  echo "Harbor setup"
  echo
  echo "This script configures Harbor for this checkout, writes .env, and starts Docker Compose."
  echo "It does not install Harbor globally."
  echo
  confirm "Continue?" Y || exit 1

  require_command git "Install Git, then rerun this script.\n\nUbuntu/Debian:\n  sudo apt update && sudo apt install -y git\n\nmacOS:\n  xcode-select --install\n  # or: brew install git"
  require_command openssl "Install OpenSSL, then rerun this script.\n\nUbuntu/Debian:\n  sudo apt update && sudo apt install -y openssl\n\nmacOS:\n  brew install openssl"
  require_command docker "Harbor needs Docker and the Docker Compose plugin. Install them, then rerun this script.\n\nUbuntu/Debian:\n  curl -fsSL https://get.docker.com | sh\n  sudo usermod -aG docker \"$USER\"\n  newgrp docker\n\nmacOS:\n  Install Docker Desktop:\n  https://docs.docker.com/desktop/setup/install/mac-install/"
  if ! docker compose version >/dev/null 2>&1; then
    echo
    echo "Docker Compose plugin is not available."
    echo
    echo "Install Docker Compose, then rerun this script."
    echo
    echo "Ubuntu/Debian: install the docker-compose-plugin package or rerun Docker's install guide."
    echo "macOS: Docker Desktop includes Docker Compose."
    exit 1
  fi

  prepare_env_file
  prompt_password
  prompt_bind_host
  prompt_dev_bind_host
  write_env
  start_harbor

  echo
  echo "Harbor setup complete."
  echo
  echo "Open:"
  echo "  http://${HARBOR_SETUP_BIND_HOST}:8080"
  echo
  echo "Useful commands:"
  echo "  docker compose --profile updater logs -f"
  echo "  scripts/harbor-export.sh -o backups/harbor.tgz"
}

main "$@"
