# Harbor Roadmap

Harbor is an open-source, Docker-first, self-hostable Pi cloud agent appliance. The goal is to give an individual technical user an always-on personal AI computer they control: reachable from a private web UI, terminal, and messaging channels, with an optional hosted version later for convenience and managed compute.

Harbor is intentionally a single-user, high-trust appliance. Multi-user/team access is not a current product goal.

## Current status

- Phase 1 is mostly implemented and is being dogfooded.
- Phase 2 documentation exists for Docker and VPS/Tailscale deployment, but restore steps, database/config inspection notes, and system UI polish remain incomplete.
- Phases 3-5 are forward-looking.

## Phase 1: Personal Appliance Prototype

Get Harbor working for a single power user on a local machine.

- [x] Docker Compose setup
- [x] Pi SDK-backed browser chat
- [x] Persistent `/workspace`, `/config`, and `/home/agent` volumes
- [x] SQLite app state and transcript storage
- [x] Session list/new/archive basics
- [x] Provider auth and model selection
- [x] Pi package management
- [x] Real web terminal backed by PTY
- [x] Multiple UI themes
- [x] Telegram bot channel for messaging the agent

Success means: one person can run Harbor locally, chat with Pi from the browser or Telegram, and use it for real work inside `/workspace`.

Status: mostly implemented; continue dogfooding and fixing friction.

## Phase 2: VPS + Tailscale Always-On Deploy

Deploy Harbor to a private VPS or home server behind Tailscale before broader product polish. This tests the core product hypothesis: an always-on personal agent appliance reachable privately from anywhere.

- [x] VPS/home-server deployment guide for Ubuntu/Debian
- [x] Docker and Docker Compose install steps
- [x] Tailscale setup and MagicDNS guidance
- [x] `.env`-based production configuration
- [x] Compose settings for VPS use:
  - [x] `restart: unless-stopped`
  - [x] persistent named volumes
  - [x] explicit password configuration
- [x] Firewall guidance:
  - [x] expose Harbor only over Tailscale
- [ ] Backup and restore docs (partial):
  - [x] `/config`
  - [x] `/workspace`
  - [x] `/home/agent`
  - [ ] restore onto a fresh host
- [ ] Operational runbook (partial):
  - [x] update Harbor
  - [x] restart Harbor
  - [x] view logs
  - [x] rebuild image
  - [ ] inspect database/config
- [ ] Tailscale-aware System UI if available:
  - show Tailscale IP / hostname
  - show suggested private URL
- [x] Production safety checks:
  - fail when `HARBOR_PASSWORD=harbor` in production mode
  - document secret-bearing files in `/config`

Success means: Harbor can run unattended on a VPS or home server, survive restarts, and be reachable from the user's devices through Tailscale without exposing the web UI publicly.

## Phase 3: Dogfood Hardening + Product Polish

Use daily workflow friction to harden the appliance.

- Better error surfaces for chat, packages, Telegram, and provider auth
- Telegram status in Config:
  - last poll
  - last message
  - last error
- Telegram command polish:
  - implemented today: `/help`, `/status`, `/sessions`, `/new [name]`
  - planned: `/use <session>` and clearer working/status feedback
- Rename sessions
- Archived sessions UI polish
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

## Phase 4: Self-Host Hardening

Turn the dogfood prototype into a self-hosted tool another technical individual can deploy and trust without hand-holding.

- Clear setup documentation
- Guided first-run checklist
- Backup/export/restore support
- Upgrade process
- Better logging and diagnostics
- Update distribution and lifecycle:
  - publish versioned Docker images, e.g. `ghcr.io/awtotty/harbor:latest` and semver tags
  - document manual source-checkout update flow
  - show current/latest version in System UI
  - support optional user-triggered updates through a small privileged updater sidecar rather than giving the main Harbor container direct Docker control
  - consider Watchtower-compatible labels/config for users who want scheduled auto-updates or update notifications
- Permission/security docs
- Extension/package bundle management
- Workspace/file inspection improvements
- Optional OAuth or reverse-proxy auth docs for single-user deployments behind trusted access layers

Success means: a technical user can self-host Harbor without hand-holding and use it for real work.

## Phase 5: Hosted Utility Version

Offer Harbor as a managed service while preserving the open-source self-hosted core.

- Managed hosted personal instances
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
