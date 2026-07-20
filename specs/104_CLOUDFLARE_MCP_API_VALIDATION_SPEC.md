# 104 Cloudflare MCP API Validation Spec

Status: Accepted

## Problem

Samebase can call Cloudflare through two transports. Legacy `mcp_oauth` connections use Cloudflare
MCP, where the MCP server accepts that credential and executes `cloudflare.request()` on Samebase's
behalf. Standard Cloudflare OAuth app and API-key connections use direct `api.cloudflare.com` REST
requests with bearer tokens. Direct Cloudflare REST token introspection can reject `mcp_oauth`
credentials as invalid API tokens, so the transport choice is part of the auth-method contract.

Current Cloudflare provisioning code still treats each request as an untyped string path and then
reads provider JSON with fallback helpers. That leaves the Workers and Workers Builds boundary
weaker than the Convex Management API boundary: TypeScript cannot reject misspelled paths, missing
path parameters, invalid request bodies, or changed response fields before feature code reads them.

## Decision

Use Cloudflare's OpenAPI schema as the contract source while making the Cloudflare transport
explicit at the typed request boundary:

1. Generate a checked-in OpenAPI subset for the Cloudflare API families Samebase currently owns, not
   only the exact endpoints called today. Do not generate the full Cloudflare schema into the app
   boundary because unrelated products can break generation and would add unused contract weight.
2. Generate TypeScript declarations from that subset with `openapi-typescript`. Type generation
   should preserve OpenAPI read/write markers so request bodies exclude response-only fields.
   Type-only normalization may loosen empty request-body object fragments that Cloudflare composes
   into otherwise valid schemas when the raw composition would produce an impossible TypeScript
   input type; response validation still uses the unmodified generated subset.
3. Generate standalone AJV validators for successful JSON responses from that subset so Convex code
   imports generated validators instead of compiling AJV schemas at runtime.
4. Expose one typed Cloudflare request helper that accepts literal OpenAPI path templates, typed
   `params.path` / `params.query`, and typed request bodies.
5. The helper formats the typed path and query into a concrete Cloudflare API path, sends that path
   through the explicit transport selected by the Cloudflare auth method, validates the provider
   envelope and success payload, then returns the typed `result` value to feature code.
6. `oauth` and `api_key` use direct `api.cloudflare.com` fetches. `mcp_oauth` calls must remain on
   the Cloudflare MCP transport.
7. Feature code should stop parsing Cloudflare provider records with `asRecord`, `readString`, and
   similar fallback readers for endpoints covered by the generated subset. Missing required provider
   fields should fail closed at the typed boundary.

## Initial API Family Scope

The initial subset covers the Cloudflare API families Samebase currently owns:

1. `/accounts/{account_id}/workers...` for Workers, Worker Script, Worker Subdomain, Worker
   versions, Worker deployments, Worker routes/domains, and adjacent account-scoped Workers APIs.
2. `/accounts/{account_id}/builds...` for Workers Builds repository connections, build tokens,
   triggers, environment variables, builds, logs, and deploy hooks.
3. `/accounts` for account inventory.
4. `/user/tokens/verify` for seeded API-token introspection.

Generation should select these families by stable path prefixes or equivalent OpenAPI grouping
metadata. It should not require a hand-maintained list of each individual operation. If Cloudflare
adds a new endpoint inside one of these families, the generated subset drift check should surface
that addition.

## Acceptance Criteria

- Cloudflare provisioning callsites pass literal OpenAPI path templates and typed params instead of
  interpolated API paths.
- Covered Cloudflare responses are validated before feature code reads them.
- The typed Cloudflare request helper requires an explicit transport; no callsite may rely on an
  implicit MCP default.
- `oauth` and `api_key` use direct REST transport and `mcp_oauth` remains MCP-only transport.
- Cloudflare schema drift can be checked by regenerating the family subset, generated types, and
  standalone validators, including new endpoints added inside selected families.
- Existing Workers provisioning, status, logs, inventory, and deletion behavior stays unchanged
  except for earlier failures on invalid provider shapes.
