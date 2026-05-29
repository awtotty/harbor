FROM node:24-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends sudo git gh ca-certificates sqlite3 curl jq python3 make g++ ripgrep fd-find less vim-tiny nano unzip zip rsync procps htop dnsutils iputils-ping netcat-openbsd tree tmux \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
  && ln -sf /usr/bin/vi /usr/local/bin/vim \
  && mkdir -p /workspace /config \
  && useradd -m -s /bin/bash -G sudo agent \
  && echo 'agent ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/harbor-agent \
  && chmod 0440 /etc/sudoers.d/harbor-agent \
  && chown -R agent:agent /workspace /config /home/agent

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build \
  && printf '#!/bin/sh\nexec node /app/node_modules/@earendil-works/pi-coding-agent/dist/cli.js "$@"\n' > /usr/local/bin/pi \
  && chmod +x /usr/local/bin/pi \
  && chown -R agent:agent /app

ENV PATH="/config/bin:/home/agent/.local/bin:/app/node_modules/.bin:${PATH}" \
    HARBOR_PORT=8080 \
    HARBOR_CONFIG_DIR=/config \
    HARBOR_WORKSPACE_DIR=/workspace \
    HARBOR_TERMINAL_USER=agent \
    PI_CODING_AGENT_DIR=/config/pi-agent \
    PI_CODING_AGENT_SESSION_DIR=/config/sessions

EXPOSE 8080
CMD mkdir -p /config/bin /home/agent/.local/bin && printf 'export PATH="/config/bin:/config/tools/npm/bin:/home/agent/.local/bin:/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\n' > /etc/profile.d/harbor-path.sh && printf '#!/bin/sh\nexec node /app/node_modules/@earendil-works/pi-coding-agent/dist/cli.js "$@"\n' > /usr/local/bin/pi && chmod +x /usr/local/bin/pi /etc/profile.d/harbor-path.sh && chown -R agent:agent /workspace /config /home/agent && exec sudo -H -E -u agent HOME=/home/agent node dist/server/index.js
