# 039 Codex Cloud Reproducibility Spec (Practical)

## Status

- Proposed
- Last updated: 2026-03-05

## Objective

Make Codex local + Codex cloud behavior reproducible from repo state, without storing secrets in
git.

## What This Spec Delivers

1. A committed contract for local Codex setup.
2. A committed manifest for intended cloud environment settings.
3. A committed runbook to recreate cloud settings from scratch.
4. A validation checklist so two people can verify parity.

## What It Does Not Try To Do

- No attempt to manage Codex cloud environments fully by API.
- No secrets in repo.
- No machine-specific paths.

## Current Repo Facts (as of 2026-03-05)

- Local Codex environment file already exists: `.codex/environments/environment.toml`.
- Current local setup script in that file is `pnpm run bootstrap`.
- Local worktree bootstrap and run flow are already standardized via `pnpm dev:worktree`.

## Core Decisions

### Decision 1: Local environment stays committed

Use `.codex/environments/environment.toml` as the committed local environment contract.

Rules:

- Treat it as app-generated source of truth.
- Change it via Codex app local-environment UI, then commit.
- Do not add machine-specific paths.

### Decision 2: Cloud intent is committed as a manifest

Add a committed file that documents expected cloud environment settings:

- `.codex/environments/cloud.environment.manifest.toml`

Purpose:

- Reviewable desired state in PRs.
- Prevent UI drift and tribal knowledge.

### Decision 3: Cloud setup logic lives in repo scripts

Add:

- `scripts/codex/cloud/setup.sh`
- `scripts/codex/cloud/maintenance.sh`

Rules:

- Idempotent.
- Fail-fast.
- No secret output.
- Only install/update what this repo requires.

### Decision 4: UI setup is documented once

Add:

- `docs/codex/cloud-environment-runbook.md`

This runbook maps every cloud UI field to manifest keys and includes reset/rebuild steps.

## File Contract

### 1) `.codex/environments/environment.toml` (existing)

Local Codex app setup for worktree runs.

### 2) `.codex/environments/cloud.environment.manifest.toml` (new)

Example:

```toml
version = 1
name = "noter-cloud-default"

[runtime]
image = "universal"
node = "24"
python = "3.12"

[scripts]
setup = "./scripts/codex/cloud/setup.sh"
maintenance = "./scripts/codex/cloud/maintenance.sh"

[network]
agent_internet = "off" # off | restricted | unrestricted
allowlist_preset = "common_dependencies"
allowlist_extra_domains = []
allowed_http_methods = ["GET", "HEAD", "OPTIONS"]

[repos]
default_repo = "samebase/samebase"
default_branch = "main"
```

### 3) `scripts/codex/cloud/setup.sh` (new)

Responsibilities:

- Install dependencies needed for lint/test/build.
- Prepare deterministic runtime state.

### 4) `scripts/codex/cloud/maintenance.sh` (new)

Responsibilities:

- Refresh dependencies/state after cache resume.
- Keep updates minimal and deterministic.

### 5) `docs/codex/cloud-environment-runbook.md` (new)

Must include:

- Exact cloud UI settings to apply.
- Mapping table: UI field -> manifest key.
- Rebuild checklist.
- Drift-check checklist.

## Cloud Security Baseline

- Agent internet: `off` by default.
- If internet is required, use allowlist + safe methods (`GET`, `HEAD`, `OPTIONS`) unless a stronger
  case is documented.
- Secrets only in Codex cloud secrets, never in git.

## Setup Procedure (Concrete)

### A. Local

1. Ensure `.codex/environments/environment.toml` is committed and current.
2. Start from worktree using existing repo flow (`pnpm dev:worktree`).

### B. Cloud

1. Create/update cloud environment in Codex UI.
2. Apply values from `.codex/environments/cloud.environment.manifest.toml`.
3. Set setup script path and maintenance script path from manifest.
4. Configure internet mode from manifest.
5. Save environment.

### C. Validation

1. Run a local task and verify bootstrap behavior is correct.
2. Run a cloud task on same branch/commit.
3. Compare outcomes for:
   - dependency resolution,
   - lint/test/build command behavior,
   - expected file diffs.
4. Record differences in runbook and adjust scripts/manifest.

## Acceptance Criteria

1. A new teammate can reproduce local setup without hidden steps.
2. A new teammate can recreate cloud environment from manifest + runbook.
3. Re-running cloud setup/maintenance scripts does not cause drift.
4. Any cloud-setting change is reviewable as a manifest diff in git.
5. No committed file contains machine-specific absolute paths or secrets.

## Implementation Plan

1. Keep current local environment file as-is.
2. Add cloud manifest file.
3. Add setup and maintenance scripts.
4. Add runbook with UI mapping table.
5. Execute validation checklist and iterate once.

## Open Choices (Need Your Call)

1. Single cloud environment for all branches, or separate environments by purpose (`default`,
   `review`, `migration`)?
2. Keep cloud agent internet fully off, or allow restricted dependency domains?

## References

- Codex local environments: https://developers.openai.com/codex/app/local-environments/
- Codex worktrees: https://developers.openai.com/codex/app/worktrees/
- Codex cloud environments: https://developers.openai.com/codex/cloud/environments/
- Codex cloud internet access: https://developers.openai.com/codex/cloud/internet-access/
- Codex config basics: https://developers.openai.com/codex/config-basic/
- Codex config reference: https://developers.openai.com/codex/config-reference/
- Codex AGENTS.md guide: https://developers.openai.com/codex/guides/agents-md/
- Codex CLI features (`codex cloud exec`): https://developers.openai.com/codex/cli/features/
- `codex-universal` image reference: https://github.com/openai/codex-universal
