# 132 One way to get a hub client

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-11-04
- Base: `origin/main` at v2263 (RFC 129, 130, and 131 shipped).

## Summary

Today the identity hub hands out clients in three ways, each with its own rules: third-party apps
ask with GitHub's token (`Convex.SharedHubClient`), the team's apps run an internal function with
the team's Convex login (`Convex.HubClient`), and laptops do the same through
`alchemy-convex hub-client`. Each new question ("how do strangers get Google sign-in on localhost?",
"why does the admin page have two tables?") needs a new answer.

This RFC makes one way for every client:

> Every client comes from `POST https://auth.samebase.com/hub-clients`, and renews and deletes
> itself with its own registration token. Only the proof differs, and the proof decides the kind of
> client.

| Where the request comes from   | Proof                                 | Client      | Return address proven by                  |
| ------------------------------ | ------------------------------------- | ----------- | ----------------------------------------- |
| GitHub Actions, a push to main | GitHub's OIDC token                   | production  | `/samebase-verification.json` on its host |
| GitHub Actions, a pull request | GitHub's OIDC token                   | preview     | `/samebase-verification.json` on its host |
| A laptop                       | a one-time approval from samebase.com | development | being a loopback address                  |

Everything else is the same for every client, whoever owns the app:

- **What it can sign in with** comes from the GitHub owner id that the proof carries. The team's
  owners (the `nicu-chiciuc` account and the `samebase` organization) get the "Samebase" Google
  client and GitHub sign-in. Every other owner gets only "Samebase Apps". A request cannot choose.
- **Provider logins** (the Convex, Cloudflare, and GitHub API logins that samebase.com saves) are a
  second purpose of a client, allowed only for the apps on a short list in the hub's code: today
  samebase.com.
- **Which app it belongs to** comes from the repository id and the app name. A new app gets
  `gh-<repository id>-<hash>`. The team's four existing apps are bound once to the app ids they have
  today, so no user id changes.
- **How long it lives:** production never expires; preview and development clients expire 14 days
  after their last deploy, dev start, sign-in, or provider login (RFC 131).
- **What the hub records:** one registration row per client: proof, repository, owner, who asked,
  app, purpose, return address. The admin page shows one table.
- **Blocks** by repository or owner apply to every client.

## The laptop approval

Local Google sign-in needs a Samebase account, because samebase.com is what knows who a person is
and which repositories they work on. It follows the native-app pattern of OAuth (RFC 8252, a
loopback redirect with a one-time code and PKCE), so no secret passes through samebase.com or the
browser:

1. `pnpm run dev` finds no working development client. `alchemy-convex hub-client` opens a listener
   on `127.0.0.1` and opens the browser at a samebase.com page, with the repository, the app, the
   local callback address, and a PKCE challenge.
2. samebase.com shows, to a signed-in member of the repository's organization: "Create a development
   client for owner/name on http://127.0.0.1:PORT?"
3. On Create, samebase.com asks the hub for a one-time approval code, with a key that can do nothing
   else (`HUB_DEV_APPROVAL_KEY`). The hub binds the code to the repository, owner, app, loopback
   callback, challenge, and approver, for five minutes.
4. samebase.com sends the browser to the listener with the code.
5. The command sends the code and the PKCE verifier to `POST /hub-clients`. The hub creates the
   development client and answers with its credentials and registration token. The command writes
   the three variables to the local backend and keeps the token in a gitignored file.
6. Each later dev start renews the client with that token. A client that is gone starts at step 1.

The approval key can only create development clients on loopback addresses. A leaked key lets
someone sign themselves in on their own laptop, nothing more.

## Moving the team's apps

The team's four apps (samebase.com, Bristol, ailegis, trailscout) move once:

1. The hub stores a binding for each: repository id and app name to its current app id, and the salt
   mode it uses today (a client without a repository record uses the hub's salt directly, RFC 130's
   apps use a per-app salt). The binding never changes, so their users keep their ids.
2. Each app's build writes `/samebase-verification.json`, and its workflow gets `id-token: write`.
3. Each stack switches from `Convex.HubClient` to the one resource. On its first deploy it adopts
   its existing client with the client's secret and fresh proof, and gets a registration token for
   the same client id. samebase.com's provider-login client keeps its id, so its saved logins stay.
4. Worktrees switch to the laptop approval.
5. `Convex.HubClient`, the Convex-login path of `alchemy-convex hub-client`, and the hub-key minting
   from app CI are removed. The hub's internal `registerClient` stays for emergencies only, run by
   hand.

## What goes away

- Two Alchemy resources become one.
- Three ways to register become one endpoint with three proofs.
- App CI no longer creates keys that can run any internal function of the hub.
- The admin page's two tables become one.

## Order of work

1. Hub: bindings, owner-based connectors, the provider-login list, adoption of an existing client,
   and the laptop approval endpoints. The resource and the CLI learn adoption and approval. No app
   changes yet.
2. samebase.com: the approval page and the one-table admin page.
3. The four apps move, one at a time, samebase.com last.
4. The old paths are removed.

## Decisions to confirm

1. Local Google sign-in needs a Samebase account.
2. The team's owners are the `nicu-chiciuc` account and the `samebase` organization.
3. Provider logins only for samebase.com.
4. Forks get no GitHub token for pull requests, so a fork's preview never gets the team's clients.

## Not in this RFC

- The page before Google that names the repository and the return site.
- A separate Convex team for the hub.
