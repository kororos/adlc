# ADLC egress proxy (Squid). Modes from the project's adlc.yaml (network.mode):
#   open / audit → allow everything (audit logs every request)
#   allowlist    → only core + stack-pack + project extra domains
FROM debian:bookworm-slim

ARG YQ_VERSION=v4.44.3
ARG TARGETARCH

RUN apt-get update \
 && apt-get install -y --no-install-recommends squid ca-certificates curl \
 && curl -fsSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${TARGETARCH:-amd64}" -o /usr/local/bin/yq \
 && chmod +x /usr/local/bin/yq \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY domains/ /etc/adlc/domains/
COPY entrypoint.sh /usr/local/bin/adlc-egress
RUN chmod 0755 /usr/local/bin/adlc-egress

EXPOSE 3128
ENTRYPOINT ["adlc-egress"]
