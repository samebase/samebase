# Shadcn Wrapper Entrypoint Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend/design system
- Last updated: 2026-03-19
- Related files: `AGENTS.md`, `apps/noter/src/lib/cornerNotch.ts`,
  `apps/noter/src/components/button.tsx`, `apps/noter/src/components/input.tsx`,
  `apps/noter/src/components/card.tsx`,
  `apps/noter/src/components/ui/button.tsx`

## Conclusion

When Noter wants to apply shared product styling or behavior to a shadcn
primitive, app code should import a repo-owned wrapper entrypoint, not the
generated primitive directly.

The canonical app-facing import for a wrapped primitive is
`@/components/<name>`, while the generated shadcn primitive remains under
`@/components/ui/<name>`.

Current rollout includes:

- `@/components/button`
- `@/components/badge`
- `@/components/card`
- `@/components/checkbox`
- `@/components/collapsible`
- `@/components/dialog`
- `@/components/dropdown-menu`
- `@/components/input`
- `@/components/label`
- `@/components/popover`
- `@/components/select`
- `@/components/sheet`
- `@/components/sidebar`
- `@/components/tabs`
- `@/components/toggle-group`
- `@/components/tooltip`

## Goals

- Keep app-facing component names clean, so product code can keep using
  `Button`.
- Preserve the generated shadcn primitive as an internal base instead of making
  product code depend on a vendor-owned path.
- Give Noter one durable place to layer shared styling or behavior onto buttons
  without editing generated shadcn files by default.
- Make the ownership boundary obvious in code review.

## Non-Goals

- Replacing shadcn as the primitive source.
- Forking shadcn templates.
- Renaming every generated shadcn component immediately.
- Introducing prefix-heavy public names such as `NButton` or `CNButton` in app
  code.

## Policy

### 1. Ownership Boundary

- Files under `apps/noter/src/components/ui/*` are generated shadcn primitives
  and remain read-only by default.
- Files outside `components/ui/*` are the place for Noter-owned wrappers,
  styling decisions, and product-level composition.

### 2. Canonical App Import

- App code should import a wrapped primitive from `@/components/<name>`.
- A single-component wrapper should continue exporting the canonical
  product-facing component name, for example `Button`.
- A multi-export wrapper module should preserve the generated public API while
  changing the import path ownership boundary.
- When a wrapper needs an internal base alias, it should use names such as
  `BaseButton`.

### 3. Styling Contract

- Shared app styling should be layered in the wrapper or through shared theme
  tokens and utility classes.
- When product styling needs a reusable control surface, expose a typed
  wrapper-owned prop such as `cornerNotch` instead of forcing call sites to
  hardcode raw utility class strings.
- If the repo has a canonical default treatment such as the standard Noter
  notch, the wrapper should apply it by default and reserve `cornerNotch={0}`
  for explicit opt-out.
- One-off local adjustments may still use `className` at the call site.
- `components.json` remains a CLI/generation configuration file, not the runtime
  styling entrypoint for existing buttons.

### 4. Generated Primitive Usage

- Generated shadcn components may continue importing from
  `@/components/ui/button` internally when they compose other generated
  primitives.
- Generated shadcn components may continue importing other generated
  `@/components/ui/*` primitives internally.
- Product surfaces should not depend on a generated `@/components/ui/*` path
  when the app-owned wrapper exists.

### 5. Naming Guidance

- Use `Button` for the app-facing wrapper.
- Use `BaseButton` for the generated primitive inside the wrapper.
- Do not use lowercase JSX names such as `nButton`.
- Avoid product-facing prefixes such as `NButton` unless the UI intentionally
  needs two distinct public button families at once.

## Acceptance Criteria

- App-owned product code imports wrapped shadcn primitives from
  `@/components/<name>`.
- Generated shadcn files under `apps/noter/src/components/ui/*` remain unchanged
  for this policy shift.
- Wrapper modules preserve the generated public API closely enough that call
  sites only need import-path rewrites or explicit opt-in wrapper props such as
  `cornerNotch`.
- Repo guidance documents the wrapper convention as the default path for future
  styling ownership.

## Summary

Noter should keep using shadcn as the primitive source while moving app-facing
imports to repo-owned wrapper entrypoints. This preserves clean product code,
keeps generated files internal, and creates stable places to own future styling
decisions without editing generated shadcn files by default.
