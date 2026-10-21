FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

# System deps for native builds and repo tooling.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        fish \
        git \
    && rm -rf /var/lib/apt/lists/*

# Tooling used in this monorepo.
RUN npm install -g pnpm@12.14.0

USER node
