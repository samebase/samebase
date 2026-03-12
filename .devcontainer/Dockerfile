FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

# System deps for native builds and repo tooling.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        fish \
        git \
    && rm -rf /var/lib/apt/lists/*
RUN fish_path="$(command -v fish)" && usermod -s "$fish_path" node

# Tooling used in this monorepo.
RUN npm install -g pnpm@9.15.0 turbo@2.5.5

USER node
