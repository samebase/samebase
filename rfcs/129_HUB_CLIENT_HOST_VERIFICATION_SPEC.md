# 129 Hub clients prove their host with a verification file

## Document Control

- Status: Accepted, in progress
- Owner: Nicu Chiciuc
- Created: 2026-11-04
- Base: `origin/main` at `059ac58da` (v2251)
- Reviewed on 2026-11-04 by Codex (`gpt-6-astra`) against the code. Its findings are folded in: the
  recorded claims, the fetch rules, the refusal reasons in deploy logs, the first-upgrade window,
  and two pull requests instead of three.
- Decisions taken on 2026-11-04 are listed under Decisions. They are settled; do not reopen them in
  the implementation.

## Summary

Today a deploy of a user's app gets its client of the identity hub through samebase.com, and
samebase.com proves that the deploy may use its return address by asking Convex: it reads the
organization's Convex credential, confirms that the named deployment is in the repository's team,
confirms that it is the production deployment or the preview of this pull request, and builds the
return address `https://<deployment>.convex.site/auth/hub/callback` itself.

This RFC replaces that proof with one rule that holds for any host:

> A hub client may send people back to host H for repository X when H serves
> `/samebase-verification.json` naming X.

GitHub's signed token proves X. The file proves H. The deploy sends its return address, and
samebase.com fetches the file from that address's origin and compares the repository id with the
token. samebase.com never talks to Convex in this flow, the deployment name is not sent, and the
return address can have any host and any path.

Everything else stays: the Samebase account, the connected-repository check, the rate limits, the
stage from the token, the 14-day removal of preview clients, the tenant switch when a repository
leaves Samebase, and the hub itself. The hub does not change at all.

## Facts

How a client is registered today, from `origin/main`:

1. `templates/base/.github/workflows/alchemy.yml` runs `alchemy deploy --stage prod` on a push to
   main and `--stage pr-<number>` on a pull request, with `id-token: write`.
2. `templates/base/alchemy.run.ts` has three rows: "Deployment" creates the Convex deployment with
   no source, "HubClient" (`Convex.SharedHubClient`) takes its name, and "Site" takes the same
   deployment over with `adopt(true)`, writes the three `HUB_` variables, and pushes. A
   `Convex.Deployment` cannot take `env` from its own outputs, which is why the rows are split.
3. `packages/alchemy-convex/src/SharedHubClient.ts` asks GitHub for an OIDC token with audience
   `samebase` and calls `POST /api/hub-clients` on samebase.com with
   `{ app, deployment, softwareVersion }`. The answer is the client, saved in Alchemy state. Each
   later deploy reads the client on the hub with the client's own registration token (RFC 7592),
   directly, not through samebase.com. A client that is gone, or whose `deployment` differs from the
   saved one, is replaced. A failed renewal keeps the saved values. A failed request for a new
   client gives the off values (`HUB_CLIENT_ID=no-hub`) and guest sign-in.
4. `apps/samebase/convex/hubClients/registration.ts`: `readRun` verifies the token against GitHub's
   key set and derives the stage with `readRunStage` (`pr-<number>` for a `pull_request` run on
   `refs/pull/<number>/merge`, `prod` for `push` or `workflow_dispatch` on `refs/heads/main`,
   anything else refused). `admitRequest` requires a live connected repository whose organization's
   `githubOwnerId` equals the token's owner id, counts the rate limits (30 per repository per hour,
   100 per organization per hour), and returns the organization's sealed Convex credential and team
   id. `readRedirectUri` opens the credential, calls `readDeploymentInTeam` and
   `isDeploymentOfStage`, and builds the callback with `HUB_CALLBACK_PATH`. `registerAtHub` calls
   the hub's `/register` with the shared key: `tenant_id: gh-<repository id>`,
   `software_id: gh-<repository id>-<sha256(app)[0:32]>[-preview]`, `deployment_type`,
   `client_name: <stage>`, one redirect URI.
5. samebase.com stores no row per client. `apps/samebase/convex/hubClients/model.ts` has only the
   rate-limit rows and the connection revisions. The hub holds the client.
6. `templates/base/package.json` deploys with
   `convex-hosting deploy --build "vp run build && node ./scripts/ensure-convex-auth.ts --prod" --dist dist/client`.
   convex-hosting uploads `dist/client` and serves a file of the build before the server renders a
   page (`templates/base/convex/http.ts`). `ensure-convex-auth.ts` sets each missing `HUB_` variable
   to its off value and keeps every value that exists.
7. GitHub Actions gives every run `GITHUB_REPOSITORY_ID` (the numeric repository id) as an
   environment variable, and the OIDC token carries the same id as `repository_id`, with
   `repository` (`owner/name`), `repository_owner_id`, `actor_id`, `sha`, `event_name`, and `ref`.
8. The hub's `parseClientMetadata` (`packages/identity-broker/src/client/registration.ts`) accepts
   exactly one redirect URI without a fragment: https, or http on a loopback address. It has no
   Convex rule. samebase.com's rule below is stricter, and the hub does not change.
9. The identity broker uses pairwise user ids derived from the app id, so a fork, which has a new
   repository id and so a new tenant and app id, gets its own users. That is intended.
10. `readConvexPreviewDeployments` in `apps/samebase/convex/repository/convexProjectResources.ts` is
    used only by this endpoint on `origin/main`.

Why the Convex proof is in the way: it ties the public client to Convex deployments and to the fixed
path of Convex Auth 2. An app on Convex Auth 0 (`/api/auth/callback/hub`), on a Cloudflare Worker,
on a custom domain, or on any other host cannot get a client. The ailegis thread of 2026-11-03 hit
the path limit first.

## Target

### The file

`GET https://<origin of the return address>/samebase-verification.json` answers 200 with:

```json
{ "repository": "123456789" }
```

- `repository` is the numeric GitHub repository id. Accept a JSON number or a string of digits, and
  compare as a string of digits with the token's `repository_id`. Nothing else is read; other
  members are ignored.
- The path is at the root of the origin, not under `/.well-known/`. RFC 8615 requires a registered
  name there, and nothing is registered with anyone.
- The origin is the scheme, host, and port of the return address. The path of the return address
  does not matter. The proof covers every path on that origin.

The file is the user's proof that they control the host, the same pattern as Google Search Console,
Let's Encrypt's HTTP challenge, and Apple's app-site association. Our template generates it at build
time. Anyone on another host puts one static file in their public folder.

### The request

`POST /api/hub-clients` takes:

```json
{
  "app": "app",
  "redirectUri": "https://happy-otter-123.convex.site/auth/hub/callback",
  "softwareVersion": "<commit>"
}
```

`deployment` is gone. `redirectUri` must be an absolute https URL, at most 2048 characters, with no
fragment (not even an empty `#`) and no userinfo, whose host is a DNS name: not an IP address in any
form, not `localhost`, and not a name under `.localhost`. Any port is allowed. Any path is allowed,
including none. The hub registers the string exactly as the run sent it.

### What samebase.com does, in order

1. `readHub`: 404 while the feature is off. Unchanged.
2. `readRun`: verify the token, derive the stage. Unchanged. Add `repository`, `actor_id`, and `sha`
   to the claims that are read; GitHub's documented example token has all three. Not
   `job_workflow_ref`: GitHub documents it for reusable workflows, and the template's job is not
   one.
3. `readBody`: the new body. A bad `redirectUri` answers 400 `invalid_request` and fetches nothing.
4. `admitRequest`: the connected-repository check, the owner check, and the rate limits. Unchanged,
   except that it no longer returns the Convex credential or the team id. The refusal
   `convex_not_connected` goes away.
5. **Verify the host.** Fetch `<origin>/samebase-verification.json` with:
   - method GET, header `Accept: application/json`, no credentials, no body;
   - `redirect: "manual"`: any 3xx is a failure, redirects are never followed. Convex's fetch
     supports this and answers the real 3xx response;
   - a 5-second timeout that also covers reading the body, so a stalled body fails;
   - a 4 KiB cap, counted while the body streams in: the read stops and cancels the body at the
     first byte past the cap, with or without a `Content-Length`;
   - no caching of any kind; every registration fetches.

   The file is not checked for its `Content-Type`; the body is parsed as JSON whatever the header
   says, because hosts vary. Refusals are 403 `not_allowed` with a reason that the deploy log can
   show: `host_unreachable` (no answer, timeout, TLS failure, stalled body),
   `verification_file_missing` (any status but 200, including redirects),
   `verification_file_invalid` (too large, not JSON, or no usable `repository`), and
   `repository_mismatch` (a different id). The reason never quotes the body or the other id.

   Private addresses: a DNS name can resolve to a private or loopback address. The URL rules do not
   stop that, and a lookup before the fetch would leave a rebinding race. Hosted Convex sends action
   fetches through an egress proxy that blocks addresses that are not public; this RFC relies on it
   and checks it once on the deployed runtime (Validation). What a caller learns about a host is
   only which of the four reasons applies and how long the request took. Only a connected
   repository's own run can ask.

6. `registerAtHub`: unchanged, with the request's `redirectUri`. `client_name` stays the stage.
7. **Record the registration.** Insert one row in a new table `hubClientRegistrations`: the hub's
   `clientId`, `githubRepositoryDatabaseId`, `githubOwnerId`, `githubRepository` (`owner/name` as of
   this run), `githubActorId`, `commitSha`, `stage`, `app`, `redirectUri`. Index by
   `githubRepositoryDatabaseId`. No secret and no token is stored. The row is the record that later
   blocks, limits by GitHub ids, and a sign-in page naming the repository will read; it costs
   nothing now and spares a migration later. Rows are never deleted by this RFC; a preview client's
   row outlives the client. A refused registration records nothing.
8. Reply 201 with the same shape as today, including `redirect_uri`.

Remove from `registration.ts`: `HUB_CALLBACK_PATH`, the Convex `readRedirectUri`,
`readDeploymentInTeam`, `isDeploymentOfStage`, the Convex credential opening, and the
`convex_unavailable` reply. Remove `readConvexPreviewDeployments` from `convexProjectResources.ts`:
this was its last reader. The account deletion registry classifies the new table as `global`, as
`hubClientConnectionRevisions`: its rows are keyed on GitHub ids, not on a Samebase user.

The stage keeps doing what it did: it labels the client `production` or `preview`, and preview
clients keep their 14-day removal date. The file carries no stage. Without the Convex check, a pull
request run can register a preview client whose return address is the production site. That client
is useless: production redeems codes with its own id and secret, so the hub refuses a code of the
preview client, and production's own users keep using production's own client. The client dies on
its removal date. Only someone who can run the workflow in the repository can create it, because
fork pull requests get no token. Accepted.

### `Convex.SharedHubClient`

Props become `{ app, redirectUri, deploymentType, softwareVersion? }`. `deployment` is gone.

- The request body sends `redirectUri`.
- `reconcile` renews the saved client when `saved.redirectUri === news.redirectUri`, and asks for a
  new one otherwise. Today it compares `deployment`. Existing stacks saved
  `redirectUri: https://<name>.convex.site/auth/hub/callback` from the hub's answer, so a template
  that computes the same URL renews its client and registers nothing new.
- The attributes drop `deployment`. Log lines name the return address where they named the
  deployment. The dashboard and the stack comment read only `status`, so neither changes.
- The failure rules stay as they are: a failed renewal keeps the saved values, a failed request for
  a new client gives the off values, and the deploy continues.
- The `REFUSALS` map gains a 400 line, so an old resource against the new endpoint shows a plain
  line.
- A 403 logs its reason when the reason is one of the fixed names of the endpoint, such as
  `verification_file_missing`. Any other text of the answer is never logged.
- The resource stays in `@samebase/alchemy-convex` under its name. Nothing in it is Convex-specific
  after this change, and moving it to a package of its own is a later decision, not this RFC.

### The template

1. The build writes the file. A script `scripts/write-samebase-verification.ts` runs after
   `vp run build` in the `deploy` script and writes `dist/client/samebase-verification.json` with
   `{ "repository": "<GITHUB_REPOSITORY_ID>" }`. Without `GITHUB_REPOSITORY_ID` (a laptop,
   `deploy:dev`) it writes nothing and prints one line. The file is never in git. A fork gets its
   own id with no change to any file.
2. The stack order in `alchemy.run.ts` changes, because the site must be live before samebase.com
   can read the file:
   - "Deployment": unchanged, creates the deployment with no source. It stays, because removing a
     row from the stack deletes it with its removal policy, and a preview "Deployment" row has
     `destroy`, which would delete a preview that "Site" still uses. It can go in a later cleanup
     once no fork has an open pull request on the old stack.
   - "Site": pushes the source with the `env` it has today minus the three `HUB_` variables.
   - "HubClient": `redirectUri: Output.interpolate\`${site.siteUrl}/auth/hub/callback\``, after
     "Site". An Alchemy output cannot be put in a plain template literal.
   - "Variables": a fourth `Convex.Deployment` row on the same deployment with `adopt(true)`, no
     source, and `env` holding only the three `HUB_` variables. A `Convex.Deployment` with `env` and
     no source sets the variables and pushes nothing.

   On the first run of an upgraded stack, "Site" stops managing the `HUB_` names and removes them
   before its push command starts. `ensure-convex-auth.ts` sets the off values during the push, and
   "Variables" writes the real values after the push, in the same run. The deploy script runs
   `ensure-convex-auth.ts` before `vp run build`, not after it as today, so the deployment is
   without the three variables for seconds, not for the whole build. The Google button is then
   hidden until "Variables" finishes, once, on that run. A run that fails between the push and
   "Variables" leaves guest sign-in until the next run. Later runs change nothing. Convex functions
   read variables at call time, so no push is needed after "Variables". The stack test in
   `packages/alchemy-convex/test/SharedHubClient.test.ts` runs this order.

3. README, Google sign-in section: the deploy writes `samebase-verification.json` into the site and
   samebase.com reads it to confirm the host; an app on another host or path serves the same file at
   its origin's root with its repository id (`gh api repos/<owner>/<name> --jq .id`) and sends its
   own return address. Keep it to a few sentences.

### What does not change

- The hub: no code, no schema, no metadata, no deploy.
- The account requirement: a repository must still be connected to Samebase, and its owner must
  match. Dropping it is a later decision; after this RFC it is the removal of one check plus keying
  the rate limits on the ids in the token, which the registration rows already hold.
- The tenant switch (`startTenantConnectionSync`), the rate limits and their rows, the stage rules,
  the 14-day removal, `HUB_APP` and the user ids derived from it, the CI `no-hub` values in
  `scripts/ci-bootstrap-convex.ts`, `Convex.HubClient` (the team-hub route), and every first-party
  app.

## Changes

Two pull requests. The template cannot share the first one: it installs `@samebase/alchemy-convex`
from npm with its own lockfile (`templates/base/pnpm-lock.yaml`, `--frozen-lockfile` in CI), and the
new version exists only after the first pull request merges and
`.github/workflows/alchemy-convex-release.yml` publishes it.

### PR 1. samebase.com and `@samebase/alchemy-convex`

The endpoint (`apps/samebase/convex/hubClients/registration.ts`, `model.ts`,
`repository/convexProjectResources.ts`, `accountDeletion/cleanup.ts`, `hubClients.convex.test.ts`),
the resource (`packages/alchemy-convex/src/SharedHubClient.ts`, its test, README, changelog, and the
bump to 0.22.0), and this RFC. The merge deploys samebase.com and publishes the package. From then
until PR 2 reaches a fork, a template deploy that needs a new client gets 400 and guest sign-in.
Saved clients keep working: their renewals go to the hub directly. There is no period in which both
bodies are accepted.

### PR 2. Template: write the file, reorder the stack, README

`templates/base/package.json` (the deploy script and alchemy-convex 0.22.0),
`templates/base/pnpm-lock.yaml`, `templates/base/scripts/write-samebase-verification.ts` with a
test, `templates/base/alchemy.run.ts`, `templates/base/README.md`, and the regenerated starter
manifest. Then push to `samebase/base` the usual way and note it in the starter changelog.

## Decisions

1. The host is proven by a file at the host, not by Convex and not by nothing. No host proof at all
   was considered and is not wrong: a wrong return address only sends people to a site that cannot
   use the code. The file was chosen because the template pays nothing for it and a later sign-in
   page can truthfully name the return site.
2. The file lives at `/samebase-verification.json`, at the root. Nothing is registered with IANA or
   any other party.
3. The file holds one repository id and nothing else. No stage, no list, no app name.
4. The stage comes from GitHub's token only, as today. The loss of the "preview of this pull
   request" check is accepted (see Target).
5. The account requirement stays in this RFC.
6. The hub does not change.
7. samebase.com records the token's claims per registration from day one.
8. The host is verified at registration only. A host that changes hands later keeps its client until
   its removal date or a block; a production client is never re-verified. Re-verifying on renewal
   would route renewals through samebase.com and is not part of this RFC.
9. Old and new request bodies are not both accepted. The only outside user of the public client is
   on our template and upgrades through the starter changelog.

## Validation

Unit tests in `hubClients.convex.test.ts`, replacing the "the deployment" tests:

- refuses a return address that is http, has a fragment or an empty `#`, has userinfo, names an IPv4
  address (also in hex), an IPv6 address, `localhost`, or a name under `.localhost`, or is too long,
  and fetches nothing;
- reads the file at the root of the origin, with the port, with `redirect: "manual"` and no
  credentials;
- refuses with `host_unreachable` on a timeout and on a connection failure;
- refuses with `verification_file_missing` on 404 and on a 301;
- refuses with `verification_file_invalid` on a non-JSON body, on a body over 4 KiB, on a streamed
  body over 4 KiB with no `Content-Length`, on a name instead of the id, and on a fraction;
- refuses with `repository_mismatch` on another id, and does not show that id;
- accepts the id as a string, as a number, with more members and no `Content-Type`, and streamed;
- an organization without a Convex connection gets a client;
- registers with exactly the return address the run sent, on any path;
- a `pull_request` run with the production address registers a preview client (the accepted case);
- records one row with the claims and no secret, and no row when the hub refuses.

The stub replaces `fetch`, so these tests prove what the handler does with each answer. They do not
prove that Convex's fetch does not follow a redirect or blocks private addresses; the live checks
below do. A stalled body is covered by the timeout signal on the fetch and is not unit-tested,
because the timeout is real time.

Unit tests in `SharedHubClient.test.ts`: the request body, renewal when `redirectUri` is unchanged,
a new client when it changes, the 400 line, a known 403 reason in the log, an unknown 403 reason
kept out of the log, and the template's stack order (site, client, variables).

Template: `write-samebase-verification.test.ts` for the file content and for the laptop case.

Live, once, on production samebase.com after PR 1: register from a test repository whose return
address redirects, and one whose host resolves to a private address. Both must be refused, the first
with `verification_file_missing` and the second with `host_unreachable`.

Live, on a fork of the template or on `samebase/base` itself, after both PRs:

1. Open a pull request. The run registers a client;
   `https://<preview>.convex.site/samebase-verification.json` answers the repository id; Google
   sign-in works on the preview.
2. Merge to main. Production's client is renewed, not replaced: the hub shows the same client id as
   before the upgrade, and people already signed in stay signed in.
3. Check production's variables after the run: the three `HUB_` values are the real ones.
4. Close the pull request. The preview and its client are deleted as before.

## Non-Goals

- Dropping the Samebase account requirement, and re-keying the rate limits on GitHub ids.
- A page on the hub before Google that names the repository and the return site.
- Moving the Google project off a personal account.
- Verified custom domains through Convex's API; a custom domain now works by serving the file.
- Re-verifying hosts after registration.
- Moving `SharedHubClient` out of `@samebase/alchemy-convex`.
- Any change to the hub, its metadata, or its error pages.
