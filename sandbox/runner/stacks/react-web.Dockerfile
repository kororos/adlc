# React web stack layer: system libraries for Playwright's chromium (browsers are downloaded per
# project by `playwright install chromium`, matching the project's Playwright version).
ARG BASE=adlc/runner-base:local
FROM ${BASE}

ARG PLAYWRIGHT_VERSION=1.64.1

USER root
RUN npx -y "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
USER adlc
