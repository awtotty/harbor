# Harbor

Harbor is a self-hostable cloud agent appliance built around Pi. It starts as a lightweight web UI over persistent Pi sessions with `/workspace`, `/config`, and `/home/agent` volumes, and supports messaging channels through the same message router.

## Prototype features

- TypeScript Fastify server
- React/Vite lightweight web UI
- Password-protected browser chat
- Pi SDK-backed persistent default session
- Environment editor writing `/config/harbor.env`
- System status page
- Docker Compose scaffold with SSH port exposed

## Run locally

```bash
pnpm install
pnpm run build
HARBOR_CONFIG_DIR=$PWD/.config HARBOR_WORKSPACE_DIR=$PWD/workspace pnpm start
```

Open http://localhost:8080 and log in with `harbor` unless `HARBOR_PASSWORD` is set.

## Run with Docker

```bash
docker compose up --build
```

Open http://localhost:8080.

For an always-on VPS deploy over Tailscale, see `docs/DIGITALOCEAN_TAILSCALE.md`.

## Agent access

Harbor intentionally gives the Pi agent broad access inside the container.

Persistent paths:

- `/workspace` — user/project workspace
- `/config/harbor.db` — Harbor SQLite app state and transcripts
- `/config/harbor.json` — Harbor config
- `/config/harbor.env` — env/secrets file
- `/config/pi-agent` — Pi auth/config
- `/config/sessions` — Pi native sessions
- `/config/bin` — persistent custom scripts/binaries on `PATH`
- `/home/agent` — persistent shell home, CLI auth/config, dotfiles, and history

The image includes common agent/terminal tools such as `git`, `gh`, `sqlite3`, `curl`, `jq`, `rg`, `fd`, `vim`, `tmux`, `rsync`, `tree`, and network/debugging utilities. See `docs/PERSISTENCE.md` for what survives rebuilds and where to put custom tools.

## Notes

The web chat routes through the same internal message router that Signal will use later:

```text
web / telegram / future channels -> MessageRouter -> PiSessionRegistry -> Pi SDK session
```
