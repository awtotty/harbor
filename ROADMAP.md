# Harbor Roadmap

Harbor is an open-source, Docker-first, self-hostable Pi cloud agent appliance. It gives an individual technical user an always-on personal AI computer they control: reachable from a private web UI, terminal, and messaging channels, with persistent state and a safe update path.

Harbor is intentionally a single-user, high-trust appliance. Multi-user/team access is not a current product goal.

## Current status

Harbor has moved from prototype into early self-hostable appliance dogfooding.

The core appliance loop is implemented:

- Docker Compose deployment
- interactive setup with production-safe defaults
- Pi SDK-backed web chat
- Telegram bot access
- persistent `/workspace`, `/config`, and `/home/agent` volumes
- SQLite app state and transcript storage
- real PTY web terminals
- provider auth and model selection
- Pi package management
- optional capability bundles
- backup/export/restore scripts
- source-tag update flow
- System UI and `/update` command backed by an external updater sidecar

The remaining roadmap is now focused on ongoing polish, useful default bundles, files UX, and private dev preview polish.

## Completed: Personal Appliance

Harbor can now run as a personal appliance for one technical user.

- [x] Docker Compose setup
- [x] Interactive `scripts/setup.sh`
- [x] Pi SDK-backed browser chat
- [x] Persistent `/workspace`, `/config`, and `/home/agent` volumes
- [x] SQLite app state and transcript storage
- [x] Session list/new/archive basics
- [x] Provider auth and model selection
- [x] Pi package management
- [x] Real web terminal backed by PTY
- [x] Multiple UI themes
- [x] Telegram bot channel for messaging the agent
- [x] Shared Harbor commands including `/help`, `/status`, `/sessions`, `/new`, and `/update`
- [x] Capability bundle scaffolding

## Completed: Self-Hosted Operations

Harbor can be installed, backed up, restored, and updated without hand-editing containers.

- [x] VPS/home-server deployment guidance
- [x] Docker and Docker Compose install guidance
- [x] Tailscale/private-network deployment guidance
- [x] `.env`-based production configuration
- [x] Production safety check for default password
- [x] Persistent named volumes
- [x] Backup/export script
- [x] Import/restore script
- [x] Fresh-host restore documentation
- [x] Source-tag update script
- [x] Version metadata in System UI
- [x] External updater sidecar so Harbor can update from System UI or `/update` without giving the main container Docker access
- [x] Operational docs for Docker, persistence, security, bundles, backup/restore, and updates

## Ongoing: UI Polish

Use daily workflow friction to refine Harbor into something that feels calm, reliable, and appliance-like.

Examples:

- Better error surfaces for chat, packages, Telegram, provider auth, updater, and bundles
- Telegram status in Config:
  - last poll
  - last message
  - last error
- Telegram/session command polish:
  - `/use <session>`
  - clearer working/status feedback
- Rename sessions
- Archived sessions UI polish
- Transcript search/export
- Better files UX so Harbor feels like a small personal computer:
  - file browser
  - upload/download
  - create/rename/delete files and folders
  - open common text/markdown/log files from the browser
- Mobile web polish
- Keyboard navigation in the web app
- PWA install support
- Terminal UX polish:
  - names
  - reconnect behavior
  - cwd/status display
- Config reset actions:
  - reset Telegram token
  - clear auth/model config
- Safer env editor
- Better package/bundle install progress

## Ongoing: Capability Bundles

Keep the default image slim while making common toolsets easy to add from Config.

Near-term bundle ideas:

- Developer bundle:
  - `neovim`/`nvim`
  - language servers or formatters where appropriate
- Cloud/devops bundle examples
- Project-specific bundle examples
- Better bundle status detection and uninstall behavior
- Bundle tests and validation helpers
- Documentation examples for custom installers

## Delivered: Private Dev Server Proxy

Harbor can route Harbor-authenticated paths like `/proxy/:port/` to runtime-local dev servers. This makes Harbor useful as a private remote dev workspace without publishing a broad Docker dev-port range to the host.

The proxy supports normal private dev-server previews, including root paths such as `/proxy/3000` and nested paths such as `/proxy/3000/...`. It is intentionally path-based same-origin trusted preview mode: useful for private development, but not browser isolation for untrusted apps and not public app hosting.

Remaining polish:

- improve WebSocket/HMR compatibility where practical
- make generated apps easy to open from chat, terminal, and System/UI affordances
- add clearer framework examples for base path configuration
- keep public app hosting out of Harbor's appliance runtime unless it is implemented through a separate, properly isolated deployment architecture
