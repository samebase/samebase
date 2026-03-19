# Shadcn Wrapper Entrypoint Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend/design system
- Last updated: 2026-03-19
- Related files: `AGENTS.md`, `apps/noter/src/components/button.tsx`,
  `apps/noter/src/components/ui/button.tsx`

## Conclusion

When Noter wants to apply shared product styling or behavior to a shadcn
primitive, app code should import a repo-owned wrapper entrypoint, not the
generated primitive directly.

For buttons, the canonical app-facing import becomes `@/components/button`. The
generated shadcn primitive at `@/components/ui/button` remains the internal base
implementation.

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

- App code should import the button from `@/components/button`.
- The wrapper should continue exporting the canonical product-facing name
  `Button`.
- The wrapper implementation should alias the generated primitive as
  `BaseButton`.

### 3. Styling Contract

- Shared app styling should be layered in the wrapper or through shared theme
  tokens and utility classes.
- One-off local adjustments may still use `className` at the call site.
- `components.json` remains a CLI/generation configuration file, not the runtime
  styling entrypoint for existing buttons.

### 4. Generated Primitive Usage

- Generated shadcn components may continue importing from
  `@/components/ui/button` internally when they compose other generated
  primitives.
- Product surfaces should not depend on the generated button path when the
  wrapper exists.

### 5. Naming Guidance

- Use `Button` for the app-facing wrapper.
- Use `BaseButton` for the generated primitive inside the wrapper.
- Do not use lowercase JSX names such as `nButton`.
- Avoid product-facing prefixes such as `NButton` unless the UI intentionally
  needs two distinct public button families at once.

## Acceptance Criteria

- App-owned product code imports buttons from `@/components/button`.
- The generated shadcn `button.tsx` file remains unchanged for this policy
  shift.
- The wrapper preserves the generated button API so call sites do not need
  semantic rewrites.
- Repo guidance documents the wrapper convention as the default path for future
  styling ownership.

## Summary

Noter should keep using shadcn as the button primitive source while moving the
app-facing import to a repo-owned `Button` wrapper. This preserves clean product
code, keeps generated files internal, and creates one stable place to own future
styling decisions.
