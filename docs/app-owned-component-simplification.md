# App-Owned Component Simplification

## Purpose

This note captures operator guidance for simplifying Samebase-owned React components during local
refactors. It is intentionally about app-owned code, not published packages or generated primitives.

## Prefer Closed Internal Components

When a component is used only in the same file or only by Samebase-owned code, keep its API closed
by default.

Do not add pass-through styling props such as `className` just because a component might need to
vary later. The app owns both the component and its callers, so future changes can edit the
component directly when a real need appears.

General rule:

- If the component is not a true shared primitive, avoid extensibility props.
- If there is one current visual treatment, encode that treatment in the component.
- Add a prop only when a shipped callsite already needs a meaningful variation.
- When unsure whether a component is generic, assume it is not generic.

Example:

- Dashboard logo components should not accept `className` when every use is a fixed dashboard-owned
  icon slot.

## Pass Domain Objects When They Are The API

When a parent already has a cohesive domain object and the child needs most of that object's fields,
pass the object instead of unpacking every field into parallel props.

Accessing fields as `branch.name`, `branch.headCommitSha`, or `branch.pullRequestTitle` is often
clearer than receiving many detached props, because the field's domain and ownership stay visible at
the usage site.

General rule:

- Prefer `branch={branch}` over a long list of `branchName={branch.name}`,
  `headCommitSha={branch.headCommitSha}`, and similar one-for-one forwarding.
- Keep separate props only for values that are genuinely not part of the object or that
  intentionally override object-derived behavior.
- Do not flatten a domain object into props merely to make a component look smaller at its callsite.

Example:

- A dashboard branch row that needs almost every `branch` field should receive the branch object and
  read from `branch` internally.

## Delete Pass-Through Wrappers

If a local function or component only returns another function or component with renamed or
one-for-one forwarded props, question whether it should exist.

General rule:

- Keep a wrapper only when it adds a real invariant, layout boundary, state, or behavior.
- Delete wrappers that only reshape data for a single nearby callsite.
- Prefer using the real component directly when the wrapper does not clarify the domain.

Example:

- If `RepositoryBranchListRow` only maps `branch` fields into `RepositoryBranchLinkRow`, consider
  rendering `RepositoryBranchLinkRow` directly from the branch list.

## Trust Typed Boundaries

Avoid runtime guards such as `Array.isArray(value)` once a value has crossed a typed, validated app
boundary and downstream code already has an exact type.

Repeated shape checks inside typed React code usually mean the component is no longer trusting its
own data contract. That makes the code noisier and hides real contract drift behind fallback
behavior.

General rule:

- Validate unknown external data at the boundary where it enters the app.
- After Convex validators, generated API types, schema parsers, or equivalent boundary checks
  establish a field as an array, use it as an array.
- Do not add `Array.isArray` fallbacks for non-nullable typed arrays in app components.
- If a value truly can be malformed or nullable, fix the boundary type or parser instead of adding
  scattered local fallbacks.

Example:

- `branch.commits` comes from the paginated branch query return validator as an array, so the
  dashboard should use `branch.commits` directly rather than falling back to `[]`.

## Preserve Absence

Do not hide missing values behind sentinel defaults such as `""` when `undefined` or `null` already
represents the absence honestly.

Defaulting to an empty string often forces downstream code to ask indirect questions like
`value.length > 0` instead of the clearer question: is the value present?

General rule:

- Let optional values stay optional unless a real API requires a concrete fallback.
- Use truthiness or explicit nullish checks for optional values before passing them to APIs that
  require a string.
- Do not add plan-B defaults that make missing data look like present-but-empty data.
- If absence is a meaningful state, preserve it in the type and branch on it directly.

Example:

- A dashboard `primaryBranch` should remain `string | undefined` when no active branch exists, and
  callsites should check `primaryBranch` before building branch-specific routes or controls.

## Prefer Readable Styling

Optimize utility classes for understanding before visual micro-adjustment.

Subtle opacity modifiers, breakpoint-only shape changes, and ornamental frame classes make a
component harder to reason about unless they protect a current layout or product invariant. Prefer
the obvious token first, then add nuance only when the reason is concrete.

General rule:

- Prefer Tailwind's standard font-size tokens such as `text-xs` and `text-sm` over arbitrary sizes
  such as `text-[11px]`.
- Prefer `border` over `border-border/60` unless the softened border is a real standard in that
  surface.
- Prefer `bg-muted` over `bg-muted/20` unless the lower contrast is necessary.
- Avoid breakpoint-only frame changes such as `sm:border`, `sm:mx-0`, or `sm:corner-notch-1` when
  the UI does not need a different structure across sizes.
- If a class does not protect a named invariant, remove it.

Example:

- Dashboard pull request list containers should use the simplest border and muted background that
  communicate the grouping.

## Prefer Named Branching Helpers

Avoid long nested ternaries for rendering multiple similar states.

Nested ternaries make it hard to see the priority order and the shared shape of each branch. In
app-owned rendering code, a small named helper with early `if` returns is usually clearer and easier
to change.

General rule:

- Use a named helper when JSX branches past one or two simple cases.
- Prefer plain `if` returns when the states are ordered by priority.
- Keep the helper local until more than one real callsite needs it.
- Extract tiny shared fragments only when they remove real duplication without hiding the state
  being rendered.

Example:

- Dashboard pull request resource status should be rendered by a helper that orders loading, stale,
  failed, and current states rather than by a nested ternary inside the card props.

## Extract Named Workflows

Avoid leaving large `useCallback` blocks inside a page component when the callback owns a workflow
instead of a tiny local event.

`useCallback` can make a function reference stable, but it does not make the surrounding component
easier to read. If the callback coordinates domain data, external actions, debounce state, browser
lifecycle, or batching, give that workflow a named hook or helper and keep the page component
focused on wiring.

General rule:

- Keep inline callbacks for small, local handlers whose behavior is obvious at the callsite.
- Extract callbacks that own a domain workflow, especially when multiple callbacks share the same
  data, action, or debounce rules.
- Prefer one named hook for a cohesive workflow over several tiny wrappers that only hide one line
  each.
- Return only the callback or value the current callsite needs; do not make the hook generic for
  imagined future callers.

Example:

- Provider-backed pull request pagination and resource enrichment should live in the named
  `useRepositoryPullRequests` hook. The dashboard should not inline GitHub action calls, repository
  loops, or refetch policy inside `RepositoryDashboard`.

## Document Side Effects

Before adding or keeping a `useEffect`, first prove that render-time derivation, event handlers,
keys, or component boundaries cannot express the behavior.

React treats Effects as an escape hatch for synchronizing with external systems, not as a general
way to keep React state in sync with other React state. See
[React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).

Effects often hide synchronization between React state, browser events, external windows, and
persisted data. If an effect is still needed, a short JSDoc-style comment above it or above its
named hook should make that dependency explicit and name the removal path.

General rule:

- Avoid a new effect whenever the result can be calculated during render.
- Do not reset state in an effect just because another render condition hides that state; hidden is
  not the same thing as cleared.
- Prefer source-owned optimistic updates over local shadow state plus an effect that waits for the
  server value to catch up.
- Prefer extracting a remaining effect into a named hook when the hook name can describe the
  external synchronization at the callsite.
- Explain the external system or lifecycle the effect synchronizes with.
- Mention why render-time derivation is not enough today.
- Include a concrete removal path, such as moving work to a backend scheduler, a route-level data
  layer, or a shared optimistic state helper.
- If no removal path can be named, re-check whether the effect is carrying too much responsibility.

Example:

- Dashboard developer tools can derive visibility from `developerToolsVisible` while preserving
  remembered open state; this does not need an effect.
- Dashboard panel state persisted in Convex should use mutation-level optimistic updates instead of
  local state that a later effect reconciles with the query.
- Page-load warning suppression can compare query timestamps to a mount-time value instead of
  copying the initial query value into a ref from an effect.
- A dashboard hook named `useProviderOAuthPopupCompletionReload` can make the popup message bridge
  clearer than leaving the `useEffect` inline.
