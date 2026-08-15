# Spiro assets-only guidance comparison

Date: 2026-08-15

## Outcome

The candidate assets-only adoption section improved a focused read-only Spiro migration plan from
6/16 to 15/16 in an independent blind score.

Keep the section goal-based. It helped the agent select the Samebase command interface, a locked
package contract, a runtime-only asset boundary, separate preview upload, and an old-host gate. Do
not promote its symlink implementation as a general rule.

The supervised live migration also showed that a hosting-only adoption must not trigger a general
application-toolchain migration. Its first patch added Vite+, Vitest, TypeScript checks, generated
hooks, and duplicate deployment verification to a six-file static repository. A repair pass removed
those layers because real Wrangler checks proved the same boundaries.

## Inputs

- Target: `nicu-chiciuc/spiro` at `fdfebbea5c28072af783c657cb6679d5e936e1cc`
- Installed Samebase plugin: `0.2.20`
- Candidate Samebase artifact: `49975336d4221257ad42ae5e691d56adf6fef24d`
- Live migration result: [Spiro pull request 1](https://github.com/nicu-chiciuc/spiro/pull/1)

The frozen repository contained six files. Its browser runtime used only `index.html`,
`dat.gui.min.new.js`, and `stats.min.js`. It had no package manifest, lock file, build, CI, backend,
or provider configuration. GitHub Pages served the repository root. An arbitrary route returned 404,
while `README.md` was publicly reachable.

## Live migration observation

A fresh projectless Codex task received only this request:

> Migrate https://github.com/nicu-chiciuc/spiro to Samebase. Preserve its current behavior, connect
> the existing repository to my Samebase account, and create a ready GitHub pull request for any
> required source changes. Do not merge the pull request.

The task needed no saved Codex project. It cloned the repository, connected it to Samebase without a
provider attachment, and opened a ready pull request.

Before manager correction, the task:

- preserved the application behavior and legacy source files
- added all three Samebase command names
- created a separate Cloudflare asset artifact
- verified Cloudflare dry runs and browser behavior
- caught that moving the browser files would break the current GitHub Pages host
- added Vite+, Vitest, TypeScript checks, generated hooks, a deploy wrapper, an artifact verifier,
  and CI
- configured `single-page-application` fallback, which changed unknown routes from 404 to 200 and
  made repository-only route probes return the application HTML

The manager recorded these results before correction. The repair kept the safe asset boundary and
old-host compatibility, restored 404 behavior, and removed the application-toolchain layers that did
not prove a distinct migration contract. The final source result keeps a small exact-copy build
because that build lets GitHub Pages use the legacy root paths while Cloudflare receives only the
three runtime files.

This supports an outcome rule, not a copy-script rule. A copy build can be justified when it creates
a real provider boundary or preserves a live compatibility path.

## Focused comparison

Two fresh projectless read-only tasks received:

- the same frozen source commit
- the same core migration-planning prompt
- the same installed public plugin
- the same Codex Desktop default model and reasoning configuration
- no live Samebase, provider, pull request, or non-frozen branch state

The treatment received only the 36-line candidate `Assets-Only Legacy Repositories` section. Both
tasks could read current public documentation and write isolated temporary validation files. The
manager sent the same stop instruction to both after they had enough evidence for a final plan.

An independent scorer received anonymized plan summaries, the frozen repository facts, and an
eight-part rubric. The scorer did not receive the treatment identity.

| Criterion                                 | Control | Candidate |
| ----------------------------------------- | ------: | --------: |
| Reproducible package contract             |       1 |         2 |
| Non-deploying build safety                |       2 |         2 |
| Runtime-only asset boundary               |       0 |         2 |
| Provider config and command separation    |       1 |         2 |
| Preview state and non-production behavior |       0 |         2 |
| Safe validation                           |       2 |         2 |
| Route proof                               |       0 |         1 |
| Old-host rollback handling                |       0 |         2 |
| **Total**                                 |   **6** |    **15** |

The control omitted a lock file and the preview deploy command. It copied all five content files,
including `README.md` and the demo GIF, into the Worker artifact. It did not keep the old host as an
explicit gate.

The candidate used a locked pnpm and Wrangler contract, all three Samebase command names, a
three-file runtime boundary, separate preview upload, repository-only 404 checks, and an explicit
old-host gate.

Neither plan was ready without repair. The candidate:

- did not test an arbitrary missing route
- assumed Git symlinks were portable across checkouts and provider packaging
- committed an unverified Worker name before provider selection

The public guidance should therefore state outcomes and verification boundaries. It should not
require symlinks, copying, one asset directory name, or one provider-name strategy.

## Decision

Keep these candidate rules in the public adoption reference:

1. A hosting-only adoption does not justify an application framework or toolchain migration.
2. The deployable asset boundary contains runtime files, not repository files or tool state.
3. The build is non-deploying and can be a real compatibility or asset-boundary step.
4. Production and preview commands remain separate.
5. Route proof includes the root, a known asset, a known missing route, and repository-only paths.
6. The old host remains unproven after any source-layout or publishing change until its route
   passes.

Keep these as research candidates:

- whether source configuration should omit the Worker name until Samebase selects the resource
- whether symlink-based asset boundaries are portable enough for supported local environments

## Limits

This comparison used separate Codex Desktop tasks, not the isolated CLI harness used for Weight TSX.
Both tasks shared the installed public plugin, but only the treatment received the candidate
section. The task API did not report the configured model identity. The comparison shows a strong
result on one target. It does not prove that every sentence helps every assets-only repository.

Spiro is connected to Samebase and its source pull request is green. No Cloudflare provider is
attached, the pull request is not merged, and no production migration is complete. The live provider
path remains the next gate.
