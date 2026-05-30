# Harbor Updates

Harbor's update path makes a self-hosted appliance easy to keep current without giving the main web app direct control over Docker or the host.

Harbor currently uses a source-checkout deployment: the host has a Git checkout of this repository, and Docker Compose builds the Harbor image from that checkout. Git tags in GitHub are the stable update targets.

## User-facing flows

Interactive setup configures update support automatically:

```bash
scripts/setup.sh
```

After setup, users can update Harbor from:

- System page → **Update**
- web chat or Telegram → `/update`, then `/update confirm`

The update creates a pre-update backup, checks out the latest tag, rebuilds Harbor with version metadata, restarts the Harbor container, and waits for `/healthz`.

## Security boundary

The main `harbor` container must not mount `/var/run/docker.sock` and must not mutate its own deployment checkout. Docker socket access would effectively grant host-root control from the web app.

Update execution belongs to the separate `harbor-updater` sidecar. The sidecar is privileged by design and has:

- Docker socket access
- the deployment checkout mounted at `/deploy`
- a shared bearer token used by Harbor

The main Harbor app receives only `HARBOR_UPDATER_URL` and `HARBOR_UPDATER_TOKEN`. It can request fixed updater operations, but it does not receive Docker access.

## Host scripts

Harbor includes host-run scripts for source-checkout deployments:

```bash
scripts/harbor-export.sh -o backups/harbor.tgz
scripts/harbor-import.sh backups/harbor.tgz --yes
scripts/harbor-update.sh --target v0.1.0
```

`harbor-update.sh`:

1. verifies the checkout is clean
2. fetches Git tags
3. chooses the requested tag, or the latest `v*` tag
4. creates a pre-update backup by default
5. checks out the target tag detached
6. rebuilds Harbor with version metadata
7. stops the old Harbor container to release published ports, including the temporary `3000-3099` dev range
8. starts the updated Harbor container
9. waits for `/healthz`

The scripts default `COMPOSE_PROJECT_NAME=harbor` so the updater sidecar uses the same Compose project name from its `/deploy` mount as the host checkout does from the `harbor` directory.

For dogfooding against `main`, you can still use the manual flow:

```bash
git pull --ff-only
docker compose --profile updater up --build -d
```

## Version metadata

The Docker image accepts build args that are exposed to the app, `/healthz`, and the System page:

```text
HARBOR_VERSION
HARBOR_COMMIT
HARBOR_BUILT_AT
```

The setup and update scripts pass those values automatically. For manual builds:

```bash
HARBOR_VERSION="$(git describe --tags --exact-match 2>/dev/null || echo dev)" \
HARBOR_COMMIT="$(git rev-parse --short HEAD)" \
HARBOR_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
docker compose --profile updater up --build -d
```

## APIs

Harbor exposes update state to the authenticated web UI:

```text
GET  /api/updates/status
POST /api/updates/request
```

The updater sidecar exposes a small private API on the Compose network:

```text
GET  /status
POST /update
```

Requests require:

```text
Authorization: Bearer $HARBOR_UPDATER_TOKEN
```

`POST /update` accepts structured input only:

```json
{
  "target": "v0.4.0",
  "backup": true
}
```

The sidecar validates targets as semver-like `v*` tags and runs `scripts/harbor-update.sh --yes --target <tag>`.

## Rollback

Rollback is currently manual:

```bash
git checkout <previous-release-tag>
docker compose --profile updater up --build -d
scripts/harbor-import.sh backups/pre-update-...tgz --yes
```

Future work can add a fixed rollback operation to the updater sidecar, using the same backup/import mechanics.
