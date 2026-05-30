# Backup and Restore

Harbor's container image is replaceable. The appliance state lives in Docker volumes mounted at:

```text
/config
/workspace
/home/agent
```

Backups contain secrets, transcripts, auth tokens, source code, shell history, and workspace data. Store them privately and encrypt them before moving them off-host.

## Export

From the Harbor checkout on the host:

```bash
scripts/harbor-export.sh -o backups/harbor-$(date -u +%Y%m%d-%H%M%S).tgz
```

By default the export script stops Harbor for SQLite consistency, creates the archive, and restarts Harbor if it was running before the export.

Use `--live` only when you accept the risk of copying SQLite files while Harbor is running:

```bash
scripts/harbor-export.sh --live -o backups/harbor-live.tgz
```

## Restore

Restore is destructive: it replaces the current contents of `/config`, `/workspace`, and `/home/agent`.

```bash
scripts/harbor-import.sh backups/harbor.tgz --yes
```

The script stops Harbor, clears the persistent volume contents, extracts the backup, repairs ownership, and starts Harbor again.

## Fresh-host restore

On the new host:

```bash
git clone https://github.com/awtotty/harbor.git
cd harbor
scripts/setup.sh
scripts/harbor-import.sh /path/to/harbor.tgz --yes
```

After restore, open Harbor at the URL configured by setup. If the host or Tailnet IP changed, rerun `scripts/setup.sh` to create a new `.env`; the restored `/config`, `/workspace`, and `/home/agent` data remains in the Docker volumes.

## Update safety

`scripts/harbor-update.sh` creates a pre-update backup by default before checking out a tag, rebuilding, and restarting Harbor. If an update fails, keep the backup path from the updater output for manual rollback.
