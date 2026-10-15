# ADLC runner base image: Claude Code CLI, gh, git, Docker CLI (talks to the project's DinD sidecar),
# Node 22 + corepack (pnpm), yq, jq, tmux. Stack layers (sandbox/runner/stacks/*.Dockerfile) build on it.
FROM node:22-bookworm-slim

ARG ADLC_UID=1000
ARG ADLC_GID=1000
ARG CLAUDE_CODE_VERSION=2.1.300
ARG YQ_VERSION=v4.44.3
ARG GH_MIN_VERSION=2.94.0
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git gnupg jq tmux less procps openssh-client unzip xz-utils python3 make g++ \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh docker-ce-cli docker-compose-plugin docker-buildx-plugin \
 && rm -rf /var/lib/apt/lists/*

# gh >= 2.94 is required for sub-issue and dependency flags.
RUN v=$(gh --version | head -1 | awk '{print $3}') \
 && [ "$(printf '%s\n%s\n' "$GH_MIN_VERSION" "$v" | sort -V | head -1)" = "$GH_MIN_VERSION" ] \
 || { echo "gh $v is older than $GH_MIN_VERSION" >&2; exit 1; }

RUN curl -fsSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${TARGETARCH:-amd64}" -o /usr/local/bin/yq \
 && chmod +x /usr/local/bin/yq

RUN corepack enable \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force

# Non-root user whose uid/gid match the owner of /srv/adlc on the host (bind mounts, secrets).
# The gid may already exist in the image (e.g. 20 on macOS hosts): reuse it.
RUN (userdel -r node 2>/dev/null || true) && (groupdel node 2>/dev/null || true) \
 && (getent group "${ADLC_GID}" >/dev/null || groupadd -g "${ADLC_GID}" adlc) \
 && useradd -m -o -u "${ADLC_UID}" -g "${ADLC_GID}" -s /bin/bash adlc

COPY bin/ /usr/local/bin/
RUN chmod 0755 /usr/local/bin/adlc-*

# Login shells (bash -l, tmux shells, agents' shells) reset PATH from /etc/profile;
# re-add what the image puts on PATH via ENV.
RUN printf '%s\n' 'export PNPM_HOME=/home/adlc/.local/share/pnpm' \
      'case ":$PATH:" in *":$PNPM_HOME:"*) ;; *) export PATH="$PNPM_HOME:$PATH" ;; esac' \
      > /etc/profile.d/adlc.sh

USER adlc
WORKDIR /home/adlc
ENV DISABLE_AUTOUPDATER=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/home/adlc/.local/share/pnpm \
    PATH=/home/adlc/.local/share/pnpm:$PATH

ENTRYPOINT ["adlc-entrypoint"]
