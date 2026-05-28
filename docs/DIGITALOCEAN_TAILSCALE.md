# DigitalOcean + Tailscale Deployment

This guide deploys Harbor as an always-on personal agent appliance on a DigitalOcean Droplet, reachable privately over Tailscale.

## 1. Create a Droplet

Recommended starting point:

- Ubuntu 24.04 LTS
- 2 vCPU / 4 GB RAM or larger
- 50 GB disk or larger if you keep repositories/files in Harbor
- SSH key authentication

## 2. Install Docker and Git

SSH into the Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Install dependencies:

```bash
apt update
apt install -y docker.io docker-compose-plugin git curl
systemctl enable --now docker
```

## 3. Install and join Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Open the printed auth URL and approve the server in your Tailscale account.

Get the server's Tailscale IP:

```bash
tailscale ip -4
```

If MagicDNS is enabled in Tailscale, you can also use the machine name, e.g.:

```text
http://harbor-droplet:8080
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

Recommended VPS settings:

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
http://harbor-droplet:8080
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

From inside the Droplet:

```bash
curl -fsS http://localhost:8080/healthz
```

## 7. Backups

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

## 8. Firewall notes

DigitalOcean Cloud Firewall and `ufw` should not expose Harbor's web port to the public internet.

Recommended public inbound:

- SSH to the Droplet on port 22 from your IP, or use Tailscale SSH.

Recommended private inbound over Tailscale:

- Harbor web: `8080`
- Harbor container SSH: `2222` if you use it

If you bind Harbor to the Tailscale IP as shown above, the web UI is not listening on the public Droplet interface.
