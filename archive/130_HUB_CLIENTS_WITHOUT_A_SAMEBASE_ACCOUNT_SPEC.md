# 130 The hub registers apps itself, without a Samebase account

## Document Control

- Status: Done. PR 1, the new path, shipped in v2259. PR 2, the old path removed, ships in v2261.
- Owner: Nicu Chiciuc
- Created: 2026-11-04
- Follows RFC 129, which made a repository prove its host with `/samebase-verification.json`.
- Rewritten on 2026-11-04 after two reviews and a research report, then amended after a third review
  of the rewrite (`reports/hub-rules-placement.md`, outside the repository). The first version kept
  the rules in samebase.com and sent each block to the hub; every problem the reviews found came
  from that.

## Summary

Today an app's deploy asks samebase.com for a Google sign-in client. samebase.com checks GitHub's
token, the verification file, the Samebase account, and the limits, then asks the hub to create the
client. The rules live in samebase.com and the clients live in the hub.

After this RFC the deploy asks the hub directly. The hub checks GitHub's token, the verification
file, the limits, and the blocks, records the registration, and creates the client. No Samebase
account is needed. samebase.com keeps an admin page that reads the hub's records and sets blocks
through a key that can do nothing else.

What this means for a real person:

- Someone forks or copies `samebase/base`, sets `CONVEX_ACCESS_TOKEN` and `CONVEX_TEAM_ID`, and
  pushes. The first deploy has Sign in with Google. They never visit samebase.com.
- Nicu opens the admin page on samebase.com, sees which repositories registered and who deployed
  them, and blocks a repository or a GitHub owner. A block stops new clients and sign-ins at once.

## What moves where

**Into the hub app (`apps/identity-hub`).**

- A new endpoint `POST https://auth.samebase.com/hub-clients`, which does what
  `apps/samebase/convex/hubClients/registration.ts` does today, minus the account check: verify
  GitHub's token, read the verification file with the same rules (https on a DNS name, no redirects,
  5 seconds, 4 KiB), count the limits, check the blocks, record the registration, and create the
  client through the broker component in the same mutation as the record.
- Tables: `registrations` (as `hubClientRegistrations` today: client id, repository id and name,
  owner id, actor id and login, commit, stage, app, return address), `blocks` (by repository id or
  by owner id, with a reason and who set it), and `requestWindows` (the hourly counts).
- Limits per hour: 30 per repository, 100 per owner, and 50 new owners across the whole hub. A new
  owner is one with no registration yet, counted once.
- `app` is at most 64 characters.

**Blocks live in the hub, as two switches.**

- A repository block uses the broker's tenant switch (`disconnected`), which the hub sets locally.
  The broker gets a local setter that raises the stored revision itself, so the hub never has to
  count revisions, and samebase.com's old remote writer is gone before the first block.
- An owner block is one row. The broker gets a generic owner switch: each tenant records the owner
  id it was registered under, and the broker refuses a client whose tenant is disconnected,
  suspended, or whose owner is blocked, on registration, renewal, sign-in start, and code exchange.
  Blocking an owner therefore touches no repository rows, has no size limit, and stops every client
  of that owner at once.
- The operator's manual suspension (`setTenantSuspended`) stays separate; no block or unblock
  changes it.
- Every block and unblock appends an audit row: who, when, what, and the reason. Unblocking deletes
  the block but keeps its audit rows.
- The registration endpoint checks both blocks twice: before the file fetch, and again in the final
  mutation that creates the client and its record, so a block set during the fetch still applies.

**The hub stops accepting the shared registration key.** The broker gets a management-only mode:
each client keeps reading and deleting its own record with its own token (renewals do not change),
the third-party pause (`THIRD_PARTY_PAUSED`) keeps working, and `POST /register`,
`/tenant-connection`, and the discovery entry `registration_endpoint` are gone. The new endpoint
checks the pause itself, because the component's `register` does not.

**Out of samebase.com.** The endpoint `/api/hub-clients`, the tables `hubClientRateLimits`,
`hubClientRegistrations`, and `hubClientConnectionRevisions`, the tenant switch it sends when a
repository connects or leaves, and `HUB_REGISTRATION_KEY`. Leaving Samebase no longer stops Google
sign-in. samebase.com keeps its own first-party `HUB_*` and `RESOURCE_HUB_*` variables, and CI keeps
its no-hub values, with the moderation key off in CI.

**The admin page on samebase.com.** `/admin/hub-clients`, for admins only, as the other admin pages.
It calls admin endpoints on the hub with a new key, `HUB_MODERATION_KEY`, set on both deployments by
hand once, compared by hash and refused when empty. The key can only: list registrations (newest
first, paginated), return counts for the last day and week, list blocks and their audit rows, and
block or unblock a repository or an owner with a reason. No answer holds a client secret or a
registration token. Counts read at most a fixed number of rows and say "at least" when they reach
it. A ranking of owners is left for later. samebase.com never holds a hub deploy key, the signing
keys, the salt, or provider grants for this.

**The package and the starter.** `Convex.SharedHubClient` sends its request to `<hub>/hub-clients`,
where `<hub>` is `HUB_URL` or `https://auth.samebase.com`; `SAMEBASE_URL` goes away. The new reply
carries the terms link, which the resource logs once. This is a new release of
`@samebase/alchemy-convex`, then `samebase/base` updates to it.

## Terms and privacy

Both pages get a short section about the shared sign-in service, written in the pull request and
approved by Nicu before merge:

- Terms: what apps may use it for, and that Samebase may block a repository or an owner at any time.
  A new client's deploy log shows the terms link, which the hub returns with the client.
- Privacy: for people who sign in to such an app, the hub passes their name, email, whether the
  email is verified, picture, and a per-app id to the app; it keeps sign-in records for 90 days and
  registration records with the developer's GitHub repository, login, and commit. Samebase controls
  the hub's records; each app's developer controls what their app receives. People reach Samebase at
  the contact email.

The landing page and the docs pages that say leaving Samebase stops Google sign-in, or that Google
sign-in needs a connected repository, change in the same pull request.

## Decisions

Taken by Nicu on 2026-11-04:

1. The rules move into the hub; the hub stays its own Convex deployment.
2. The hub stays in the same Convex team. A separate team costs another subscription.
3. The admin page stays on samebase.com and uses a key that can only read registrations and set
   blocks.
4. No special handling for repository transfers or for clients registered before v2252. The
   registered apps are almost all Nicu's own. A transferred repository is only re-checked at its
   next new client.
5. Limits: 30 per repository, 100 per owner, 50 new owners per hour.

## Order of work

Two pull requests in the monorepo, so nothing is lost between them:

1. **PR 1, the new path next to the old one.** The hub gets the endpoint, its tables, the owner
   switch, the management-only mode (not yet switched on), the moderation endpoints, and a one-time
   import of samebase.com's `hubClientRegistrations` rows with their original times. samebase.com
   gets the admin page. `@samebase/alchemy-convex` points to the hub. samebase.com's old endpoint
   still works, so old starter versions keep registering.
2. **Between the PRs.** Set `HUB_MODERATION_KEY` on both deployments. The admin page then shows
   registrations, but the hub refuses blocks while it still takes the shared registration key
   (`REGISTRATION_ACCESS_TOKEN`): until then samebase.com's old endpoint registers clients with no
   owner, and its tenant switch could undo a repository block. Check on the hub's runtime that a
   redirecting host and a private-address host are refused. Update `samebase/base` to the new
   package. Wait until samebase.com has no tenant switch workflow still retrying (they retry for up
   to about 34 hours).
3. **PR 2, the old path removed.** First remove `REGISTRATION_ACCESS_TOKEN` from the hub, which
   closes the old path and turns blocks on; then run the import of samebase.com's registration
   records, which is now final, and compare the counts; then merge. samebase.com loses its endpoint,
   tables, tenant switch, and registration key; the hub switches to the management-only mode; the
   terms, privacy, landing page, and docs change. Tenants that samebase.com disconnected because
   they left Samebase are switched back on, unless blocked; manual suspensions stay.

## Validation

- Hub tests: a registration with no Samebase account succeeds; a blocked repository and a blocked
  owner are refused before the file is fetched; blocking an owner switches off each recorded
  repository and unblocking switches back on only those with no other block; the limits count per
  repository, per owner, and per new owner; `app` over 64 characters is refused; the shared key no
  longer creates a client; the moderation key cannot create clients.
- samebase.com tests: the admin functions refuse non-admins; the page lists registrations and blocks
  through the moderation key.
- Live: a repository made from `samebase/base` under a second GitHub account, with no Samebase
  account, gets Google sign-in on its first deploy, shows on the admin page, and loses new sign-ins
  when its owner is blocked.

## Checklist for the build

- Hub: add `jose` and `convex-helpers` as dependencies, declare `HUB_MODERATION_KEY`, register its
  tests in the root test project, and test against the real broker component, not a fetch stub, for
  the atomic create and the switches.
- samebase.com, PR 2: `schema.ts`, `http.ts`, `repository/records.ts`, `repository/deletion/runs.ts`
  and `cleanup.ts`, `accountDeletion/cleanup.ts`, `organizations.ts`, their tests
  (`removal.convex.test.ts`, `organizationAdmin.convex.test.ts`, `hubClients/`), and regenerated API
  files.
- Docs: `packages/alchemy-convex/README.md` (`HUB_URL`), `apps/identity-hub/README.md`,
  `LandingPreviewPage.tsx` and its test, `docs-do-it-yourself.md`, `docs-the-big-migration.md`, the
  starter README in `samebase/base`, the starter manifest, and the changelogs.

## Not in this RFC

- The page before Google that names the repository and the return site, with an admin switch to
  force it. After this RFC the hub holds everything it needs.
- A separate Convex team for the hub.
- Sign-in counts per app on the admin page.
