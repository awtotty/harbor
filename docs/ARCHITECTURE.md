# Harbor Architecture

Harbor is a Dockerized Pi cloud-agent appliance. It is intentionally a single-user, high-trust personal appliance; it does not try to isolate multiple users from each other.

## Services

Harbor is split into three Compose services:

```text
harbor          control plane: web UI, auth, API, transcripts, config, Telegram, proxy gateway
harbor-runtime  runtime plane: Pi SDK sessions, terminals, bundles/packages, workspace tools, dev servers
harbor-updater  privileged updater sidecar: Docker/Compose access for source-tag updates
```

The main `harbor` control container does not mount the Docker socket and does not run heavy workspace workloads. Agent work is delegated to `harbor-runtime` over the private Compose network using `HARBOR_RUNTIME_URL` and `HARBOR_RUNTIME_TOKEN`.

The updater sidecar remains separate from both control and runtime. It is privileged by design, but exposes only fixed update operations.

## Persistent volumes

- `/workspace` — user projects and working files. Mounted into `harbor-runtime`.
- `/config` — persistent Harbor and Pi state. Mounted into control and runtime.
- `/home/agent` — persistent shell home for CLI auth, dotfiles, history, and user-level tool state. Mounted into `harbor-runtime`.

The control plane mounts `/config` so it can serve sessions, transcripts, auth/config, Telegram state, and observability. Runtime mounts all three volumes because agent/tool execution needs the workspace and shell home.

Harbor prepends these persistent/custom paths to `PATH` in the runtime:

- `/config/bin` — recommended location for custom persistent scripts/binaries.
- `/config/tools/npm/bin` — npm global tools installed by capability bundles.
- `/home/agent/.local/bin` — user-local tools installed by the `agent` user.
- `/app/node_modules/.bin` — Harbor/Pi project CLIs.

Container image layers are still ephemeral. Tools installed with `apt` inside a running container do not survive rebuilds unless added to the Dockerfile or reinstalled by a bundle. CLI auth and config under `/home/agent` persist.

## Core flows

### Web chat

```text
Browser Chat -> harbor POST /api/chat/start
             -> ChatService persists user message in /config/harbor.db
             -> MessageRouter forwards to harbor-runtime /internal/message
             -> runtime PiSessionRegistry -> Pi SDK
Browser SSE  <- harbor GET /api/chat/runs/:runId/events
```

`ChatService` persists normalized transcript messages to `/config/harbor.db`. The run-based API keeps chat responsive while using standard GET-based SSE for browser, proxy, and Tailnet compatibility.

### Telegram chat

```text
Telegram Bot -> harbor TelegramService -> ChatService -> MessageRouter -> harbor-runtime -> Pi SDK
```

Telegram uses the same `ChatService` path as web chat rather than duplicating Pi-session logic. Telegram-linked sessions are tracked with channel metadata; session names are not the source of truth for Telegram routing.

### Sessions

Harbor sessions are stored in SQLite under `/config/harbor.db`. Each Harbor session maps to a Pi session ID and has its own transcript. Pi native session files live under `/config/sessions` and are used by the runtime.

### Packages and bundles

Package and bundle API requests hit the control plane, then proxy to the runtime service. Runtime runs Pi package commands and bundle installers using the persistent `/config`, `/workspace`, and `/home/agent` volumes.

After package or bundle changes, runtime resets active Pi SDK sessions so new resources load on next chat.

### Terminal

Web terminals use `@xterm/xterm` in the browser and `node-pty` in the runtime service. Control proxies terminal API/SSE calls to runtime. Terminal state is in-memory in the runtime and does not survive runtime restarts. The shell runs as `agent` and starts in `/workspace`.

### Private dev-server proxy

Browser requests to:

```text
/proxy/<port>/...
```

hit the control plane first for Harbor auth and cross-site checks. Control then forwards to runtime's internal dev proxy, which connects to `127.0.0.1:<port>` inside the runtime container. This lets dev servers stay runtime-local while still being accessible through Harbor's authenticated same-origin preview path.

This is private trusted preview mode, not public app hosting or browser isolation for untrusted apps.

## Future non-web channels

Additional messaging channels should call `ChatService.sendChatMessage(...)` rather than duplicating chat or Pi SDK session logic. That keeps transcripts in one place while the actual agent execution remains in runtime.
