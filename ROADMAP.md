# Harbor Roadmap

Harbor is an open-source, Docker-first, self-hostable Pi cloud agent appliance. The goal is to give individuals and teams an always-on personal AI computer they control: reachable from a private web UI, SSH, terminal, and messaging channels, with an optional hosted version later for convenience and managed compute.

## Phase 1: Personal Appliance Prototype

Get Harbor working for a single power user on a local machine.

- Docker Compose setup
- Pi SDK-backed browser chat
- Persistent `/workspace` and `/config` volumes
- SQLite app state and transcript storage
- Session list/new/archive basics
- OpenAI subscription login and model selection
- Pi package management
- SSH authorized key setup
- Real web terminal backed by PTY
- Multiple UI themes
- Telegram bot channel for messaging the agent

Success means: one person can run Harbor locally, chat with Pi from the browser or Telegram, and use it for real work inside `/workspace`.

Status: mostly implemented; continue dogfooding and fixing friction.

## Phase 2: VPS + Tailscale Always-On Deploy

Deploy Harbor to a private VPS behind Tailscale before broader product polish. This tests the core product hypothesis: an always-on personal agent appliance reachable privately from anywhere.

- VPS deployment guide for Ubuntu/Debian
- Docker and Docker Compose install steps
- Tailscale setup and MagicDNS guidance
- `.env`-based production configuration
- Compose settings for VPS use:
  - `restart: unless-stopped`
  - persistent named volumes or documented bind mounts
  - explicit password configuration
- Firewall guidance:
  - expose Harbor only over Tailscale
  - restrict SSH to Tailscale where possible
- Backup and restore docs for:
  - `/config`
  - `/workspace`
- Operational runbook:
  - update Harbor
  - restart Harbor
  - view logs
  - rebuild image
  - inspect database/config
- Tailscale-aware System UI if available:
  - show Tailscale IP / hostname
  - show suggested private URL
- Production safety checks:
  - warn or fail when `HARBOR_PASSWORD=harbor` in production mode
  - document secret-bearing files in `/config`

Success means: Harbor can run unattended on a VPS, survive restarts, and be reachable from the user's devices through Tailscale without exposing the web UI publicly.

## Phase 3: Dogfood Hardening + Product Polish

Use daily workflow friction to harden the appliance.

- Better error surfaces for chat, packages, Telegram, and provider auth
- Telegram status in Config:
  - last poll
  - last message
  - last error
- Telegram commands:
  - `/help`
  - `/new`
  - `/sessions`
  - `/use <session>`
- Working/status feedback for messaging channels
- Rename sessions
- Archived sessions UI
- Transcript search/export
- Mobile web polish
- PWA install support
- Terminal UX polish:
  - names
  - reconnect behavior
  - cwd/status display
- Robust dev-server reverse proxy:
  - route Harbor-authenticated paths like `/proxy/:port/` to container-local agent-started apps
  - support WebSocket/HMR where possible
  - reduce reliance on Docker-published dev port ranges
- Config reset actions:
  - reset Telegram token
  - clear auth/model config
- Safer env editor
- Better package install/update progress

Success means: Harbor feels reliable enough for everyday personal workflows, both from browser and phone.

## Phase 4: Teammate-Ready Self-Host

Turn the personal setup into something technical teammates can deploy and trust.

- Clear setup documentation
- Guided first-run checklist
- Backup/export support
- Upgrade process
- Better logging and diagnostics
- Update distribution and lifecycle:
  - publish versioned Docker images, e.g. `ghcr.io/awtotty/harbor:latest` and semver tags
  - document manual update flow: `docker compose pull && docker compose up -d`
  - show current/latest version in System UI
  - support optional user-triggered updates through a small privileged updater sidecar rather than giving the main Harbor container direct Docker control
  - consider Watchtower-compatible labels/config for users who want scheduled auto-updates or update notifications
- Permission/security docs
- Extension/package bundle management
- Workspace/file inspection improvements
- Multi-user/team access model exploration
- Optional OAuth or reverse-proxy auth docs

Success means: technical teammates can self-host Harbor without hand-holding and use it for real work.

## Phase 5: Hosted Utility Version

Offer Harbor as a managed service while preserving the open-source self-hosted core.

- Managed hosted instances
- Persistent storage and backups
- Remote access without manual server setup
- Hosted model routing
- Messaging channel management
- Usage dashboard
- Utility-style metered billing
- Data export and migration path back to self-hosting

Success means: users can either self-host Harbor for free or pay for managed convenience, uptime, and compute.

## Deferred / Reconsider Later

### Signal

Signal linked-device mode works poorly for the desired use case because a linked device is not a separate recipient the same user can message. A dedicated Signal bot-like account requires another phone number. Keep Signal deferred unless there is a clear user need and acceptable setup story.
