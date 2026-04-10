# 014 Worktree Cloud Provisioning + CLI Auth Spec

## Document Control

- Status: Proposed
- Owner: Noter dev tooling / local workflow
- Last updated: 2026-02-17
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/012_DEV_ENV_ORIGIN_SITE_URL_SYNC_SPEC.md`
  - `specs/013_WORKTREE_AUTO_PROVISIONING_SPEC.md`

## Summary

Add a local Noter CLI that uses the **existing Convex CLI login** to
authenticate and auto-provision cloud **dev (preview) deployments** for each new
worktree. The CLI runs **before** `pnpm dev` (or as part of it) and writes
worktree-specific `.env.local` values so `pnpm dev` just works with isolated
cloud dev deployments. Netlify is out of scope for MVP.

This spec only covers **local worktree dev provisioning**. For a multi-user SaaS
flow, Noter must first support provider OAuth in the web UI (Convex, GitHub, and
optionally Netlify) so infra is created in the user’s accounts.

This spec focuses on local developer tooling, not Noter backend changes.

## Goals

- Provide a CLI-authenticated path to create/reuse Convex cloud dev deployments
  per worktree.
- Automatically write per-worktree `.env.local` values (`CONVEX_DEPLOYMENT`,
  `VITE_CONVEX_URL`, etc.).
- Keep secrets out of the repo and out of `noter.md`.
- Integrate cleanly with the existing worktree identity algorithm from Spec 013.
- Align repo-level Convex configuration with `noter.md` frontmatter.
- Make `pnpm dev` fail fast with a clear message if Convex CLI login is missing.

## Non-Goals

- No changes to Noter backend provisioning flows (Convex actions remain
  unchanged).
- No Netlify or Convex production provisioning from this CLI.
- No public/consumer OAuth apps in this iteration.
- No worktree creation hooks installed automatically; use explicit CLI commands.

## Background (Current State)

- Spec 013 provides worktree auto-provisioning for **local anonymous** Convex
  deployments and per-worktree ports.
- Production infra provisioning for noter-managed vaults is done server-side
  using shared provider tokens.
- `.env.local` currently includes `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`,
  `VITE_CONVEX_SITE_URL`, `CONVEX_DEPLOY_KEY`, and `SETUP_SCRIPT_RAN`.

This spec adds a _local, per-user_ cloud provisioning path that does not rely on
shared backend tokens.

## User Journey (End-to-End)

### A. SaaS onboarding (not implemented here)

1. User signs in to Noter with GitHub.
2. User connects Convex (OAuth) and optionally Netlify (OAuth).
3. User clicks “Create project” (rename from “Create agent”).
4. Noter backend provisions repo + Convex project + optional Netlify site in the
   user’s accounts.
5. Template app is deployed automatically.

### B. Local dev with worktrees (this spec)

1. User runs `pnpm dev` in a worktree.
2. Pre-step runs `noter worktree provision`.
3. CLI checks Convex CLI login (via `npx convex login`).
4. CLI ensures a dev deployment for the worktree.
5. CLI writes `.env.local` for the worktree.
6. `pnpm dev` starts successfully.

## Proposed CLI Surface

### Commands

- `noter auth status` — show whether Convex CLI auth is available.
- `noter auth login convex` — run (or instruct) `npx convex login` if not logged
  in.
- `noter auth logout` — remove local Noter CLI state (does **not** log out of
  Convex CLI).
- `noter worktree add <branch> [path]` — wrapper for `git worktree add`, then
  provision.
- `noter worktree provision` — provision the **current** worktree.
- `noter worktree status` — show deployment + env status for current worktree.

### UX Guarantees

- No secrets are printed to stdout.
- All tokens are stored locally with restrictive permissions.
- Commands are idempotent; reruns do not create duplicate deployments.

## Auth Model

### Convex (Required)

Supported auth inputs:

1. **Convex CLI login** (required for MVP). Use the existing `npx convex login`
   flow, then read the token from the Convex CLI config file.
2. **OAuth application token** (future; for external users).

Storage:

- The Convex token is read from the Convex CLI config file (no duplication).
- Noter CLI stores only **non-secret** defaults (ex: last selected project slug)
  under `~/.noter/config.json`.

### Web UI OAuth (Prerequisite for External Users)

This spec assumes **local developer tooling**. If Noter is used by external
users, the web UI must support OAuth for:

1. GitHub (already required for repo creation).
2. Convex (so infra is created in the user’s Convex account).
3. Netlify (optional, if Netlify stays in the product).

Without these, “Create project” would provision into the operator’s accounts,
which is not acceptable for multi-user SaaS.

## Provisioning Model

### Worktree Identity

Use the worktree ID algorithm defined in Spec 013. The worktree ID becomes the
suffix for Convex dev deployment names.

### Convex (Cloud Dev Deployments)

1. Resolve repo root + worktree ID.
2. Resolve Convex project:
   - If `worktrees.convex.projectSlug` is set, use it.
   - Else, prompt the user to select from existing projects in the team, then
     **confirm** whether to write the choice into `noter.md` frontmatter
     (default: yes).
   - The CLI does **not** auto-create new projects in MVP (avoid accidental org
     clutter).
3. Ensure a dev (preview) deployment exists:
   - Name format: `dev:${deploymentPrefix}-${worktreeId}`.
   - If the deployment already exists, reuse it.
4. Create or reuse a deploy key for this deployment.
5. Write `.env.local` in the worktree:
   - `CONVEX_DEPLOYMENT=dev:${deploymentPrefix}-${worktreeId}`
   - `CONVEX_DEPLOY_KEY=<deployKey>`
   - `VITE_CONVEX_URL=<cloudUrl>`
   - `VITE_CONVEX_SITE_URL=<siteUrl>`
   - `SETUP_SCRIPT_RAN=1` (skip interactive setup in `setup.mjs`)

## Interaction With `noter.md`

- The repo template should include a `worktrees` block in `noter.md`.
- When Noter creates a repo for a user (SaaS flow), it should pre-fill:
  - `worktrees.convex.projectSlug`
  - `worktrees.convex.teamId`
- This avoids prompts during local provisioning.

## Configuration Surface

### `noter.md` frontmatter additions

```yaml
worktrees:
  enabled: true
  frontend:
    basePort: 5173
    range: 200
  convex:
    mode: cloud_dev
    teamId: "team_abc123"
    projectSlug: "noter"
    deploymentPrefix: "noter-wt"
```

### Local CLI config (not committed)

Optional, **non-secret** defaults to reduce prompts. `~/.noter/config.json`

```json
{
  "convex": {
    "lastProjectSlug": "noter"
  }
}
```

## Idempotency Rules

- If a Convex deployment exists, reuse it and **do not** rotate deploy keys in
  MVP.
- If `.env.local` exists, update only the keys managed by the CLI and preserve
  unrelated entries.

## Error Handling

- Missing credentials → actionable error with next-step hints.
- Network or provider failures → no partial `.env.local` writes; use a temp file
  and atomic rename.
- Team ownership loss (Convex) → surface with guidance to re-auth using a
  service account.

## Backend Storage (Clarification)

- **Local worktree provisioning:** no Noter backend storage is required.
- **SaaS onboarding:** Noter backend must store per-user provider tokens or
  references (Convex OAuth token, team id) and infra metadata. This likely
  requires new user fields or a dedicated credentials table.

## Security & Compliance

- Never write provider tokens into repo-tracked files.
- Local credentials file should be `0600` (owner read/write only).
- Avoid logging bearer tokens or deploy keys.

## Effort / Complexity Assessment

### Option A: Convex only, Convex CLI login (recommended MVP)

- **Complexity:** Low to medium
- **Work:** CLI scaffolding, management API wrapper, `.env.local` writer,
  worktree detection.
- **Risk:** Low; relies on stable Convex APIs.

### Option C: First-party OAuth (Convex + Netlify) for external users

- **Complexity:** High
- **Work:** OAuth app registration, verification, PKCE/callback server, token
  storage/refresh, UX.
- **Risk:** Higher; public integrations require verified OAuth apps.

## Testing

- Unit: worktree ID generation and slugification (Spec 013 reuse).
- Unit: `.env.local` merge logic (preserve unknown keys).
- Integration (manual):
  - Provision new worktree; verify Convex dev deployment exists and UI connects.
  - Re-run provisioning; verify idempotency.

## Open Questions

None for MVP.

## References

- Convex Management API and OAuth apps
- Worktree auto-provisioning spec (013)
