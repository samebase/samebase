# Agent Context Shadcn Ownership Decision

## Document Control

- Status: Ownership decision
- Date: 2026-05-23
- Related:
  - `AGENTS.md`
  - `specs/063_SHADCN_WRAPPER_ENTRYPOINT_SPEC.md`
  - `packages/agent-context/manifests/noter.md`

## Decision

Represent shadcn/ui ownership as a repo docs/spec pointer plus a compact always-loaded `AGENTS.md`
reminder. Do not add a portable package skill or a new Noter overlay only for shadcn ownership.

This rule is Noter design-system policy, not general TypeScript engineering practice. The portable
package can point to the repo policy when UI component ownership matters, but the policy should not
be promoted into `typed-product-engineering` or `route-ui-validation`.

## Evidence

Current `AGENTS.md` already carries the compact operational rule:

- generated files under `apps/noter/src/components/ui/*` are read-only by default
- new shadcn components should be added or refreshed through the shadcn CLI
- Noter-owned styling or behavior belongs in wrappers outside `components/ui/*`
- explicit generated-file edits must stay minimal and be called out

`specs/063_SHADCN_WRAPPER_ENTRYPOINT_SPEC.md` contains the detailed design-system boundary:

- `components/ui/*` is generated primitive space
- app-owned wrappers and composition live outside `components/ui/*`
- empty pass-through wrappers should not be preserved
- `Button` is the current explicit exception

The package manifest intentionally has only three Noter overlays:

- `noter-app-template`
- `noter-convex`
- `noter-operator-workflows`

Adding a fourth overlay for one design-system ownership rule would add routing machinery without a
new task family.

## Status Caveat

`specs/063_SHADCN_WRAPPER_ENTRYPOINT_SPEC.md` currently says `Status: Proposed`. Until that status
is accepted/current, a shortened `AGENTS.md` should keep the compact shadcn rule as the active
operator reminder instead of relying on the spec as the only source of truth.

## Follow-Up Shape

Before removing the shadcn rule from always-loaded context:

- either mark spec 063 accepted/current through the normal repo process, or keep the compact
  `AGENTS.md` pointer permanently
- keep the detailed wrapper policy in spec 063
- keep shadcn ownership out of portable skills and Noter overlays unless future evidence shows a
  broader UI-ownership task family
