# Harbor Security Notes

Harbor is intentionally a high-access personal cloud agent appliance. Treat the web UI and Telegram bot as equivalent to shell access on the container.

Before exposing Harbor beyond localhost:

- Set a strong `HARBOR_PASSWORD`.
- Put Harbor behind TLS, Tailscale, Cloudflare Access, or another trusted access layer.
- Use the web terminal for shell access inside Harbor, and use host/infrastructure access for out-of-band administration.
- Harbor's Node/Pi SDK process and web terminals run as `agent` by default, and `agent` has passwordless sudo inside the container.
- Remember that Pi packages and capability bundles are executable code and package install is an admin-level action.
- Do not mount `/var/run/docker.sock` into the main Harbor container. Web/chat-triggered updates should go through a separate external updater service or sidecar.
- `/config` contains secrets, OAuth credentials, transcripts, app state, Telegram bot tokens, and custom binaries in `/config/bin`. Back it up carefully and do not publish it.
- `/home/agent` persists CLI auth/config and shell history. Treat it as sensitive too.
- Backups contain secrets and transcripts. Store them privately, and encrypt them before moving them off-host.

Persistent sensitive paths:

- `/config/harbor.env`
- `/config/harbor.db`
- `/config/pi-agent/auth.json`
- `/config/sessions`
- `/config/harbor.json`
- `/config/bin`
- `/home/agent`
