# Harbor

Harbor is a Docker-first, self-hostable Pi cloud agent appliance. It gives you an always-on personal AI computer with a web UI, Telegram bot access, real terminals, persistent sessions, and durable `/workspace`, `/config`, and `/home/agent` volumes.

Harbor is currently an early prototype meant for dogfooding by single technical users. It is intentionally a single-user, high-trust appliance; multi-user/team access is not a current product goal.

## Trust model

Harbor is not a hardened multi-tenant sandbox. Treat anyone with access to the web UI, Telegram bot, or terminals as having shell access to the container and to the persistent volumes. Run Harbor on localhost or a private network such as Tailscale, use a strong password, and do not expose it directly to the public internet.

## Choose your path

| Goal | Start here |
| --- | --- |
| Try Harbor locally with Docker | [Run with Docker](#run-with-docker) |
| Deploy an always-on private instance | [`docs/VPS_TAILSCALE.md`](docs/VPS_TAILSCALE.md) |
| Understand Docker settings and volumes | [`docs/DOCKER.md`](docs/DOCKER.md) |
| Back up, restore, and move Harbor | [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) |
| Understand what persists | [`docs/PERSISTENCE.md`](docs/PERSISTENCE.md) |
| Develop Harbor without Docker | [Development without Docker](#development-without-docker) |

## What you need

- Docker and Docker Compose for the recommended user path.
- A Pi/OpenAI-compatible account or provider auth configured through Harbor's Config screen before chat will work.
- Tailscale or another trusted private access layer for always-on remote access.
- Optional: a Telegram bot token if you want remote messaging from Telegram.

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
- Pi package management with default packages for web access, subagents, processes, and context-mode
- Optional capability bundles for extra persistent CLIs and Pi package sets
- Model provider auth and model selection
- Environment editor writing `/config/harbor.env`
- System status and structured observability events
- Docker Compose deployment

## Run with Docker

```bash
scripts/setup.sh
```

The interactive setup writes `.env`, starts Harbor, and configures update support. Open the printed URL and log in with the password you chose.

Manual Docker start is also supported:

```bash
cp .env.example .env
# edit .env if needed; use a strong HARBOR_PASSWORD for anything persistent
docker compose up --build
```

For local development, the default `.env.example` values bind Harbor to `127.0.0.1`.

### First run checklist

After the container is running:

1. Log in to the web UI.
2. Open Config/System.
3. Configure provider auth and choose a model.
4. Check package/status surfaces for obvious setup errors.
5. Send a short test prompt in Chat.
6. If chat fails, check `/status`, the System page, and `docker compose logs -f harbor`.

### Docker configuration

Common `.env` settings:

```env
HARBOR_PASSWORD=change-me
HARBOR_PRODUCTION=false
HARBOR_BIND_HOST=127.0.0.1
HARBOR_PORT=8080
HARBOR_DEV_BIND_HOST=127.0.0.1
```

Compose publishes container ports `3000-3099` for agent-started dev servers. This is the current dev-server access mechanism. Set `HARBOR_DEV_BIND_HOST` to your Tailscale IP for Tailnet access to those ports. A Harbor-authenticated reverse proxy is planned to reduce reliance on published port ranges.

For private Tailnet access, bind `HARBOR_BIND_HOST` to the host's Tailscale IP or MagicDNS-resolved interface. Avoid exposing Harbor directly to the public internet.

Production guardrail: when `HARBOR_PRODUCTION=true`, Harbor refuses to start with the default `HARBOR_PASSWORD=harbor`.

## Development without Docker

Docker Compose is the supported user path. The non-Docker path is mainly for Harbor contributors.

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

Useful contributor commands:

```bash
pnpm run build
pnpm test
```

## Web UI

The web UI has four primary areas:

- Sessions sidebar — create, select, and archive chats.
- Chat — live Pi-backed conversations with grouped activity/tool events.
- Terminal — browser terminal attached to a real PTY inside the container.
- Config/System — provider auth, model selection, packages, Telegram, env, status, and observability.

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

## Capability bundles

Harbor supports optional capability bundles for extra persistent tools and Pi package sets without bloating the base Docker image. Bundles can install npm CLIs into `/config/tools`, link commands into `/config/bin`, create config directories, write environment variables, and install Pi packages.

Install bundles from Config → Packages & bundles. See `docs/BUNDLES.md` for how optional capability bundles are defined.

## Terminal

The web terminal runs as the `agent` user in `/workspace` and uses the persistent `/home/agent` home directory. Use the web terminal for shell access inside Harbor, or use host/infrastructure access for out-of-band administration.

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

Harbor intentionally gives the Pi agent broad access inside the container. Treat the web UI, terminals, and Telegram bot as high-trust interfaces equivalent to shell access.

Message flow:

```text
web / telegram / future channels -> MessageRouter -> PiSessionRegistry -> Pi SDK session
```

Security notes are in `docs/SECURITY.md`.
