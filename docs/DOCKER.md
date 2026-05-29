# Docker Deployment

Harbor is intended to run as a Docker appliance. The image contains the Harbor web server, Pi SDK integration, PTY terminal support, default Pi packages, and common command-line tools.

## Quick start

```bash
scripts/setup.sh
```

The setup script writes `.env`, starts Harbor, and configures update support for the System page and `/update` command.

For manual setup:

```bash
cp .env.example .env
# edit HARBOR_PASSWORD before running anywhere persistent
docker compose up --build
```

Open Harbor at:

```text
http://localhost:8080
```

Default Compose bindings are localhost-only for the web UI and agent-started dev-server ports.

## Environment

Important `.env` settings:

```env
HARBOR_PASSWORD=change-me
HARBOR_PRODUCTION=false
HARBOR_BIND_HOST=127.0.0.1
HARBOR_PORT=8080
```

Container paths are normally fixed by Compose:

```env
HARBOR_CONFIG_DIR=/config
HARBOR_WORKSPACE_DIR=/workspace
HARBOR_TERMINAL_USER=agent
PI_CODING_AGENT_DIR=/config/pi-agent
PI_CODING_AGENT_SESSION_DIR=/config/sessions
```

When `HARBOR_PRODUCTION=true`, Harbor refuses to start with the unsafe default password `harbor`.

## Volumes

Compose creates three persistent named volumes:

```yaml
harbor-workspace: /workspace
harbor-config:    /config
harbor-home:      /home/agent
```

Use these for backups and migrations. The container image should be considered replaceable.

Notable persistent files/directories:

- `/config/harbor.db` — Harbor SQLite state and transcripts
- `/config/harbor.json` — Harbor application config
- `/config/harbor.env` — environment/secrets edited by the web UI
- `/config/pi-agent` — Pi auth/config/package state
- `/config/sessions` — Pi native sessions
- `/config/bin` — persistent user binaries on `PATH`
- `/workspace` — working files
- `/home/agent` — shell home, dotfiles, history, CLI auth

## Network binding

Local-only default:

```env
HARBOR_BIND_HOST=127.0.0.1
```

Tailnet/private host example:

```env
HARBOR_BIND_HOST=100.x.y.z
```

Public `0.0.0.0` binding is not recommended unless Harbor is behind a trusted private network, VPN, or reverse proxy with strong authentication.

## Terminal

Harbor runs the web server and terminal PTYs as the `agent` user. The image grants `agent` passwordless sudo because Harbor is intended as a high-trust personal agent appliance.

The web terminal starts in `/workspace`. `PATH` includes:

```text
/config/bin
/home/agent/.local/bin
/app/node_modules/.bin
/usr/local/bin
```

The Docker image installs `/usr/local/bin/pi` as a wrapper around the bundled Pi CLI, so `pi` is available in web terminals.

Harbor can optionally install capability bundles through Config → Packages & bundles. Bundles install persistent tools under `/config/tools`, link user-facing commands into `/config/bin`, and can write env vars to `/config/harbor.env`.

Use the web terminal for shell access inside Harbor, or use host/infrastructure access for out-of-band administration.

Compose publishes container ports `3000-3099` for dev servers started by the agent:

```text
${HARBOR_DEV_BIND_HOST:-127.0.0.1}:3000-3099 -> container ports 3000-3099
```

Leave `HARBOR_DEV_BIND_HOST=127.0.0.1` for local-only access, or set it to the host's Tailscale IP for Tailnet access.

## Updating

Recommended source-checkout update flow:

```bash
scripts/harbor-update.sh
```

For dogfooding directly against `main`:

```bash
git pull --ff-only
docker compose up --build -d
```

The image rebuilds, while `/workspace`, `/config`, and `/home/agent` persist. See [UPDATES.md](UPDATES.md) for backup/import scripts and the longer-term external updater design that will allow web/chat-triggered updates without giving the main Harbor container Docker access.

## Inspecting logs and health

```bash
docker compose logs -f harbor
curl -fsS http://localhost:8080/healthz
```

Harbor also records structured status/events in `/config/harbor.db`, visible on the System page.

## Resetting state

To reset the replaceable container while keeping state:

```bash
docker compose up --build --force-recreate
```

To delete all Harbor state, remove the volumes explicitly:

```bash
docker compose down -v
```

This deletes transcripts, config, sessions, workspace, and `/home/agent` data.
