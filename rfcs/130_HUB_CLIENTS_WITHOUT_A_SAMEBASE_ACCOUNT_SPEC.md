# 130 The hub registers apps itself, without a Samebase account

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-11-04
- Follows RFC 129, which made a repository prove its host with `/samebase-verification.json`.
- Rewritten on 2026-11-04 after two reviews and a research report (`reports/hub-rules-placement.md`,
  outside the repository). The first version kept the rules in samebase.com and sent each block to
  the hub; every problem the reviews found came from that.

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

**Blocks are local to the hub.** Blocking a repository or an owner does, in one transaction:

1. Store the block.
2. Switch off the broker tenant of every repository the hub has a registration for, under that
   repository or owner, with the broker's existing tenant switch.

A registration from a blocked repository or owner is refused before anything else. Unblocking
deletes the block and switches each tenant back on, unless another block still covers it. Because
the rules and the clients are in one database, there are no network calls, retries, or batches
between services.

**Out of samebase.com.** The endpoint `/api/hub-clients`, the tables `hubClientRateLimits`,
`hubClientRegistrations`, and `hubClientConnectionRevisions`, the tenant switch it sends when a
repository connects or leaves, and the variable `HUB_REGISTRATION_KEY`. Leaving Samebase no longer
stops Google sign-in.

**The hub stops accepting the shared registration key.** The broker's `POST /register` and
`/tenant-connection` routes are not mounted by the hub any more. Each client keeps reading and
deleting its own record with its own token, as today, so renewals do not change.

**The admin page on samebase.com.** `/admin/hub-clients`, for admins only, as the other admin pages.
It calls admin endpoints on the hub with a new key, `HUB_MODERATION_KEY`, that can only: list
registrations (newest first, paginated), return counts for the last day and week, and block or
unblock a repository or an owner with a reason. Counts read at most a fixed number of rows and say
"at least" when they reach it. A ranking of owners is left for later.

**The package and the starter.** `Convex.SharedHubClient` sends its request to
`<hub issuer>/hub-clients`, with `https://auth.samebase.com` as the default, in a new release of
`@samebase/alchemy-convex`. `samebase/base` updates to it. Between the merge and that update, a
deploy that needs a new client gets guest sign-in; saved clients keep working.

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

## Before building

The verification file fetch moves from samebase.com to the hub, and anyone can trigger it. Check
once on the hub's runtime that a host that redirects and a host on a private address are both
refused.

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

## Not in this RFC

- The page before Google that names the repository and the return site, with an admin switch to
  force it. After this RFC the hub holds everything it needs.
- A separate Convex team for the hub.
- Sign-in counts per app on the admin page.
