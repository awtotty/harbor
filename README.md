# Harbor

Harbor is a Docker-first, self-hostable Pi cloud agent appliance. It gives you an always-on personal AI computer with a web UI, Telegram bot access, real terminals, persistent sessions, and durable `/workspace`, `/config`, and `/home/agent` volumes.

Harbor is currently an early prototype meant for dogfooding by technical users.

## Prototype features

- TypeScript Fastify server
- React/Vite lightweight web UI
- Password-protected browser chat
- Pi SDK-backed sessions
- SQLite app state and transcript storage
- Telegram bot integration for messaging your agent
- Real web terminals backed by PTY
- SSH access into the container
- Pi package management
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

Harbor intentionally gives the Pi agent broad access inside the container. Treat the web UI and Telegram bot as high-trust interfaces equivalent to shell access.

Message flow:

```text
web / telegram / future channels -> MessageRouter -> PiSessionRegistry -> Pi SDK session
```

Security notes are in `docs/SECURITY.md`.
