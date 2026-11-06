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
keys. `POST /hub-clients` (`src/client/hubClients.ts`) takes GitHub's OIDC token of a GitHub Actions
run, or the app's initial access token on a laptop, and checks that the return address names the
repository. It is GitHub-first on purpose: the proof is one section of that file, and everything
after it works on GitHub's ids. A second proof would be a second section, not a change to the rest.
A host with another proof can still call `component.registration.register` with
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

Every app belongs to a tenant, such as `gh-<repository id>`, and the host says whether it is
first-party: every connector but a reserved one, and API resources. A third-party app has one
connector. The first client of an app id creates the app, and an existing app keeps what it was
created as. Each client holds its own registration access token, and reads (which renews it) or
deletes its own record at `/register/<client>` (RFC 7592).

A row in `blocks` stops a repository, or every repository of an owner: registration, renewal,
sign-in, code exchange, and provider refresh read it. It is the one block state, and
`moderation.setBlock` its one writer, which also appends the event. Our hub sets it from Block
repository and Block owner on samebase.com's admin page, through `/moderation/blocks`.

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
a requested `scope` (RFC 6749 section 3.3) and returns the scope the provider granted. Convex's team
authorization has no scope parameter, so a requested scope answers `invalid_scope`. Unknown or
multiple resources answer `invalid_target`. The code binds the resource, so `/token` can omit it; if
supplied, it must match exactly. Neither this response nor refresh issues an ID Token.

Only first-party apps can request API access. As with first-party sign-in, the broker adds no
consent screen: the trusted app starts the flow and the provider supplies its authorization screen.
This trust is intentional; clients of third-party apps cannot receive API credentials. The two OAuth
legs have independent state and PKCE values. The browser cookie binds the upstream callback to the
initiating browser. The downstream response includes `iss`, and its code lasts 60 seconds and is
usable once.

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
state. The mutation that saves the provider's answer reads the client, its app, and the blocks
again: a block or a client delete that committed while the provider answered keeps the new access
token from the caller (`401 invalid_client`), and the saved rotation lets the grant work again after
an unblock.

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
the connector callback (RFC 9700 section 2.1.1). A first-party request skips the chooser, not this
binding. A link or a callback that reaches another browser gets an error page, and the request keeps
waiting for the browser that started it.

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

- No refresh tokens for OIDC sign-in: apps keep their own sessions. API authorization supports
  refresh tokens and `offline_access` when its provider does.
- GitHub answers token errors with HTTP 200 and calls `invalid_grant` `bad_refresh_token`. Its
  provider corrects that response before the standard client reads it.
- The token endpoint answers `temporarily_unavailable` when a provider cannot refresh, which RFC
  6749 section 5.2 lists only for the authorization endpoint. Provider-issued access tokens are not
  revocable through the broker's RFC 7009 endpoint.
- No sessions at the broker: `prompt=none` returns `login_required`; there is no logout protocol.
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
- Clients inherit the trust of their app: a first-party app's deployments skip the chooser and
  consent, because every deployment of a first-party app registers at deploy time.
- A third-party app's preview or development client first shows the hub's consent page: the host
  that gets the sign-in, the GitHub repository that registered the client, the deploy, and what the
  app receives. The app's own name is not on it: client metadata is self-asserted (RFC 7591 section
  5), and the host and repository are what the hub checked. Continue goes to the app's one
  connector. Cancel ends on a page of the hub, not at the host, because a user may cancel out of
  distrust (RFC 9700 section 4.11.2); its link back carries `access_denied` (RFC 6749 section
  4.1.2.1) for a user who chooses to return. A third-party production client still shows no page of
  the hub: it goes straight to its connector, and the connector's own screen names the hub, not the
  app. This falls short of RFC 6749 section 10.12, which asks that a client get no authorization
  without the user's awareness of it, and it is the confused deputy shape of the MCP security guide.
  A host that wants this accepts it knowingly and sets `selectAccount`, so the provider shows its
  account screen on each sign-in and a user is never passed through with no click. Blocking the
  app's tenant is the answer to a bad app.
- A refusal before sign-in goes to an error page for a third-party app, not to its redirect URI,
  because nobody reviewed that URI (RFC 9700 section 4.11.2).
- A read of a client (RFC 7592 section 2.1) renews it, and answers without `client_secret` and
  `registration_access_token`, which the section includes. The hub keeps only their hashes, and the
  client already holds both. No request changes a secret: a client that lost it registers a new
  client, and the old one stays valid, because the hub cannot know which one a deployment holds.
- A production client cannot delete itself, which RFC 7592 section 2.3 allows a server to refuse. A
  stack destroy can leave a production deployment running, so only the hub's administrator deletes
  one.
- No loopback exception on redirect URIs: a local deployment registers its exact
  `http://127.0.0.1:<port>/...` URI.
- `auth_time` is the hub's completion time: when the broker completed the sign-in, after the
  connector answered. After a fresh login through an OIDC connector it is the provider's `auth_time`
  instead, which the broker checked against the request's lifetime. The broker never compares an
  upstream `auth_time` with the value of `max_age`.
- A replayed authorization code revokes the code, its request, and its broker refresh grant if
  present. Already issued access tokens remain valid: a `/userinfo` token keeps its five minutes,
  and a provider access token follows the provider's expiry and revocation rules.

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
