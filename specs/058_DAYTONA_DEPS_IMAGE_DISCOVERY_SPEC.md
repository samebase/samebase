# 058 Daytona Deps Image Discovery Spec

## Status

- Draft
- Date: 2026-03-16
- Supersedes the env-based part of:
  - `024_DAYTONA_IMAGE_AND_STARTUP_PERFORMANCE_SPEC.md`

## Summary

Daytona snapshot builds should derive the deps image name directly from repo
identity plus the computed deps input hash.

Noter should stop relying on env-configured deps image paths as the normal
source of truth for Daytona deps images.

Target resolution:

- primary candidate:
  - `ghcr.io/<owner>/<repo>-daytona-deps:<inputHash>`
- compatibility fallback during migration:
  - `ghcr.io/<owner>/<repo>-daytona-deps:<lockHash>`

This keeps Daytona deps image selection deterministic, automatic, and aligned
with the same hash that the GitHub workflow already publishes.

## Problem

The current production flow still depends on Convex env for deps image
discovery.

That creates an unnecessary control surface and a real failure mode:

1. repo code changes and the Daytona deps image workflow publishes a new image
2. production Convex env still points at an older image tag
3. snapshot builds continue using the stale image
4. new tooling in `Dockerfile.daytona-deps` does not appear in fresh sandboxes

We just hit this exact failure with fish tooling:

- repo code already installed `fisher` and `pure`
- prod snapshot builds still used an older pinned deps image
- fresh sandboxes had fish as the shell, but not `fisher`

This is not a data problem, and it is not a GitHub API discovery problem. It is
configuration drift caused by storing a derived value as mutable runtime config.

## Goals

- Remove manual Convex env churn from Daytona deps image selection
- Make snapshot builds automatically use the latest compatible deps image
- Keep deps image selection deterministic and reproducible
- Keep the existing content-hash-based GHCR publish model
- Preserve safe fallback when the expected deps image does not exist yet

## Non-Goals

- Replacing the Daytona deps image workflow
- Switching deps image identity from content hash to commit SHA
- Querying GitHub or GHCR at runtime to discover "the latest" image
- Adding new database tables for deps image resolution
- Introducing extra override env vars unless a real migration requires them

## Product Decision

The Daytona deps image should be derived from repo state, not operator-edited
runtime config.

Normal production behavior should be:

1. compute the same `inputHash` used by the deps image workflow
2. derive the canonical immutable GHCR tag from that hash
3. attempt to build the snapshot from that image
4. if missing, try the compatibility lock-hash tag during migration
5. if still missing, fall back to the install-based snapshot build path

The correct meaning of "latest" here is:

- latest image compatible with the current deps inputs

It is not:

- latest git commit
- latest env var value
- latest image returned by an API list call

## Why Env Is The Wrong Primitive

An env-configured deps image path does not represent business configuration. It
represents a deterministic derived artifact path.

That makes env the wrong storage layer because:

1. it can drift from repo reality
2. it can lag until a Convex runtime reload
3. it forces manual coordination after otherwise-complete merges
4. it duplicates information already encoded in the repo and CI workflow

The repo already has the real inputs:

- owner
- repo
- `Dockerfile.daytona-deps`
- package manifests
- lockfile
- base image
- pnpm version

Those are enough to derive the correct image tag with no extra mutable config.

## Source Of Truth

The source of truth should be:

1. the Daytona deps hash inputs in the repo
2. the repo identity for the snapshot being built
3. the GHCR naming contract from the existing workflow

That means runtime resolution should directly derive:

```text
ghcr.io/<owner>/<repo>-daytona-deps:<inputHash>
```

Where:

- `<owner>` is the lowercase GitHub owner
- `<repo>` is the lowercase repo name
- `<inputHash>` is computed from the same effective inputs as
  `scripts/daytona-deps-hash.js`

## Proposed Resolution Contract

### Primary candidate

Use:

```text
ghcr.io/<owner>/<repo>-daytona-deps:<inputHash>
```

### Migration fallback

While legacy alias tags still exist, also try:

```text
ghcr.io/<owner>/<repo>-daytona-deps:<lockHash>
```

This fallback should remain only while older images still rely on the lock-hash
alias path.

### No normal env dependency

Env-configured deps image paths should no longer be required for normal runtime
resolution.

Preferred end state:

- remove the env dependency entirely from Daytona snapshot resolution

Acceptable migration state:

- keep env only as an explicit debug override path
- default behavior ignores it unless a dedicated override mode is intentionally
  enabled in the same patch

If there is no active migration, the cleaner option is to remove it entirely.

## Implementation Direction

In `apps/noter/convex/daytona/actions.ts`:

1. remove the normal dependency on env-configured deps image paths
2. replace `resolveDepsImageNameForTag(...)` with direct GHCR derivation from:
   - owner
   - repo
   - tag
3. keep `resolveDepsImageNames(...)` as the ordered candidate list builder:
   - first `inputHash`
   - then `lockHash` if different
4. keep current registry-auth setup
5. keep current behavior where missing deps images fall back to install-based
   snapshot builds

In practice this means the runtime code should behave as if the template were
always:

```text
ghcr.io/{owner}/{repo}-daytona-deps:{inputHash}
```

without reading that from env.

## Runtime Behavior

### Snapshot build path

When building a snapshot:

1. compute `inputHash`
2. compute `lockHash`
3. build ordered candidates:
   - `ghcr.io/<owner>/<repo>-daytona-deps:<inputHash>`
   - `ghcr.io/<owner>/<repo>-daytona-deps:<lockHash>` if distinct
4. try each candidate in order
5. if none exist, fall back to the snapshot path that runs dependency install in
   the build

### Logging

Snapshot logs should keep emitting the exact selected candidate so runtime
behavior is debuggable:

- `Trying deps image ...`
- `Using deps image ...`
- `Deps image not found: ...`

This is important because it makes drift or missing-image failures visible
without additional tooling.

## Why Not Database Or GitHub API

### Database

Convex should not store the resolved deps image tag because that would still be
a cached derived value that can drift from repo inputs.

### GitHub API / GHCR listing

An API call to ask for "the latest image" is the wrong abstraction:

1. it is slower
2. it adds permissions coupling
3. "latest" is ambiguous
4. the correct answer is not temporal, it is deterministic

The correct image is the one whose tag matches the current deps input hash, not
the most recently published package.

## Acceptance Criteria

- Snapshot builds no longer require env-configured deps image paths for normal
  operation
- A merge that changes Daytona deps inputs requires no manual prod env update
- Snapshot logs show the hash-derived image name directly
- Fresh snapshots automatically pick the correct newly published deps image when
  the hash changes
- If the expected image is missing, snapshot builds still succeed through the
  install-based fallback path
- Production fish/Codex tooling changes become available after the normal image
  workflow + snapshot rebuild path, without manual env edits

## Rollout Plan

1. Add direct hash-derived image resolution in runtime code
2. Keep lock-hash fallback during the migration window
3. Remove env-configured deps image paths from normal prod usage
4. Validate with a real Daytona deps change:
   - publish image
   - rebuild snapshot
   - recreate sandbox
   - verify tooling appears without env edits
5. Later, remove lock-hash fallback once legacy alias reliance is gone

## Open Questions

- Whether to keep a deliberately hidden debug override for deps image selection
  during incident response, or remove env-based overrides entirely
- When to remove the legacy lock-hash fallback from runtime resolution
