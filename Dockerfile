FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server sudo git gh ca-certificates sqlite3 curl jq python3 make g++ ripgrep fd-find less vim-tiny unzip zip rsync procps htop dnsutils iputils-ping netcat-openbsd tree tmux \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
  && mkdir -p /var/run/sshd /workspace /config \
  && useradd -m -s /bin/bash -G sudo agent \
  && echo 'agent:harbor' | chpasswd \
  && echo 'agent ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/harbor-agent \
  && chmod 0440 /etc/sudoers.d/harbor-agent \
  && chown -R agent:agent /workspace /config /home/agent

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build \
  && chown -R agent:agent /app

ENV PATH="/config/bin:/home/agent/.local/bin:/app/node_modules/.bin:${PATH}" \
    HARBOR_PORT=8080 \
    HARBOR_CONFIG_DIR=/config \
    HARBOR_WORKSPACE_DIR=/workspace \
    HARBOR_TERMINAL_USER=agent \
    PI_CODING_AGENT_DIR=/config/pi-agent \
    PI_CODING_AGENT_SESSION_DIR=/config/sessions

EXPOSE 8080 22
CMD service ssh start && mkdir -p /config/bin /home/agent/.local/bin && chown -R agent:agent /workspace /config /home/agent && exec sudo -H -E -u agent HOME=/home/agent node dist/server/index.js
