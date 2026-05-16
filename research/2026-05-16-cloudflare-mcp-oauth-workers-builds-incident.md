# Cloudflare MCP OAuth Workers Builds Incident

## Document Control

- Status: Incident notes with implementation follow-up
- Owner: Noter app provisioning and provider connections
- Created: 2026-05-16
- Related:
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `specs/044_CLOUDFLARE_MCP_AUTO_TOKEN_REFRESH_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `research/2026-05-15-notermd-workers-provisioning-migration.md`
  - GitHub PR `noter-md/noter#758`
  - GitHub PR `noter-md/noter#760`

## Summary

After PR #758 moved Noter app provisioning to Cloudflare Workers Builds,
production app creation reached `ensure Cloudflare` and failed. The first
failure was caused by treating a Cloudflare MCP OAuth credential like a
Cloudflare API token. A follow-up dev test then exposed a second failure:
repeated attempts had left multiple Cloudflare Workers Build Tokens named
`noter build token`, and Noter failed closed instead of choosing a reusable
Noter-owned token.

PR #760 fixes both provisioning blockers:

1. OAuth connections skip `/user/tokens/verify` and reuse an existing Workers
   Build Token.
2. Duplicate `noter build token` rows resolve by stable UUID order so trigger
   upserts can converge without manual Cloudflare cleanup.

The development deployment `quiet-robin-508` was updated during the incident.
Live Chrome testing against `http://localhost:5173/` confirmed that a new vault
named `nicu-chiciuc/tmp-noter-cloudflare-dup` provisioned and rendered a
Cloudflare Worker dashboard link.

## Production Symptom

The reported production run completed GitHub and Convex setup, then failed in
Cloudflare:

```text
2026-05-16T13:45:52.662Z INFO  ensure Cloudflare - Ensuring Cloudflare Worker and deploy settings.
2026-05-16T13:45:57.183Z ERROR ensure Cloudflare - Provisioning failed during ensure_cloudflare.
```

The new Cloudflare MCP OAuth grant screen showed broad Cloudflare API
permissions. Granting full access did not make production provisioning succeed
before the code fix because the backend still called the API-token-only verify
endpoint.

## Issue 1: MCP OAuth Credential Rejected By API Token Verify

### Evidence

Live dev smoke against the same Cloudflare MCP OAuth credential showed:

- `/user/tokens/verify` failed with Cloudflare `1000: Invalid API Token`.
- `/workers/subdomain` succeeded.
- `/builds/tokens` succeeded.

This proved the OAuth credential could manage the Workers and Workers Builds
resources Noter needed, but could not be introspected as a Cloudflare API token.

### Root Cause

`apps/noter/convex/cloudflareResources.ts` resolved Workers Build Tokens through
`/user/tokens/verify`, then matched Cloudflare's build-token
`cloudflare_token_id` to the current API token id.

That is correct for manually supplied Cloudflare API-key connections, but wrong
for MCP OAuth connections. MCP OAuth tokens are accepted by Cloudflare API
operations through the MCP server, but `/user/tokens/verify` rejects them.

### Fix

PR #760 threaded the Cloudflare auth method into Workers provisioning:

- `api_key` connections keep the strict current-token-id lookup.
- `mcp_oauth` connections reuse an existing Workers Build Token without calling
  `/user/tokens/verify`.
- OAuth reuse prefers a token already attached to existing triggers, then a
  token named `noter build token`, then a single unambiguous token.

## Issue 2: Callback Reported "Cloudflare OAuth Exchange Failed"

### Evidence

In the development deployment, the browser landed on:

```text
https://quiet-robin-508.convex.site/oauth/cloudflare-mcp/callback?...
```

The page rendered:

```text
Cloudflare OAuth exchange failed
```

Convex logs showed state lookup and deletion, then only:

```text
cloudflare:mcp_oauth:exchange_failed
message: Failed to exchange Cloudflare OAuth code (400).
```

`oauthStates` was empty afterward because the failed callback deletes the
one-time state row.

### Root Cause Status

The exact Cloudflare token-endpoint response for that first failed callback was
not captured. The code only logged the HTTP status and discarded safe error
fields. Later Chrome testing with a fresh full-access authorization succeeded,
so this was not the final provisioning blocker.

### Fix

PR #760 added sanitized OAuth token-endpoint error formatting:

- browser callback response stays generic
- logs can include `error`, `error_description`, `message`, `detail`, or
  `statusText`
- OAuth-bearing query values and long token-like strings are redacted before
  logging

This keeps future OAuth exchange failures debuggable without writing codes,
tokens, or state values into durable logs.

## Issue 3: Duplicate Workers Build Tokens Named `noter build token`

### Evidence

After Cloudflare OAuth connected successfully in development, creating a new
vault failed with:

```text
Cloudflare setup failed. Last failure: ensure Cloudflare: Cloudflare has multiple Workers build tokens named "noter build token". Keep one and retry.
```

The failed test vault was:

```text
nicu-chiciuc/tmp-worker-dev-001
```

Its visible provisioning log reached `ensure Cloudflare`, then failed on build
token selection. The provider panel showed Cloudflare connected, valid, and
refreshable, so the remaining blocker was not OAuth connection health.

### Root Cause

Prior failed or retried provisioning attempts can leave more than one Cloudflare
Workers Build Token with Noter's standard name. The selector treated multiple
Noter-named tokens as an operator cleanup problem and failed closed.

Cloudflare's Workers Build Tokens list response exposes:

- `build_token_name`
- `build_token_uuid`
- `cloudflare_token_id`
- `owner_type`

It does not expose a creation timestamp that would let Noter choose "newest."
The relevant Cloudflare API reference is:
`https://developers.cloudflare.com/api/resources/workers_builds/subresources/tokens/`

### Fix

PR #760 changed the selector to choose by stable UUID order when:

- multiple preferred trigger-attached tokens exist
- multiple Noter-named tokens exist
- multiple current API-token-backed tokens exist

For MCP OAuth, duplicate `noter build token` rows now converge by selecting one
stable UUID. The subsequent trigger upserts bind production and preview triggers
to the selected token.

The selector still fails when OAuth sees multiple generic tokens and none are
already preferred or Noter-named. That case is intentionally ambiguous.

## Live Validation

Validated from the primary local checkout against the development Convex
deployment and real Chrome/OAuth session:

```bash
./node_modules/.bin/vp test convex/cloudflareResources.test.ts convex/cloudflareMcpOAuth.test.ts convex/infraProvisioning.test.ts
./node_modules/.bin/tsgo --noEmit
pnpm exec convex dev --once --typecheck=disable --tail-logs=disable
```

Chrome live test:

1. Opened `http://localhost:5173/`.
2. Confirmed GitHub and Convex provider connections were present.
3. Completed Cloudflare MCP OAuth with full access.
4. Confirmed the provider panel reported Cloudflare connected and token valid.
5. Created `nicu-chiciuc/tmp-noter-cloudflare-dup`.
6. Confirmed the vault completed setup and rendered a Cloudflare Worker
   dashboard link.

The older `nicu-chiciuc/tmp-worker-dev-001` vault still shows its historical
duplicate-token failure. That is expected; it failed before the development
deployment received the selector fix.

## Operational Notes

- Do not log Cloudflare OAuth codes, state values, access tokens, refresh
  tokens, or raw provider credential values.
- If future production reads are needed, run Convex commands from the primary
  checkout and clear `CONVEX_DEPLOY_KEY` so `--prod` is not silently overridden.
- Repeated app provisioning attempts can leave Cloudflare-side Workers Build
  Tokens behind. Noter should converge known Noter-named duplicates rather than
  asking the operator to clean them up manually.
- If Cloudflare later adds a creation timestamp to the build-token list
  response, revisit stable UUID selection and consider preferring the newest
  Noter-named token.
