# Harbor Architecture

Harbor is a Dockerized Pi cloud-agent appliance. The container runs the Harbor Node/Pi SDK process as the `agent` user.

Harbor is intentionally a single-user, high-trust personal appliance. It does not try to isolate multiple users from each other.

## Persistent volumes

- `/workspace` — user projects and working files.
- `/config` — persistent Harbor and Pi state.
- `/home/agent` — persistent shell home for CLI auth, dotfiles, history, and user-level tool state.

Harbor also prepends these persistent/custom paths to `PATH`:

- `/config/bin` — recommended location for custom persistent scripts/binaries.
- `/home/agent/.local/bin` — user-local tools installed by the `agent` user.
- `/app/node_modules/.bin` — Harbor/Pi project CLIs.

Container image layers are still ephemeral. Tools installed with `apt` inside a running container do not survive rebuilds unless added to the Dockerfile or reinstalled by the user. CLI auth and config under `/home/agent` will persist.

## Core flows

### Web chat

```text
Browser Chat -> POST /api/chat/start -> ChatService -> MessageRouter -> PiSessionRegistry -> Pi SDK
Browser SSE  <- GET /api/chat/runs/:runId/events <- ChatRunManager
```

`ChatService` persists normalized transcript messages to `/config/harbor.db`. The run-based API keeps chat responsive while using standard GET-based SSE for browser, proxy, and Tailnet compatibility.

### Telegram chat

```text
Telegram Bot -> TelegramService -> ChatService -> MessageRouter -> PiSessionRegistry -> Pi SDK
```

Telegram uses the same `ChatService` path as web chat rather than duplicating Pi-session logic. Telegram-linked sessions are tracked with channel metadata; session names are not the source of truth for Telegram routing.

### Sessions

Harbor sessions are stored in SQLite. Each Harbor session maps to a Pi session ID and has its own transcript.

### Packages

Package operations call Pi CLI commands using `PI_CODING_AGENT_DIR=/config/pi-agent`, then reset active SDK sessions so new resources load on next chat.

### Terminal

Web terminals use `@xterm/xterm` in the browser and `node-pty` on the server. Terminal state is in-memory and does not survive server restarts. The shell runs as `agent` and starts in `/workspace`.

### Future non-web channels

Additional messaging channels should call `ChatService.sendChatMessage(...)` rather than duplicating chat or Pi SDK session logic.
