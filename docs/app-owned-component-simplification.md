# App-Owned Component Simplification

## Purpose

This note captures operator guidance for simplifying Noter-owned React
components during local refactors. It is intentionally about app-owned code, not
published packages or generated primitives.

## Prefer Closed Internal Components

When a component is used only in the same file or only by Noter-owned code, keep
its API closed by default.

Do not add pass-through styling props such as `className` just because a
component might need to vary later. The app owns both the component and its
callers, so future changes can edit the component directly when a real need
appears.

General rule:

- If the component is not a true shared primitive, avoid extensibility props.
- If there is one current visual treatment, encode that treatment in the
  component.
- Add a prop only when a shipped callsite already needs a meaningful variation.
- When unsure whether a component is generic, assume it is not generic.

Example:

- Dashboard logo components should not accept `className` when every use is a
  fixed dashboard-owned icon slot.

## Pass Domain Objects When They Are The API

When a parent already has a cohesive domain object and the child needs most of
that object's fields, pass the object instead of unpacking every field into
parallel props.

Accessing fields as `branch.name`, `branch.headCommitSha`, or
`branch.pullRequestTitle` is often clearer than receiving many detached props,
because the field's domain and ownership stay visible at the usage site.

General rule:

- Prefer `branch={branch}` over a long list of `branchName={branch.name}`,
  `headCommitSha={branch.headCommitSha}`, and similar one-for-one forwarding.
- Keep separate props only for values that are genuinely not part of the object
  or that intentionally override object-derived behavior.
- Do not flatten a domain object into props merely to make a component look
  smaller at its callsite.

Example:

- A dashboard branch row that needs almost every `branch` field should receive
  the branch object and read from `branch` internally.

## Delete Pass-Through Wrappers

If a local function or component only returns another function or component with
renamed or one-for-one forwarded props, question whether it should exist.

General rule:

- Keep a wrapper only when it adds a real invariant, layout boundary, state, or
  behavior.
- Delete wrappers that only reshape data for a single nearby callsite.
- Prefer using the real component directly when the wrapper does not clarify the
  domain.

Example:

- If `VaultBranchListRow` only maps `branch` fields into `VaultBranchLinkRow`,
  consider rendering `VaultBranchLinkRow` directly from the branch list.

## Trust Typed Boundaries

Avoid runtime guards such as `Array.isArray(value)` once a value has crossed a
typed, validated app boundary and downstream code already has an exact type.

Repeated shape checks inside typed React code usually mean the component is no
longer trusting its own data contract. That makes the code noisier and hides
real contract drift behind fallback behavior.

General rule:

- Validate unknown external data at the boundary where it enters the app.
- After Convex validators, generated API types, schema parsers, or equivalent
  boundary checks establish a field as an array, use it as an array.
- Do not add `Array.isArray` fallbacks for non-nullable typed arrays in app
  components.
- If a value truly can be malformed or nullable, fix the boundary type or parser
  instead of adding scattered local fallbacks.

Example:

- `vault.remoteBranches` comes from the `getUserVaults` Convex return validator
  as an array, so the dashboard should use `vault.remoteBranches` directly
  rather than falling back to `[]`.

## Preserve Absence

Do not hide missing values behind sentinel defaults such as `""` when
`undefined` or `null` already represents the absence honestly.

Defaulting to an empty string often forces downstream code to ask indirect
questions like `value.length > 0` instead of the clearer question: is the value
present?

General rule:

- Let optional values stay optional unless a real API requires a concrete
  fallback.
- Use truthiness or explicit nullish checks for optional values before passing
  them to APIs that require a string.
- Do not add plan-B defaults that make missing data look like present-but-empty
  data.
- If absence is a meaningful state, preserve it in the type and branch on it
  directly.

Example:

- A dashboard `primaryBranch` should remain `string | undefined` when no active
  branch exists, and callsites should check `primaryBranch` before building
  branch-specific routes or controls.

## Prefer Named Branching Helpers

Avoid long nested ternaries for rendering multiple similar states.

Nested ternaries make it hard to see the priority order and the shared shape of
each branch. In app-owned rendering code, a small named helper with early `if`
returns is usually clearer and easier to change.

General rule:

- Use a named helper when JSX branches past one or two simple cases.
- Prefer plain `if` returns when the states are ordered by priority.
- Keep the helper local until more than one real callsite needs it.
- Extract tiny shared fragments only when they remove real duplication without
  hiding the state being rendered.

Example:

- Dashboard repository refresh status should be rendered by a helper that checks
  `syncing`, `rate_limited`, `cooldown`, `failed`, then `lastSyncedAt`, rather
  than by a nested ternary inside the card props.
