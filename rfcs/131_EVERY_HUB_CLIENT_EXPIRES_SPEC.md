# 131 Every hub client expires the same way

## Document Control

- Status: Proposal, reviewed. Codex reviewed the first version on 2026-11-04; the backfill and the
  Remove button were dropped, and use of the resource client now renews it.
- Owner: Nicu Chiciuc
- Created: 2026-11-04
- Base: `origin/main` at v2261 (RFC 130 shipped).

## Summary

The identity hub keeps one client for each deployment that can sign people in. Clients of
third-party apps expire: a preview client is deleted 14 days after its last deploy or sign-in. The
clients of the team's own apps (samebase.com, Bristol, ailegis, trailscout) never expire, so dead
worktree and preview clients pile up. On 2026-11-04, 21 of 53 clients were dead and removed by hand.

After this RFC every preview and development client expires 14 days after its last deploy, dev
start, or sign-in, whoever registered it. Production clients never expire; an admin removes a dead
one by hand from the admin page.

## Facts

- `registerClient`, the hub's internal function for first-party clients
  (`packages/identity-broker/src/client/index.ts`), creates a client with no `removeAt` and returns
  no registration token.
- `Convex.HubClient` (`packages/alchemy-convex/src/HubClient.ts`) reconciles by returning its saved
  output whenever the props match, without asking the hub; `delete` unregisters the client.
- `registerDevelopmentClient` (`alchemy-convex hub-client`, run by the worktree setup through
  `hub:client` and `hub:resource-client`) keeps the deployment's variables when all three exist,
  without asking the hub.
- A successful sign-in already moves `removeAt` 14 days forward when the client has one
  (`component/authRequests.ts`). The daily cleanup deletes clients past `removeAt`
  (`component/lifecycle.ts`).
- Consumers today: samebase.com and the hub on @samebase/alchemy-convex 0.23.0, ailegis on 0.20.0,
  Bristol and trailscout on 0.17.0. A consumer that only trusts its saved state would keep a deleted
  client forever.

## Target

1. **Any use renews.** A successful sign-in already moves `removeAt` 14 days forward. A successful
   resource authorization and a provider token refresh do the same, so samebase.com's resource
   client, whose provider grants are tied to its client ID, never expires while it is used.
2. **Broker.** A new internal function `renewClient({ clientId, expires })` answers whether the
   client exists, sets `renewedAt`, and moves `removeAt` 14 days forward. With `expires: true`, a
   preview or development client that has no `removeAt` gets one: this is how a client starts to
   expire. Production never gets one. `registerClient` takes the same optional `expires`; leaving it
   out means `false`, so older callers are unchanged.
3. **`Convex.HubClient`.** Its `diff` always answers "update", as `Convex.SharedHubClient` does, so
   every deploy reaches `reconcile`. There it calls `renewClient` with `expires: true`; if the
   client is gone, it registers a new one with `expires: true`, and the new values reach the
   deployment's variables in the same run. Its `delete` leaves production clients alone, as
   `Convex.SharedHubClient` does: a destroy can leave a production deployment running.
4. **Development clients.** `registerDevelopmentClient` renews the client named by the existing
   variables, with `expires: true`. If the hub no longer has it, it registers a new one and
   overwrites the three variables in one `env set --force`. The worktree start runs both client
   commands on every start, not only in the one-time setup.
5. **No backfill.** A client starts to expire the first time an upgraded caller renews it. A client
   that no upgraded caller ever renews keeps no deadline, and is removed by hand with
   `identityBroker:deleteClient` when it is dead, as on 2026-11-04.
6. **Admin page.** Each client row shows its client ID, its full return address, and when it
   expires, or "never".

## Order of work

1. One PR: the broker changes, `Convex.HubClient` and `registerDevelopmentClient`, the worktree
   start, a new @samebase/alchemy-convex release, and the admin page columns. The hub deploys
   `renewClient` with the merge.
2. Upgrade samebase.com, ailegis, Bristol, and trailscout to the new package. Each deploy then
   starts the expiry of its preview clients, and each worktree start that of its development
   clients.

## Decisions

- Previews and development: 14 days after the last deploy, dev start, sign-in, resource
  authorization, or provider refresh. Production: never expires.
- A closed pull request still deletes its preview client through the stack's destroy, as today.
- A forgotten preview that loses its client gets a new one on its next deploy.
- No Remove button: the moderation key stays unable to delete clients. Dead production clients are
  removed by hand.

## Validation

- Broker tests: `expires` sets `removeAt` only for preview and development; leaving it out sets
  none; `renewClient` moves it and answers false for a missing client; a sign-in, a resource
  authorization, and a provider refresh move it; cleanup deletes a client past it.
- alchemy-convex tests: a full plan and apply with unchanged props renews; one after the client is
  gone registers a new one and writes its values; a destroy keeps a production client; a development
  deployment with stale variables gets a new client.
- Worktree start test: with the setup marker present, both client commands still run.
- Live: after the backfill, a worktree started within 14 days keeps its client; the admin page shows
  expiry dates; Remove deletes one client.

## Non-Goals

- One registration path for all apps (first-party apps registering through GitHub's token).
- Changing how third-party clients expire.
