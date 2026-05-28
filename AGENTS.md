# Harbor Agent Context

You are running inside a Harbor container: a self-hosted Pi cloud agent appliance.

Important paths:

- `/workspace` — user workspace for projects and files.
- `/config` — persistent Harbor configuration volume.
- `/config/harbor.db` — SQLite database for Harbor app state and web transcript history.
- `/config/harbor.json` — Harbor app configuration, including selected model.
- `/config/harbor.env` — user-managed environment variables/secrets.
- `/config/pi-agent` — Pi auth/config directory, including OAuth credentials.
- `/config/sessions` — Pi native session files.

Useful commands:

```bash
sqlite3 /config/harbor.db ".tables"
sqlite3 /config/harbor.db "select id, name, updated_at, archived_at from sessions order by updated_at desc;"
sqlite3 /config/harbor.db "select role, kind, text, created_at from messages where session_id = 'default' order by created_at;"
```

Harbor intentionally gives the agent broad access to the workspace and persistent app state. Treat secrets and auth files carefully: read them only when explicitly needed for setup/debugging, and do not echo secret values back to the user unless they explicitly ask.
