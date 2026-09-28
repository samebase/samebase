# 103 Convex API Validation Spec

Status: Accepted

## Problem

Samebase currently treats Convex Platform API responses as `unknown` and then tries to discover
fields with fallback helpers such as `resolveField`, `readString`, and `readStringOrNumber`. That
makes the provider boundary weak: the app cannot tell whether Convex changed a response, whether
Samebase guessed the wrong shape, or whether a missing field is a real product state.

The concrete bug is the Convex team slug. OAuth and API-key connection flows can resolve the team id
from `/v1/token_details`, but the published token-details schema does not include `teamSlug`. The
team slug is available from Management API project reads, especially `/v1/teams/{team_id}/projects`.

## Research

Convex publishes the Management API OpenAPI document at <https://api.convex.dev/v1/openapi.json>.
The Management API documentation links to that API family at
<https://docs.convex.dev/management-api>.

The OAuth application docs define `/oauth/token` separately at
<https://docs.convex.dev/platform-apis/oauth-applications>. That endpoint is not present in the
Management API OpenAPI document. Discovery probes for a separate OAuth OpenAPI or
authorization-server metadata document returned no usable JSON schema.

The official `@convex-dev/platform` package is generated from Convex platform OpenAPI specs and
confirms the same split: Management API types include `/token_details`, project, deployment, and
deploy-key endpoints, but not `/oauth/token`.

Generator and validator checks:

- `openapi-typescript` produces strong TypeScript types from the Convex Management API document
  without adding runtime dependencies.
- AJV 2020 compiles validators directly against the Convex OpenAPI 3.1 schemas and rejects missing
  required fields for the response schemas Samebase uses.
- Zod JSON-schema conversion did not reliably resolve OpenAPI `$ref`s in a quick probe.
- Higher-level client generators added more machinery than Samebase needs or weakened some schema
  constraints.
- `openapi-fetch` provides the desired client contract: callsites pass literal OpenAPI path
  templates and grouped `params.path` / `params.query` values so TypeScript can reject misspelled
  paths, wrong methods, missing path params, and invalid request bodies before runtime. Samebase
  uses it with the generated `paths` type while keeping Samebase-owned error shaping and AJV runtime
  response validation.
- The OpenAPI `int64` format can be represented as a JSON number or string, but JavaScript cannot
  safely represent every `int64` as a `number`. Convex provider IDs are opaque to Samebase, so
  `AccessTokenId`, `CustomRoleId`, `ProjectId`, `TeamId`, `DeploymentId`, and `MemberId` must be
  preserved as decimal strings at the app boundary. Non-ID numeric fields, such as timestamps,
  remain numbers and must fail closed if Convex returns a value outside JavaScript's safe numeric
  range.

## Decision

Samebase pins Convex Management API validation to the published OpenAPI schema:

1. Store the Convex Management API OpenAPI document as a generated JSON drift sentinel. App code
   must not import it at runtime.
2. Store generated TypeScript declarations derived from that document.
3. Generate TypeScript declarations with `openapi-typescript` transform hooks that map the Convex ID
   schemas Samebase consumes to decimal strings. The checked-in OpenAPI document remains the
   upstream drift sentinel; generated app types model Samebase's lossless provider boundary.
4. Generate standalone AJV validators from a Samebase-normalized copy of the fetched document for
   every Convex Management API response Samebase consumes. The normalization keeps the same upstream
   schema except for the Convex ID schemas that Samebase treats as decimal strings. Convex imports
   the generated validators, not AJV itself, because the Convex runtime disallows string-code
   generation.
5. Expose a typed Convex Management client instead of a generic
   `request(path, method, body): Promise<unknown>` escape hatch. Internal requests must go through
   `openapi-fetch` with literal OpenAPI path templates such as `/teams/{team_id}/projects`, an
   allowed method for that path, and typed `params.path` / `params.query` objects derived from the
   generated `paths` interface. Paginated endpoints must follow the returned cursor until complete.
   `openapi-fetch` is responsible for path/query serialization; feature callsites must not build
   interpolated Management API URLs.
6. Generate per-endpoint decimal ID response paths from the same OpenAPI response schemas used for
   AJV validation. Parse successful Convex Management API JSON responses as text with a lossless
   JSON parser before validation, normalize only those generated schema paths to decimal strings,
   and convert all other numeric fields to JavaScript numbers only when the conversion is safe.
   Property names alone are not authoritative; arbitrary metadata fields named `id` or `teamId`
   remain normal numbers unless their schema path resolves to a Convex ID schema. If a future
   OpenAPI response schema uses the same structural path as both a Convex ID and a non-ID number,
   generation fails instead of guessing at runtime.
7. Validate `/oauth/token` with a small local Zod schema because it is outside the Management API
   spec and has no OpenAPI document in this integration. Its response contract is exactly the
   documented `{ access_token, token_type: "bearer" }` shape; extra fields are logged by field name
   and ignored so schema drift is visible without leaking token values or failing an otherwise-valid
   OAuth exchange. Its request body, HTTP method, content type, URL, and response parser are modeled
   together as an explicit endpoint contract.
8. Keep generated AJV validator exports prefixed with `ajv`, reserving the `v` prefix for Convex
   `convex/values` validators.
9. Keep the Convex platform API boundary together under `apps/samebase/convex/convexManagementApi/`:
   the typed client, shared errors, OAuth token contract, generated OpenAPI JSON, generated
   TypeScript declarations, generated standalone validators, and focused tests.
10. Use `pnpm --dir apps/samebase run verify:convex-management-api` to regenerate the pinned
    document, generated declarations, and standalone validators and fail if Convex's published
    OpenAPI schema drifted from the checked-in contract. Keep newly published provider values
    readable without automatically adding user-facing choices. New UI choices require confirmed
    availability in the Convex dashboard.
11. Keep compile-time tests alongside the client tests for the OpenAPI call surface. They must prove
    that provider IDs are decimal strings, required path params stay required, wrong methods are
    rejected, and the management client cannot be constructed without a token.

The typed client is the only app code that may parse Convex Management API response payloads.
Feature code should consume typed results and fail closed when a required provider field is missing.

## Team Slug

`/v1/token_details` returns the token owner id and token metadata. It does not return a team slug.
Team slug discovery must happen after a Management API project read that returns
`ProjectResponse.teamSlug`.

Provisioning should persist `teamSlug` once it has a project list response for the connected team.
Connection status may temporarily lack `teamSlug` until a project read has occurred.

## Acceptance Criteria

- No Convex Management API callsite reads raw provider records with fallback field-name guesses.
- Convex Management API response shapes are validated before feature code reads them.
- Validation errors identify the endpoint and schema without logging secrets or full provider
  payloads.
- OAuth token exchange is validated explicitly and documented as separate from the Management API
  schema.
- The obsolete generic Convex provider wrapper is removed once callsites use the typed client.
