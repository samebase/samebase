---
name: typed-product-engineering
description:
  Engineer typed product applications with strict runtime boundaries and delete-first refactoring.
  Use when changing TypeScript or similarly typed app code that involves schema-derived types,
  validators, generated API clients, provider payloads, state models, route/server state, UI
  abstractions, effects, or tests that pressure production code shape.
---

# Typed Product Engineering

Use this for typed product code where model shape, runtime validation, UI state, and tests can
accidentally make impossible states possible.

## Type And Validation Boundaries

- Do not use `any`, broad assertions, or assertion-based examples to bypass the type system.
- Derive TypeScript types from the runtime schema, validator, or generated source of truth when one
  exists.
- Keep broad generated validation when it protects a broad current provider or OpenAPI surface from
  drift.
- Prefer a direct hand-written schema for tiny, hand-documented boundaries that are outside the
  generated source's real contract.
- After replacing one validation approach with another, run a reduction pass again. Delete old
  mappers, issue normalizers, field extractors, strict companion schemas, or mirror types unless a
  current caller still needs the shape.
- Keep upstream library value and error shapes unless production code needs a different shape for a
  current invariant such as redaction, unsafe I/O isolation, or multiple shipped callsites.

## Refactoring Discipline

- Prefer delete-first refactors for app-internal code. Remove or narrow the wrong abstraction and
  update current callsites instead of preserving compatibility shims.
- Do not keep adapters, wrappers, generated glue, custom error classes, or helper factories whose
  main job is renaming, copying, unwrapping, or re-reporting a usable native value.
- Keep a helper or branch when deleting it forces unsafe indexing, `never` collapse, duplicated
  validation, or assertions at the proof boundary.
- Do not add production helpers solely to make tests prettier. Assert behavior directly, and for
  diagnostics match upstream issue payloads when they are adequate.
- Use negative type tests when reducing a typed request facade could accidentally permit invalid
  params, bodies, methods, response shapes, or route states.

## Product State And UI

- Model durable state with required fields, discriminated variants, closed literal sets, and
  validators that reject impossible rows.
- Default properties and function arguments to required; make optionality earn its place through
  persisted data, external input, migration, or patch semantics.
- Keep state axes orthogonal and small. Forbid unsupported cross-products in data shape and UI gates
  before adding orchestration for states the product does not need.
- Return collections with deterministic sort order and stable tie-breakers.
- Separate committed route/server state from local draft or interaction state.
- Treat every effect as something to justify. Prefer route lifecycle, data/cache APIs, event
  handlers, derived render state, or CSS when those owners fit.
- Preserve existing placement, keyboard, focus, touch, selection, and editor behavior unless the
  product change explicitly requires moving them.

## Research Notes

Derived from `research/2026-05-23-agent-context-pack-drafts.md` and
`research/2026-05-23-agent-context-experiment-results-4.md`.
