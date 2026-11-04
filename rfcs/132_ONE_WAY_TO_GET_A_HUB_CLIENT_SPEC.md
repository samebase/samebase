# 132 One way to get a hub client

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-11-04
- Base: `origin/main` at v2263 (RFC 129, 130, and 131 shipped).
- Rewritten on 2026-11-04 after a Codex review of the first version, which moved the team's apps
  onto the strangers' path. Every serious finding came from that move, so this version keeps each
  app on the proof it has and makes everything after the proof the same.

## Summary

The identity hub creates clients in two places today with different rules: the team's apps run the
internal function `registerClient` with the team's Convex login, and strangers' apps call
`POST /hub-clients` with GitHub's token. Only the second records a registration, returns a renewal
token, counts limits, and checks blocks. Strangers have no way to get a client on their laptop.

After this RFC there is one create step, and the ways of proving who you are feed into it:

> A proof says who is asking and for which repository or app. The create step decides everything
> else, the same way for every client.

| Proof                   | Used by                               | Clients it can create              | Audience |
| ----------------------- | ------------------------------------- | ---------------------------------- | -------- |
| The team's Convex login | the team's apps, in CI and on laptops | production, preview, development   | team     |
| GitHub's OIDC token     | strangers' apps in GitHub Actions     | production, preview                | public   |
| A samebase.com approval | strangers' apps on a laptop           | development, on a loopback address | public   |

The create step, for every proof:

1. Checks blocks for the repository and owner, when the proof names them, and the limits of RFC 130
   for public proofs.
2. Picks the app: the app id the team's stack names for a team proof, `gh-<repository id>-<hash>`
   for a public proof. App ids, salts, and first-party status of existing apps never change.
3. Picks the sign-in methods from the catalog below.
4. Creates the client with the lifetime of RFC 131: production never expires; preview and
   development clients expire 14 days after their last deploy, dev start, sign-in, or provider
   login.
5. Records one registration row: the proof, who asked, the repository or app, the purpose, and the
   return address.

The admin page shows one table: every client with its registration row.

## Sign-in methods

The hub keeps a short catalog. Each method has a team version and, when one exists, a public
version:

| Method   | Team version                 | Public version                    |
| -------- | ---------------------------- | --------------------------------- |
| `google` | the "Samebase" Google client | the "Samebase Apps" Google client |
| `github` | the team's GitHub OAuth App  | none yet                          |

- An app asks by plain name, `signInWith: ["google", "github"]`, in its Alchemy stack; the default
  is `["google"]`. The audience of the proof picks the version. A method without a public version is
  refused with a clear message to a public proof.
- The broker stores the methods on the app as a list (today a public app holds one connector). A
  sign-in through any other connector is refused. An app with one method goes straight to it; an app
  with several shows the broker's chooser.
- Adding a method to an app adds it; removing one stops new sign-ins through it. Each method gives a
  person a separate account in the app, because the hub never links accounts by email.
- The team's apps keep every team connector, as today.
- Adding a public GitHub later is one new OAuth App and one catalog line.

## Provider logins

The saved Convex, Cloudflare, and GitHub API logins of samebase.com are a second purpose of a
client. Only a team proof can ask for it, and only for the apps on a list in the hub's code, today
`samebase-ahbfh`. The purpose is stored on each client, and the broker checks it, and the blocks and
suspensions, at authorization, code exchange, and refresh. Today a refresh checks neither blocks nor
suspensions; this fixes that.

## The laptop approval for strangers

Local Google sign-in for a stranger's app needs a Samebase account, because samebase.com knows who
the person is and can check GitHub for their access. It follows the native-app pattern of OAuth (RFC
8252, a loopback redirect, and PKCE with S256), so no secret passes through samebase.com or the
browser:

1. `pnpm run dev` finds no working development client. `alchemy-convex hub-client` opens a listener
   on `127.0.0.1` and opens a samebase.com page with: the repository, the app, the client's callback
   on the local backend, and a PKCE challenge. The listener's address is a second, separate callback
   that only receives the approval.
2. samebase.com asks GitHub, with the signed-in person's GitHub authorization, whether they can push
   to the repository, and resolves the repository's numeric id and owner id itself. The repository
   need not be connected to Samebase.
3. On Create, samebase.com asks the hub for a one-time code with `HUB_DEV_APPROVAL_KEY`. The code is
   bound to the repository, owner, app, both callbacks, the challenge, and the approver, for five
   minutes, and is used once.
4. samebase.com sends the browser to the listener with the code. The command sends the code and the
   PKCE verifier to `POST /hub-clients`, which creates the development client in the same
   transaction that uses up the code.
5. The command writes the three variables to the local backend and keeps the renewal token in a
   gitignored file. Each later dev start renews with it; a client that is gone starts again at
   step 1.

The approval key can only create public development clients on loopback addresses, with public
sign-in methods. It can never create a client of a team app or with a team connector. A leaked key
lets someone make localhost clients for any repository's public namespace, which signs in only
people who use that laptop.

## What does not change

- The team's apps keep registering with the team login, the same app ids, salts, connectors, and
  first-party claims. Their users keep their ids.
- Strangers' production and preview clients keep the GitHub token and the verification file.
- The hub's internal admin functions stay for emergencies, run by hand.

## Existing clients

A one-time function gives every existing client without a registration row one, with the proof "team
login, before records", its app, its purpose (a client whose return path is `/oauth/hub/callback` is
a provider-login client), and its return address.

## Order of work

1. The create step in the hub: the team proof calls it in place of `registerClient`, with the same
   answer; registration rows for team clients; the purpose on each client and the refresh fix; the
   backfill; the one-table admin page.
2. The sign-in method catalog: the list of methods on an app, `signInWith` on
   `Convex.SharedHubClient` and `Convex.HubClient`.
3. The laptop approval: the hub's code endpoint, the samebase.com page, and the command.

Each step ships alone and changes nothing for a signed-in user.

## Decisions

- Three proofs and one create step; the team's apps keep their proof.
- Local Google sign-in for strangers needs a Samebase account and push access to the repository.
- Provider logins only for samebase.com.
- Sign-in methods by plain name; the proof's audience picks the version; Google is the default.

## Not in this RFC

- A public GitHub OAuth App and other providers.
- The page before Google that names the repository and the return site.
- A separate Convex team for the hub.
