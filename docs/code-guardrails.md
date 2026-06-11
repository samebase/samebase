# Code Guardrails

Canonical full wording of the repo code guardrails. `AGENTS.md` carries the always-loaded one-line
form of every rule; this file holds the complete versions with rationale and examples. When the two
disagree, this file wins — update both in the same change.

- Never use `any` or type assertions to bypass the type system. `as const` is always acceptable when
  preserving literal inference; every other assertion needs explicit user approval for that exact
  callsite.
- Do not use `Reflect.get` or `Reflect.set` as a workaround for TypeScript property access, browser
  API typing, global property writes, or object mutation. Prefer direct typed property access with a
  real narrow. If TypeScript cannot express a justified browser/API callsite, use the narrowest
  `@ts-expect-error` with a concrete explanation instead of hiding the access behind reflection.
- Do not use `globalThis` in app or test code. Use the typed runtime host directly, such as
  `window`, `global`, or a test framework global-stubbing API. If code needs to create or augment a
  global property, add or update the TypeScript declaration for that property first.
- Do not recommend assertion-based examples in chat, docs, or review comments. When narrowing
  `unknown` or provider-owned data, write real runtime guards, validators, or model changes that let
  TypeScript prove the access.
- When suppression is unavoidable, use the narrowest possible `@ts-expect-error`. Never use
  `@ts-nocheck`.
- Prefer inference when it keeps the code clear. Do not restate local variable types when the
  expression is already strongly typed unless the annotation changes the contract, clarifies
  object-spread shape composition, or prevents a real widening problem.
- For discriminated union variants, put the discriminant property first in each object shape so the
  variant is immediately visible when reading the type.
- When passing inline validators to `pure(...)` or `sure(...)`, omit redundant `unknown` parameter
  annotations; let the helper infer the input type unless a narrower input is intentional.
- When a schema exists, derive the TypeScript type from it instead of duplicating a manual type.
- Before adding a helper, formatter, wrapper, class, or generated artifact, ask whether the final
  design still needs it. Delete-first is the default. Keep the native library value or error shape
  unless a production caller needs a different shape; do not add branches or adapters whose outputs
  are equivalent to the simpler expression.
- Do not add custom Error subclasses unless production code catches that exact class, branches on
  structured fields, or the error type is part of an existing module contract. Tests should not be
  the reason an error class exists.
- Generated files must only contain output derived from the named source of truth. Do not put
  hand-authored schemas, local endpoint contracts, or convenience types into generated output.
- For hard-coded references to tracked repo files in scripts, prefer `trackedFilePath(...)` or a
  scoped wrapper such as `noterAppFilePath(...)` before using an untyped string path.
- In Convex modules, define result validators before handlers, derive types via `Infer<typeof ...>`,
  and prefer destructuring validator builders once instead of repeated `v.<fn>()` call sites.
- Reserve the leading `v` prefix for reusable Convex value validators from `convex/values`, such as
  `vProviderAuth`; name the inferred type without the prefix, such as `ProviderAuth`. Runtime
  validators from other systems use a system-specific prefix, such as `ajvPlatformProjectDetails`.
- Default to required properties and required function/mutation/action arguments. Treat every
  optional field or argument as another explicit state that must be justified by current behavior,
  data migration, external input, or patch semantics.
- Keep product state spaces as orthogonal and small as possible. When two workflows could combine
  into a large cross-product of states, first ask whether the product can forbid that interaction.
  Prefer making unsupported combinations unrepresentable through the data model and UI gates over
  adding orchestration for pause/cancel/delete cases the current product does not need.
- When modeling durable product state, put as many invariants as possible into the state shape
  itself: discriminated unions, required variant-specific fields, closed literal sets, and Convex
  validators that reject impossible rows. Use runtime transition functions only for rules that
  genuinely depend on current database contents, time, or provider responses.
- For important state models, start tests by enumerating the state axes and allowed combinations,
  and use that matrix to pressure the schema toward making impossible states impossible.
- When returning collections from queries or building user-visible lists, always choose an explicit
  deterministic sort order with stable tie-breakers.
- New or materially changed code should include concise comments that explain the constraint or
  invariant being preserved. Prefer JSDoc above functions when a function-level explanation is
  needed. Specific hooks and utilities with non-obvious ownership, timing, or synchronization
  behavior should have function-level JSDoc explaining why the indirection exists.
- Comments must use the same terminology as the code. Prefer exact type, function, event, and
  property names such as `draftPath` or `expectedRouteAddress` over invented labels; use `@see` to
  point readers at a nearby type or helper. Prefer comments that name the concrete runtime case over
  abstract ownership language, for example:
  `if durable state says "left" but this layout has no left pane, render "main"; same for "right".`
- For JSDoc above local types, props, and small config unions, write the app contract in the
  simplest direct vocabulary and preserve user-authored wording. For multiline `/** ... */`
  comments, prefer plain interior lines without leading `*` prefixes. Example:

  ```ts
  /**
  all = shows sidebar toggle on mobile an desktop
  
  desktop = shows sidebar toggle on desktop only
  
  hidden = hides sidebar toggle on both desktop and mobile
  */
  type WorkspaceLayoutV2ToggleVisibility = "all" | "desktop" | "hidden";
  ```

- Avoid `"use node"` unless the module truly requires it.
- Treat every `useEffect` and `useLayoutEffect` as something to justify. Check whether the behavior
  belongs in a route lifecycle such as `beforeLoad`, a data/cache API, an event handler, derived
  render state, or CSS. Collapse duplicate effects that share the same trigger/concern.
- In carefully curated state machines such as the route URL editor VM, put an even bigger question
  mark on effects, `MutationObserver`, subscriptions, and DOM polling. First prove why the state
  cannot move through an existing event, route value, prop, cache subscription, or explicit
  caller-owned boundary; if a feature is only a nice-to-have suggestion, drop or narrow it instead
  of adding reactive machinery.
- Prefer truthiness checks for typed flags whose domain is already `true | undefined`; use
  `=== true` only when the distinction from other truthy values is part of the logic.
- When the runtime meaning is that a value exists, write an existence check. Avoid exact
  `!== undefined`, `!== null`, or `typeof value === "string"` checks unless the exact missing value,
  runtime type, empty string, or union discriminator is the state being modeled.
- When filtering nullable arrays, use the shared `notEmpty` type predicate from
  `@noter-md/dependent` instead of inline Boolean type predicates.
- Treat repeated optional chaining on the same value as a correctness smell. If logic reads a
  maybe-null object more than once, narrow it once with an explicit missing-value branch, then use
  direct access. Keep `?.` only for one-off maybe-reads whose missing case is genuinely equivalent
  to absence.
- Prefer direct conditions over intermediate variables when the expression is already easy to read.
  Do not add `!!` coercions, named booleans, helper wrappers, or provider splits just to look more
  engineered; add a name only when it makes confusing logic clearer.
- When business logic is tangled with generic mechanics (picking keys, mapping entries, reshaping
  values), separate the two. Prefer a small typed utility in the right shared module, then delete
  any one-off wrapper that no longer earns its place.
- Before keeping a helper, validator wrapper, adapter, custom error shape, or mirror type introduced
  by a patch, run a delete-first reduction pass. If its main job is renaming, copying, unwrapping,
  reshaping, filtering, or re-reporting something a library already returns in a usable form, remove
  it unless it protects a real current invariant such as secret redaction or unsafe I/O isolation.
- For runtime validation and parsing, prefer one source-of-truth schema and derive the TypeScript
  type from it. Do not duplicate field lists, hand-write parallel response types, add strict
  companion schemas, translate validator issues, or walk unknown keys the validator already handles.
  After replacing one validation approach with another, run the same reduction pass on the new code;
  do not preserve the old approach's helper shape or naming out of inertia.
- Treat generated validation glue as a carrying cost, not a default win, but do not replace broad
  OpenAPI-derived coverage with hand-written schemas just to reduce generated files. Keep the
  generator path when it protects a broad current API surface or prevents real drift from a
  source-of-truth spec; narrow it when a non-generated boundary was merely bolted on.
- When tests pressure production code into adding a mapper, branch, helper, or named intermediate
  value solely to make assertions prettier, simplify the test instead. Assert app behavior directly;
  for diagnostics prefer the upstream library's own issue payload over a normalized shape.
- Let focused module paths carry generic utility context (prefer `pick` from an object module over
  prefixing every export), and avoid broad barrel exports that erase that context. Do not add barrel
  files for app code.
- Do not add speculative helpers, flags, env vars, allowlist entries, compatibility paths, or config
  surface that the current patch does not use end to end. Keep config surfaces minimal and current.
- When cleanup or migration work makes a direct native API viable, delete the temporary adapter
  instead of keeping a near-equivalent wrapper or reshaped mirror around it.
- For app-internal refactors, prefer delete-first changes over compatibility-preserving patches.
  When a shared abstraction owns the wrong responsibility, remove or narrow it and update all
  current callsites instead of adding pass-through props, transitional wrappers, or shims. Backwards
  compatibility for app-internal components is a non-goal unless the user asks for it.
- If a transitional helper, adapter, or mirror object ends up unused outside tests, delete it. Do
  not keep dead migration scaffolding, test-only production helpers, incomplete extractions, or
  wrappers that no longer pull their weight.
- Avoid parameterized local helper factories when a helper has one current callsite and can read the
  needed local constants directly.
- Remove property-presence checks such as `key in object` when they only exist to appease
  TypeScript. Keep them only when own-key presence is real runtime state. Prefer the simple
  `key in object` form unless prototype safety is a proven issue for that object.
- Fail closed rather than inventing placeholder fallbacks unless the patch is implementing a real
  migration.
- Do not add same-name re-export shim files or one-line pass-through modules that only re-export
  another module. Update imports directly and delete these wrappers when found; they pollute the
  tree and break editor navigation when tracing real implementations.
- `URLSearchParams` is globally warned by lint so app search defaults to typed route objects and
  route-specific helpers. Intentional protocol boundaries such as OAuth, external URLs,
  parser/serializer helpers, fixtures, and tests can stay native while warning output keeps those
  callsites visible.
- For app-owned components, default to closed styling APIs. Do not add pass-through styling props
  such as `className`, `bodyClassName`, or `headerClassName` unless a current shipped callsite truly
  needs them. When a shared component's styling standard stops fitting, change the component's
  standard directly instead of threading more override props through the tree.
- For shared layout chrome, standardize structure and behavior rather than inventing semantic
  content sub-APIs like `title`, `meta`, `leading`, or `trailing` unless the product truly needs one
  shared content pattern.
- Do not construct Tailwind or CSS class names dynamically. Map state to full literal class strings.
- Default app-internal navigation to SPA navigation through TanStack Router `Link` or `navigate`.
  Plain anchors are for external URLs, downloads, or deliberate document reloads only; if an
  internal action keeps an `href` for copy/open-in-new-tab behavior, ordinary left-clicks must still
  route through the SPA path.
