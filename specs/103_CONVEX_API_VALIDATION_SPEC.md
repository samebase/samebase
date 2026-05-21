# 103 Convex API Validation Spec

Status: Accepted

## Problem

Noter currently treats Convex Platform API responses as `unknown` and then tries
to discover fields with fallback helpers such as `resolveField`, `readString`,
and `readStringOrNumber`. That makes the provider boundary weak: the app cannot
tell whether Convex changed a response, whether Noter guessed the wrong shape,
or whether a missing field is a real product state.

The concrete bug is the Convex team slug. OAuth and API-key connection flows can
resolve the team id from `/v1/token_details`, but the published token-details
schema does not include `teamSlug`. The team slug is available from Management
API project reads, especially `/v1/teams/{team_id}/list_projects`.

## Research

Convex publishes the Management API OpenAPI document at
<https://api.convex.dev/v1/openapi.json>. The Management API documentation links
to that API family at <https://docs.convex.dev/management-api>.

The OAuth application docs define `/oauth/token` separately at
<https://docs.convex.dev/platform-apis/oauth-applications>. That endpoint is not
present in the Management API OpenAPI document. Discovery probes for a separate
OAuth OpenAPI or authorization-server metadata document returned no usable JSON
schema.

The official `@convex-dev/platform` package is generated from Convex platform
OpenAPI specs and confirms the same split: Management API types include
`/token_details`, project, deployment, and deploy-key endpoints, but not
`/oauth/token`.

Generator and validator checks:

- `@hey-api/openapi-ts` generates typed SDK functions, request/response types,
  path/query/body typing, and generated Zod response validators from the Convex
  Management API document.
- The SDK plugin can wire generated response validators into each generated
  operation, so Noter does not need to maintain a separate method/path validator
  map.
- A parser schema patch can map the Convex ID schemas Noter consumes to decimal
  strings before Hey API emits TypeScript and Zod output.
- The generated fetch client parses successful JSON with `JSON.parse` before
  running response validators. Because patched ID schemas require strings,
  numeric provider IDs fail closed before feature code can use a corrupted ID.
  Supporting numeric unsafe ID responses would require a custom lossless parse
  path before validation; compatibility with numeric ID responses is not a
  product invariant.
- The OpenAPI `int64` format can be represented as a JSON number or string, but
  JavaScript cannot safely represent every `int64` as a `number`. Convex
  provider IDs are opaque to Noter, so `ProjectId`, `TeamId`, `DeploymentId`,
  and `MemberId` must be preserved as decimal strings at the app boundary.
  Non-ID numeric fields, such as timestamps, remain numbers because current
  product logic treats them as millisecond timestamps.

## Decision

Noter pins Convex Management API validation to the published OpenAPI schema:

1. Store the Convex Management API OpenAPI document as a generated JSON drift
   sentinel. App code must not import it at runtime.
2. Store generated Hey API output derived from that document for the Convex
   operations Noter currently calls. The generated output includes TypeScript
   types, SDK functions, fetch client support, and Zod response schemas.
3. Generate with a Hey API parser patch that maps Convex ID schemas Noter
   consumes to decimal-string schemas. The checked-in OpenAPI document remains
   the upstream drift sentinel; generated app types model Noter's provider ID
   boundary.
4. Use the generated SDK functions through a small Noter-owned wrapper that
   supplies authorization headers, request timeout behavior, endpoint formatting
   for operator output, and Noter error shaping.
5. Do not expose a generic `request(path, method, body): Promise<unknown>`
   escape hatch. Feature code must call named Convex Management API operations.
6. Treat numeric provider ID responses as invalid. This fails closed before
   feature code can receive an ID that may already have been corrupted by normal
   JSON parsing. If a future provider contract requires accepting numeric unsafe
   IDs, add a custom lossless parse path before generated validation.
7. Validate `/oauth/token` with a small local Zod schema because it is outside
   the Management API spec and has no OpenAPI document in this integration. Its
   response contract is exactly the documented
   `{ access_token, token_type: "bearer" }` shape; extra fields are logged by
   field name and ignored so schema drift is visible without leaking token
   values or failing an otherwise-valid OAuth exchange. Its request body, HTTP
   method, content type, URL, and response parser are modeled together as an
   explicit endpoint contract.
8. Keep the Convex platform API boundary together under
   `apps/noter/convex/convexManagementApi/`: the typed client, shared errors,
   OAuth token contract, generated OpenAPI JSON, generated TypeScript SDK/schema
   output, and focused tests.
9. Use `pnpm --dir apps/noter run verify:convex-management-api` to regenerate
   the pinned document and generated Hey API output and fail if Convex's
   published OpenAPI schema drifted from the checked-in contract.
10. Keep compile-time tests alongside the client tests for the call surface.
    They must prove that required named-operation inputs stay required and that
    current response validation rejects numeric provider IDs.

The typed client is the only app code that may parse Convex Management API
response payloads. Feature code should consume typed results and fail closed
when a required provider field is missing.

## Team Slug

`/v1/token_details` returns the token owner id and token metadata. It does not
return a team slug. Team slug discovery must happen after a Management API
project read that returns `PlatformProjectDetails.teamSlug`.

Provisioning should persist `teamSlug` once it has a project list response for
the connected team. Connection status may temporarily lack `teamSlug` until a
project read has occurred.

## Acceptance Criteria

- No Convex Management API callsite reads raw provider records with fallback
  field-name guesses.
- Convex Management API response shapes are validated before feature code reads
  them.
- Validation errors identify the endpoint and schema without logging secrets or
  full provider payloads.
- OAuth token exchange is validated explicitly and documented as separate from
  the Management API schema.
- The obsolete generic Convex provider wrapper is removed.
