# 029 Authenticated Providers Route Spec

## Document Control

- Status: Accepted
- Owner: Noter auth + platform, vault dashboard
- Last updated: 2026-05-29
- Related specs:
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/036_MCP_CONNECTION_TOKEN_HEALTH_VISIBILITY_SPEC.md`
  - `specs/044_CLOUDFLARE_MCP_AUTO_TOKEN_REFRESH_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`

## Summary

Provider management moves out of the dashboard accordion and into its own authenticated `/providers`
route. The route owns user-level provider credential management for GitHub, Convex, and Cloudflare.
Provider credentials remain user-scoped in `providerConnections`.

`/home` no longer owns a Providers accordion or `providersPanelOpen` state. Vault resource
attach/create flows stay on `/home` through `add-convex` and `add-cloudflare`.

## Goals

- Add `/providers` as the authenticated surface for provider connection status and actions.
- Keep GitHub, Convex, and Cloudflare credentials in `providerConnections`, one active connection
  per (`userId`, `kind`).
- Let `/providers` own connect, disconnect, API-key, OAuth, and Cloudflare MCP token-health actions.
- Remove the dashboard Providers accordion and its persisted open/closed state.
- Keep vault resource attach/create flows on `/home`.

## Non-Goals

- Do not change app login providers or the provider credential data model.
- Do not move vault resource identity into `providerConnections`.
- Do not move Convex deployment or Cloudflare Worker attach/create dialogs to `/providers`.
- Do not add a new dashboard settings table for provider visibility.

## Route Contract

`/providers` is protected by the normal authenticated app route guard. An unauthenticated user
cannot manage provider connections there.

The route shows the current user's provider rows:

1. GitHub: connected state, auth method, metadata, connect, disconnect, and API-key/OAuth entry
   points.
2. Convex: connected state, auth method, team metadata, connect, disconnect, and API-key/OAuth entry
   points.
3. Cloudflare: connected state, auth method, account/default-account metadata, connect, disconnect,
   API-key/MCP OAuth entry points, token-health status, reconnect guidance, manual health check, and
   auto-refresh status.

Provider OAuth start and callback flows may return users to `/providers` when the user initiated the
flow from that route.

The route uses the shared app workspace chrome and the standard right sidebar. Navigation back to
`/home` is provided by the shared route/meta links instead of a route-specific top control.

## Data Contract

`providerConnections` remains the durable source of truth for provider credentials and metadata. The
route reads the existing provider status queries and invokes the existing provider connection
mutations/actions; it does not introduce a route-owned credential store.

The dashboard must not persist provider visibility with `providersPanelOpen`. If an old
`dashboardSettings.providersPanelOpen` implementation exists, the `/providers` route does not read
or write it, and dashboard cleanup should remove that state when touching the old panel code.

## `/home` Dashboard Contract

`/home` owns vault lists, vault resource rows, and resource attach/create dialogs. It may link to
`/providers` when a provider connection is required, but it does not render a provider-management
accordion.

The existing vault resource routes stay on `/home`:

1. `/home?add-convex#vault-name` opens the Convex project/deployment attach or create dialog.
2. `/home?add-cloudflare#vault-name` opens the Cloudflare Worker attach or create dialog.

Those flows can require a connected provider credential, but they attach resources to a vault. They
do not create, disconnect, or health-check provider credentials inline.

## Acceptance Criteria

1. `/providers` is the only primary in-app surface for managing provider credentials.
2. GitHub, Convex, and Cloudflare credentials remain user-scoped in `providerConnections`.
3. Cloudflare MCP token health and auto-refresh UI live on `/providers`.
4. `/home` does not own `providersPanelOpen`, a Providers accordion, or provider visibility
   persistence.
5. `/home?add-convex#vault-name` and `/home?add-cloudflare#vault-name` continue to own vault
   resource attach/create flows.
6. `/providers` has the standard right sidebar, including the shared `/home` route/meta link.
