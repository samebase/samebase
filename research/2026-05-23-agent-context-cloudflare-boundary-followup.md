# Agent Context Cloudflare Boundary Follow-Up

## Document Control

- Status: Follow-up decision
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-forward-test-results-3.md`
  - `packages/agent-context/overlays/noter-convex.md`
  - `apps/noter/convex/cloudflareApi/client.test.ts`

## Decision

Open Cloudflare API boundary hardening as a separate production-code PR when the operator wants to
ship that test coverage. Do not fold it into the agent-context extraction PR.

The validation patch is useful implementation evidence, but the validation branch
`codex/noter-convex-overlay-validation` is based on the extraction PR history. A production-code PR
should start from latest `origin/main` or from the extraction PR after it lands, then carry only the
focused `apps/noter/convex/cloudflareApi/client.test.ts` hardening.

## Evidence

The isolated validation worktree produced a focused test sketch for
`apps/noter/convex/cloudflareApi/client.test.ts`:

- compile-time method/path/params/response checks for generated OpenAPI types
- typed return checks for `requestCloudflareApi`
- request materialization through the mocked Cloudflare MCP transport
- fail-before-transport validation for non-string path params

The validation run passed:

- `pnpm exec vp fmt --check apps/noter/convex/cloudflareApi/client.test.ts`
- `pnpm exec vp test apps/noter/convex/cloudflareApi/client.test.ts`
- `pnpm --dir apps/noter exec tsgo --noEmit --pretty false`
- `git diff --check`

This supports the `noter-convex` overlay's provider-boundary guidance, but it is production test
coverage rather than extracted context.

## Follow-Up Shape

Use a clean branch for the production follow-up:

- base it on latest `origin/main` or on this extraction PR after merge
- apply only the focused Cloudflare API client test changes
- rerun the same format, unit-test, typecheck, and diff checks
- open a small ready PR if the coverage is ready, or a draft PR if it is being preserved for later

Keep the validation worktree until the follow-up is either ported or explicitly discarded.
