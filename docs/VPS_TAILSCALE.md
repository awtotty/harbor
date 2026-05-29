# VPS / Home Server + Tailscale Deployment

This guide deploys Harbor as an always-on personal agent appliance on any host with Docker, reachable privately over Tailscale. Linux is the simplest target, but the host can also be macOS or Windows if Docker Desktop is installed.

Good host options include:

- A VPS from Hetzner, DigitalOcean, Vultr, Linode/Akamai, OVH, Netcup, etc.
- A home server, old desktop, mini PC, or NAS.

Tailscale is the private network layer; it is not the host. The host runs Docker and Harbor. Tailscale lets your devices reach Harbor without exposing the web UI to the public internet.

Most commands below assume Ubuntu/Debian. On macOS or Windows, install Docker Desktop and Tailscale using their native installers, then run the Harbor `docker compose` commands from a terminal.

## 1. Choose a host

Recommended starting point:

- Ubuntu 24.04 LTS or Debian 12 for easiest setup, or another OS with Docker support
- 2 vCPU / 4 GB RAM or larger
- 50 GB disk or larger if you keep repositories/files in Harbor
- SSH key authentication if using a VPS

For a home machine, Ubuntu Server or Debian is simplest, but any always-on machine with Docker is acceptable.

## 2. Install Docker and Git

SSH into the host:

```bash
ssh YOUR_USER@YOUR_HOST
```

Install dependencies on Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git curl
sudo systemctl enable --now docker
```

If your user is not in the `docker` group, either use `sudo docker ...` or add your user:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
```

## 3. Install and join Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Open the printed auth URL and approve the host in your Tailscale account.

Get the host's Tailscale IP:

```bash
tailscale ip -4
```

If MagicDNS is enabled in Tailscale, you can also use the machine name, e.g.:

```text
http://harbor-host:8080
```

## 4. Clone Harbor

```bash
git clone YOUR_HARBOR_REPO_URL harbor
cd harbor
cp .env.example .env
```

Edit `.env`:

```bash
vim .env
```

Recommended always-on settings:

```env
HARBOR_PASSWORD=use-a-long-random-password
HARBOR_PRODUCTION=true

# Replace with the output from `tailscale ip -4`.
HARBOR_BIND_HOST=100.x.y.z
HARBOR_PORT=8080

# Optional: expose container SSH only on Tailscale too.
HARBOR_SSH_BIND_HOST=100.x.y.z
HARBOR_SSH_PORT=2222
```

Do not leave `HARBOR_PASSWORD=harbor` with `HARBOR_PRODUCTION=true`; Harbor will refuse to start.

For local-only testing on the host, keep the bind hosts as `127.0.0.1`.

## 5. Start Harbor

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f harbor
```

Open Harbor from a device on your Tailscale network:

```text
http://100.x.y.z:8080
```

or with MagicDNS:

```text
http://harbor-host:8080
```

## 6. Operations

### View logs

```bash
cd harbor
docker compose logs -f harbor
```

### Restart

```bash
docker compose restart harbor
```

### Update Harbor

```bash
cd harbor
git pull
docker compose up -d --build
```

### Shell into the container

```bash
docker compose exec harbor bash
```

### Check health

From inside the host:

```bash
curl -fsS http://localhost:8080/healthz
```

or, if bound to the Tailscale IP:

```bash
curl -fsS http://100.x.y.z:8080/healthz
```

### Inspect config and database

Open a shell in the container:

```bash
docker compose exec harbor bash
```

Useful read-only checks:

```bash
ls -la /config /workspace /home/agent
sqlite3 /config/harbor.db ".tables"
sqlite3 /config/harbor.db "select id, name, updated_at, archived_at from sessions order by updated_at desc limit 10;"
```

Do not paste secret values from `/config/harbor.env`, `/config/harbor.json`, Pi auth files, or shell history into issues or chat unless you deliberately intend to share them.

## 7. Backups and restore

Harbor stores persistent state in Docker volumes:

- `harbor_harbor-config` -> `/config`
- `harbor_harbor-workspace` -> `/workspace`
- `harbor_harbor-home` -> `/home/agent`

Back up all three for a full restore.

Example volume backup:

```bash
mkdir -p ~/harbor-backups
for volume in harbor_harbor-config harbor_harbor-workspace harbor_harbor-home; do
  docker run --rm -v "$volume:/data:ro" -v "$HOME/harbor-backups:/backup" alpine \
    tar czf "/backup/$volume-$(date +%Y%m%d-%H%M%S).tgz" -C /data .
done
```

### Restore onto a fresh host

1. Install Docker, Git, and Tailscale on the new host.
2. Clone Harbor and create `.env` with the desired bind host/password.
3. Create empty volumes by starting and stopping Harbor once:

```bash
docker compose up -d --build
docker compose down
```

4. Copy the backup archives into `~/harbor-backups` on the new host.
5. Restore each archive into its matching Docker volume:

```bash
for volume in harbor_harbor-config harbor_harbor-workspace harbor_harbor-home; do
  archive=$(ls -t "$HOME/harbor-backups/$volume"-*.tgz | head -1)
  docker run --rm -v "$volume:/data" -v "$HOME/harbor-backups:/backup:ro" alpine \
    sh -c "find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf /backup/$(basename "$archive") -C /data"
done
```

6. Start Harbor again:

```bash
docker compose up -d
```

7. Check logs and health before using the restored instance:

```bash
docker compose logs -f harbor
curl -fsS http://localhost:8080/healthz
```

## 8. Firewall notes

Do not expose Harbor's web port to the public internet unless you have put it behind a trusted access layer.

Recommended public inbound on a VPS:

- SSH to the host on port 22 from your IP, or use Tailscale SSH.

Recommended private inbound over Tailscale:

- Harbor web: `8080`
- Harbor container SSH: `2222` if you use it

If you bind Harbor to the Tailscale IP as shown above, the web UI is not listening on the public interface.

On a home server, router port forwarding is not required when using Tailscale.
