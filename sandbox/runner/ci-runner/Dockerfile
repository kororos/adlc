# ADLC CI runner image: the official GitHub Actions runner plus what ADLC jobs need behind the
# egress proxy. Built by the CI registrar (adlc-ci) inside the CI Docker engine from BASE.
ARG BASE=ghcr.io/actions/actions-runner:latest
FROM ${BASE}
LABEL org.adlc.managed="true"
USER root

# docker compose (test environments) and yq (adlc.build.yaml), pinned and checksum-verified.
ARG COMPOSE_VERSION=v5.6.0
ARG COMPOSE_SHA256_AMD64=40343e21ca777173e69cff5dbafeb37c6f81f3b0d57d9e597f036e95eb63e76a
ARG COMPOSE_SHA256_ARM64=733ec76717ceb59052a9609b9dadfb523b2df8eab57a54212872d10a58078ea2
ARG YQ_VERSION=v4.44.3
ARG YQ_SHA256_AMD64=a2c097180dd884a8d50c956ee16a9cec070f30a7947cf4ebf87d5f36213e9ed7
ARG YQ_SHA256_ARM64=0e7e1524f68d91b3ff9b089872d185940ab0fa020a5a9052046ef10547023156
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) c=x86_64 cs=$COMPOSE_SHA256_AMD64 y=amd64 ys=$YQ_SHA256_AMD64 ;; \
      arm64) c=aarch64 cs=$COMPOSE_SHA256_ARM64 y=arm64 ys=$YQ_SHA256_ARM64 ;; \
      *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL --retry 3 "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$c" -o /usr/local/lib/docker/cli-plugins/docker-compose; \
    echo "$cs  /usr/local/lib/docker/cli-plugins/docker-compose" | sha256sum -c -; \
    chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose; \
    curl -fsSL --retry 3 "https://github.com/mikefarah/yq/releases/download/$YQ_VERSION/yq_linux_$y" -o /usr/local/bin/yq; \
    echo "$ys  /usr/local/bin/yq" | sha256sum -c -; \
    chmod 0755 /usr/local/bin/yq; \
    docker compose version; yq --version

# Jobs have no direct internet: everything goes through the egress proxy, whose address Docker
# passes in as HTTP(S)_PROXY. Keep it across sudo (apt, `playwright install --with-deps`), and let
# Node's fetch and corepack use it.
# (The base image's /etc/sudoers doesn't include /etc/sudoers.d, so add the line there.)
RUN printf 'Defaults env_keep += "HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy NODE_USE_ENV_PROXY"\n' >>/etc/sudoers \
 && visudo -c
ENV NODE_USE_ENV_PROXY=1

# Entry point: gives the job's Docker client the proxy, then runs the runner.
COPY adlc-runner-start /usr/local/bin/adlc-runner-start

USER runner
