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

- `openapi-typescript` produces strong TypeScript types from the Convex
  Management API document without adding runtime dependencies.
- AJV 2020 compiles validators directly against the Convex OpenAPI 3.1 schemas
  and rejects missing required fields for the response schemas Noter uses.
- Zod JSON-schema conversion did not reliably resolve OpenAPI `$ref`s in a quick
  probe.
- Higher-level client generators added more machinery than Noter needs or
  weakened some schema constraints.

## Decision

Noter pins Convex Management API validation to the published OpenAPI schema:

1. Store the Convex Management API OpenAPI document in generated source.
2. Store generated TypeScript types derived from that document.
3. Generate standalone AJV validators from the pinned document for every Convex
   Management API response Noter consumes. Convex imports the generated
   validators, not AJV itself, because the Convex runtime disallows string-code
   generation.
4. Expose a typed Convex Management client instead of a generic
   `request(path, method, body): Promise<unknown>` escape hatch.
5. Validate `/oauth/token` with a small local JSON Schema because it is outside
   the Management API spec. Its response contract is exactly the documented
   `{ access_token, token_type: "bearer" }` shape; extra fields are logged by
   field name and ignored so schema drift is visible without leaking token
   values or failing an otherwise-valid OAuth exchange. Its request body, HTTP
   method, content type, URL, and response parser are modeled together as an
   explicit endpoint contract.
6. Keep generated AJV validator exports prefixed with `ajv`, reserving the `v`
   prefix for Convex `convex/values` validators.
7. Keep the Convex platform API boundary together under
   `apps/noter/convex/convexManagementApi/`: the typed client, shared errors,
   OAuth token contract, generated OpenAPI document, generated TypeScript types,
   generated standalone validators, and focused tests.
8. Use `pnpm --dir apps/noter run verify:convex-management-api` to regenerate
   the pinned document, generated types, and standalone validators and fail if
   Convex's published OpenAPI schema drifted from the checked-in contract.

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
- The obsolete generic Convex provider wrapper is removed once callsites use the
  typed client.
