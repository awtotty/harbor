# Harbor Architecture

Harbor is a Dockerized Pi cloud-agent appliance. The container starts SSH as root, then runs the Harbor Node/Pi SDK process as the `agent` user.

## Persistent volumes

- `/workspace` — user projects and working files.
- `/config` — persistent Harbor and Pi state.

## Core flows

### Web chat

`Web Chat -> /api/chat -> ChatService -> MessageRouter -> PiSessionRegistry -> Pi SDK`

`ChatService` persists normalized transcript messages to `/config/harbor.db`.

### Sessions

Harbor sessions are stored in SQLite. Each Harbor session maps to a Pi session ID and has its own transcript.

### Packages

Package operations call Pi CLI commands using `PI_CODING_AGENT_DIR=/config/pi-agent`, then reset active SDK sessions so new resources load on next chat.

### Terminal

Web terminals use `@xterm/xterm` in the browser and `node-pty` on the server. Terminal state is in-memory and does not survive server restarts.

### Future channels

Signal/SMS/etc. should call `ChatService.sendChatMessage(...)` rather than duplicating `/api/chat` logic.
