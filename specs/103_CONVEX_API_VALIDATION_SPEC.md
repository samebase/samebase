# 103 Convex API Validation Spec

Status: Accepted

## Problem

Samebase previously treated Convex Platform API responses as `unknown` and tried to discover fields
with fallback helpers such as `resolveField`, `readString`, and `readStringOrNumber`. That makes the
provider boundary weak: the app cannot tell whether Convex changed a response, whether Samebase
guessed the wrong shape, or whether a missing field is a real product state.

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

Current generator and validator contract:

- Hey API generates TypeScript types, endpoint methods, and Valibot request and response validators
  from the Convex Management API document. Callers use literal method/path keys and typed `path`,
  `query`, and `body` options. Each call requires an authenticated client.
- Both providers use the generated Fetch client. The Convex response interceptor parses JSON without
  losing numeric precision, converts IDs to strings, and checks other numbers before returning JSON
  for SDK validation. The SDK's second parse is exact because all remaining numbers are safe.
  Runtime code imports generated validators, with no schema compilation in Convex.
- Generator resolvers preserve composed array items and dictionary values, reject arrays where
  objects are required, and enforce finite numbers and safe integers. Schema defaults and formats
  remain annotations, as with the previous AJV boundary.
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
2. Generate TypeScript types, SDK methods, and Valibot validators with Hey API. Generate SDK methods
   for the operations used by the app. Retain component schemas for boundary validation tests.
3. Map the six Convex ID schemas to decimal strings in the generator input. The checked-in OpenAPI
   document remains unchanged; generated app types model Samebase's lossless provider boundary.
4. Validate requests and successful JSON responses with the generated Valibot validators. Do not add
   local response schemas beside the generated contract. Validation errors retain native issues
   privately. Logs contain only endpoint and schema metadata, never provider values.
5. Expose a typed Convex Management client instead of a generic
   `request(path, method, body): Promise<unknown>` escape hatch. Internal requests must go through
   generated methods such as `ConvexManagement.GET["/teams/{team_id}/projects"]`, with typed `path`
   and `query` objects. Paginated endpoints must follow the returned cursor until complete. The
   generated client serializes path and query values. The client factory trims path values and
   checks decimal path IDs before sending them. Feature callsites must not build interpolated
   Management API URLs.
6. Generate per-endpoint decimal ID response paths from the same OpenAPI response schemas used for
   generated validation. Parse successful Convex Management API JSON responses as text with a
   lossless JSON parser before validation, normalize only those generated schema paths to decimal
   strings, and convert all other numeric fields to JavaScript numbers only when the conversion is
   safe. Property names alone are not authoritative; arbitrary metadata fields named `id` or
   `teamId` remain normal numbers unless their schema path resolves to a Convex ID schema. If a
   future OpenAPI response schema uses the same structural path as both a Convex ID and a non-ID
   number, generation fails instead of guessing at runtime.
7. Validate `/oauth/token` with a small local Zod schema because it is outside the Management API
   spec and has no OpenAPI document in this integration. Its response contract is exactly the
   documented `{ access_token, token_type: "bearer" }` shape; extra fields are logged by field name
   and ignored so schema drift is visible without leaking token values or failing an otherwise-valid
   OAuth exchange. Its request body, HTTP method, content type, URL, and response parser are modeled
   together as an explicit endpoint contract.
8. Keep generated validator names as emitted by Hey API. Authored Convex modules reserve the local
   `v` binding for `convex/values` validators.
9. Keep the Convex platform API boundary together under `apps/samebase/convex/convexManagementApi/`:
   the typed client, shared errors, OAuth token contract, generated OpenAPI JSON, generated
   TypeScript SDK and validators, decimal-path metadata, and focused tests.
10. Use `pnpm --dir apps/samebase run verify:convex-management-api` to regenerate the pinned
    document, generated SDK, validators, and decimal-path metadata and fail if Convex's published
    OpenAPI schema drifted from the checked-in contract. Keep newly published provider values
    readable without automatically adding user-facing choices. New UI choices require confirmed
    availability in the Convex dashboard.
11. Keep compile-time tests alongside the client tests for the OpenAPI call surface. They must prove
    that provider IDs are decimal strings, required path params stay required, wrong methods are
    rejected, and the management client cannot be constructed without a token. Runtime tests cover
    concurrent lossless parsing, native HTTP errors, request auditing before fetch, no automatic
    retries, and the timeout during both fetch and response body reading.

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
