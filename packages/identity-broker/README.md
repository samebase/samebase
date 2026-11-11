# identity-broker

[![Convex Component](https://www.convex.dev/components/badge/samebase/identity-broker)](https://www.convex.dev/components/samebase/identity-broker)
[![npm](https://img.shields.io/npm/v/@samebase/identity-broker)](https://www.npmjs.com/package/@samebase/identity-broker)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

**Google and GitHub sign-in for every deployment of every app: production, each pull request
preview, each dev server.** An OpenID Provider as a [Convex](https://convex.dev) component. You
register one OAuth client at each provider, once. Each deployment then gets its own client from the
broker when it deploys. The broker keeps no user accounts and no sessions: each app gets a standard
`id_token` and owns its users.

![Google and GitHub refuse preview deployments because each has a new URL. Identity Broker sits in front of them, so each provider sees one client and one URL, and every app and preview registers its exact URL at deploy.](https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/how-it-works.gif)

## Three ways to use it

**Sign-in in your app, with nothing to run.** Samebase runs a public hub at `id.samebase.com`. The
[samebase/base](https://github.com/samebase/base) starter uses it from its first deploy. In an
[Alchemy](https://alchemy.run) stack, it is one resource of
[`@samebase/alchemy-convex`](https://github.com/samebase/samebase/tree/main/packages/alchemy-convex):

```ts
IdentityHub.Client("IdentityHubClient", {
  hub: { issuer: "https://id.samebase.com" },
  connectors: ["google", "github"],
  redirectUris: [Output.interpolate`${deployment.siteUrl}/auth/hub/callback`],
  deploymentType: stage === "prod" ? "production" : "preview",
});
```

**Your own hub.** [samebase/identity-hub](https://github.com/samebase/identity-hub) is a template:
this component plus settings. Your name on the sign-in page, your Google project, your rules about
who may register. About 15 minutes.

**The component in your own Convex app.** [Mount it](#mount-it), below.

## What it does

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/sign-in-page-dark.png">
    <img width="460" src="https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/sign-in-page-light.png" alt="The broker's sign-in page for a preview deployment. It names the host pr-12.weather-app.example.com, the preview pr-12, and the GitHub repository octo-org/weather-app, and offers Continue with Google and Continue with GitHub.">
  </picture>
</p>

- **A standard OpenID Provider.** Authorization code flow with PKCE, discovery, JWKS, userinfo, and
  RS256 `id_token`s. Any OpenID Connect client can use it. For Convex Auth, see the
  [consumer guide](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/consumers.md).
- **A client for each deployment, at deploy time.** `POST /hub-clients` takes the OIDC token of the
  GitHub Actions run as proof of the repository. An app needs no account at the hub and no shared
  secret.
- **A sign-in page that names the app.** The user sees the host, the deployment, and the GitHub
  repository that registered it, before the provider's screen.
- **No user table.** `sub` is the provider's own id, such as `google:104325...`, the same in every
  app and at every hub. An app can move to another hub and keep its users.
- **Rules as code.** One `policy` function says which repositories may register, which connectors
  and provider APIs each may use, and whether apps are paused. It runs at registration and at each
  use.
- **An administrator's API.** Block a repository or an owner, grant one repository a connector, let
  a trusted app skip the sign-in page, list and delete clients.
- **Provider API access.** The same hub authorizes access to the Convex, Cloudflare, and GitHub APIs
  for an app's users, with the standard `resource` parameter.
- **Connectors are configuration.** `google()` and `github()` are included. Any OpenID Connect
  provider is a plain object. An OAuth 2.0 provider that publishes RFC 8414 metadata is one too,
  with a function that reads the user's identity from its API.
- **Cleanup and logs.** A preview client is deleted 14 days after its last use. Each sign-in and
  each registration writes one log line that names no user.

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
files; everything else of the hub is in `broker.ts`. Register one callback with each provider:
`<issuer>/connectors/google/callback` and `<issuer>/connectors/github/callback`.

Keys: `npx identity-broker keys` prints the value for `IDENTITY_BROKER_KEYS`; `keys --rotate`
advances it, and `keys --rotate --no-overlap` replaces a compromised key at once. The key set holds
no user identity, so a lost one is replaced with a new one. `parseKeySet` checks a value's shape
before a deploy, and `assertKeySetUsable` signs a test token with it and verifies that token against
its JWKS.

Tests: `register` of `@samebase/identity-broker/test` adds the component to a host's `convex-test`
backend.

## Register an app's deployments

`POST /hub-clients` gives a client to one deployment of an app, with no account at the hub.

### The proof

- **A GitHub Actions run** sends GitHub's OIDC token whose audience is the hub's issuer, so no other
  hub can use a token made for this one. A run of `main` gets a production client, a pull request a
  preview client. `IdentityHub.Client` of `@samebase/alchemy-convex/identity-hub` does this at each
  deploy, at the hub of its `hub` prop.
- **A development server** sends the app's initial access token (RFC 7591 section 1.2), which a
  production answer holds. It gets a development client.

### The request

- `redirectUris`: one to eight return addresses, each matched exactly at `/authorize`. A deployment
  registers every handler that receives the hub's answers, such as a sign-in callback and a
  connections callback, on one client. Each https origin must serve `/samebase-verification.json`
  with the repository's numeric id. A GitHub run's list holds no loopback address; a development
  client may mix loopback and verified https addresses.
- `connectors`: the connectors the client enrolls in, such as `["google", "github"]`. Each must be
  one of the hub's and one that the policy allows this registration; else the answer is
  `400 invalid_connectors` with the allowed names. The enrollment is on the client for good: a
  deployment that wants another set registers a new client.
- The app's name and a version.

The 201 answer and the client's RFC 7592 record repeat the list and the enrollment, and discovery
lists the hub's connector names in `connectors_supported`. A Convex Auth v2 app points its generic
OAuth method at `<issuer>/authorize` and `<issuer>/token`; the
[consumer guide](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/consumers.md)
has the code.

### The policy

`registration.policy` decides what a registration may do, from facts the hub checked: the
repository's numeric id and `owner/name`, its owner's id, the app name, the deployment type, the
return addresses, and the proof (`github-actions` or `initial-access-token`). It answers three
things:

- `connectors`: the connectors the registration may enroll in and use.
- `resources`: the provider APIs, by name, that its client may authorize.
- `paused`: a paused client gets no registration, sign-in, code exchange, or refresh, and keeps its
  reads, renewals, revocations, and self-deletes.

The broker runs it at registration and at each use (`/authorize`, `/continue`, the connector
callback, code exchange, API authorization, and provider refresh) on the client's and the tenant's
rows, so a change applies to existing clients at once. A policy that throws or answers a malformed
value refuses the request; nothing is allowed by default.

### The administrator

The holder of the moderation key changes these at runtime, with no deploy of the hub:

- **Blocks.** `/moderation/blocks` stops a repository or an owner at once, policy or not.
- **Connector grants.** `/moderation/connector-grants` gives one repository a connector that the
  policy does not give it. Every step of a sign-in reads the grants again, so a revoked grant stops
  the next step.
- **The sign-in page.** The page shows for every client. `/moderation/sign-in-page` exempts one
  repository, or every app, and the browser then goes straight to the provider.
- **Clients.** `/moderation/clients?owner=<id>` lists the clients of every repository of that GitHub
  account and `DELETE /moderation/clients/<id>` deletes one, for a console that shows each developer
  their own.

A grant and an exemption cover every app and deployment of a repository, and count while the
repository's recorded owner, and the client's, is the owner the row is bound to. A transferred
repository does not keep them. Each repository and each owner also has hourly limits on
registrations.

### A client's lifetime

A preview or development client gets a removal date 14 days ahead, and the daily `cleanup` deletes
it after that date. A read of `/register/<client>` with the client's registration access token
(RFC 7592) renews it and moves the date 14 days forward; run it at each deploy. A sign-in, a
resource authorization, and a provider refresh also move it. A production client never gets a
removal date.

A preview or development client deletes itself with `DELETE /register/<client>`. The administrator
deletes any client with `broker:deleteClient`. A client that is gone is no error.

## Connect provider APIs

API resource providers authorize access to a provider's API without creating an identity. Add
`resources` alongside `connectors` in `defineIdentityBroker`:

```ts
import {
  cloudflareConnection,
  convexConnection,
  githubConnection,
} from "@samebase/identity-broker";

const resources = [
  convexConnection({ clientId: convexClientId, clientSecret: convexClientSecret }),
  cloudflareConnection({ clientId: cloudflareClientId, clientSecret: cloudflareClientSecret }),
  githubConnection({ clientId: githubAppClientId, clientSecret: githubAppClientSecret }),
];
```

Each credential value above is a function that reads the host's secret. Register these provider
callbacks once: `<issuer>/connections/convex/callback`, `<issuer>/connections/cloudflare/callback`,
and `<issuer>/connections/github/callback`. Preview apps register their exact callback with the hub
using the existing client registration, in the same `redirectUris` list as the sign-in callback.
Configure the Cloudflare OAuth client with `client_secret_basic`; Convex and GitHub use
`client_secret_post`. The constructors use these methods for code exchange and refresh. In hub mode
the policy's `resources` names the providers a client may authorize; without hub mode every client
may authorize every one.

Send an authorization-code request with S256 PKCE and one `resource`: `https://api.convex.dev` for
Convex team access, `https://api.cloudflare.com/client/v4/` for Cloudflare, or
`https://api.github.com` for the user access token of a GitHub App. Omit `openid`. The broker
requests the provider's configured scope. Redeem the code at `/token` with client authentication,
`redirect_uri`, and `code_verifier`. The response is an OAuth bearer token response for that
provider API, without an ID Token. The app still owns its users and connection records.

Cloudflare supplies refresh credentials, which the broker retains in the same private component and
exposes through an opaque, client-bound refresh token. Use the standard `refresh_token` grant and
`/revoke` on disconnect. Convex's team token has no refresh grant or advertised expiry. Revoking the
broker grant stops future refresh; it does not revoke a provider access token already issued. See
[design.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/design.md#api-authorization)
for retention and refresh failure behavior.

## Logs

The broker writes one console line, `hub_event` and a JSON object, for each sign-in that ends with
tokens, each sign-in that a block, the policy, or a limit refuses, and each answer to
`POST /hub-clients`:

```
hub_event {"event":"sign_in","repository":"octo-org/weather-app","app":"weather-app","deployment":"preview","connector":"google","reason":null}
```

`event` is `sign_in`, `sign_in_refused`, `registration`, or `registration_refused`, and `reason`
says why a request was refused. The line names no user, token, or return address. A log stream of
the deployment carries it out of Convex.

## What is stored

Apps, clients, authorization requests for ten minutes, authorization codes for sixty seconds, and an
audit row per issued `id_token` for 90 days. Apart from those audit rows, nothing about a user
outlives the sign-in request that carried it. There are no accounts, no sessions, and no passwords.
[docs/design.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/design.md)
has each table and each decision.

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
