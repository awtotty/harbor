# Harbor

Harbor is a self-hostable cloud agent appliance built around Pi. It starts as a lightweight web UI over a persistent Pi session with `/workspace` and `/config` volumes, and is designed to add Signal and other channels through the same message router.

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
npm install
npm run build
HARBOR_CONFIG_DIR=$PWD/.config HARBOR_WORKSPACE_DIR=$PWD/workspace npm start
```

Open http://localhost:8080 and log in with `harbor` unless `HARBOR_PASSWORD` is set.

## Run with Docker

```bash
docker compose up --build
```

Open http://localhost:8080.

## Agent access

Harbor intentionally gives the Pi agent broad access inside the container.

Persistent paths:

- `/workspace` — user/project workspace
- `/config/harbor.db` — Harbor SQLite app state and transcripts
- `/config/harbor.json` — Harbor config
- `/config/harbor.env` — env/secrets file
- `/config/pi-agent` — Pi auth/config
- `/config/sessions` — Pi native sessions

The image includes `sqlite3`, `curl`, and `jq` so the agent can inspect Harbor state and call local APIs when useful.

## Notes

The web chat routes through the same internal message router that Signal will use later:

```text
web / signal / future channels -> MessageRouter -> PiSessionRegistry -> Pi SDK session
```
