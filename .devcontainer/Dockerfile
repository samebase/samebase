FROM mcr.microsoft.com/devcontainers/typescript-node:1-bookworm

# System deps for native builds and repo tooling.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        git \
    && rm -rf /var/lib/apt/lists/*

# Tooling used in this monorepo.
RUN npm install -g pnpm@9.15.0 turbo@2.5.5

USER node
