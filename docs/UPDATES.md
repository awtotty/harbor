# Harbor Updates

Harbor's update path should make a self-hosted appliance easy to keep current without giving the main web app direct control over Docker or the host.

For now Harbor prefers a source-checkout deployment: the host has a Git checkout of this repository, and Docker Compose builds the Harbor image from that checkout. Git tags in GitHub are the stable update targets.

## Goals

- Let the user see the current Harbor version and latest GitHub tag from the System page.
- Let the user eventually trigger an update from the web UI or a shared Harbor command such as `/update`.
- Keep Docker/Compose privileges out of the main Harbor container.
- Back up persistent state before updating.
- Make rollback understandable.

## Security boundary

The main `harbor` container must not mount `/var/run/docker.sock` and must not mutate its own deployment checkout. It is a high-access agent appliance already, but Docker socket access would effectively grant host-root control from the web app.

Update execution belongs in an external updater:

- a host-side service, or
- an optional Docker Compose sidecar/profile dedicated to updates.

That updater is privileged by design. It should expose only fixed operations like status/check/update/rollback, require a shared token, validate targets, and never accept arbitrary shell commands from Harbor.

## Current source update scripts

Harbor includes host-run scripts for source-checkout deployments:

```bash
scripts/harbor-export.sh -o backups/harbor.tgz
scripts/harbor-import.sh backups/harbor.tgz --yes
scripts/harbor-update.sh --target v0.1.0
```

`harbor-update.sh` fetches Git tags, checks out the requested release tag, rebuilds Harbor with version metadata, stops the old Harbor container to release published ports, starts the updated container, and waits for `/healthz`. By default it creates a pre-update backup first. The scripts default `COMPOSE_PROJECT_NAME=harbor` so the updater sidecar uses the same Compose project name from its `/deploy` mount as the host checkout does from the `harbor` directory.

For dogfooding against `main`, you can still use the manual flow:

```bash
git pull --ff-only
docker compose up --build -d
```

The persistent volumes survive image rebuilds:

- `/config`
- `/workspace`
- `/home/agent`

Back up those volumes before important updates.

## Version metadata

The Docker image accepts build args that are exposed to the app and `/healthz`:

```text
HARBOR_VERSION
HARBOR_COMMIT
HARBOR_BUILT_AT
```

A release build should pass values like:

```bash
docker compose build \
  --build-arg HARBOR_VERSION="$(git describe --tags --exact-match 2>/dev/null || echo dev)" \
  --build-arg HARBOR_COMMIT="$(git rev-parse --short HEAD)" \
  --build-arg HARBOR_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Harbor exposes current metadata and latest GitHub tag status through:

```text
GET /api/updates/status
```

and displays it on the System page.

## Target user flow

After the external updater exists, the intended flow is:

1. User opens System page or sends `/update`.
2. Harbor shows current version, latest tag, and whether an updater is configured.
3. User confirms an update.
4. Harbor sends a fixed update request to the external updater.
5. The updater:
   - acquires a lock
   - creates a pre-update backup
   - fetches GitHub tags/releases
   - checks out the requested release tag
   - rebuilds Harbor with Docker Compose
   - stops the old Harbor container so published ports such as the temporary `3000-3099` dev range are released
   - starts the updated Harbor container
   - waits for `/healthz`
   - records success/failure and backup path
6. The UI/chat reports that Harbor may disconnect during restart and shows the final result after reconnect.

## Updater API contract draft

The external updater should be local/private and authenticated with:

```text
Authorization: Bearer $HARBOR_UPDATER_TOKEN
```

Proposed endpoints:

```text
GET  /status
POST /check
POST /update
POST /rollback
```

`POST /update` should accept only structured input, for example:

```json
{
  "target": "v0.4.0",
  "backup": true
}
```

The updater should reject arbitrary refs by default and allow only GitHub release tags fetched from the configured Harbor repository.

## Optional updater sidecar

Harbor includes an optional `harbor-updater` Compose profile. To enable it, set a strong token in `.env`:

```bash
HARBOR_UPDATER_TOKEN=$(openssl rand -hex 32)
HARBOR_UPDATER_URL=http://harbor-updater:8787
```

Then start Harbor with the updater profile:

```bash
docker compose --profile updater up --build -d
```

The sidecar exposes:

```text
GET  /status
POST /update
```

The main Harbor service receives only `HARBOR_UPDATER_URL` and `HARBOR_UPDATER_TOKEN`. The sidecar has Docker socket access and a bind mount of the deployment checkout at `/deploy`; the main app does not.

When configured, the System page can request an update. Harbor forwards a fixed update request to the sidecar, and the sidecar runs `scripts/harbor-update.sh --yes --target <tag>`.

## Rollback story

Rollback should use the pre-update backup and previous release tag:

```bash
git checkout <previous-release-tag>
docker compose up --build -d
# restore backup if state migration or data changes need reverting
```

Once backup/import scripts exist, rollback can become a single updater operation that restores the backup and restarts Harbor.
