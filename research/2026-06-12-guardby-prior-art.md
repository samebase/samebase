# guardBy prior art: derived type predicates across the ecosystem

Web survey (2026-06-12) run before settling the predicate-factory design, answering: does an
established library already implement an earned, drift-proof type predicate, and what do the major
schema ecosystems do? Below, `guard` is the control-flow factory that shipped in
`@noter-md/dependent` (working name `guardBy`, hence this file's name); `guard(schema)` is the
schema-derived prototype that was dropped.

## Why predicates need deriving at all

- TypeScript does not verify a hand-written `value is T` against the function body. The proposal to
  check predicate bodies was closed as not planned:
  [microsoft/TypeScript#29980](https://github.com/microsoft/TypeScript/issues/29980). Dan Vanderkam:
  "TypeScript does very little to check that they're valid"
  ([The Hidden Side of Type Predicates](https://effectivetypescript.com/2024/02/27/type-guards/)).
- TS 5.5 inferred predicates
  ([microsoft/TypeScript#57465](https://github.com/microsoft/TypeScript/pull/57465)) cover only the
  inline case: no return annotation, a single return whose boolean expression refines the parameter
  directly. Inference cannot see through function calls (`(x) => checkType(x)` gets no predicate)
  and never applies to factory shapes, so it cannot replace a derived guard.
- No typescript-eslint rule flags a hand-written `value is T` as unverified.

## Schema-derived guards (the `guard(schema)` tier)

Well-established pattern; a `guard(schema)` for `@samebase/sure` was prototyped on this branch with
direct precedent:

- Effect `Schema.is(schema)` → `(u: unknown) => u is A` — the closest analogue
  ([docs](https://effect.website/docs/schema/introduction/)).
- Valibot `v.is(schema, input)` narrows to the schema output; documented to skip transformations
  ([api/is](https://valibot.dev/api/is/)).
- io-ts `codec.is` — and its documented footgun: for transforming codecs, `.is` and `.decode`
  diverge (`NumberFromString.is("1")` is false while decode succeeds),
  [gcanti/io-ts#328](https://github.com/gcanti/io-ts/issues/328).
- ArkType `type.allows` deliberately guards the pre-morph input type
  ([Type API](https://arktype.io/docs/type-api)).
- Zod has no core guard derivation (requests closed:
  [colinhacks/zod#2413](https://github.com/colinhacks/zod/issues/2413)); the community fills the gap
  with `safeParse(...).success` wrappers.

The ecosystem split (guard the input vs the decoded output) is exactly the ambiguity our "refining
schemas only" rule on `guard()` closes: a transforming schema cannot pass through it, so the io-ts
divergence cannot occur.

## Control-flow-earned guards (the `guard` tier)

No npm package or published post implements the `guard` shape — a callback typed
`(value: Value) => Narrowed | null` whose claim is earned by control-flow narrowing (returning the
un-narrowed input is a compile error) and enforced at runtime by
`value !== null && Object.is(match(value), value)`. Closest partial precedents:

- ts-pattern `isMatching(pattern)` derives `value is P.infer<pattern>` from a structural pattern
  object ([gvergnaud/ts-pattern](https://github.com/gvergnaud/ts-pattern)) — a real guard factory,
  but pattern-shaped: it cannot compose existing predicates or arbitrary control flow, and it is a
  dependency overlapping sure.
- Effect `Predicate` combinators compose existing refinements but still require hand-written `is`
  claims at the leaves
  ([Predicate docs](https://effect-ts.github.io/effect/effect/Predicate.ts.html)).

Known risks of the identity-check approach (none published as critique; covered by
`packages/dependent/test/dependent.test.ts`): a callback returning a reconstruction (`{ ...value }`)
rejects at runtime by design; a failed match on a null input would falsely succeed without the
factory's null pre-check; `Object.is` keeps a legitimate NaN match from false-negating.

## Conclusion

Ship `guard` only; there is nothing to adopt. `guard` fills a gap the ecosystem has named but not
solved — TypeScript declined to check predicate bodies, inference cannot reach factories or calls,
and the only existing factory (ts-pattern) trades control flow for pattern objects. Five lines with
tests beats a dependency.

The prototyped `guard(schema)` was dropped before merge: a census of all 75 hand-written predicates
in the repo (2026-06-12) found zero sites where a sure schema proves the shape a predicate restates
— the backend boundary belongs to Convex validators, and the route-search sure schemas are
transforming (trim), which a refining-only guard correctly refuses. Sure call sites narrow through
the validator's own `[ok, value]` result instead. If a reusable schema-derived guard is ever needed,
re-add it in the Effect `Schema.is` shape recorded above (the implementation is ~5 lines over
`InferGood`/`InferInput`, refining schemas only).
