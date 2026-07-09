# Code Guardrails

Canonical full wording of the repo code guardrails. `AGENTS.md` carries the always-loaded one-line
form of every rule; this file holds the complete versions with rationale and examples. When the two
disagree, this file wins — update both in the same change.

## Type safety

Type-safety always matters, but the goal is not "zero `any` at any cost" — it is that the types tell
the truth and the code reads like the mental model of the business logic. TypeScript is a tool for
reaching the goal, not a barrier to route around; "enterprise TypeScript" ceremony that muddies the
meaning of the code is its own failure. Where the type system genuinely cannot express something,
the gap must be explicit, searchable, and quarantined — hiding a type gap is strictly worse than
declaring one.

- Never use `any` or type assertions. `as const` is always acceptable when preserving literal
  inference — it asserts nothing unsafe. There is no approved use for any other assertion: a type
  assertion is never the right tool for anything except hiding a type issue. Where you would reach
  for `as`, use the narrowest `@ts-expect-error` with the runtime fact instead. Assertions hide in
  plain sight: they keep "working" long after they stop being true, and nothing flags them for
  review.
- When unsafety is unavoidable, declare it with the narrowest possible `@ts-expect-error` plus a
  comment stating the runtime fact that makes the line safe. Never use `@ts-nocheck`.
  `@ts-expect-error` is preferred precisely because it is trivially greppable and because it errors
  loudly the day the suppression stops being necessary. The house style is
  `packages/dependent/src/object.ts`:

  ```ts
  export function entries<Obj extends object>(value: Obj): Array<ObjectEntry<Obj>> {
    // @ts-expect-error Object.entries returns the same entries with weaker types.
    return Object.entries(value);
  }
  ```

- Rare exception, held rare: in deeply generic type-level code, `unknown` and `never` sometimes
  cannot express a constraint — the canonical cases are matching arbitrary function types
  (`T extends (...args: any) => infer COutput`) and variance-sensitive inference slots
  (`Sure<unknown, unknown, any>`), both throughout `packages/sure/src`. There `any` is the honest
  option and `@ts-expect-error` is the wrong tool (suppressing inside generics breaks inference
  instead of marking a gap). Mark it with an `eslint-disable-next-line` for
  `typescript-eslint/no-explicit-any` (which is an `error` repo-wide) plus a short reason, on the
  exact offending line. That is the default shape of every lint exception in this repo; when a
  single rule genuinely saturates a file, lift that rule to one file-top `eslint-disable` header
  with the same reason, keeping sparse rules line-level. Saturation is a density judgement, not a
  count — a few hits in a large file stay line-level; a compact type-level or scratch file where the
  rule applies throughout takes a header. Never a config-level exemption (`-A` flags, rule
  overrides) — the disable lives in the file it excuses, greppable and validated by
  `--report-unused-disable-directives`. Sole exception: machine-generated files, which cannot carry
  disables, get a config override. Roughly 90% of generic code still needs no `any` — reach for
  `unknown`/`never` first, every time.
- Do not launder type gaps through cleverness. Overload signatures the implementation cannot prove,
  `as unknown as` chains, intermediate `unknown` variables, and "flexible" generics that quietly
  erase a type all hide unsafety instead of declaring it — each is worse than a visible
  `@ts-expect-error`. Overloads are welcome when they refine a truth the implementation actually
  guarantees (the length-preserving `map`/`atLeast`/`exactly` in `packages/dependent/src/main.ts`,
  the OpenAPI clients in `apps/samebase/convex/*Api/client.ts`); they are forbidden as a costume for
  types the code cannot earn.

  A local annotation can launder the same gap when the expression is already `any`. For example,
  Convex Auth currently types the `jwt.customClaims` callback with `GenericQueryCtx<AnyDataModel>`,
  so `ctx.db.get("users", userId)` does not carry Samebase's generated `Doc<"users">` type. Do not
  write:

  ```ts
  // BAD: the annotation hides that the library boundary erased the schema.
  const user: Doc<"users"> | null = await ctx.db.get("users", userId);
  ```

  Instead, make the erased boundary explicit and earn every field read:

  ```ts
  const user: unknown = await ctx.db.get("users", userId);
  return buildAuthTokenProfileCustomClaims(user); // validates before reading fields
  ```

  If the boundary can be wrapped in a truly typed API, do that once with a concrete runtime proof.
  Otherwise prefer `unknown` plus validation over a comforting local annotation.

- When a real TS limitation keeps muddying business code, absorb the technicality in a tiny shared
  wrapper with an honest outer signature and the `@ts-expect-error` contained inside — `includes()`,
  `keys()`, `entries()`, `fromEntries()`, `pick()` in `@samebase/dependent` are the canonical
  shapes: callers read like the mental model, and the gap lives in one audited line. `packages/sure`
  is this philosophy taken to its extreme (inference-first APIs, slot types, unsafety concentrated
  at a few composition points) — read it when in doubt. Counter-rule: this is a small, stable
  vocabulary of generic primitives with short names in shared modules whose path carries the
  context; it is not a license to sprawl one-line app-code functions with long names that fragment
  the logic a reader is trying to follow. If a wrapper's name says less than the expression it
  wraps, inline it.
- Beware "disconnected type safety" — the subtlest laundering, because a real runtime check sits
  right next to it. A hand-written `value is T` predicate (or explicit return-type annotation) that
  restates what a validator already proves creates an unchecked seam: TypeScript trusts the `is T`
  claim without verifying it against the body, so when the schema evolves, the predicate keeps
  narrowing to the stale shape and nothing errors anywhere — the type system reports safety that no
  longer exists. Type predicates are unsafe by default: assertion-lite, to be kept rare, tiny, and
  audited (`notEmpty`, `includes`). Prefer the connected path where everything is inferred and drift
  cannot hide:

  ```ts
  const vault = object({ id: string(), branch: string() });

  // BAD — disconnected: the hand-written predicate target restates what the
  // schema already knows. Add `owner: string()` to the schema and this still
  // narrows to the stale two-field shape, with no error anywhere.
  function isVault(value: unknown): value is { id: string; branch: string } {
    return vault(value)[0];
  }

  // GOOD — connected: the schema's own result narrows; one source of truth.
  const [ok, parsed] = vault(input);
  if (ok) {
    // parsed is inferred from the schema — schema changes propagate here
  }
  ```

  A good predicate needs two things at once: complete type safety (the claim is checked, so it
  cannot drift) and visibility (the guarded type is readable at the definition). Derive reusable
  predicates with `guard` in `@samebase/dependent`, written generics-first so both types stay
  visible without spelling the null failure channel —
  `guard<Input, Target>((value) => (cond ? value : null))`; the callback returns the received value
  where control flow narrowed it, or null to reject — see `isConnectedVault` in
  `apps/samebase/convex/vault/state.ts`. Returning the un-narrowed input is a compile error and the
  factory identity-checks the result at runtime, so the `value is` claim is earned, never asserted,
  while the annotated callback keeps the guarded type visible.

  Where a sure schema already proves the shape, do not wrap it in a predicate at all — let the
  validator's own `[ok, value]` result narrow at the call site. (A schema-derived guard factory in
  the Effect `Schema.is` shape was prototyped and dropped for having no callsites; the pattern is
  recorded in `research/2026-06-12-guardby-prior-art.md` if a reusable schema-guard need appears.)

  For one-off local boolean checks, no annotation also stays connected: since TS 5.5 the predicate
  is inferred from the body (single return statement that refines the parameter), so there is no
  claim to drift — but the guarded type is invisible at the definition, so prefer the derived forms
  for anything exported or reused.

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
- Never add runtime statements whose only job is appeasing the type checker — presence checks like
  `key in object`, redundant guards, `hasOwnProperty` ceremony. If the types are wrong, declare the
  gap (`@ts-expect-error` with the runtime fact) instead of laundering it through runtime code. Keep
  a presence check only when own-key presence is real runtime state (an explicit `undefined` clear
  vs a missing key).

## UI behavior

- On mobile-first chat or prompt surfaces, Enter must not send by default. Require an explicit send
  action and treat accidental Enter-to-send on mobile as a product bug. (ChatInput is currently a
  hidden experiment; this applies to any future shipped chat surface.)
- For pane rails that should feel nearly flush, prefer `px-1` over `px-0` so the content keeps a
  small nonzero inset without reading as padded — ideally encoded once in the shared workspace
  layout shell rather than per page.

## All other guardrails

- Prefer inference when it keeps the code clear. Do not restate local variable types when the
  expression is already strongly typed unless the annotation changes the contract, clarifies
  object-spread shape composition, or prevents a real widening problem.
- For generic function members on object types, prefer function-valued property syntax when method
  semantics are not part of the contract:

  ```ts
  type Runner = {
    run: <Task extends FunctionReference<"mutation">>(
      task: Task,
      ...args: OptionalRestArgs<Task>
    ) => Promise<FunctionReturnType<Task>>;
  };
  ```

  Prefer that over `run<Task extends ...>(...): ...` for callback slots and context subsets. The two
  shapes are often interchangeable for Samebase's small structural context types, but VS Code's
  TextMate grammar can lose syntax-highlighting scope after complex generic method signatures. Keep
  method syntax when the type intentionally models method-specific assignability, overloads, or
  `this` behavior.

- For discriminated union variants, put the discriminant property first in each object shape so the
  variant is immediately visible when reading the type.
- When passing inline validators to `pure(...)` or `sure(...)`, omit redundant `unknown` parameter
  annotations; let the helper infer the input type unless a narrower input is intentional.
- When a schema exists, derive the TypeScript type from it instead of duplicating a manual type.
- Before adding a helper, formatter, wrapper, class, or generated artifact, ask whether the final
  design still needs it. Delete-first is the default. Keep the native library value or error shape
  unless a production caller needs a different shape; do not add branches or adapters whose outputs
  are equivalent to the simpler expression. This includes helper factories parameterized for a
  single callsite — keep the direct function until multiple shipped callsites prove configurability.
- When changing or defending a helper, trace every production call site and read the tests that name
  the helper before keeping it. A helper with one production call site is guilty until proven
  useful: inline it unless its name carries a non-obvious domain invariant or it quarantines a real
  boundary. Tests that only assert the helper's obvious input/output wrapper are deletion evidence,
  not coverage evidence; move the useful assertion to the caller behavior or delete the test with
  the helper.
- Do not add custom Error subclasses unless production code catches that exact class, branches on
  structured fields, or the error type is part of an existing module contract. Tests should not be
  the reason an error class exists.
- Generated files must only contain output derived from the named source of truth. Do not put
  hand-authored schemas, local endpoint contracts, or convenience types into generated output.
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
- Comments document the current contract or invariant, in the code's own concrete vocabulary
  (`draftPath`, `expectedRouteAddress` — never invented labels), naming the concrete runtime case
  over abstract ownership language. Never narrate the patch ('moved from X'), and never delete,
  reword, or normalize user-authored comments — preserve their wording exactly. JSDoc for functions
  with non-obvious ownership or timing; multiline JSDoc may use plain interior lines without leading
  `*` (easier to copy). Example:

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
- In modules whose state movement is explicitly modeled (hand-curated VMs and state machines — e.g.
  the route URL editor VM), effects, `MutationObserver`, subscriptions, and DOM polling need even
  stronger proof: first show why the state cannot move through an existing event, route value, prop,
  cache subscription, or caller-owned boundary; if a feature is only a nice-to-have suggestion, drop
  or narrow it instead of adding reactive machinery.
- Prefer truthiness checks for typed flags whose domain is already `true | undefined`; use
  `=== true` only when the distinction from other truthy values is part of the logic.
- When the runtime meaning is that a value exists, write an existence check. Avoid exact
  `!== undefined`, `!== null`, or `typeof value === "string"` checks unless the exact missing value,
  runtime type, empty string, or union discriminator is the state being modeled.
- When filtering nullable arrays, use the shared `notEmpty` type predicate from
  `@samebase/dependent` instead of inline Boolean type predicates.
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
- Fail closed rather than inventing placeholder fallbacks unless the patch is implementing a real
  migration.
- Do not add same-name re-export shim files or one-line pass-through modules that only re-export
  another module. Update imports directly and delete these wrappers when found; they pollute the
  tree and break editor navigation when tracing real implementations.
- `URLSearchParams` is lint-warned (deliberately warn, not error) so app search defaults to typed
  route objects while OAuth/external-URL/fixture/test callsites stay native and visible; the lint
  message itself states the policy at each callsite.
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
