# 052 Daytona Runtime Manifest And Sandbox Programs Spec

## Status

- Proposed
- Last updated: 2026-03-12

## Summary

Define a single-source-of-truth runtime contract for Daytona and move complex
sandbox control logic out of bash-in-TypeScript strings and into sandbox-side
ESM helper programs.

This spec introduces two related decisions:

1. Daytona runtime setup should come from one structured manifest, not repeated
   shell fragments across Dockerfiles and TypeScript.
2. Complex sandbox logic should be authored as plain ESM programs that can be
   read as source, generated into string payloads, and executed inside Daytona
   with `node`.

The goal is not "Markdown as code." The goal is a stronger Noter pattern:

- one human-readable artifact
- multiple machine uses
- deterministic generated projections

`slogans.md` is the simplest example of the pattern. This spec applies the same
idea to runtime/build infrastructure using structured code artifacts instead of
copy-pasted command strings.

## Why This Spec Exists

The current Daytona runtime logic duplicates the same contract in multiple
places:

1. `apps/noter/convex/daytonaActions.ts`
2. `Dockerfile.daytona-deps`
3. `.devcontainer/Dockerfile`

This duplication is already visible in:

1. apt package lists
2. default-shell setup
3. Codex CLI installation
4. base-image assumptions

The current sandbox control layer also embeds a growing amount of bash inside
TypeScript string literals:

1. dev-server status probes
2. runtime bootstrap/install flows
3. tmux launch/restart wrappers
4. fallback start paths

That creates three problems:

1. drift between duplicated runtime definitions
2. quoting-heavy shell programs that are hard to review and test
3. loss of the "Noter can build Noter" loop because the real behavior is spread
   across disconnected copies instead of first-class repo artifacts

## Core Idea

Noter should describe the runtime it uses to build and operate itself in
artifacts that are:

1. readable in the repo
2. editable in Noter
3. executable or renderable by the build/runtime pipeline

This is a self-referential design on purpose.

A developer should be able to:

1. open the Daytona runtime manifest in Noter
2. change a package, version, shell policy, or helper program
3. regenerate the derived Dockerfile/script outputs
4. use Noter and its terminal tooling to validate the result

That loop is a product strength, not just an implementation detail.

## Goals

1. Define one canonical Daytona runtime contract.
2. Remove hand-maintained duplication between Daytona image setup in TypeScript
   and Dockerfiles.
3. Move complex sandbox logic to sandbox-side ESM helpers where control flow is
   easier to read and test.
4. Preserve simple shell usage where shell is still the right tool.
5. Make generated outputs deterministic and auditable.
6. Keep the design simple enough that future contributors can understand the
   source artifact without reverse-engineering a macro system.

## Non-Goals

1. Eliminating Dockerfiles entirely.
2. Rewriting every shell one-liner in JavaScript.
3. Introducing a full macro language in the first rollout.
4. Converting Markdown into executable infrastructure code.
5. Bundling all runtime and sandbox behavior into one giant generated file.

## Guiding Principle: One Artifact, Multiple Readings

The intended pattern is:

1. one source artifact encodes the real contract
2. humans read it as source
3. build/runtime code reads it as data or executable text
4. derived outputs are generated mechanically

Examples:

1. `slogans.md`
   - humans read/edit it as content
   - app code parses it as input
2. future `runtime/daytonaRuntime.ts`
   - humans read/edit it as code and configuration
   - generators render Dockerfile text and Daytona `dockerfileCommands(...)`
3. future `runtime/daytonaSandboxPrograms/*.js`
   - humans read/edit them as normal ESM programs
   - generation step exports their raw source for Convex
   - Daytona runs that same source with `node`

This is the kind of meta/self-hosting loop Noter should lean into.

## Main Decisions

### 1. Create a Daytona Runtime Manifest

Add one canonical structured module for Daytona runtime policy.

Suggested location:

- `runtime/daytonaRuntime.ts`

Suggested contents:

1. base image
2. apt packages
3. global npm packages and versions
4. default-shell policy
5. supported `pnpm` version
6. optional profile overlays for different consumers

Illustrative shape:

```ts
export const daytonaRuntimeManifest = {
  baseImage: 'mcr.microsoft.com/devcontainers/javascript-node:24-bookworm',
  aptPackages: ['make', 'tmux'],
  globalNpmPackages: [{ name: '@openai/codex', version: '0.114.0' }],
  pnpmVersion: '9.15.0',
} as const
```

This file is the source of truth. Other artifacts must derive from it.

### 2. Generate Runtime Outputs Instead Of Copying Them

From the runtime manifest, generate or render:

1. Daytona `Image.base(...).dockerfileCommands(...)` command lists
2. `Dockerfile.daytona-deps`
3. optionally `.devcontainer/Dockerfile`, if we decide the devcontainer should
   share the same baseline through an explicit overlay instead of a manually
   maintained divergence

Important rule:

- if an output is generated from the manifest, contributors should not edit that
  output by hand

Recommended enforcement:

1. deterministic generator script
2. checked-in generated output where human audit matters
3. validation script or test that fails when generated artifacts are stale

### 3. Use Sandbox-Side ESM Programs For Complex Runtime Logic

Multi-step sandbox logic should not live primarily as long bash strings inside
Convex modules.

Suggested location:

- `runtime/daytonaSandboxPrograms/*.js`

These files should be:

1. plain ESM
2. authored as normal source files
3. executable with `node` inside Daytona
4. locally testable outside Daytona where practical

Convex should not stringify arbitrary closures or TypeScript functions.

Instead:

1. author helper programs as standalone ESM files
2. run a small generation step that exports their raw source into a generated TS
   module
3. have Convex write that source into the sandbox and execute it with `node`
4. exchange inputs/outputs as JSON

Suggested generated artifact:

- `apps/noter/convex/generated/daytonaSandboxPrograms.generated.ts`

That module can export something like:

```ts
export const daytonaSandboxPrograms = {
  startDevServer: '...raw esm source...',
  getDevServerStatus: '...raw esm source...',
} as const
```

### 4. Keep Shell For Small Shell-Shaped Work

Shell should remain acceptable for:

1. Docker `RUN` steps
2. tiny probes like `command -v tmux`
3. direct tool invocation wrappers such as `tmux new-session ...`
4. short glue code where shell is clearer than a Node script

Move to ESM when any of the following become true:

1. non-trivial branching
2. retry/poll loops
3. JSON I/O
4. structured status parsing
5. quoting complexity dominates the code

## Initial Migration Targets

Best first candidates:

1. dev-server status probing
2. background/fallback dev-server start verification
3. runtime package/bootstrap checks
4. other sandbox-side state inspection logic that is currently encoded as ad hoc
   shell programs

Not good early candidates:

1. short Docker `RUN` fragments
2. one-line tmux attach commands
3. tiny `command -v` checks that are not part of a larger script

## Runtime Profiles And Deliberate Divergence

Do not force every consumer to be byte-for-byte identical if their purpose is
different.

Instead, represent divergence explicitly.

Example:

1. Daytona runtime base profile
2. Daytona Codex-auth overlay
3. devcontainer overlay

That lets us avoid accidental drift without pretending the local devcontainer
and user-facing Daytona runtime are always identical.

The rule is:

- differences should be declared as overlays on the same model, not hidden in
  unrelated duplicated files

## Generation Pipeline

Recommended pipeline:

1. source artifacts live under `runtime/`
2. `scripts/` contains deterministic generators
3. generators emit checked-in derived artifacts where appropriate
4. CI validates freshness

Suggested scripts:

1. `scripts/render-daytona-runtime.js`
2. `scripts/export-daytona-sandbox-programs.js`
3. optional `scripts/check-generated-runtime.js`

## Testing Strategy

Minimum expected validation:

1. unit tests for manifest rendering
2. unit tests for sandbox helper input/output parsing
3. freshness checks for generated artifacts
4. one integration path that proves a generated sandbox helper can be written
   into Daytona and executed successfully

## Acceptance Criteria

1. Daytona runtime packages/versions are declared once in the runtime manifest.
2. `Dockerfile.daytona-deps` and Daytona image command lists are derived from
   that manifest instead of being maintained independently.
3. At least one complex Daytona bash string is replaced by a sandbox-side ESM
   helper program.
4. Convex executes generated helper program source without relying on
   function-to-string hacks.
5. CI can detect stale generated runtime artifacts.
6. The resulting structure is still readable to a contributor who has not read
   the generator implementation yet.

## Risks

1. over-engineering the generator layer before the runtime model stabilizes
2. hiding simple behavior behind unnecessary abstraction
3. introducing build fragility if generated artifacts are not deterministic

## Mitigations

1. keep the manifest schema small
2. move one script family at a time
3. keep generated outputs human-auditable
4. keep ESM helpers standalone and boring
5. add a macro/bundling layer only if plain-file composition becomes painful

## Phased Plan

- [ ] Phase 1: add `runtime/daytonaRuntime.ts` and make it the canonical Daytona
      runtime manifest
- [ ] Phase 2: generate Daytona `dockerfileCommands(...)` and
      `Dockerfile.daytona-deps` from that manifest
- [ ] Phase 3: extract one complex sandbox flow into
      `runtime/daytonaSandboxPrograms/*.js` and generate raw-source exports for
      Convex
- [ ] Phase 4: migrate additional complex Daytona shell programs to sandbox ESM
      helpers
- [ ] Phase 5: decide whether `.devcontainer/Dockerfile` should be generated
      from an explicit overlay on the same manifest
- [ ] Phase 6: only if needed, add a lightweight bundling/macro layer for
      sandbox programs

## Relationship To Other Specs

This spec complements, but does not replace:

1. `051_DAYTONA_STANDARD_RUNTIME_AND_PTY_SESSIONS_SPEC.md`
   - that spec defines runtime/session behavior
   - this spec defines how that runtime behavior should be authored and derived
2. `035_LANDING_SLOGAN_SOURCE_AND_SELECTION_SPEC.md`
   - that spec is the simpler content-first example of the same single-artifact
     pattern
