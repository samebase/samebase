# 130 Hub clients without a Samebase account

## Document Control

- Status: Proposal, reviewed
- Reviewed on 2026-11-04 by an Opus subagent against the code. The section Review amendments
  overrides the Target where they differ.
- Owner: Nicu Chiciuc
- Created: 2026-11-04
- Base: `origin/main` at `6ca950b9d` (v2255)
- Follows RFC 129, which made a repository prove its host with `/samebase-verification.json`.

## Summary

Since RFC 129, GitHub's token proves which repository asks for a hub client, and the file proves
that the repository controls the return host. The Samebase account proves nothing more. It still
does three jobs, which this RFC moves elsewhere before the account check goes:

1. The rate limits count per Samebase repository and organization row.
2. Leaving Samebase suspends the repository at the hub, which is the only automatic off switch.
3. An account holder accepted Samebase's terms.

After this RFC, any GitHub repository whose deploy sends GitHub's token and whose host serves the
file gets a client of the public "Samebase Apps" Google client. A fork of `samebase/base` with only
`CONVEX_ACCESS_TOKEN` and `CONVEX_TEAM_ID` set has Google sign-in on its first deploy.

## Facts

From `origin/main`:

1. `admitRequest` in `apps/samebase/convex/hubClients/registration.ts` requires a live connected
   repository (`readRepositoryByGitHubId`, `isLiveConnectedRepository`) whose organization's
   `githubOwnerId` equals the token's `repository_owner_id`, then counts `hubClientRateLimits`: 30
   per repository and 100 per organization in a fixed one-hour window. The rows are keyed on the
   Convex ids `repositoryId` and `organizationId`.
2. `hubClientRateLimits` rows are deleted with their repository (`repository/deletion/cleanup.ts`)
   and their organization (`organizations.ts`).
3. `startTenantConnectionSync` (`hubClients/tenantConnection.ts`) sends `connected: true` when a
   GitHub repository connects (`repository/records.ts`) and `connected: false` when it is removed
   (`repository/deletion/runs.ts`), through a workflow that retries for about 34 hours, ordered by
   `hubClientConnectionRevisions`. The hub stores it as `disconnected` on the tenant
   (`packages/identity-broker/src/component/registration.ts` `setConnection`). A disconnected tenant
   cannot register and cannot sign anyone in.
4. The hub has a second, separate switch: `identityBroker:setTenantSuspended`, an internal function
   that an operator runs with the hub's deploy key. Neither switch knows owners: a tenant is one
   repository, `gh-<repository id>`.
5. `hubClientRegistrations` (RFC 129) records each client with `githubRepositoryDatabaseId`,
   `githubOwnerId`, `githubRepository`, `githubActorId`, `githubActorLogin`, `commitSha`, `stage`,
   `app`, and `redirectUri`, indexed by repository id.
6. samebase.com has admin pages (`/admin/users`, `/admin/emails`) whose functions use
   `access: "access_admin"`; `identity/access.ts` lists the admin emails.
7. The terms of service and the privacy policy do not mention the hub, the shared Google client, or
   the people who sign in to apps built from the starter.
8. The hub caps each repository at 10 apps and each app at 30 clients.

## Target

### Admission

`admitRequest` takes the token's repository id and owner id and does, in one transaction:

1. Refuse with `blocked` when `hubClientBlocks` has the repository or the owner.
2. Count the request in fixed one-hour windows: one for the repository id (30), one for the owner id
   (100), and one global window for requests from owners that have no registration yet (50 new
   owners per hour). Refuse with `rate_limited` when any is full. The global window bounds what one
   person with many GitHub accounts can do to the "Samebase Apps" Google project.

It no longer reads `repositories` or `organizations`. The refusals `repository_not_connected` and
`owner_mismatch` go away, and `blocked` joins the fixed reasons that `Convex.SharedHubClient` logs
(a package patch release).

### Request windows

A new table `hubClientRequestWindows`:
`{ scope: "repository" | "owner" | "newOwners", githubId, count }` (`githubId` is empty for
`newOwners`), indexed by scope and id, one row per key, the window starting at the row's creation,
as today. Rows are not tied to Samebase rows, so repository and organization deletion no longer
touch them. `hubClientRateLimits` and its cleanup steps are removed.

### Blocks

A new table `hubClientBlocks`:
`{ scope: "repository" | "owner", githubId, reason, blockedAt, blockedByUserId }`, indexed by scope
and id.

- Blocking refuses every later registration of that repository, or of every repository of that
  owner.
- Blocking also stops the clients that exist: for a repository, its tenant; for an owner, the tenant
  of every repository id that `hubClientRegistrations` holds for that owner. samebase.com sends
  `connected: false` for each through the existing tenant connection workflow, so the hub refuses
  their registrations and sign-ins within seconds, with retries during a hub outage.
- Unblocking deletes the row and sends `connected: true` for the same tenants. An operator's
  `setTenantSuspended` at the hub stays separate and is not cleared.

### The tenant switch changes meaning

Today `connected` means "connected to Samebase". After this RFC it means "not blocked by
samebase.com". Connecting a repository and removing it from Samebase no longer call
`startTenantConnectionSync`: leaving Samebase does not stop Google sign-in, because Samebase is no
longer needed for it. The hub does not change.

Tenants that were disconnected because their repository left Samebase stay disconnected at the hub.
The admin page lists blocks only, so such a tenant is cleared by blocking and unblocking its
repository, which sends `connected: true` with a newer revision. Before PR 2, list the disconnected
tenants on the hub once and clear each that should work.

### Admin page

`/admin/hub-clients`, with `access: "access_admin"` functions:

- The latest registrations, newest first, paginated: time, `owner/name` linked to GitHub, owner id,
  actor login, stage, app, and the return host.
- For the last 24 hours and the last 7 days: the number of registrations, of distinct repositories,
  and of distinct owners, and the owners with the most distinct repositories in the last 7 days.
  This is the abuse pattern: one person making many repositories.
- Block or unblock a repository or an owner, with a required reason. The block list with its
  reasons.

The counts are read from `hubClientRegistrations` with a bounded scan of the time window; if the
table grows past what a query reads in one call, the counts become an aggregate in a later change.

### Terms and privacy

Both pages get a short section, written in PR 2 and approved by Nicu before merge:

- Terms: the shared sign-in service, acceptable use for apps that use it, and that Samebase may
  block a repository or an owner at any time without notice. Using the service from a deploy means
  accepting these terms.
- Privacy: for people who sign in to an app through the hub, the hub receives their Google name,
  email, and Google account id, gives the app a per-app id, name, and email, and keeps a record of
  the sign-in. Samebase handles this for the app, which is responsible for its own use of the data.

The starter's README (in `samebase/base`) states the same in one sentence where it describes Google
sign-in, and drops "after leaving Samebase, new Google sign-ins fail".

### What does not change

The hub, the file check of RFC 129, the 14-day removal of preview clients, the hub's caps, and the
first-party route `Convex.HubClient`.

## Changes

### PR 1. Limits by GitHub ids, blocks, and the admin page

The account check stays on. The new limits and blocks run next to it, and the admin page shows real
registrations before anyone without an account can register. The tenant switch stops following
connect and leave in this PR.

### PR 2. No account, terms, and privacy

Removes the connected-repository and owner checks from `admitRequest`, adds the terms and privacy
sections, and a docs changelog entry. A pull request on `samebase/base` updates the README.

## Decisions to confirm

1. Leaving Samebase no longer stops Google sign-in.
2. A block is by repository id or by owner id, set by an admin on the admin page.
3. The limits are 30 per repository and 100 per owner per hour, as today, plus 50 new owners per
   hour across all of Samebase (agreed 2026-11-04; the number is a starting point).
4. Terms are accepted by using the service, with no signup.

## Review amendments

Decided on 2026-11-04 after the review. Each item overrides the Target text above.

1. **The global window counts distinct new owners.** The first request of an owner with no
   registration inserts a `newOwner` row for that owner id in the window and adds 1 to the global
   count. Later requests from the same owner add nothing. Otherwise one account sending 50 requests
   with a bad host fills the window for everyone.
2. **A block decides each repository from both scopes.** On every block and unblock, samebase.com
   sends `connected = !(repository blocked || owner blocked)` for each affected repository, never a
   fixed value, so unblocking an owner cannot turn on a repository that has its own block.
3. **Blocks catch races and transfers.** `recordRegistration` reads `hubClientBlocks` for the
   repository and the owner and starts `connected: false` in the same transaction when either is
   blocked. A registration refused with `blocked` also sends `connected: false` for that repository,
   which catches a repository transferred to a blocked owner on its next run. The owner of a
   repository is the owner of its latest registration row.
4. **Old clients.** Clients registered before v2252 have no rows. PR 1 backfills an owner block's
   reach from `repositories` joined to `organizations.githubOwnerId`, because every such repository
   was connected.
5. **Earlier disconnects are cleared in PR 1.** PR 1 stops connect from sending `connected: true`,
   so it also ships a one-time internal mutation that sends `connected: true` for every row of
   `hubClientConnectionRevisions` that has no block. The hub needs no list of tenants.
6. **Indexes and batches.** `hubClientRegistrations` gets `by_github_owner_id`; the new-owner test
   is `.first()` on it. An owner block fans out in batches that schedule the next batch.
7. **`app` is at most 64 characters**, refused with 400 in `readBody`. Anyone can send it after this
   RFC, and a huge value would break the admin scan and the registration row.
8. **The admin counts** read `by_creation_time` with `take(N)` and show "at least N" when they hit
   it. Distinct repositories and owners are counted in memory.
9. **RFC 129's live checks come first.** A host that redirects and a host that resolves to a private
   address must both be refused on production before PR 2, because PR 2 lets any GitHub account
   trigger the file fetch.
10. **Privacy and terms state what the hub does.** The privacy section names the data the hub passes
    to apps (name, email, `email_verified`, picture, a per-app id), that it keeps sign-in records
    for 90 days and registration records with the developer's GitHub repository, login, and commit,
    that Google user data goes to third-party apps, that Samebase controls the hub's records and
    each app's developer controls what the app receives, and how a person who signs in reaches
    Samebase at the contact email. The 201 reply carries the terms URL, and `Convex.SharedHubClient`
    logs it on a new client, so developers see the terms. Nicu approves the wording; this is not
    legal advice.
11. **Every text that says leaving Samebase stops Google sign-in changes**, in the PR that changes
    the behavior: `LandingPreviewPage.tsx` and its test, `docs-the-big-migration.md`,
    `docs-do-it-yourself.md`, and the starter README in `samebase/base`.
12. **The old table goes in one PR.** Convex deploys a schema without `hubClientRateLimits` and
    keeps its rows as a table with no schema; delete it in the dashboard afterwards. Remove every
    reference (model, registration, repository and organization deletion, the account deletion
    registry, tests) and classify `hubClientRequestWindows` and `hubClientBlocks` as `global`.
13. **Smaller items.** A 429 says which window refused. A block is refused while samebase.com has no
    hub key, because the switch would not be sent. Tests say "before the file fetch and the hub
    call", since GitHub's key set is fetched first. The live test uses a repository made from the
    template, or turns on Actions in a fork.

## Validation

- Unit tests: a registration without any Samebase row succeeds (PR 2), a blocked repository and a
  blocked owner are refused before any fetch, the windows count per GitHub id, blocking an owner
  sends `connected: false` for each of its recorded repositories and unblocking sends `true`,
  connect and leave no longer start the workflow, and admin functions refuse a non-admin.
- Live after PR 2: a fork of `samebase/base` from a second GitHub account, with no Samebase account,
  gets Google sign-in on its first deploy, shows on the admin page, and loses sign-in when its owner
  is blocked.

## Non-Goals

- Sign-in counts per app. The hub holds them; samebase.com cannot read them without a new hub
  endpoint.
- The page before Google that names the repository and the return site. Follow-up idea from
  2026-11-04: the hub shows that page by default, an app can ask to go straight to Google, and an
  admin can force the page for a repository or an owner from the admin page. That forcing switch
  would travel to the hub the same way as blocks, as tenant state set by samebase.com.
- Automatic blocks or alerts.
