# identity-broker

[![Convex component](https://img.shields.io/badge/Convex_component-identity--broker-8D2676)](https://www.convex.dev/components/samebase/identity-broker)
[![npm](https://img.shields.io/npm/v/@samebase/identity-broker)](https://www.npmjs.com/package/@samebase/identity-broker)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

An OpenID Provider that runs on [Convex](https://convex.dev). One deployment holds a team's sign-in
connections once, such as Google and GitHub, and signs users in to many small apps. The broker keeps
no user accounts and no sessions: every sign-in goes upstream again, and each app creates its own
user from the `id_token` it receives.

![Google and GitHub refuse preview deployments because each has a new URL. Identity Broker sits in front of them, so each provider sees one client and one URL, and every app and preview registers its exact URL at deploy.](https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/how-it-works.gif)

Why: every new app otherwise needs its own OAuth app registrations, and a preview deployment with a
fresh callback URL cannot have them at all. With the broker, an app registers each deployment as a
client at deploy time and never touches GitHub or Google.

## Start from our hub

A hub is a small Convex app that mounts this component.
[`apps/identity-hub`](https://github.com/samebase/samebase/tree/main/apps/identity-hub) is
samebase.com's own hub. To run your own, use the template
[samebase/identity-hub](https://github.com/samebase/identity-hub), which Samebase runs unchanged as
its public hub; its README has the deploy steps. An app from the Samebase starter asks for the
connectors `google` and `github`, and its `IdentityHub.Client` takes your hub as
`hub: { issuer, terms }`.

## What it is

- `@samebase/identity-broker`: a Convex component plus the host-side endpoints. Authorization code
  flow with PKCE, discovery, JWKS, userinfo, and `POST /hub-clients`, where each deployment of an
  app gets its own client at deploy time. RS256 `id_token`s with public subjects, the provider's own
  id such as `google:104325...`, the same in every app and every broker.
- Connectors are configuration: any OAuth 2.0 provider that publishes RFC 8414 metadata, and any
  OpenID Connect provider. `github()` and `google()` are included.
- API resource providers authorize access without creating an identity. `convexConnection()`,
  `cloudflareConnection()`, and `githubConnection()` use the same authorization and token endpoints
  with the standard `resource` parameter. A hub's policy says which clients may use them.
- `IdentityHub.Client` of
  [`@samebase/alchemy-convex/identity-hub`](https://github.com/samebase/samebase/tree/main/packages/alchemy-convex),
  an Alchemy v2 resource, gets a deployment its client from the hub that the stack names, at deploy
  time.

## Mount it

```sh
npm install @samebase/identity-broker
```

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import identityBroker from "@samebase/identity-broker/convex.config";

const app = defineApp();
app.use(identityBroker);
export default app;
```

```ts
// convex/broker.ts: the whole hub config, and its admin functions for `npx convex run broker:<name>`
import { defineIdentityBroker, github, google } from "@samebase/identity-broker";
import { components } from "./_generated/api";

export const broker = defineIdentityBroker({
  component: components.identityBroker,
  issuer: process.env.ISSUER ?? process.env.CONVEX_SITE_URL!,
  keys: () => process.env.IDENTITY_BROKER_KEYS,
  connectors: [
    github({
      clientId: () => process.env.GITHUB_CLIENT_ID!,
      clientSecret: () => process.env.GITHUB_CLIENT_SECRET!,
      selectAccount: true,
    }),
    google({
      clientId: () => process.env.GOOGLE_CLIENT_ID!,
      clientSecret: () => process.env.GOOGLE_CLIENT_SECRET!,
      selectAccount: true,
    }),
  ],
  // `POST /hub-clients`, `/register/<client>`, `/moderation/*`, and the policy.
  registration: {
    name: "Example",
    terms: "https://example.com/terms",
    privacy: "https://example.com/privacy",
    moderationKey: () => process.env.IDENTITY_HUB_MODERATION_KEY,
    // What each registration may do, from its facts: run at registration and at each use. It can
    // name only the connectors and resources above: a misspelt one does not compile.
    policy: () => ({
      connectors: ["github", "google"],
      resources: [],
      paused: process.env.APPS_PAUSED === "true",
    }),
  },
});

export const { deleteClient, deleteApp, listApps, listClients, cleanup } = broker.admin();
```

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { broker } from "./broker";

const http = httpRouter();
broker.addHttpRoutes(http);
export default http;
```

```ts
// convex/crons.ts: expired requests and codes, old audit rows, and expired preview clients
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("identity broker cleanup", { hourUTC: 4, minuteUTC: 17 }, internal.broker.cleanup, {});
export default crons;
```

Convex reads the routes from `http.ts` and the schedule from `crons.ts`, so those two stay their own
files; everything else of the hub is in `broker.ts`.

Keys: `npx identity-broker keys` prints the value for `IDENTITY_BROKER_KEYS`; `keys --rotate`
advances it, and `keys --rotate --no-overlap` replaces a compromised key at once. The key set holds
no user identity, so a lost one is replaced with a new one. `parseKeySet` checks a value's shape
before a deploy, and `assertKeySetUsable` signs a test token with it and verifies that token against
its JWKS.

## Register an app's deployments

`POST /hub-clients` gives a client to one deployment of an app, with no account at the hub:

- A GitHub Actions run sends GitHub's OIDC token whose audience is the hub's issuer, so no other hub
  can use a token made for this one. A run of `main` gets a production client, a pull request a
  preview client. The return address must be https, and its host must serve
  `/samebase-verification.json` with the repository's numeric id. `IdentityHub.Client` of
  `@samebase/alchemy-convex/identity-hub` does this at each deploy, at the hub of its `hub` prop.
- A production answer also holds the app's initial access token (RFC 7591 section 1.2). A
  development server sends it for a development client, on a loopback return address.
- The body names the app, the return address, a version, and `connectors`: the connectors the client
  enrolls in, such as `["google", "github"]`. Each must be one of the hub's and one that the policy
  allows this registration; else the answer is `400 invalid_connectors` with the allowed names. The
  enrollment is on the client for good: a deployment that wants another set registers a new client.
  The 201 answer and the client's RFC 7592 record repeat it, and discovery lists the hub's names in
  `connectors_supported`.

`registration.policy` decides what a registration may do, from facts the hub checked: the
repository's numeric id and `owner/name`, its owner's id, the app name, the deployment type, the
return address, and the proof (`github-actions` or `initial-access-token`). It answers the
`connectors` the registration may enroll in and use, the API `resources` (by provider name) its
client may authorize, and whether it is `paused`. The broker runs it at registration and at each use
(`/authorize`, `/continue`, the connector callback, code exchange, API authorization, and provider
refresh) on the client's and the tenant's rows, so a change applies to existing clients at once. A
policy that throws or answers a malformed value refuses the request; nothing is allowed by default.
A paused client gets no registration, sign-in, code exchange, or refresh, and keeps its reads,
renewals, revocations, and self-deletes. The sign-in page is not the policy's: it shows for every
client unless the hub's administrator exempts its repository, or every app, at
`/moderation/sign-in-page`, and the broker applies that itself. A repository's exemption covers
every app and deployment of it, and counts while the repository's recorded owner, and the client's,
is the owner the row is bound to. The administrator can also grant one repository a connector that
the policy does not give it, at `/moderation/connector-grants`: its clients may then enroll in and
use it, bound to an owner in the same way. Every step of a sign-in reads the grants again, so a
revoked grant stops the next step.

Each repository and owner has hourly limits, and `/moderation/blocks` stops a repository or an owner
at once, policy or not. `/moderation/clients?owner=<id>` lists the clients of every repository of
that GitHub account and `DELETE /moderation/clients/<id>` deletes one, for a console that shows each
developer their own. A Convex Auth v2 app points its generic OAuth method at `<issuer>/authorize`
and `<issuer>/token`; see the
[docs](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/consumers.md).

A preview or development client gets a removal date 14 days ahead, and the daily `cleanup` deletes
it after that date. A read of `/register/<client>` with the client's registration access token
(RFC 7592) renews it and moves the date 14 days forward; run it at each deploy. A sign-in, a
resource authorization, and a provider refresh also move it. A production client never gets a
removal date.

A preview or development client deletes itself with `DELETE /register/<client>`. The administrator
deletes any client with `broker:deleteClient`. A client that is gone is no error.

## Connect provider APIs

Add `resources` alongside `connectors` in `defineIdentityBroker`:

```ts
import { convexConnection, cloudflareConnection } from "@samebase/identity-broker";

const resources = [
  convexConnection({ clientId: convexClientId, clientSecret: convexClientSecret }),
  cloudflareConnection({ clientId: cloudflareClientId, clientSecret: cloudflareClientSecret }),
];
```

Each credential value above is a function that reads the host's secret. Register these provider
callbacks once: `<issuer>/connections/convex/callback` and
`<issuer>/connections/cloudflare/callback`. Preview apps register their exact callback with the hub
using the existing client registration. Use a separate client if API connections and sign-in have
different callback URLs. Configure the Cloudflare OAuth client with `client_secret_basic`; Convex
uses `client_secret_post`. The constructors use these methods for code exchange and refresh. In hub
mode the policy's `resources` names the providers a client may authorize; without hub mode every
client may authorize every one.

Send an authorization-code request with S256 PKCE and one `resource`: `https://api.convex.dev` for
Convex team access, or `https://api.cloudflare.com/client/v4/` for Cloudflare. Omit `openid`. The
broker requests the provider's configured scope. Redeem the code at `/token` with client
authentication, `redirect_uri`, and `code_verifier`. The response is an OAuth bearer token response
for that provider API, without an ID Token. The app still owns its users and connection records.

Cloudflare supplies refresh credentials, which the broker retains in the same private component and
exposes through an opaque, client-bound refresh token. Use the standard `refresh_token` grant and
`/revoke` on disconnect. Convex's team token has no refresh grant or advertised expiry. Revoking the
broker grant stops future refresh; it does not revoke a provider access token already issued. See
[design.md](docs/design.md#api-authorization) for retention and refresh failure behavior.

## Standards

OAuth 2.0 and the OAuth 2.1 draft (code flow, PKCE S256, exact redirect URIs, `iss` on responses),
OpenID Connect Core and Discovery, RFC 8414, RFC 8707, RFC 7009, RFC 9207, RFC 9700, and the JWT,
JWS, JWK and cookie standards under them. A client gets its credentials out of band, which RFC 6749
section 2 leaves open.
[docs/standards.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/standards.md)
lists each with its sections and status, and departures are named in
[docs/design.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/design.md).

## License

Apache-2.0.
