# Persistence Guide

Harbor separates the reproducible container image from personal persistent state.

## Persistent paths

Docker Compose mounts these volumes by default:

- `/workspace` — projects and working files.
- `/config` — Harbor database, Pi auth/session state, package config, env files, and app config.
- `/home/agent` — shell home for the `agent` user: dotfiles, shell history, CLI auth, `~/.config`, `~/.cache`, etc.

## Custom tools

Harbor prepends these persistent tool paths to `PATH`:

```text
/config/bin
/config/tools/npm/bin
/config/tools/pnpm
/config/tools/cargo/bin
/config/tools/go/bin
/home/agent/.local/bin
/app/node_modules/.bin
```

Terminal sessions also set common tool-install environment variables so default user-level installs land in mounted volumes:

```text
NPM_CONFIG_PREFIX=/config/tools/npm
PNPM_HOME=/config/tools/pnpm
CARGO_HOME=/config/tools/cargo
GOPATH=/config/tools/go
```

Use `/config/bin` for persistent custom scripts or standalone binaries:

```bash
mkdir -p /config/bin
curl -L https://example.com/tool -o /config/bin/tool
chmod +x /config/bin/tool
```

Use normal user-level installers when possible:

```bash
npm install -g typescript
pnpm add -g some-cli
cargo install ripgrep
python3 -m pip install --user some-cli
```

Those install locations are in `/config` or `/home/agent`, so they survive Harbor image rebuilds and source updates.

## What does not persist

Changes to the container filesystem outside mounted volumes do not survive rebuilds/recreates. For example:

```bash
sudo apt-get install gh
sudo npm install -g some-cli
```

inside a running container is temporary because those commands write to the image filesystem. Prefer non-`sudo` user-level installs, `/config/bin`, or Harbor bundles. To make apt packages permanent, add them to the Dockerfile or create a derived image.

## GitHub CLI example

`gh auth login` stores auth under `/home/agent`, so auth persists once `gh` is available. But the `gh` binary itself only persists if it lives in a mounted path or is installed in the Dockerfile.

Recommended options:

1. Add common tools to the Dockerfile. Harbor already includes common tools such as `gh`, `rg`, `fd`, `vim`, `tmux`, `rsync`, and `tree`.
2. Place standalone binaries in `/config/bin`.
3. Keep CLI auth/config in `/home/agent`.

## Backups and restore

Back up all three volumes for a full Harbor backup:

- `/workspace`
- `/config`
- `/home/agent`

See `VPS_TAILSCALE.md` for example backup and restore commands using Docker volumes.
