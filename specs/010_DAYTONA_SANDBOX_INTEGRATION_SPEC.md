# 010 Daytona Sandbox Integration Spec

## Summary

This spec captures the current Daytona sandbox MVP (runtime bootstrap + terminal embed) and outlines the next step: moving from runtime bootstrap to prebuilds for faster startup. The short-term goal is to prove that the sandbox has the repo and can run `pnpm` commands. The medium-term goal is Daytona prebuilds (preferred over GitHub Actions builds for speed).

## Goals

- Create a Daytona sandbox per vault (currently `main` branch only).
- Ensure the sandbox contains the full repo source and can run `pnpm` commands.
- Provide an in-app terminal (iframe) with fallback to open in a new tab.
- Allow sandbox removal (without deleting snapshots).
- Cache base setup via Daytona snapshots to reduce startup time.
- Document the path to Daytona prebuilds.

## Non-Goals

- Arbitrary command execution exposed to general users (MVP is single-user testing only).
- Fully automated multi-branch preview sandboxes (future work).
- Dockerfile-based builds from repo source within Convex (requires build infrastructure).

## Current MVP (Runtime Bootstrap)

**Flow:**
1. User clicks **Start Daytona** in the Vault dashboard.
2. Convex action creates a Daytona sandbox via SDK.
3. Sandbox bootstraps repo and runs `pnpm install` in background.
4. Terminal iframe auto-opens; user can execute commands.
5. **Remove sandbox** button deletes only the sandbox (snapshots remain).

**Bootstrap actions (inside sandbox):**
- Clone GitHub repo into `/home/daytona/workspace/<repo>`.
- Checkout target branch.
- Install `pnpm` if missing.
- `pnpm install` runs in background (logs at `/tmp/noter-pnpm-install.log`).

**Why runtime bootstrap?**
- Convex cannot access repo contents to build Docker images.
- Runtime clone + install is the minimal viable path to verify sandbox usefulness.

## Snapshot Strategy (Now)

Snapshots are used to avoid repeating base OS/Node setup. The system:
- Defaults snapshot creation to **true** if not explicitly disabled.
- Infers snapshot name from base image: `noter-<sanitized-image>`, e.g. `noter-mcr.microsoft.com-devcontainers-typescript-node-1-bookworm`.
- Uses snapshot on sandbox creation if it exists.
- If missing, creates it once using the base image.

**Per-vault snapshot preference:**
- Each vault can store an explicit snapshot name (intended for Daytona prebuilds).
- If a vault snapshot name is set, the system **does not auto-create** snapshots.
- If the named snapshot is missing, sandbox creation fails with a clear error so the user can fix the prebuild or clear the preference.
- When a snapshot preference is set, bootstrap is **skipped** for fast startup (assumes prebuild has repo + deps).
- UI exposes:
  - Snapshot name input + save.
  - Snapshot list fetch (Daytona API) with one-click selection.

**Limitations:**
- Snapshot is built from the base image only, not from a running sandbox’s filesystem.
- Repo dependencies still need to be installed unless a future prebuild step includes repo context or cache volumes.

## Terminal UX

- **Open Terminal** uses a signed preview URL (port `22222`) and renders in an iframe.
- **Open in tab** is always available as fallback.
- **Refresh link** generates a new signed URL if the iframe expires.
- If Daytona blocks embedding (CSP/X-Frame-Options), tab fallback is required.

## Sandbox Removal

- **Remove sandbox** deletes the sandbox via Daytona SDK.
- Vault metadata is cleared.
- Snapshots are **not** deleted.

## Current Environment Variables

Required:
- `DAYTONA_API_URL`
- `DAYTONA_API_KEY` (or `DAYTONA_API_TOKEN`)

No other Daytona env vars are used. Base image is fixed in code to
`mcr.microsoft.com/devcontainers/javascript-node:24-bookworm`.

## Future: Daytona Prebuilds

**Why prebuilds?**
- Faster startup than runtime bootstrap.
- Deterministic base with pre-installed dependencies.

**Preferred approach:** Daytona prebuilds over GitHub Actions, assuming Daytona’s prebuild is faster and tightly integrated.

**Two viable paths:**
1. **Daytona Project Config + Prebuilds**
   - Store project config and Dockerfile/devcontainer in the repo.
   - Daytona builds & caches per-branch images.
   - Sandbox creation uses prebuilt image.
   - CLI flow (high level):
     - `daytona project-config add`
     - `daytona prebuilds add <project-config> <time-window>`
     - `daytona prebuilds logs <prebuild-id>`
     - `daytona create <project-config>`

2. **GitHub Actions → Registry**
   - Build Docker image in CI.
   - Push to GHCR.
   - Sandbox uses prebuilt image from registry.

**Constraint:** Convex cannot build images from repo source directly, so prebuilds must be executed outside Convex.

## Open Questions

- Daytona prebuild API/workflow details (project config, triggers, cache invalidation).
- Best place to store prebuild metadata (vault vs separate table).
- Whether to persist pnpm store using a Daytona volume mount.
- Whether to switch to per-branch sandboxes once prebuilds are available.

## Security Note (Important)

The runtime bootstrap currently clones via a URL containing a GitHub token. This token appears in the process list
inside the sandbox (visible via `ps aux`), which is a security risk. For safety, do not embed access tokens in
clone URLs. Use a safer mechanism such as:

- `git -c http.extraHeader="AUTHORIZATION: basic …" clone https://github.com/owner/repo.git` with a short-lived
  header value, or
- a temporary credentials helper/file removed immediately after clone.

Any future bootstrap must avoid leaking tokens in process args, logs, or error output.

## Next Steps

1. Confirm Daytona prebuild workflow and APIs.
2. Decide between Daytona-native prebuilds vs GitHub Actions builds.
3. Implement prebuild integration and swap sandbox creation to use prebuilt images.
4. Optional: Add a “Warm Prebuild” / “Build Snapshot” UI button.
