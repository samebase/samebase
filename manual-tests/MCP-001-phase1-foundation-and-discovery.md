# MCP-001 Phase 1 Foundation And Discovery

## Goal

Validate metadata discovery, dynamic client registration, and authorize request
validation for the Convex-hosted MCP OAuth provider.

## Prerequisites

- Run worktree bootstrap: `make anon`
- Use local Convex site URL: `http://127.0.0.1:11327`

## Steps

1. Verify protected-resource metadata:
   - `curl -sS http://127.0.0.1:11327/.well-known/oauth-protected-resource`
2. Verify authorization-server metadata:
   - `curl -sS http://127.0.0.1:11327/.well-known/oauth-authorization-server`
3. Register a dynamic client:
   - `curl -sS -X POST http://127.0.0.1:11327/oauth/mcp/register -H 'content-type: application/json' --data '{"redirect_uris":["https://example.com/callback"],"token_endpoint_auth_method":"none","response_types":["code"],"grant_types":["authorization_code","refresh_token"]}'`
4. Hit authorize with missing parameters:
   - `curl -i "http://127.0.0.1:11327/oauth/mcp/authorize"`

## Expected

1. Both metadata endpoints return `200` JSON.
2. Registration returns `201` with `client_id`.
3. Invalid authorize request returns `400` with `error=invalid_request`.
