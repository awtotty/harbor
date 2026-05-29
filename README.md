# Harbor

Harbor is a Docker-first, self-hostable Pi cloud agent appliance. It gives you an always-on personal AI computer with a web UI, Telegram bot access, real terminals, persistent sessions, and durable `/workspace`, `/config`, and `/home/agent` volumes.

Harbor is currently an early prototype meant for dogfooding by technical users.

## Prototype features

- TypeScript Fastify server
- React/Vite lightweight web UI
- Password-protected browser chat with live streaming responses
- Pi SDK-backed sessions
- SQLite app state and transcript storage
- Shared Harbor commands in web and Telegram (`/help`, `/status`, `/sessions`, `/new [name]`)
- Telegram bot integration for messaging your agent remotely
- Real web terminals backed by PTY/xterm
- `pi` CLI available inside the container terminal as the `agent` user
- SSH access into the container
- Pi package management with default packages for web access, subagents, processes, and context-mode
- Model provider auth and model selection
- Environment editor writing `/config/harbor.env`
- System status and structured observability events
- Docker Compose deployment

## Run with Docker

```bash
cp .env.example .env
# edit .env if needed
docker compose up --build
```

Open http://localhost:8080 and log in with the password from `.env`.

For local development, the default `.env.example` values bind Harbor to `127.0.0.1`.

### Docker configuration

Common `.env` settings:

```env
HARBOR_PASSWORD=change-me
HARBOR_PRODUCTION=false
HARBOR_BIND_HOST=127.0.0.1
HARBOR_PORT=8080
HARBOR_SSH_BIND_HOST=127.0.0.1
HARBOR_SSH_PORT=2222
HARBOR_DEV_BIND_HOST=127.0.0.1
```

Compose publishes container ports `3000-3099` for agent-started dev servers. Set `HARBOR_DEV_BIND_HOST` to your Tailscale IP for Tailnet access to those ports.

For private Tailnet access, bind `HARBOR_BIND_HOST` and optionally `HARBOR_SSH_BIND_HOST` to the host's Tailscale IP or MagicDNS-resolved interface. Avoid exposing Harbor directly to the public internet.

Production guardrail: when `HARBOR_PRODUCTION=true`, Harbor refuses to start with the default `HARBOR_PASSWORD=harbor`.

## Run locally without Docker

```bash
pnpm install
pnpm run build
HARBOR_CONFIG_DIR=$PWD/.config \
HARBOR_WORKSPACE_DIR=$PWD/workspace \
PI_CODING_AGENT_DIR=$PWD/.config/pi-agent \
PI_CODING_AGENT_SESSION_DIR=$PWD/.config/sessions \
pnpm start
```

Open http://localhost:8080 and log in with `harbor` unless `HARBOR_PASSWORD` is set.

## Web UI

The web UI has four primary areas:

- Sessions sidebar — create, select, and archive chats.
- Chat — live Pi-backed conversations with grouped activity/tool events.
- Terminal — browser terminal attached to a real PTY inside the container.
- Config/System — provider auth, model selection, packages, Telegram, SSH keys, env, status, and observability.

Web chat uses a run-based streaming API:

```text
POST /api/chat/start
GET  /api/chat/runs/:runId/events
```

This keeps chat responsive while using standard GET-based SSE for better behavior over Tailnet and browser/proxy paths.

## Harbor commands

Harbor intercepts shared commands before passing messages to Pi:

- `/help` — show available Harbor commands
- `/status` — show Harbor system status and recent errors
- `/sessions` — list active sessions
- `/new [name]` — create and switch/link to a new session

These commands work from both the web UI and Telegram.

## Telegram

Harbor supports a Telegram bot channel for remote messaging:

1. Open Config → Telegram.
2. Create a bot with [@BotFather](https://t.me/BotFather).
3. Paste and test the token.
4. Send the bot a message.
5. Refresh recent senders and approve your Telegram user ID.
6. Enable the bot.

Telegram-linked sessions are tracked through channel metadata and shown as tags in the web sidebar. Session names are not used as channel source-of-truth.

## Terminal and SSH

The web terminal runs as the `agent` user in `/workspace` and uses the persistent `/home/agent` home directory. The container also exposes SSH on the configured host port.

Useful paths on `PATH` inside terminals:

- `/config/bin` — persistent custom scripts and binaries
- `/home/agent/.local/bin` — per-user tools
- `/app/node_modules/.bin` — app-local Node CLIs
- `/usr/local/bin/pi` — wrapper for the bundled Pi CLI

## Always-on deployment

Harbor is designed to run on any always-on host that supports Docker:

- VPS providers such as Hetzner, DigitalOcean, Vultr, Linode/Akamai, OVH, Netcup, etc.
- A home server, old desktop, mini PC, NAS, or Mac/Windows machine running Docker Desktop.

Recommended access model: run Harbor on the host and expose it privately through Tailscale rather than opening the web UI to the public internet.

See `docs/VPS_TAILSCALE.md` for a generalized VPS/home-server + Tailscale guide.

## Persistent state

Harbor intentionally separates the reproducible container image from personal state.

Persistent paths:

- `/workspace` — user/project workspace
- `/config/harbor.db` — Harbor SQLite app state and transcripts
- `/config/harbor.json` — Harbor config, including Telegram bot settings
- `/config/harbor.env` — env/secrets file
- `/config/pi-agent` — Pi auth/config/packages
- `/config/sessions` — Pi native sessions
- `/config/bin` — persistent custom scripts/binaries on `PATH`
- `/home/agent` — persistent shell home, CLI auth/config, dotfiles, and history

The image includes common agent/terminal tools such as `git`, `gh`, `sqlite3`, `curl`, `jq`, `rg`, `fd`, `vim`, `tmux`, `rsync`, `tree`, and network/debugging utilities.

See `docs/PERSISTENCE.md` for what survives rebuilds and where to put custom tools.

## Agent access

Harbor intentionally gives the Pi agent broad access inside the container. Treat the web UI, terminals, SSH, and Telegram bot as high-trust interfaces equivalent to shell access.

Message flow:

```text
web / telegram / future channels -> MessageRouter -> PiSessionRegistry -> Pi SDK session
```

Security notes are in `docs/SECURITY.md`.
