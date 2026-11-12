# Design

The broker is a federated OpenID Provider in the shape of Dex: upstream connectors, no accounts. It
can also authorize API resources through ordinary OAuth without creating an identity.

## What is stored

Apps, clients (one per deployment: exact redirect URI, hashed secret), authorization requests for
ten minutes, authorization codes for sixty seconds and one use, an audit row per issued `id_token`
(app, client, connector, subject, time). Apart from those audit rows, nothing about a user outlives
the sign-in request that carried it. The audit rows keep the subject for 90 days.

API authorizations use separate request and refresh-grant tables in the same component. A request
holds its upstream token only until code redemption or expiry. A refresh grant holds the upstream
refresh token, resource, client id, and a hash of the broker refresh token. It holds no user
profile. The upstream secret stays in the private component, protected by Convex's encryption at
rest and component isolation; there is no additional application encryption key. Signing-key
rotation does not affect these grants. Idle grants expire after 90 days, and successful refresh
renews that deadline. Client deletion invalidates redemption and refresh immediately and schedules
bounded deletion of remaining grants. `/revoke` deletes the client's grant immediately.

The host schedules the component's `cleanup` daily from a cron, as the
[identity-hub](../../../apps/identity-hub) app does; nothing else deletes these rows. One run
drains: a batch deletes at most 200 rows per table, and a full batch schedules the next one at once
with the same cutoff, until no table fills a batch. The cutoff is the time the run began, so the run
ends: rows written during it run out after the cutoff. A completed request lives until one minute
after its authorization code expires, so cleanup never removes a request whose code can still be
redeemed.

A preview or development client has a removal date: cleanup deletes it 14 days after its
registration or its last renewal, sign-in, resource authorization, or provider refresh. A deployment
renews its client at each deploy and dev start with a read of `/register/<client>`, and gets a new
one when the client is gone. A production client never gets a removal date: a destroy can leave a
production deployment running, and the hub cannot know that it stopped.

Other clients stay until `deleteClient` removes them, or their app is deleted. A host that sets
`previewClientIdleDays` also has cleanup delete a preview client with no sign-in for that many days.
It is off by default, because a deployment whose client was deleted does not register again by
itself.

## Registration

The broker holds every row and every rule of a hub (RFC 135), so every copy of a hub has the same
caps, expiry, blocks, history, and moderation. A hub is configuration: connectors, resources, env,
keys. `POST /register` (`src/client/hubClients.ts`) is the client registration endpoint of RFC 7591.
Its Bearer is the initial access token of RFC 7591 section 3: GitHub's OIDC token of a GitHub
Actions run, or the app's own initial access token in development. The hub checks that each return
address names the repository. It is GitHub-first on purpose: the proof is one section of that file,
and everything after it works on GitHub's ids. A second proof would be a second section, not a
change to the rest. A host with another proof can still call `component.registration.register` with
`newClientCredentials` itself.

The checks run in two transactions with a fetch between them. `hubClients.admit` reads the blocks
and counts the request in the repository's and the owner's hourly windows before the hub fetches the
verification file; the creating mutation reads the blocks again, creates the client, records who
made it on the client, appends the registration event, and replaces the app's initial access token.
A block set during the fetch still applies. Every refusal comes before the first write, so a refused
request writes nothing past those two counts. An owner with no registration yet counts in the
new-owners window only when its registration succeeds, so failed attempts cannot use up that
allowance for everyone.

The tenant records the `iat` of the newest accepted GitHub token. A token that names another owner
and is not newer than that, the same second included, is refused (`stale_proof`): GitHub's tokens
live a few minutes, and without this a retained token of the old owner could move a transferred
repository back and delete the new owner's initial access tokens. A tenant with no recorded `iat`
(one registered before 0.22.0) accepts the next token of any owner and records it.

Every app belongs to a tenant, such as `gh-<repository id>`. The first client of an app id creates
the app. `software_id` names the app. A request sends the app name alone (`weather-app`) or the full
form `<tenant id>/<app name>` (`gh-123456789/weather-app`); the hub registers and answers the full
form, so it is unique at the hub. The repository part always comes from the proof: a full form that
names another repository is refused with `invalid_client_metadata`. Without `software_id` the app
name is `app`, without `software_version` the version is `unknown`, and without
`token_endpoint_auth_method` the method is `client_secret_basic`, the RFC's default.

Each client enrolls in connectors at registration (`connectors`, the hub's own member: at least one
name, `[a-z0-9-]{1,64}`, duplicates collapsed, stored sorted), and the enrollment never changes: a
deployment that wants another set registers a new client, as it does for another return address.
Without `connectors`, the client enrolls in every connector that the policy and the repository's
grants allow it, and an empty set is refused. Each client holds its own registration access token,
and reads (which renews it) or deletes its own record at `/register/<client>` (RFC 7592).

A row in `blocks` stops a repository, or every repository of an owner: registration, renewal,
sign-in, code exchange, and provider refresh read it. It is the one block state, and
`moderation.setBlock` its one writer, which also appends the event. Our hub sets it from Block
repository and Block owner on samebase.com's admin page, through `/moderation/blocks`. A row in
`signInPageExemptions` is the other thing the admin sets (see Policy): it only skips the sign-in
page, and a block wins over it.

## Policy

The broker defines the policy contract and enforces it; a hub implements it as a function
(`registration.policy`, RFC 137). Its input is a client's facts: the repository id and name, the
tenant's owner, the app, the deployment type, the return address, and the proof. At registration the
facts come from GitHub's token or the initial access token's row and the request body; at use, from
the client's and the tenant's rows, so a changed policy applies to existing clients at once. Its
answer is the connectors the client may enroll in and use, the API resources (by provider name) it
may authorize, and whether it is paused. The sign-in page is not the policy's.

In hub mode the sign-in page shows for every client, unless the hub's administrator exempted its
repository or every app (`signInPageExemptions`); the broker applies that itself (`pageShown` in
src/client/policy.ts, which `/authorize` decides with and `/moderation/clients` reports with). Only
those two read the exemptions: `/authorize` with the client's facts in one query
(`clients.forAuthorize`), and the moderation list with each client, never from a request. An API
authorization through `/authorize` reads them with the facts but has no page, so it does not apply
them; `/continue`, the callbacks, code exchange, and refresh do not read them, because the page
matters only at `/authorize`. A repository row covers every app and deployment of the repository,
and counts only while the tenant's recorded owner and the owner that registered the client are the
row's owner, so a transfer stops it and an old client of a previous owner never gets it; it counts
again if the repository comes back to the same owner. Rows of different owners coexist.
`signInPage.set` is their one writer, through `/moderation/sign-in-page`; it needs no tenant, so a
row can be set before the repository registers, refuses a row for another owner than the recorded
one, removes only the row of the owner it names, and appends a `sign_in_page_change` event in the
same transaction. The list says per repository row whether it is active, bound to the repository's
recorded owner now (or to no recorded owner yet).

Decision: the admin's exemptions are the one lever of the page, and the broker applies them; the
policy decides connectors, resources, and the pause only. The broker draws its own sign-in page, so
it applies the admin's flag itself, the standard server behavior of Keycloak's per-client "Consent
required" and Auth0's first-party flag. Ory Hydra passes its per-client `skip_consent` to a consent
app only because Hydra has no page of its own. A hub has no code rule for the page: an app that
should skip it, such as the hub's own product, gets an ordinary exemption from the admin page. The
cost is that a hub cannot skip or force the page in code; the admin who sets an exemption and the
operator who writes the hub's policy are the same party, so one lever is enough.

The hub's administrator can add connectors to one repository's clients (`connectorGrants`, RFC 137
decision 10). A grant is per repository, owner and connector, and counts like a repository
exemption. A client may enroll in and use the policy's connectors and its repository's granted ones,
of the host's configured connectors. At registration, the owner that the request proves stands for
the recorded owner. Unlike an exemption, a grant is read at every step, in the transaction that
decides it: the registering mutation (with `policyConnectors` from the host), the offered set of
`/authorize`, `/continue`, the callback's claim and completion, and code exchange
(`usableConnectors` in src/component/policy.ts, `grantedTo` in src/component/connectorGrants.ts).
The host adds the grants that `clients.withApp` carries to the policy's part (`usableNow`), but
`decision.connectors`, which the mutations fence on, stays the policy's part alone, so a grant
revoked after the host read it stops the next step. `connectorGrants.set` is their one writer,
through `/moderation/connector-grants`, with the same owner checks as `signInPage.set`, and it
appends a `connector_grant_change` event in the same transaction. A revoke needs no configured
connector, so the admin can remove the row of a connector that the hub no longer has. Grants give no
API resource and skip no page; an exemption grants no connector.

Decision: a grant adds to the policy's default, per repository, bound to an owner, and is checked at
every step. Every app of a repository shares it: a workflow of the repository can already pick any
app name, so a grant per app gave no real separation. Auth0 and FusionAuth enable connections per
application, Cognito and Dex keep a provider list on each client, and Auth0's third-party apps get
only the connections the operator opened to every app. No product lets a self-registered client
choose the operator's private providers. A hub's policy gives every app its public connectors and
its own product every connector in code, so a mistake on the admin page cannot lock the operator
out; the admin grants a private connector to another app at runtime, without a hub release.

The policy runs in the host's HTTP action, once per request, at registration, `/authorize`,
`/continue`, the connector callback (before the request is claimed, and again after the provider
answered, before the code is issued), code exchange, API authorization (at the start and after the
provider answered), and provider refresh. The mutation that enforces the decision receives it with
the owner the policy decided on, and refuses when its rows say otherwise: the tenant's owner
changed, a block landed, or the request's set, the client's enrollment, or the decision no longer
holds the connector. A policy that throws or answers a malformed value refuses the request
(`503 temporarily_unavailable`, or an error page before the user continued, or an authorization
error at the return address after) and writes nothing. The policy is configuration, read with the
env at the start of the action that serves a request: a pause or a policy change that lands while
the provider answers is not seen by that action's second decision, so the request completes under
the configuration it started with, and the next request refuses. That is the boundary RFC 137
decision 2 chose; moderation (a block) stays a row that every mutation reads in its own transaction,
and it stops a request in that window. Without hub mode there is no policy: the host is its own, and
every client may use its enrollment and every resource, with no page asking for consent and no
pause.

A pause refuses new registrations, sign-ins, API authorizations, callback completions, code
exchanges, and refreshes before the provider is called. It leaves client reads and renewals,
revocation, self-delete, and moderation alone, so a short pause ends without expired clients. A
block is stronger than the pause. A withdrawn connector, resource, or pause stops later issuance
only: an id_token and an access token live to their expiry, `/userinfo` answers a valid access
token, a provider access token already released stays usable at the provider, and an app's session
is the app's. A client delete is different: `/userinfo` refuses the access token of a deleted client
(RFC 7592 section 2.3), while an id_token already issued cannot be recalled.

## Sign-in page

`/authorize` stores the request's set: the connectors the `connector` parameter named (a
space-delimited list, as `scope` and `prompt` are; an empty or whitespace value counts as omitted),
else every connector the client may use now. A name outside the enrollment answers
`invalid_request`; the set is then intersected with the policy's connectors, and an empty set is
"Sign-in is off" (403). With one connector in the set and no page to ask for consent (no hub mode,
or an exemption), the browser goes straight to the provider; otherwise one page offers a "Continue
with" button per connector of the set. When it asks for consent, the page also names the host that
gets the sign-in (which served the repository's verification file, or is the user's own computer),
the deploy and the GitHub repository that registered the client, what the app receives, and links
the hub's privacy notice and terms. The picker and the consent are one page, so no user sees two
pickers. `/continue`, the callback, and code exchange accept only a connector in the set, the
enrollment, and the policy of the moment. The id_token keeps `connector` as one string, the
connector the user signed in with.

Whether the page asks for consent is decided once, at the `/authorize` that stores the request: an
exemption set or removed later does not change a request that already passed it, in either
direction. `/continue`, the callback, code exchange, and refresh keep every other check; they do not
decide the page again. Removing an exemption is not a revocation: to stop an app, block it. With the
page skipped, the provider's screen is the only one, and it names the hub, not the app; a connector
with `selectAccount` makes that screen ask for a click, so no app gets a user who authorized the hub
before with no click at all.

A refusal before the user continued from the page (or, with no page, before the redirect to the
provider) is an error page of the hub, for every client: the user has not accepted the return
address (RFC 9700 section 4.11.2). After the user continued, every outcome goes to the client's
registered return address as an authorization response: a denial at the provider, an expired
callback, a pause or a withdrawn connector that landed in between.

## Token endpoint

A client authenticates with the one method it registered, `client_secret_basic` or
`client_secret_post`. A request that carries an `Authorization` header and a non-empty
`client_secret` in the body answers `invalid_request`, even when both are right (RFC 6749 section
2.3); an empty parameter counts as omitted (section 3.2). The mutation that redeems the
authorization code also reads the client and its app and checks the secret and the method, so a
deletion of either commits wholly before a redemption or after it, a failed authentication leaves
the code redeemable, and a code redeems once.

## API authorization

Without `resource`, `/authorize` keeps the OIDC sign-in contract and requires `openid`. A request
with one exact configured `resource` instead uses RFC 6749 authorization code flow with RFC 7636
S256 and RFC 8707 resource indicators. Each provider has one configured scope, so the broker ignores
a requested `scope` (RFC 6749 section 3.3) and returns the scope the provider granted. Convex and
GitHub take no scope parameter, so with them `/authorize` refuses a requested scope. At
`/authorize`, this refusal and an unknown or repeated resource end on an error page of the hub,
because the user has not continued from a page. The code binds the resource, so `/token` can omit
it; if supplied, it must match exactly, and a different or second resource answers `invalid_target`.
Neither this response nor refresh issues an ID Token.

The policy's `resources` names the providers a client may authorize, checked at API authorization,
at the exchange of a resource code, and at both evaluations of a refresh (below). The broker adds no
consent screen of its own here: the provider supplies its authorization screen, and a refusal before
it is an error page of the hub. The two OAuth legs have independent state and PKCE values. The
browser cookie binds the upstream callback to the initiating browser. The downstream response
includes `iss`, and its code lasts 60 seconds and is usable once. The code and the broker refresh
token are 43 characters (32 random bytes in base64url); the access token has the size that the
provider gives it (RFC 6749 sections 4.1.2 and 5.1).

The broker returns the provider's bearer access token unchanged. The resource server remains the
provider API; a broker issuer on the authorization response does not claim that the broker signed
the access token. OAuth leaves token formats and the authorization-server/resource-server
relationship open. This upstream integration is a deployment choice, not a new OAuth wire protocol
or RFC 8693 token exchange. The broker validates token responses with `oauth4webapi` and omits scope
for the scope-less Convex flow. `expires_in`, when supplied upstream, is reduced by the time already
spent returning the code to the app; the broker invents no expiry.

When the provider supplies a refresh token, the broker issues an opaque refresh token for the
authenticated confidential client. The broker token stays stable; upstream rotation is committed to
its grant before returning a response. Every refresh authenticates the client and checks its app and
resource. One attempt holds the grant at a time, and a concurrent attempt gets
`503 temporarily_unavailable`. An attempt that stopped without an outcome frees the grant after 60
seconds. Once another attempt claims the grant, the first attempt can change nothing; until then a
late answer is still saved, because the provider may have rotated the refresh token and only that
answer holds the new one. Only an upstream `invalid_grant` deletes the grant. Any other failure
keeps it and answers `503 temporarily_unavailable`: if rotation had already happened, the retry gets
`invalid_grant` from the provider's replay check (RFC 9700 section 4.14.2), which is the same end
state. A refresh has two policy evaluations: the admission, before the provider is called, where a
withdrawn resource answers `invalid_target` and a pause `invalid_client`; and the release, after the
provider answered, on the rows of that moment. The mutation that saves the provider's answer reads
the client, its app, and the blocks again and takes the release decision: a block, a client delete,
a pause, or a withdrawn resource that committed while the provider answered keeps the new access
token from the caller (`401 invalid_client`), and the saved rotation lets the grant work again once
the block or the policy lifts. A client that lost a resource can still revoke its grants.

RFC 7009 `/revoke` authenticates the client with its registered method and removes only its broker
refresh grant. Unknown tokens, including another client's token, return an empty 200 response. Token
hints do not change the lookup. Revocation does not call the upstream provider or invalidate already
issued provider access tokens: upstream revocation can affect other authorizations held by the hub.
Users can revoke the hub's upstream access at the provider when that is desired.

## Issuer

The issuer is https, or http on a loopback host for local development. The supported configuration
is a dedicated hostname with the issuer at `/`, such as `https://auth.example.com`. There the
transaction cookies carry the `__Host-` prefix, so a subdomain or a narrower path cannot set them.
Another handler on the same hostname can, so the hostname serves the broker alone. An issuer under a
path, such as `https://example.com/identity`, uses plain cookies scoped to that path, and is not
verified in browsers.

## Browser binding

`/authorize` sets one transaction cookie per request, and every later step needs it: `/continue` and
the connector callback (RFC 9700 section 2.1.1). A request with one connector and no page to ask for
consent skips the page, not this binding. A link or a callback that reaches another browser gets an
error page, and the request keeps waiting for the browser that started it.

## Subjects

`sub` is public (OIDC Core section 8): `<provider>:<upstreamId>`, such as `google:104325...` or
`github:4076804`. `provider` is a field of each connector, the same for every connector of one
provider, such as the two Google clients of a hub, so one account has one `sub` through either. The
broker refuses a provider with a colon and two connectors of one provider with two issuers, so two
providers cannot give one `sub`. The value is the same in every app of the broker and in every
broker, and it depends on nothing the broker holds: not the app id, the connector name, the key set,
or the issuer.

Until 0.17.0 the subject was pairwise per app (OIDC Core 8.1):
`base64url(SHA-256(appId || connector || upstreamId || salt))`, with a salt in
`IDENTITY_BROKER_KEYS`, and an app from `/register` derived its own salt from it so that an owner
who left could take that salt to another broker. It stopped, so that an app keeps its users' ids
when it moves to another broker, which needs nothing then:

- The standard allows it. Section 8 makes `public` the default, and section 17.3 says pairwise
  subjects "SHOULD be considered" against correlation among clients: a consideration, not a
  requirement. Google publishes `subject_types_supported: ["public"]` itself.
- Pairwise subjects hid nothing in practice. Every app of the hub that made the change asked for
  `email`, which matches a user across apps more surely than any `sub`. A host whose apps ask for
  `openid` alone, and who wants them not to be correlated, should keep a pairwise broker.
- A `sub` is not a credential: each id_token names one client in `aud`.
- The salt made the app id, the connector name, the key set, and the issuer part of every user's
  identity. Losing the key set, moving an app, or changing an app's kind gave every user a new id.

Every id_token and every UserInfo response also carry `connector`, the connector's name. Until
0.18.0 those of a first-party app also carried `connector_account_id`, the id in `sub` without the
provider.

## Named departures from the specifications

- `connector` on `/authorize` is an unregistered extension parameter, kept by that name because
  every consumer sends it; RFC 6749 section 8.2 recommends a vendor prefix for such parameters. It
  is a space-delimited list, as OIDC Core section 3.1.2.1 shapes list parameters. The discovery
  document's `connectors_supported` is an extension too, which OIDC Discovery section 3 and RFC 8414
  section 2 allow; the name is unregistered.
- A refusal before the user continued from the hub's page ends on an error page of the hub, where
  OIDC Core section 3.1.2.6 sends an authentication error to the client's redirect URI. The user has
  not accepted that address, and RFC 9700 section 4.11.2 warns against redirects to it: a link on
  this host could end on any page of a stranger's app. After the user continued, every outcome goes
  to the redirect URI as the standard says.
- No refresh tokens for OIDC sign-in: apps keep their own sessions. API authorization supports
  refresh tokens and `offline_access` when its provider does.
- GitHub answers token errors with HTTP 200 and calls `invalid_grant` `bad_refresh_token`. Its
  provider corrects that response before the standard client reads it.
- The token endpoint answers `temporarily_unavailable` when a provider cannot refresh, which RFC
  6749 section 5.2 lists only for the authorization endpoint. Provider-issued access tokens are not
  revocable through the broker's RFC 7009 endpoint.
- No sessions at the broker, so it can never answer without interaction: `prompt=none` ends on the
  hub's error page by the rule above, where OIDC Core section 3.1.2.6 sends `login_required` to the
  client. There is no logout protocol.
- PKCE with S256 is required of every client, confidential ones included, as OAuth 2.1 requires.
  OIDC Core does not require it, so the OpenID Basic OP certification plan, whose requests omit it,
  cannot pass.
- `response_type=code` only, so the "dynamic OP" profile of OIDC Core 15.2 is not met.
- `max_age` is honored only as a fresh login: `prompt=login` or any `max_age` sends `prompt=login`
  and `max_age=0` to an OIDC connector whose provider documents `prompt=login`. `max_age` obliges
  the provider to return `auth_time` (OIDC Core 3.1.2.1), and a provider can still reuse its
  session, so the OIDC sign-in completes only when that `auth_time` falls between the second the
  request was created and now, each widened by 60 seconds of clock skew; a missing, older, or later
  `auth_time` answers `login_required`. A connector that cannot reauthenticate answers
  `login_required` before anything goes upstream: a plain OAuth connector such as GitHub, which has
  no `auth_time` to check, and Google, which documents no `login` value for `prompt`. A freshness
  request against these is refused rather than pretended. Other `prompt` values, such as `consent`
  and `select_account`, answer `invalid_request`.
- Subjects are public (OIDC Core section 8), not pairwise, against the consideration of section
  17.3: every app can correlate a user with every other app and with the provider account. See
  Subjects for the reasons.
- The sign-in page has no Cancel that answers `access_denied` at the host (RFC 6749 section
  4.1.2.1): a stranger's link may have brought the user here, and a user who declines may distrust
  the host (RFC 9700 section 4.11.2). The browser's Back leaves; the app learns nothing, and the
  request expires. The app's own name is not on the page: client metadata is self-asserted (RFC 7591
  section 5), and the host and the repository are what the hub checked.
- An initial access token is required: there is no open registration, which RFC 7591 section 3 and
  OpenID Connect Registration section 3 recommend.
- A read of a client (RFC 7592 section 2.1) renews a preview or development client. That is inside
  OpenID Connect Registration section 4.2, which asks a read not to change the client configuration
  or the registered metadata: the renewal moves only the hub's removal date, which is neither. The
  departure is the answer: the read answers without `client_secret`, because the hub keeps only its
  hash. It echoes the `registration_access_token` that the request presented. No request changes a
  secret: a client that lost it registers a new client, and the old one stays valid, because the hub
  cannot know which one a deployment holds.
- No update: `PUT` answers 405 (RFC 7592 section 2.2).
- A production client cannot delete itself, which RFC 7592 section 2.3 allows a server to refuse. A
  stack destroy can leave a production deployment running, so only the hub's administrator deletes
  one.
- No CORS on the registration endpoint, which OpenID Connect Registration section 3 recommends: a
  deploy registers, never a browser.
- Software statements are ignored, which RFC 7591 section 3.1.1 permits.
- Only `web` clients, `public` subjects, and RS256 ID Tokens. A request for anything else, or with a
  metadata member the hub cannot honor, such as `sector_identifier_uri` or an encryption member, is
  refused with `invalid_client_metadata`.
- No loopback exception on redirect URIs: a local deployment registers its exact
  `http://127.0.0.1:<port>/...` URI.
- `auth_time` is the hub's completion time: when the broker completed the sign-in, after the
  connector answered. After a fresh login through an OIDC connector it is the provider's `auth_time`
  instead, which the broker checked against the request's lifetime. The broker never compares an
  upstream `auth_time` with the value of `max_age`.
- A replayed authorization code revokes the code, its request, and its broker refresh grant if
  present. Already issued access tokens remain valid: a `/userinfo` token keeps its five minutes,
  and a provider access token follows the provider's expiry and revocation rules.
- A refresh request that carries `scope` answers `invalid_scope`, where RFC 6749 section 6 lets a
  client ask for a narrower scope. The broker cannot narrow a provider's token and does not keep the
  scope of a grant, so its response could not tell the client which scope it got (section 3.3).

## Keys

`IDENTITY_BROKER_KEYS` holds one current RS256 private key and the public halves of retired keys
with their retirement time. The host parses it in each request and refuses a key without its RSA
members. The JWKS publishes each key under its entry's kid, the kid the signer writes into a token
header. `keys --rotate` only parses its input, so a current key the signer refuses, such as RSA
under the 2048 bits RS256 needs, can still be rotated out. It checks its output instead: a test
id_token signed with the new current key must verify against the JWKS the broker publishes, and each
retired key there must be RSA of 2048 bits or more; a weak key carried over as retired is dropped
with `--no-overlap`. `keys --rotate` keeps the retired public key in the JWKS for 14 days. After a
key compromise, `keys --rotate --no-overlap` drops the retired keys at once, so every token signed
before stops verifying. The key set holds no identity, so a lost one is replaced with a new one:
tokens signed before stop verifying, and no user changes.
