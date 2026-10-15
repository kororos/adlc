# React Native stack layer: JDK 17, Android SDK (adb, build tools), Maestro, Playwright browser deps.
# Android platform-tools are x86_64-only: build this layer on amd64 hosts.
ARG BASE=adlc/runner-base:local
FROM ${BASE}

ARG ANDROID_CMDLINE_TOOLS=11076708
ARG ANDROID_PLATFORM=android-35
ARG ANDROID_BUILD_TOOLS=35.0.0
ARG PLAYWRIGHT_VERSION=1.48.2

USER root
ENV ANDROID_HOME=/opt/android-sdk \
    MAESTRO_CLI_NO_ANALYTICS=1
ENV PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/opt/maestro/bin:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jdk-headless \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "$ANDROID_HOME/cmdline-tools" \
 && curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip" -o /tmp/clt.zip \
 && unzip -q /tmp/clt.zip -d "$ANDROID_HOME/cmdline-tools" \
 && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" \
 && rm /tmp/clt.zip \
 && yes | sdkmanager --licenses >/dev/null \
 && sdkmanager --install "platform-tools" "platforms;${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}" >/dev/null \
 && chown -R adlc:adlc "$ANDROID_HOME"

RUN curl -fsSL https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip -o /tmp/maestro.zip \
 && unzip -q /tmp/maestro.zip -d /opt \
 && rm /tmp/maestro.zip \
 && maestro --version >/dev/null

RUN npx -y "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm

USER adlc
