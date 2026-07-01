# Vault Route Rename

## Context

The sidebar dashboard work originally mixed two concerns:

- moving the signed-in dashboard route from `/home` to `/vault`
- changing dashboard behavior so the left sidebar selects an individual vault

The route rename touches route generation, auth return URLs, URL editor fixtures, visual tests,
manifest metadata, and accepted route documentation. Keeping it separate gives the sidebar PR a
stable URL model to build on.

## Decision

`/vault` is the canonical signed-in dashboard route.

`/home` is removed. There is no redirect, alias, fallback route, or compatibility shim.

For this rename-only PR, `/vault` keeps the current dashboard behavior that `/home` had: it renders
the full vault dashboard and still uses the existing dashboard hash model. The focused
`/vault/<org>/<repo>` dashboard and the removal of dashboard hash scrolling belong to the follow-up
sidebar PR.

## Implementation Notes

- `DASHBOARD_ROUTE` now points at `/vault`.
- The dashboard root route is generated as a `/vault` index route so it does not conflict with the
  existing `/vault/$` file-view catch-all.
- The manifest `start_url`, public auth return tests, route editor examples, and route access
  metadata now use `/vault`.
- The right-sidebar primary link now reads `Vaults` and points to `/vault`.
- A router test covers that `/home?delete` is not a dashboard route.

## Left Out

- No `/vault/<org>/<repo>` dashboard route.
- No left-sidebar vault selection changes.
- No dashboard hash or scroll behavior removal.
