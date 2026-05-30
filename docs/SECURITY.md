# Harbor Security Notes

Harbor is intentionally a high-access personal cloud agent appliance. Treat the web UI and Telegram bot as equivalent to shell access on the container.

Before exposing Harbor beyond localhost:

- Set a strong `HARBOR_PASSWORD`.
- Put Harbor behind TLS, Tailscale, Cloudflare Access, or another trusted access layer.
- Use the web terminal for shell access inside Harbor, and use host/infrastructure access for out-of-band administration.
- Harbor is split into a web/API control container and a runtime container. The Pi SDK process, terminals, bundles, and workspace tools run in the runtime container as `agent` by default, and `agent` has passwordless sudo inside that container.
- Remember that Pi packages and capability bundles are executable code and package install is an admin-level action.
- Do not mount `/var/run/docker.sock` into the main Harbor container. Web/chat-triggered updates should go through a separate external updater service or sidecar.
- The dev-server proxy at `/proxy/<port>/` is same-origin trusted preview mode for private dev servers only. It requires Harbor auth, rejects obvious cross-site browser requests, strips Harbor credentials before forwarding, and only targets runtime-local ports, but frontend JavaScript served through `/proxy/<port>/` is not browser-isolated from the Harbor UI/API. Treat proxied dev apps as trusted Harbor workspace code; public or untrusted app hosting is out of scope.
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
