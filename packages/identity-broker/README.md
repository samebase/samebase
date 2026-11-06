# identity-broker

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
[`apps/identity-hub`](https://github.com/samebase/samebase/tree/main/apps/identity-hub) is the hub
we run in production, and it is also the example: there is no separate template. To run your own,
copy that folder and change the values in `alchemy.run.ts` and `convex/connectors.ts`, or ask your
agent to do it. Its
[README](https://github.com/samebase/samebase/blob/main/apps/identity-hub/README.md) has the deploy
steps.

## What it is

- `@samebase/identity-broker`: a Convex component plus the host-side endpoints. Authorization code
  flow with PKCE, discovery, JWKS, userinfo, and `POST /hub-clients`, where each deployment of an
  app gets its own client at deploy time. RS256 `id_token`s with public subjects, the provider's own
  id such as `google:104325...`, the same in every app and every broker.
- Connectors are configuration: any OAuth 2.0 provider that publishes RFC 8414 metadata, and any
  OpenID Connect provider. `github()` and `google()` are included.
- API resource providers authorize access without creating an identity. `convexConnection()`,
  `cloudflareConnection()`, and `githubConnection()` use the same authorization and token endpoints
  with the standard `resource` parameter. Only first-party apps can use them.
- `Convex.SharedHubClient` of
  [`@samebase/alchemy-convex`](https://github.com/samebase/samebase/tree/main/packages/alchemy-convex),
  an Alchemy v2 resource, gets a deployment its client from our hub at deploy time.

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
// convex/http.ts
import { httpRouter } from "convex/server";
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
    }),
    google({
      clientId: () => process.env.GOOGLE_CLIENT_ID!,
      clientSecret: () => process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // The one connector of every app that is not the hub's own.
    google({
      name: "google-apps",
      clientId: () => process.env.GOOGLE_APPS_CLIENT_ID!,
      clientSecret: () => process.env.GOOGLE_APPS_CLIENT_SECRET!,
      reserved: true,
      selectAccount: true,
    }),
  ],
  // `POST /hub-clients`, `/register/<client>`, and `/moderation/*`.
  registration: {
    ownRepositoryIds: () => process.env.OWN_REPOSITORY_IDS,
    thirdPartyConnector: "google-apps",
    paused: () => process.env.THIRD_PARTY_PAUSED === "true",
    moderationKey: () => process.env.HUB_MODERATION_KEY,
    terms: "https://example.com/terms",
  },
});

const http = httpRouter();
broker.addHttpRoutes(http);
export default http;
```

```ts
// convex/identityBroker.ts: administration for `npx convex run`
import { broker } from "./http";
export const { deleteClient, deleteApp, listApps, listClients, cleanup } = broker.admin();
```

Keys: `npx identity-broker keys` prints the value for `IDENTITY_BROKER_KEYS`; `keys --rotate`
advances it, and `keys --rotate --no-overlap` replaces a compromised key at once. The key set holds
no user identity, so a lost one is replaced with a new one. `parseKeySet` checks a value's shape
before a deploy, and `assertKeySetUsable` signs a test token with it and verifies that token against
its JWKS.

## Register an app's deployments

`POST /hub-clients` gives a client to one deployment of an app, with no account at the hub:

- A GitHub Actions run sends GitHub's OIDC token (audience `samebase`). A run of `main` gets a
  production client, a pull request a preview client. The return address must be https, and its host
  must serve `/samebase-verification.json` with the repository's numeric id.
  `Convex.SharedHubClient` of `@samebase/alchemy-convex` does this at each deploy.
- A production answer also holds the app's initial access token (RFC 7591 section 1.2). A laptop
  sends it for a development client, on a loopback return address.

The apps of a repository in `ownRepositoryIds` are the hub's own: every connector but a reserved
one, and the API resources. Every other repository's apps sign in only through
`thirdPartyConnector`. Each repository and owner has hourly limits, and `/moderation/blocks` stops a
repository or an owner at once. A Convex Auth v2 app points its generic OAuth method at
`<issuer>/authorize` and `<issuer>/token`; see the
[docs](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/consumers.md).

A preview or development client gets a removal date 14 days ahead, and the daily `cleanup` deletes
it after that date. A read of `/register/<client>` with the client's registration access token
(RFC 7592) renews it and moves the date 14 days forward; run it at each deploy. A sign-in, a
resource authorization, and a provider refresh also move it. A production client never gets a
removal date.

A preview or development client deletes itself with `DELETE /register/<client>`. The administrator
deletes any client with `identityBroker:deleteClient`. A client that is gone is no error.

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
uses `client_secret_post`. The constructors use these methods for code exchange and refresh.

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
