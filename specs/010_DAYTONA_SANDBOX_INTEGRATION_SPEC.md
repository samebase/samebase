# 010 Daytona Sandbox Integration Spec

## Summary

This spec captures the current Daytona sandbox MVP (runtime bootstrap + terminal
embed) and outlines the next step: moving from runtime bootstrap to prebuilds
for faster startup. The short-term goal is to prove that the sandbox has the
repo and can run `pnpm` commands. The medium-term goal is Daytona prebuilds
(preferred over GitHub Actions builds for speed).

## Goals

- Create a Daytona sandbox per vault (currently `main` branch only).
- Ensure the sandbox contains the full repo source and can run `pnpm` commands.
- Provide an in-app terminal (iframe) with fallback to open in a new tab.
- Allow sandbox removal (without deleting snapshots).
- Cache base setup via Daytona snapshots to reduce startup time.
- Document the path to Daytona prebuilds.

## Non-Goals

- Arbitrary command execution exposed to general users (MVP is single-user
  testing only).
- Fully automated multi-branch preview sandboxes (future work).
- Dockerfile-based builds from repo source within Convex (requires build
  infrastructure).

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
- Runtime clone + install is the minimal viable path to verify sandbox
  usefulness.

## Snapshot Strategy (Now)

Snapshots are used to avoid repeating base OS/Node setup. The system:

- Infers a **base snapshot** name from the base image: `noter-<sanitized-image>`
  (example:
  `noter-mcr.microsoft.com-devcontainers-javascript-node-24-bookworm`).
- Creates that base snapshot once (if missing) and reuses it for sandbox
  creation.

**Prebuild snapshot (manual for now):**

- Snapshot name is **automatically inferred** per vault + branch:
  `noter-prebuild-<owner>-<repo>-<branch>` (sanitized).
- If the prebuild snapshot exists, sandbox creation **uses it** and **skips
  bootstrap** for fast startup.
- If it does **not** exist, sandbox creation falls back to the base snapshot and
  runs bootstrap.
- UI exposes a **Build prebuild** button that:
  - Clones the repo for the selected branch.
  - Builds a snapshot that includes repo + dependencies.
  - Replaces any existing prebuild snapshot with the same name.
- UI also exposes **Check prebuild** to fetch snapshot state (`PENDING`,
  `BUILDING`, `ACTIVE`, `ERROR`).
- Prebuild build logs stream into Convex logs (`daytona:prebuild:log`), not the
  Noter UI.

**Limitations:**

- Prebuilds are currently manual and branch-scoped (auto-update per commit is
  future work).

## Terminal UX

- **Open Terminal** uses a signed preview URL (port `22222`) and renders in an
  iframe.
- **Open in tab** is always available as fallback.
- **Refresh link** generates a new signed URL if the iframe expires.
- If Daytona blocks embedding (CSP/X-Frame-Options), tab fallback is required.
- Terminal shells auto-`cd` to `/home/daytona/workspace/<repo>` on open.

## Sandbox Removal

- **Remove sandbox** deletes the sandbox via Daytona SDK.
- Vault metadata is cleared.
- Snapshots are **not** deleted.

## Current Environment Variables

Required:

- `DAYTONA_API_URL`
- `DAYTONA_API_KEY` (or `DAYTONA_API_TOKEN`)

Optional:

- `DAYTONA_BASE_IMAGE` (optional fallback image when no deps image is available)

Optional (private registry automation):

- `DAYTONA_REGISTRY_URL` (example: `ghcr.io`)
- `DAYTONA_REGISTRY_USERNAME`
- `DAYTONA_REGISTRY_PASSWORD` (PAT with `read:packages` + `repo` for private
  GHCR)
- `DAYTONA_REGISTRY_PROJECT` (optional)
- `DAYTONA_REGISTRY_NAME` (optional, defaults to `ghcr`)
- `DAYTONA_REGISTRY_SET_DEFAULT` (optional, `true|false`)
- `DAYTONA_REPO_REFRESH_MODE` (optional: `smart` default, `always`, `never`)

No other Daytona env vars are used. Base image is fixed in code to
`mcr.microsoft.com/devcontainers/javascript-node:24-bookworm` unless
`DAYTONA_BASE_IMAGE` is set.

## Future: Daytona Prebuilds

**Why prebuilds?**

- Faster startup than runtime bootstrap.
- Deterministic base with pre-installed dependencies.

**Preferred approach:** Daytona prebuilds over GitHub Actions, assuming
Daytona’s prebuild is faster and tightly integrated.

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
   - This repo includes `Dockerfile.daytona-deps` +
     `.github/workflows/daytona-deps-image.yml` to build a deps image when
     `pnpm-lock.yaml` changes; current runtime derives the matching image name
     directly from repo identity plus the deps hash.

## Registry Automation (Implemented)

To support **private** registry images (GHCR, ECR, GCR, etc.), Noter can add a
Daytona registry entry automatically using the Daytona API. This keeps prebuilds
working without manual dashboard setup.

**Flow:**

1. On prebuild start, call `ensureDaytonaRegistry`.
2. `ensureDaytonaRegistry` lists existing registries and matches by URL (and
   project if provided).
3. If not found, create registry with credentials from env vars.
4. Optionally set as default.

**Notes:**

- Registry auth is separate from GitHub repo auth. The existing GitHub token is
  only used for git clone.
- For GHCR private images, a PAT with `read:packages` (+ `repo` if private repo)
  is required.

**Constraint:** Convex cannot build images from repo source directly, so
prebuilds must be executed outside Convex.

## Open Questions

- Daytona prebuild API/workflow details (project config, triggers, cache
  invalidation).
- Best place to store prebuild metadata (vault vs separate table).
- Whether to persist pnpm store using a Daytona volume mount.
- Whether to switch to per-branch sandboxes once prebuilds are available.

## Security Note (Important)

The runtime bootstrap currently clones via a URL containing a GitHub token. This
token appears in the process list inside the sandbox (visible via `ps aux`),
which is a security risk. For safety, do not embed access tokens in clone URLs.
Use a safer mechanism such as:

- `git -c http.extraHeader="AUTHORIZATION: basic …" clone https://github.com/owner/repo.git`
  with a short-lived header value, or
- a temporary credentials helper/file removed immediately after clone.

Any future bootstrap must avoid leaking tokens in process args, logs, or error
output.

## Next Steps

1. Confirm Daytona prebuild workflow and APIs.
2. Decide between Daytona-native prebuilds vs GitHub Actions builds.
3. Implement prebuild integration and swap sandbox creation to use prebuilt
   images.
4. Optional: Add a “Warm Prebuild” / “Build Snapshot” UI button.
