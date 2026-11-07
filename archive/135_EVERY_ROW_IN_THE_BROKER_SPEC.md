# RFC 135: Every row and every rule in the broker; the hub holds no table

Status: Superseded by [RFC 137](../rfcs/137_ONE_HUB_MODEL_SPEC.md), which restates what stays and
amends this one: the hub supplies decisions as code. Historical: decided 2026-11-06. Builds on
RFC 134. Reviewed by Codex (data model) before the build.

## Decision

`@samebase/identity-broker` holds every table and every rule of a hub: the OpenID Provider, client
registration at `POST /hub-clients` with the GitHub Actions proof and the laptop path with the app's
initial access token, blocks with their reasons and history, rate limits, and the moderation API at
`/moderation/*`. A hub (`apps/identity-hub`) holds no table. It is configuration: connectors, API
resources, env names, keys, the cron, and the Alchemy stack. That folder is the template.

GitHub-first: the GitHub Actions proof is plain code in the package, one section of
`src/client/hubClients.ts` whose output is GitHub's ids. No proof option until a second proof
exists. A host with another proof can still call `registration.register` with
`newClientCredentials`.

Out of scope, for a later "connect to a different hub" RFC: the GitHub OIDC audience (the constant
`samebase` on both sides) and the `terms` literal that alchemy-convex checks. Both stay as they are.

## Why

- The broker alone had no door: a host had to write its own registration (the hub's `hubClients.ts`,
  818 lines) to add a client safely, so the listed component was not usable alone.
- Five hub tables copied broker rows and added one field each, and one feature was spread over three
  places: the switch in the broker, the reason in the hub, the page on samebase.com.
- A copy of the hub must get the same caps, expiry, blocks, history, and moderation without copying
  code, and later user moderation must exist in every copy, with its scope check next to the data.

## Tables (component)

| Table                 | What                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients`             | + `app` (the stack's name) and `registeredBy` (who made it, with the owner of that moment). Replaces the hub's `registrations` for live clients.                                                                 |
| `blocks`              | Moved from the hub, + `at`. The one block state: registration, renewal, sign-in, code exchange, and provider refresh read it. Replaces `tenants.disconnected` and `blockedOwners`.                               |
| `events`              | Append-only. `registration` (one per client made, outlives it: the day and week counts, and whether an owner is new) and `block_change`. Replaces `audit_block_events` and the hub's `registrations` as history. |
| `initialAccessTokens` | Moved, without `productionClientId`, which nothing read.                                                                                                                                                         |
| `rateLimits`          | Moved unchanged: 30 per repository, 100 per owner, 50 new owners per hour.                                                                                                                                       |

The rules move unchanged, with the same two transactions around the verification fetch: `admit`
(blocks, then the windows; a refusal counts nothing) and the creating mutation (blocks again,
`app_taken`, the caps and eviction, the client, the event, the token replacement on a production run
and the deletion of a transferred repository's tokens). Field names stay GitHub's, so the moderation
answers and samebase.com's admin page do not change.

## Config

```ts
registration: {
  ownRepositoryIds: () => env.OWN_REPOSITORY_IDS,
  thirdPartyConnector: "google-apps",
  paused: () => env.THIRD_PARTY_PAUSED === "true",
  moderationKey: () => env.HUB_MODERATION_KEY,
  terms: "https://samebase.com/terms",
}
```

## Migration: a short freeze, two PRs

The hub has no outside user: its writers are our apps' deploys, a few test repositories, and one
admin. So the move uses a freeze of about ten minutes, not a mirroring layer that would be deleted
afterwards. Production on 2026-11-06: 51 registrations (21 live clients), 8 initial access tokens,
no blocks, no block events, 12 rate limit rows.

1. Set `THIRD_PARTY_PAUSED=true` on the hub's production deployment.
2. Merge PR A (broker 0.19.0): the new tables, the package's routes, the hub's own routes and
   writers removed, the new client fields optional for this one release, and the one-time import.
3. When the hub's deploy is done, run `npx convex run --prod migration:importHubRows` from
   `apps/identity-hub`. Check: every client has `registeredBy`, 8 tokens, 51 registration events.
4. Unset the pause.

The merge also deploys samebase.com, which is one of the hub's own repositories, so the pause does
not stop it. Its deploy renews its saved clients and makes none. If an own app did register in
between, its client already has its record and its event, and the import keeps the token that run
made, not the hub's older one.

Between the deploy and the import: samebase.com's admin page cannot list the clients (a client
without `registeredBy` fails the list), a laptop with an initial access token gets
`401 invalid_token`, and every saved client renews and signs in as before. Rate limit windows are
not copied: third-party registration is paused.

Done on 2026-11-06 with PR A (v2284): the import filled 25 clients and copied 8 tokens and 59
registration events, each equal to the hub's old rows; the pause was on for about fifteen minutes.

Then PR B (broker 0.20.0): `app` and `registeredBy` required; `tenants.disconnected`, the import,
and the hub's `schema.ts` and `migration.ts` deleted. The hub has no schema, and the data of its
five old tables is cleared after the deploy.

## Later RFCs

- User moderation: a developer sees and deletes the clients of the repositories they administer,
  checked in the package.
- A different hub: the OIDC audience, the terms check, and the template docs.
