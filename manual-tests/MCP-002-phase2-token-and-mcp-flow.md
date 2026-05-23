# MCP-002 Phase 2 Token And MCP Flow

## Goal

Validate token and protected MCP endpoints are present and enforce OAuth validation rules.

## Prerequisites

- Run worktree bootstrap: `pnpm dev:worktree`
- Local Convex site URL: `http://127.0.0.1:11327`
- A registered `client_id` from `MCP-001`

## Steps

1. Call token endpoint with fake refresh token:
   - `curl -i -X POST http://127.0.0.1:11327/oauth/mcp/token -H 'content-type: application/x-www-form-urlencoded' --data 'grant_type=refresh_token&client_id=<client_id>&refresh_token=fake'`
2. Call token endpoint with unknown client:
   - `curl -i -X POST http://127.0.0.1:11327/oauth/mcp/token -H 'content-type: application/x-www-form-urlencoded' --data 'grant_type=refresh_token&client_id=unknown&refresh_token=fake'`
3. Call MCP endpoint without bearer token:
   - `curl -i -X POST http://127.0.0.1:11327/mcp -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'`

## Expected

1. Token endpoint responds with OAuth JSON errors (`invalid_grant` or `invalid_client`) rather than
   `404`.
2. MCP endpoint responds `401` with `error=invalid_token` and `WWW-Authenticate` header.

## Notes

- Full authorization-code + PKCE success flow requires an authenticated Noter session for
  `/oauth/mcp/authorize`.
