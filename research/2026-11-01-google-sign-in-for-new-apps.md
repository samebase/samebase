# Google sign-in for new apps

Status: research. Five review rounds covered the deploy lifecycle. The standards check below is new
and not reviewed yet. Nothing here is built. Last updated 2026-11-01.

## The goal

A stranger creates an app on samebase.com. The app is in their GitHub account and their Convex team.
A few minutes later it has a working "Sign in with Google" button. They never open Google Cloud, and
they never hold a key to anything of ours.

## Standards check

Checked against the documents themselves on 2026-11-01. The sign-in itself already follows them:
PKCE, exact redirects, `iss`, pairwise subjects. See
[standards.md](../packages/identity-broker/docs/standards.md). What this plan adds does not all fit.

**Breaks a rule**

- **RFC 6749 section 10.12, consent.** The hub is the authorization server for these apps, so it
  must ensure a malicious client cannot get authorization without the user's awareness and consent.
  With no page, one Google client, and Google remembering Samebase, a stranger's app can get a
  person's name and email from one link. MCP's security guide calls this the confused deputy
  problem, and its fix is a consent page per app before going upstream. `prompt=select_account`
  stops the case with no click, if Google always shows its screen, which needs a test. It does not
  tell the person which app is asking. Google says consent is held per project, so people who
  approved `samebase.com` may count too. Decided: no page, and the hub forces the account screen. A
  test must still show that Google never passes a person through with no click.

  Nicu wants to keep an option for a page later, one that names the app and meets section 10.12. It
  lives on the hub, so turning it on needs no change in any deployed app. It needs a hub setting, a
  name to show, because the app row holds only `gh-<id>-<hash>`, and a page that lists the app's one
  connector and remembers the first click. If the Google test fails, this page is required.

  Lovable has the same gap, tested on one project. Its app code holds no client ID or secret.
  Sign-in starts at `/~oauth/initiate` on the app's own domain, its hosting adds `project_id`, and
  its broker refuses a `redirect_uri` outside that project with a 400 page. It sends no `prompt` to
  Google and shows no page of its own in the package, so a bad app it hosts can do the same thing.
  Two differences: it hosts the apps, so it can remove them, and a phishing link starts on the bad
  app's domain, not on Lovable's. An exported app loses managed Google sign-in, which matches the
  decision on leaving.

- **RFC 9700 section 4.11.2, redirects.** A client that registers itself can use the authorization
  server to send people to a phishing page, and the server must authenticate the user first. The hub
  redirects bad requests, such as `prompt=none`, to the client before anyone signs in. Stranger apps
  must get an error page at the hub for these instead.

**Reinvents a standard**

- **RFC 7591, registration.** The narrow endpoint in this file should be this endpoint. Samebase's
  key is the initial access token, whose format the RFC leaves open. The reply includes
  `client_secret_expires_at`, and all client metadata counts as self-asserted.
- **RFC 7592, managing a client (Experimental).** Each client gets its own registration access token
  for read, update, and delete. Renewal and delete can then go from the run straight to the hub,
  with no GitHub token. A run holds only its own client's token, so the fork rule for renewal and
  delete goes away. This would replace those rules in "The endpoint".

**Confirms the design**

- **RFC 7591 appendix A.5:** stateless registration gives up client management, as this file found.
- **RFC 7591 section 6:** client IDs are normally new per registration, also for the same software.
- **RFC 9207:** implemented. Each app talks to one authorization server, so mix-up does not apply.
- **OpenID Connect Core 8.1:** the app as the sector is a recorded departure in
  [design.md](../packages/identity-broker/docs/design.md). The spec neither requires nor forbids a
  salt per sector.

**Could help later, and does not fit now**

- **RFC 9126, PAR.** The app authenticates and pushes the request first, and the hub can refuse any
  other. A flood at `/authorize` would then write nothing. Convex Auth has no PAR support.
- **Client ID Metadata Documents (draft).** The client ID is a URL, so the hub keeps no rows and
  needs no cleanup, which is the cleanest answer to PR spam. It bars client secrets and needs
  key-based client auth, which Convex Auth does not have.
- **OpenID Federation.** It assigns no client secret, so it has the same mismatch.

## Decided by Nicu

- One identity hub, `auth.samebase.com`. Strangers' apps use it too.
- A second Google client, `samebase_apps`, in the same Google project as `samebase_prod`.
- No page of ours between the app's button and Google. Google's screen names Samebase. Lovable works
  the same way: its button goes straight to Google, and the callback is the central
  `oauth.lovable.app`. This conflicts with RFC 6749 section 10.12, see the standards check.
- A stranger's app always uses the new client, whatever the URL says.

## What happens for a real user

1. The app deploys in the repository's GitHub Actions. The stack creates the deployment first,
   because its URL is not known before that.
2. GitHub gives the run a signed token that says "this run is repository X". The user holds no key
   for this.
3. The run sends that token to samebase.com, with its deployment name and the name of the app.
4. Samebase checks the token, then checks through the organization's Convex connection that the
   deployment is in the Convex team of repository X.
5. Samebase asks the hub for a client for that deployment, and the hub answers with a client ID and
   secret. The hub keeps only a hash of the secret.
6. Samebase passes them to the run, which sets them on the deployment and pushes the code.
7. The Google button works.

Every later deploy renews the saved client, and gets no secret back.

## Who holds what

| Holder                | Credential                                                  | What it can reach                               |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| The user's repository | Their own Convex connection, and GitHub's short-lived token | Their own Convex team. Neither reaches the hub. |
| The user's deployment | The client ID and secret of that one deployment             | Sign-in as that one client                      |
| Samebase              | A registration key for the hub                              | Third-party registration only                   |
| The hub               | Both Google clients                                         | Google                                          |

A registration key is not a Convex deploy key. A deploy key that can run internal mutations can run
all of them, including the ones that manage our own apps. So the hub gets one narrow HTTP endpoint
that can only create, renew, and remove third-party clients, and the key opens only that endpoint.
If Samebase is compromised, an attacker can make stranger-app clients, but cannot touch
`samebase.com` or any first-party app.

The secret passes through these places:

- **Hub:** raw once, in the reply. The row holds the hash.
- **Samebase:** raw in memory while it passes the reply on. The reply is `Cache-Control: no-store`,
  and the secret is never logged and never stored in a table or a workflow result.
- **GitHub run:** in memory, wrapped as `Redacted` as soon as it arrives. The state store seals
  `Redacted` values and does not seal plain strings, so it must stay `Redacted` all the way.
- **Deployment:** an environment variable, which the user can read. It is theirs.

A build can read the secret with its deploy key and print it by accident, and `Push.ts` scrubs only
the deploy key from its output today. So it must scrub the client secret too. This only protects
logs: code in the build already holds the user's credential.

## Why the hub stores a client per deployment

The first draft proposed a self-describing, signed client with no row in the hub. A review rejected
it, and that review holds up. Every secret would come from one key, so if the key leaked, we could
not reject forgeries without also breaking every live production app, because those clients never
expire. Recovery would need the inventory of clients that the design was trying to avoid. Rows also
turned out to be cheap once they have a removal date and a cap, so the PR spam problem does not need
a new kind of client.

## What counts as an app

Users' IDs at the hub are derived from the app ID, so an app ID must never change.

- **The name comes from the stack**, from the `app` prop that `Convex.HubClient` already has. A
  template sets it once. Moving a folder or renaming the repository changes nothing. Changing the
  name means new user IDs, so the docs must say not to.
- **The hub's app ID is built by Samebase:** the GitHub repository ID and an exact, collision-free
  encoding of the name. Lossy slugs would let `a-b` and `a/b` collide.
- **Two apps per name:** one for production and one shared by all previews of that name. A preview
  runs unreviewed code, so it must not see production's user IDs. The two still receive the same
  email, so this stops ID matching, not all correlation.

Nothing needs to verify the name. It only picks a place inside that repository's own namespace, so a
false name reaches nothing that the run could not already reach. The same rule covers two stacks in
one repository: two names, two apps.

## PR spam and cleanup

A row costs almost nothing. What matters is that rows cannot grow without limit, and that nothing
depends on someone cleaning up.

- **A preview client always has a removal date**, 14 days ahead. Each deploy and each sign-in moves
  it forward, and nothing clears it. The daily cleanup deletes rows past that date, in bounded
  batches. A sign-in moves the date inside the `exchangeCode` transaction, not in the later write
  that records the sign-in, so cleanup cannot delete a client between the two.
- **A client either exists or it does not.** There is no expired state to check at `/authorize` or
  `/token`. A row that lives a day longer than planned harms nobody.
- **A cap per app: 30 rows**, counting every row. A new one over the cap removes the row with a
  removal date that was renewed longest ago, so a user with many PRs never gets stuck. A production
  app has its own rule, below.
- **A cap of 5 app names per repository**, so a run cannot get around the row cap by inventing
  names.
- **Closing a PR deletes its client right away.** This is only a tidy-up. If it fails, the removal
  date still removes the row.

So 1,000 repositories with one app name each are at most 60,000 small rows, and far fewer in
practice, because a production app's extra rows are leftovers from failed runs. A client also needs
a live Convex deployment, which limits this further. A cancelled run, a deleted repository, or
disabled Actions leaves preview rows that go away by themselves. A leftover production row stays,
signs nobody in, and counts toward the cap.

What a user feels: a preview nobody deployed or signed in to for 14 days loses Google sign-in until
its next deploy, which fixes it with no action from them. An evicted client comes back the same way.
An open PR that people use keeps working. Rerunning an old close job already destroys a reopened
preview today, with or without Google, and the next deploy brings both back.

## Production clients are never retired

A production app must not stop signing people in by itself. The hub cannot know which client a
deployment holds, because a failed push or two overlapping runs can leave it holding an older one.
Earlier drafts tried to work out which client was live so that the others could be removed, and
every version had a sequence that removed a live client. All of that only tidied up rows, and rows
are nearly free. So the hub does not try.

- **A production client has no removal date**, and cleanup never touches it. Destroying a stack does
  not delete it either, because a destroy can leave the production deployment running. If the
  deployment is gone too, the row signs nobody in.
- **A deploy with a saved client for this callback renews it.** Otherwise it asks for a new client,
  and older clients stay valid.
- **The hub never changes a secret**, so a client that works keeps working.
- **Over the cap of 30**, a production app loses its oldest row that never signed anyone in. If
  every row has signed someone in, the hub refuses the new client and the stack comment says so.
  That takes 30 clients that each served real users, so it should never happen.

We accept one thing here. The cap can remove an installed client if nobody has signed in yet, its
saved state is lost, and 29 more runs then die before saving anything. The app has no users at that
point, and the next successful deploy gets it a new client.

What this does in each failure:

- **A run dies after step 5:** it installed nothing, and the next run asks again if it has no saved
  client. The leftover client signs nobody in, and nobody holds its secret.
- **The saved state is lost while the app is live:** the next run asks for a new client. The old one
  keeps working until the push, and after it if the push fails.
- **A push fails:** `Push.ts` tries to put the old variables back, and logs a warning if it cannot.
  Whichever client the deployment ends up with still works. The next deploy pushes again.
- **Two runs overlap:** each installs a working client, and both stay valid.
- **A deployment is deleted and recreated:** it has a new URL, so the saved client's callback no
  longer matches, and the run asks for a new client.

## The endpoint

The request carries a deployment name, an app name, and the client ID when there is one. It never
chooses the repository, team, deployment type, callback, connector, or hub app ID. Samebase works
those out.

**Every call: the GitHub token.** Check the signature, issuer, exact audience, and times. Request it
right before the call, because it may last only a few minutes. Match `repository_id` and
`repository_owner_id` against a connected repository. Allow only `push`, `pull_request`, and
`workflow_dispatch`. Dependabot update jobs carry `dynamic`, and are refused. A `pull_request` run
whose `ref` is `refs/pull/N/merge` reaches only `pr-N`, in every operation below. Each preview row
stores its `pr-N` for this.

**New client, `pull_request` run.** The PR number in `ref` is signed. Samebase lists the project's
deployments, because a lookup by name does not return the preview name, and requires that the named
deployment is the preview `pr-N`.

**New client, `push` or `workflow_dispatch` on `refs/heads/main`.** It must be the production
deployment.

**Forks.** GitHub's token has no claim for a fork's head repository, so a claim check cannot catch
them. The PR number does. A fork has no Convex credential, so nothing named `pr-N` exists for a fork
PR, and the rule above refuses it. An owner who gives forks their Convex secrets has given them the
team anyway.

**Team check.** The deployment must be in the repository's Convex team, by a live Convex call.
Samebase builds the callback from that deployment, so the callback is always on a deployment that
team controls. Two repositories in one team could claim each other's deployments, but both already
hold that team's credential, so this gains nothing. If the organization's connection is gone, new
clients stop.

**Renewal and delete.** These do not go through Samebase. Each client holds its own registration
access token (RFC 7592), and the run talks straight to the hub with it, so one run can touch only
its own client. A renewal is a read of the client. If the client is gone, the answer is 401, and the
run asks for a new one. The hub refuses to delete a production client.

**Limits.** Verify the GitHub token in the HTTP action first, because a bad token then costs no
table read. Then limit requests per repository and per organization.

## Alchemy resource

`Convex.HubClient` cannot be reused. It looks for a hub in the user's own team, and its `diff`
answers `noop` for an unchanged client, so it would never call anything on a later deploy. The new
resource sits between creating the deployment and pushing, like the previews in
`apps/samebase/alchemy.run.ts`. The template's production needs the same split, because its URL is
not known in advance either. The resource answers `update` in its `diff`, so it runs on every
deploy. The plan shows an update each time, which is only cosmetic, because an unchanged client does
not cause another push. Its client ID and secret must not be marked stable, so that the push gets
the values the run ended with. It handles four answers:

| Answer                   | What the deploy does                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Renewed                  | Keeps the saved values                                                              |
| Gone                     | Asks for a new client                                                               |
| Suspended or not allowed | Keeps the saved values, does not ask for a new client, says so in the stack comment |
| Samebase unreachable     | Keeps the saved values, tries again next deploy                                     |

None of these fails the deploy. Destroying a stack only logs a warning if the delete fails, unlike
`Convex.HubClient`, so that a Samebase outage can never block a destroy.

The stack comment and the stack cards show only resource types they know, so this needs explicit
support. Add the client as a card row with its state: on, not set up, or suspended, with no secret.
The repository page gets the same line. There is no list of clients to manage, because nothing there
needs a person.

## Deploys must never lose working sign-in

`Push.ts` removes variables that a deploy stops passing. So a failed call must not drop them, or a
working app loses Google.

- **First deploy, Samebase unreachable:** the app deploys with guest sign-in, and the comment says
  so. The next deploy tries again.
- **Later deploys:** the table above.
- **Template outside Samebase, or a laptop run:** guest sign-in, and it must not look like a
  failure.

Two exceptions. If Alchemy state is lost and Samebase is down in the same deploy, the run has no
values to keep, so the app falls back to guest sign-in until the next deploy. Losing state already
needs a manual adopt run, so this is rare and fixes itself. Hand edits to these variables are not
supported.

**The off state.** Convex refuses to bind a component's required variables to optional ones, and
`setupOauth` checks the issuer URL when the module loads, so variables cannot simply be missing. We
already have an answer: `NO_HUB_ENVIRONMENT` holds `HUB_CLIENT_ID=no-hub` and a loopback issuer, and
CI runs on it. The template uses the same values and hides the button when the client ID is
`no-hub`. `registerDevelopmentClient` already leaves those values alone.

`pnpm dev` and the direct deploy scripts do not run Alchemy. So the template's scripts must set the
`no-hub` values when the variables are missing, before functions are pushed, and never overwrite
real ones.

**Hub outage.** New sign-ins fail. People already signed in stay signed in, because sessions belong
to each app's own deployment.

## Trust levels in the hub

Today one flag, `firstParty`, decides two things: skipping the chooser, and sending
`connector_account_id`. Stranger apps must get the first and never the second. So setting
`firstParty: true` to go straight to Google would be a security bug.

Instead a stranger's app row names its one connector, `google-apps`, and the endpoint sets that.

- **Every path to a connector checks this rule**, so both `/authorize` and `/continue`. `/continue`
  accepts any connector today and can restart a request that already started, so a rule in
  `/authorize` alone would not hold.
- **Redemption refuses a code from any other connector.**
- **No other app can start `google-apps`.** Strangers never see the chooser. It still exists for an
  app that names no connector, so it must not list this one.
- **`firstParty` stays false.** The endpoint can only create third-party apps, and it refuses any
  app ID outside its own namespace.

## Abuse

**Flood of `/authorize`.** A valid direct request costs 5 function calls, with one row inserted and
then updated, needs no secret, and is billed to us. This is not new: `samebase.com`'s client ID is
public, so the same flood works against the hub today. A sustained 1,000 requests a second costs
about $860 a day, and about $25,900 only if it runs for a month with nobody noticing. A
[usage limit](https://docs.convex.dev/production/usage-limits) on the hub's deployment caps this
today: the hub stops for the rest of the window, and people already signed in stay in. Convex's
abuse page says floods of expensive HTTP requests are ours to stop.

Client IDs are public, so an attacker can spend any app's budget. Budgets per app protect other
apps, not the app under attack. In order:

1. **By source, at the edge.** This is the real defense. Put a limit in front of
   `auth.samebase.com`, if that hostname can go through our Cloudflare zone. Convex documents this.
2. **Refuse requests to the raw `.convex.site` address**, so the edge cannot be bypassed. A refused
   request still costs one call.
3. **A budget per repository at the hub**, shared by all its apps. A flood at one repository stops
   only that repository. First-party apps are not limited by it.

There is no shared budget for all stranger apps in normal use, because one attacker could spend it
and stop everyone. A global brake exists only as a switch we pull in an emergency, and we accept
that it stops every stranger app.

The budget check goes inside the same mutation that writes the request row, along with the client
and app reads. Separate calls could make a refused request cost as much as a good one. The limiter
is `@convex-dev/rate-limiter`, mounted inside the broker component.

A start with no row, using a signed cookie, is possible later. It needs replay protection and has
size limits, so it is not part of the first version.

**A bad app takes a person's email.** Google's screen names Samebase, not the app. Force
`prompt=select_account` on `google-apps`, so Google always shows the account screen. This does not
tell the user which app it is, and it does not stop phishing. It only means a click on Google's
page. Suspension has to carry the rest.

**Suspending an app.** One row per repository, so that it covers production, previews, and every app
name. It holds two separate conditions, and either one blocks sign-in: the administrator's
suspension, and that the repository left Samebase. Reconnecting clears only the second, so it cannot
undo an abuse suspension. Each change of the second has a revision, and the hub ignores an older
one, so a request that stalled cannot overwrite a newer state. The row stays when preview apps go
away. The hub reads it at `/authorize`, at `/continue`, at registration, at renewal, and inside the
`exchangeCode` transaction. If suspension commits first, the code is refused. A redemption that
commits first can still finish. Suspension does not sign out users who are already in, because their
sessions belong to the app.

**One Google project.** If a stranger's app gets the project in trouble, `samebase.com` Google
sign-in goes with it, and Google's new-user limit may be shared. GitHub sign-in on the hub would
still work. Moving `google-apps` to its own project later means a new ID and secret. It keeps user
IDs only if Google's `sub` is the same across projects, which Google's pages do not state.

## Identity

**Transfer.** The repository ID stays and the owner changes. Compare `repository_owner_id` with what
Samebase stored, and refuse new clients and renewals until the new owner connects. Production keeps
working. A preview keeps working until its removal date.

**Delete and recreate.** New repository ID, so new users. That is correct.

**Accounts in the template.** Key each account by the hub's user ID. Treat email as profile data. Do
not link accounts by matching email: Google warns that `email_verified` is not authoritative for
addresses outside Gmail and Workspace, and an address can change hands. Do not copy Samebase's
profile mapper, which requires `connector_account_id`.

**A guest who signs in with Google.** Their data should move, but only with proof of the guest
session. This needs a test with Convex Auth.

**Leaving Samebase.** Decided by Nicu: the app keeps running, but sign-in through Samebase does not
come with it. An owner who leaves connects their own auth.

- **Leaving means the repository is no longer connected to Samebase.** Samebase then turns on that
  repository's suspend switch at the hub, so this needs no new mechanism in the hub.
- **What the app's users feel:** guest sign-in works, people already signed in stay signed in, and
  new Google sign-ins fail.
- **Reconnecting turns the switch off.** The repository ID is the same, so the user IDs are too.
- **The way out is the open-source broker.** An owner can host it on their own deployment with their
  own Google client. Convex Auth keys accounts by provider and `sub`, so accounts carry over if
  `sub` stays the same. That needs the same app ID and connector name, Google's `sub` to match
  across projects, and the same salt. All apps share one salt today, and it cannot be handed out. A
  salt derived per app could be. This must be decided before the first stranger signs in, because
  changing it later changes every user ID.
- **Otherwise accounts do not carry over by themselves.** The owner's database holds the emails, so
  they can match on those if they accept the risk above.

## Privacy

Our [privacy policy](../apps/samebase/src/content/privacy-policy.md) does not describe this. People
who never heard of Samebase will pass through it, and the hub briefly stores their email and name,
then keeps their app-specific ID in sign-in records. The policy must say what we receive, who gets
it, how long we keep it, and how to ask for deletion. Terms for app builders must say they own what
they do with that data. Whether Samebase is a controller or a processor here is a legal question,
not an engineering one.

## Google branding

The project is in Testing, and that is fine for this: Google's
[audience page](https://support.google.com/cloud/answer/15549945) says apps that request only name,
email, and profile do not need users on the test list. The first draft called this a blocker, and
that was wrong.

The app name is still `noter.md`. It must become Samebase. Google says a name and logo may need
brand verification before they appear. We should test with an unlisted Google account what the
screen shows today.

## Tests before building

Most important first:

1. Through the OAuth token, can Samebase go from a deployment to its project and team, and list the
   project's previews? The recorded reply has `projectId`, not `teamId`.
2. Can `auth.samebase.com` go behind a Cloudflare limit, and can direct requests be refused, both to
   `.convex.site` and to the origin with the custom hostname?
3. How are calls inside a mutation billed, for the limiter and for broker functions? This decides
   what a refused request really costs.
4. Does the template deploy and run with the `no-hub` values, with the OAuth component mounted?
5. What does an unlisted Google account see on the consent screen today?
6. Which events, actors, and fork settings give a GitHub token, and with what claims?
7. Does Google show any screen to a person who already approved, with no `prompt` and with
   `prompt=select_account`?
8. Can a guest keep their data when signing in with Google?
9. Is Google's `sub` the same for one person across client IDs in two projects?

Tests for the code itself: a stranger app cannot reach first-party claims or the first-party Google
client, including through a `/continue` restart; first-party apps never see `google-apps`;
suspension wins a race with a code redemption; a preview run cannot get a production client; a fork
run cannot touch another PR's client; a failed push followed by 14 quiet days leaves production
sign-in working; two overlapping production runs both leave sign-in working; a recreated preview
gets a new client; a removed client comes back on the next deploy; a destroy finishes when Samebase
is down; a flood at one repository leaves other repositories and first-party sign-in working.

## Order of work

1. **Hub.** The connector rule, `google-apps` with its secrets read by the workflow, error pages for
   stranger apps, removal dates, caps, suspension, and limits. Existing clients must keep their
   routing and cleanup, and a test must prove it. The new cleanup touches only rows with a removal
   date.
2. **Hub.** The RFC 7591 registration endpoint, and RFC 7592 if review agrees, with no key set yet.
3. **Samebase.** The endpoint with the GitHub and Convex checks, behind one switch that starts off.
4. **Alchemy.** The new resource, stack comment support, and the secret scrub in `Push.ts`,
   published as a package release.
5. **Template.** The `no-hub` off state with its dev scripts, and the button, in one change, with
   the OAuth component, `id-token: write`, and the new package version. It deploys in the off state
   while the switch is off.
6. **Privacy policy, Google branding, and copy.** The docs say what keeps running after someone
   leaves, and the removal dialog warns that Google sign-in stops.
7. **Set the registration key on both services, and turn the switch on.** Try it on one app of ours
   first, then new apps.

Existing apps get this only when they take the template change, because their workflows lack
`id-token: write`.

## Decided by Nicu after review

1. A live app does not keep Google sign-in after its owner leaves Samebase. The app keeps running.
2. Free users get this. The limits are set after the billing test.
3. Abuse reports go to one abuse address that reaches Nicu. Suspension starts as a manual action.

## After merge

- **GitHub App webhook.** Samebase gets no signal when the GitHub App is uninstalled, so that
  repository keeps Google sign-in until someone removes it on the dashboard. Add
  `POST /webhooks/github` for the `installation` event, actions `deleted` and `suspend`, like
  `/webhooks/polar`. Do this before opening this to strangers.
- **Google project owner.** Move the project off a personal Gmail account to an organization
  account.
- **Consent page.** The option described in the standards check.
- **The key between Samebase and the hub.** It is one long-lived shared secret. Convex's docs
  describe no way for one project to authenticate to another, so this is the plain option today.
  Rotating it means setting both sides. Replace it if Convex adds something, or if a short-lived
  signed token proves worth the work.
