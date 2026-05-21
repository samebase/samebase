# 2026-05-21 Hey API OpenAPI Validation Spike

Status: rejected for the production request layer

## Goal

Evaluate whether Hey API can replace the current `openapi-fetch` plus generated AJV response
validator setup for third-party OpenAPI clients.

The desired outcome is not AJV compatibility. AJV was introduced because the previous pass could not
find a simpler response-validation path. Removing AJV is a positive result if the replacement
preserves the actual provider-boundary invariants.

## Actual Invariant

Provider IDs must never become incorrect IDs because JavaScript parsed an OpenAPI `int64` JSON
number that cannot be faithfully represented as a `number`.

Acceptable outcomes:

- the provider returns IDs as JSON strings and generated runtime validators enforce decimal strings;
- generated code rejects numeric ID responses before feature code can use them;
- a custom client/parser hook parses raw response text losslessly before runtime validation.

Unacceptable outcome:

- ordinary `JSON.parse` reads an unsafe numeric ID, a validator coerces it, and feature code
  receives the already-corrupted value.

Compatibility with numeric ID responses is not itself the invariant. If a provider currently returns
numeric IDs and we intentionally support that wire shape, the implementation must parse those
responses losslessly before validation. If the provider can return strings or we choose to fail
closed, rejecting numeric IDs is acceptable.

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
- parser patches that turn selected OpenAPI schemas, such as `TeamId` and `ProjectId`, into
  decimal-string schemas before code generation.

The spike uses this shape:

- input: the checked-in Convex Management OpenAPI document;
- operations: `GET /token_details` and `GET /teams/{team_id}/list_projects`;
- schema patch: Convex ID schemas become `type: "string"` with `pattern: "^[0-9]+$"`;
- validator: SDK response validation via generated Zod schemas.

The generated Zod schemas reject numeric IDs after that patch. This is good for the core invariant
because a numeric unsafe ID cannot slip through as a bad string.

Important remaining concern: the stock generated fetch client still parses JSON responses with
normal `JSON.parse` before running `responseValidator`. That is fine if ID schemas reject numeric
IDs or the provider returns string IDs. It is not enough if we decide to accept numeric `int64` IDs
and preserve their exact digits.

Non-ID `int64` fields also need a decision. Hey API's generated Zod currently uses
`z.coerce.bigint()` for unpatched `int64` fields, but the generated client does not use the parsed
Zod result as the returned data. If a non-ID `int64` matters and may exceed JavaScript's safe
numeric range, we need either a lossless parser hook, a schema patch, or a deliberate fail-closed
rule for that field too.

## Decision Update

Do not continue replacing the Convex Management API boundary with Hey API's generated SDK or raw
fetch client.

Hey API solved one part of the problem: it can generate Zod response schemas and can wire those
schemas into generated SDK calls. It did not solve the request interface we need for provider APIs.

The required production shape is a single stateless function whose callsites show the provider
contract directly:

```ts
await requestConvexManagementApi(convexToken, {
  method: "GET",
  url: "/teams/{team_id}/list_projects",
  path: { team_id },
});
```

The caller should not hold a provider client object such as
`createConvexManagementApi(convexToken)`, and callsites should not move behind named wrappers such
as `listProjects(...)` or `createDeployment(...)`. The method, path, path params, query params, and
body should remain visible where the provider call happens.

Hey API's built-in outputs split those properties across two different surfaces:

- The generated SDK is typed and can validate responses, but its documented shape is a high-level
  API layer with typed functions or methods per operation. That hides the HTTP method and path
  behind generated operation names. Source: https://heyapi.dev/docs/openapi/typescript/plugins/sdk
- The raw fetch client keeps an HTTP-shaped request surface, but it is not operation-indexed. In the
  generated client, `RequestOptions` accepts `body?: unknown`, `path?: Record<string, unknown>`,
  `query?: Record<string, unknown>`, and `url: string`. A caller can provide a type argument, but
  method plus URL do not infer the required path/query/body or the response validator. Local
  evidence: `apps/noter/convex/convexManagementApi/generated/client/types.gen.ts`.
- Hey's own fetch-client docs describe `buildUrl()` as loosely typed unless the caller passes a type
  hint. That matches the generated output and means the raw client is not the transparent,
  operation-aware function we need. Source: https://heyapi.dev/docs/openapi/typescript/clients/fetch
- Validator plugins generate schemas, and SDK validation wires those schemas into SDK functions.
  When bypassing the SDK to preserve explicit method/path callsites, there is no generated operation
  map that automatically selects the matching request and response validators for a
  `{ method, url }` pair. Sources: https://heyapi.dev/docs/openapi/typescript/validators and
  https://heyapi.dev/docs/openapi/typescript/plugins/zod

The rejected wrapper attempt confirmed the mismatch. To recover the desired interface on top of Hey
API, we had to manually write overloads and a switch that mapped each endpoint to its generated SDK
function. That recreated the exact maintenance burden the migration was supposed to delete: every
new provider endpoint would require editing our wrapper layer, and discoverability would move away
from the literal OpenAPI path.

## Why This Is Not A Good Fit

Hey API is still a good generator for projects that want generated SDK operation functions. It is
not a good fit for this boundary because our highest priority is not a nicer SDK. Our priority is a
transparent provider call that is simultaneously:

- stateless from the caller's perspective;
- keyed by literal HTTP method and OpenAPI path;
- typed for that exact operation's params/body/result;
- response-validated without a manually maintained registry;
- reusable for Convex now and likely Cloudflare later.

The Hey API path can satisfy either the SDK/validation side or the transparent HTTP-callsite side,
but not both at once without custom generated glue. If we need that glue, Hey API is no longer
simplifying the core design; it becomes an implementation detail behind our own generator.

## Viable Paths After Revert

1. Keep the existing transparent request abstraction and improve the current generator/validator
   setup only where it hurts.
2. Generate our own operation-indexed map from the OpenAPI source of truth. That map would own the
   method/path/request/response/validator relationship and expose one function. Hey API could still
   be evaluated as a schema emitter behind that map, but the important interface would be ours.
3. Evaluate a different OpenAPI client whose primary abstraction is already path/method-based. It
   still must provide response validation or expose enough generated metadata for us to attach
   validators without hand-maintained endpoint lists.

The next production change should revert the Hey API SDK migration. Keeping this spike as research
is useful because it records that the failure was not Zod, Valibot, or Ajv preference; the failure
was the mismatch between Hey API's generated SDK abstraction and our explicit provider-call
invariant.

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

## Remaining Follow-Up

Use this spike as negative evidence before choosing a new production path:

1. Check the real provider wire shape for ID fields without logging values.
2. If IDs are strings, prefer a simpler fail-closed validator path, but do not reintroduce Hey API's
   generated SDK call shape.
3. If IDs are numeric and must be accepted, preserve the exact raw digits before runtime validation.
4. Repeat the same interface check against Cloudflare's OpenAPI surface before building a Cloudflare
   adapter around any new generator.
