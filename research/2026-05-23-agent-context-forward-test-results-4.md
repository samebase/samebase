# Agent Context Forward Test Results 4

## Document Control

- Status: Installed-style portable skill validation
- Date: 2026-05-23
- Related:
  - `research/agent-context-draft-skills/`
  - `research/agent-context-draft-bundle/noter-manifest.md`
  - `research/2026-05-23-agent-context-packaging-decision.md`

## Purpose

This pass validates the five portable triggerable skills as installed-style artifacts. Each subagent
received one `SKILL.md` as a skill item plus a realistic task. The agents did not receive a
pre-written expected answer, and the tasks avoided provider setup, live backend startup, browser
automation, and mutating PR/provider actions.

## Runs

| Skill                        | Agent                                  | Task Shape                                                    | Outcome                                                                  |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `typed-product-engineering`  | `019e5254-a9d1-7883-a755-330bef27e498` | Read-only provider-boundary audit                             | Sufficient; needs repo overlay for exact provider files and commands.    |
| `route-ui-validation`        | `019e5254-ad91-7530-b94a-2b4c58c55f1f` | Plan `?dev` versus `?prod-ui` route validation                | Sufficient for route method; needs Noter overlay for route semantics.    |
| `pr-workflow-review`         | `019e5254-b0b8-7ef1-9884-3625549338ff` | Read-only PR blocker triage                                   | Sufficient; found a real CodeRabbit blocker in the research docs.        |
| `exact-resource-cleanup`     | `019e5254-b415-7a30-9500-ec795c4b8105` | Read-only cleanup assessment for validation worktree          | Sufficient for fail-closed decision; needs Noter overlay for full clean. |
| `research-to-implementation` | `019e5254-b7e7-7fc0-a953-5c7ebe5516f4` | Decide next implementation direction after packaging decision | Sufficient; reinforced package-like bundle validation as next step.      |

## Results

### Typed Product Engineering

The skill guided the agent toward generated OpenAPI boundaries, response validators, negative type
tests, request materialization, large-identifier preservation, and comparison against the strongest
local provider-boundary exemplar.

Decision:

- The Cloudflare generated API boundary test remains thin compared with Convex Management.
- The smallest hardening remains focused tests in `apps/noter/convex/cloudflareApi/client.test.ts`,
  not production refactoring.
- Repo-local provider file discovery and verification commands belong in `noter-convex`, not the
  portable skill.

Applied revision:

- `typed-product-engineering` now says to add lossless large-identifier tests only when the current
  provider surface has identifiers or numeric fields that could exceed JavaScript's safe integer
  range.

### Route UI Validation

The skill produced the right portable validation shape: exact route and query params, real shipped
route over fake fixture, desktop/mobile checks, live interaction probes, and screenshot discipline.

The agent had to seek Noter overlay context for:

- `?dev` and `?prod-ui` semantics
- key-presence query params
- `pnpm anon` startup rules
- Linux/ARM64 screenshot baseline authority

Applied revision:

- `route-ui-validation` now names a safe non-mutating editability probe: intercept input, prevent
  the write, confirm content is unchanged, and verify no write request fired.

### PR Workflow Review

The skill correctly drove read-only branch/PR discovery, check review, bot-status caution, and a
final blocker decision. It found a real actionable CodeRabbit comment: the thread-sample document
said "twelve-thread subset" while the baseline table contained 28 candidate rows.

Applied revisions:

- `pr-workflow-review` now says unresolved actionable bot comments are blockers even when the
  aggregate review decision is empty or the bot check is green.
- It now points agents to read-only GraphQL or connector thread-state paths when flat PR comments do
  not prove whether review threads are resolved.
- `research/2026-05-23-agent-context-thread-sample.md` now distinguishes the 28-row candidate table
  from the twelve-thread manual-review subset.

### Exact Resource Cleanup

The skill was sufficient for the fail-closed decision on the leftover validation worktree. The agent
correctly refused to call it safe to delete because the worktree is dirty and the test sketch has
not been preserved or declared disposable.

The skill was not sufficient for full Noter cleanup by itself, as expected. Full cleanup needs the
Noter overlay for terminal PR state, exact preview ownership, machine-state paths, and Codex
archive/pin checks.

Applied revisions:

- `exact-resource-cleanup` now defines local-only dry-run checks when provider contact is forbidden.
- It now distinguishes local archive from full cleanup and requires stronger overlay proof for
  branches, previews, machine state, and external resources.

### Research To Implementation

The skill correctly selected package-like installed-context validation as the next implementation
direction, rather than shrinking `AGENTS.md` or adding Cloudflare production-code hardening to this
extraction PR.

Applied revision:

- `research-to-implementation` now includes a compact output shape for context-package validation:
  evidence, decision, smallest next step, artifact sufficiency, and missing guidance routed to core,
  skill, overlay, docs, or follow-up code.

## Bundle Decision

The installed-style pass validates the five portable triggerable skills, but also shows that a
bundle manifest is needed before promotion. The skills intentionally omit Noter-only startup,
provider, route-mode, cleanup, and PR policy details. Agents need a reachable router that pairs each
portable skill with the right Noter overlay.

Applied artifact:

- Added `research/agent-context-draft-bundle/noter-manifest.md` with the current core, skill,
  overlay, and trigger map.

## Remaining Work

- See `research/2026-05-23-agent-context-package-results.md` for the first package layout in
  `packages/agent-context`.
- See `research/2026-05-23-agent-context-compatibility-map.md` for the decision to keep existing
  repo skills as compatibility entrypoints around packaged portable skills.
- Keep `AGENTS.md` intact until each removed rule has a reachable core, skill, overlay, doc, or spec
  replacement.
- Open the Cloudflare API boundary hardening as a separate production-code follow-up when desired.
