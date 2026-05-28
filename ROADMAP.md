# Harbor Roadmap

Harbor is an open-source, self-hostable cloud agent appliance built around Pi. The goal is to give individuals and teams a personal AI computer they control: reachable from the web, Signal, and SSH, with an optional hosted version for convenience and managed compute.

## Phase 1: Personal Deploy

Get Harbor working for a single power user.

- Docker Compose setup
- Pi installed and runnable inside the container
- Persistent workspace and config volumes
- SSH access into the container
- Lightweight web UI with authentication
- Environment/secrets configuration page
- Browser chat with the Pi agent
- Basic logs and system status

Success means: one person can deploy Harbor on a VPS or home server and use it as their own cloud agent.

## Phase 2: Signal MVP

Make Signal a first-class channel for interacting with the agent remotely.

- Signal integration via a channel adapter
- Allowlisted Signal senders
- Route incoming Signal messages to a Pi session
- Send agent responses back over Signal
- Maintain conversation/session state
- Add confirmation flow for risky actions
- Show Signal status/configuration in the web UI

Success means: the user can reliably message their Harbor agent from Signal and have it perform useful work.

## Phase 3: Teammate-Ready Self-Host

Turn the personal setup into something teammates can deploy and trust.

- Clear setup documentation
- Setup wizard or guided first-run flow
- Safer permission defaults
- Better logging and diagnostics
- Backup/export support
- Extension bundle management
- Workspace/file inspection
- Update process

Success means: technical teammates can self-host Harbor without hand-holding and use it for real work.

## Phase 4: Hosted Utility Version

Offer Harbor as a managed service while preserving the open-source self-hosted core.

- Managed hosted instances
- Persistent storage and backups
- Remote access without manual server setup
- Managed Signal/SMS relay options
- Hosted model routing
- Usage dashboard
- Utility-style metered billing
- Data export and migration path back to self-hosting

Success means: users can either self-host Harbor for free or pay for managed convenience, uptime, and compute.
