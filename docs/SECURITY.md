# Harbor Security Notes

Harbor is intentionally a high-access personal cloud agent appliance. Treat the web UI as equivalent to shell access on the container.

Before exposing Harbor beyond localhost:

- Set a strong `HARBOR_PASSWORD`.
- Put Harbor behind TLS, Tailscale, Cloudflare Access, or another trusted access layer.
- Prefer SSH public keys over password SSH.
- Harbor's Node/Pi SDK process and web terminals run as `agent` by default, and `agent` has passwordless sudo inside the container.
- Remember that Pi packages are executable code and package install is an admin-level action.
- `/config` contains secrets, OAuth credentials, transcripts, app state, Telegram bot tokens, and custom binaries in `/config/bin`. Back it up carefully and do not publish it.
- `/home/agent` persists CLI auth/config and shell history. Treat it as sensitive too.

Persistent sensitive paths:

- `/config/harbor.env`
- `/config/harbor.db`
- `/config/pi-agent/auth.json`
- `/config/sessions`
- `/config/harbor.json`
- `/config/bin`
- `/home/agent`
