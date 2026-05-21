# 2026-05-21 Hey API OpenAPI Validation Spike

Status: exploratory

## Goal

Evaluate whether Hey API can replace the current `openapi-fetch` plus generated
AJV response validator setup for third-party OpenAPI clients.

The desired outcome is not AJV compatibility. AJV was introduced because the
previous pass could not find a simpler response-validation path. Removing AJV is
a positive result if the replacement preserves the actual provider-boundary
invariants.

## Actual Invariant

Provider IDs must never become incorrect IDs because JavaScript parsed an
OpenAPI `int64` JSON number that cannot be faithfully represented as a `number`.

Acceptable outcomes:

- the provider returns IDs as JSON strings and generated runtime validators
  enforce decimal strings;
- generated code rejects numeric ID responses before feature code can use them;
- a custom client/parser hook parses raw response text losslessly before runtime
  validation.

Unacceptable outcome:

- ordinary `JSON.parse` reads an unsafe numeric ID, a validator coerces it, and
  feature code receives the already-corrupted value.

Compatibility with numeric ID responses is not itself the invariant. If a
provider currently returns numeric IDs and we intentionally support that wire
shape, the implementation must parse those responses losslessly before
validation. If the provider can return strings or we choose to fail closed,
rejecting numeric IDs is acceptable.

## Hey API Findings

Current docs:

- SDK plugin: https://heyapi.dev/docs/openapi/typescript/plugins/sdk
- Zod plugin: https://heyapi.dev/docs/openapi/typescript/plugins/zod
- validators overview: https://heyapi.dev/docs/openapi/typescript/validators
- fetch client: https://heyapi.dev/docs/openapi/typescript/clients/fetch

Hey API can generate:

- typed SDK functions from OpenAPI operations;
- generated Zod response schemas;
- SDK functions that pass `responseValidator` to the generated client;
- parser patches that turn selected OpenAPI schemas, such as `TeamId` and
  `ProjectId`, into decimal-string schemas before code generation.

The spike uses this shape:

- input: the checked-in Convex Management OpenAPI document;
- operations: `GET /token_details` and `GET /teams/{team_id}/list_projects`;
- schema patch: Convex ID schemas become `type: "string"` with
  `pattern: "^[0-9]+$"`;
- validator: SDK response validation via generated Zod schemas.

The generated Zod schemas reject numeric IDs after that patch. This is good for
the core invariant because a numeric unsafe ID cannot slip through as a bad
string.

Important remaining concern: the stock generated fetch client still parses JSON
responses with normal `JSON.parse` before running `responseValidator`. That is
fine if ID schemas reject numeric IDs or the provider returns string IDs. It is
not enough if we decide to accept numeric `int64` IDs and preserve their exact
digits.

Non-ID `int64` fields also need a decision. Hey API's generated Zod currently
uses `z.coerce.bigint()` for unpatched `int64` fields, but the generated client
does not use the parsed Zod result as the returned data. If a non-ID `int64`
matters and may exceed JavaScript's safe numeric range, we need either a
lossless parser hook, a schema patch, or a deliberate fail-closed rule for that
field too.

## Repro Script

Run:

```bash
pnpm --dir apps/noter run evaluate:hey-api-convex-management
```

The script writes ignored generated output under:

```text
apps/noter/.tmp/hey-api-convex-management-api/client
```

It verifies that:

- Hey API generated SDK functions with response validators;
- patched Convex ID schemas generated string regex validators;
- valid string ID payloads pass generated Zod validation;
- numeric ID payloads fail generated Zod validation;
- the generated fetch client still uses normal `JSON.parse` before validation.

## Next Evaluation

Use this spike before choosing the production path:

1. Check the real provider wire shape for ID fields without logging values.
2. If IDs are strings, Hey API plus schema patches can likely replace the AJV
   validator map.
3. If IDs are numeric and must be accepted, test whether Hey API's custom client
   hooks can parse raw response text losslessly before calling generated
   validators.
4. Repeat the same check against Cloudflare's OpenAPI surface before building a
   Cloudflare adapter around a new generator.
