# identity-broker

[![Convex Component](https://www.convex.dev/components/badge/samebase/identity-broker)](https://www.convex.dev/components/samebase/identity-broker)
[![npm](https://img.shields.io/npm/v/@samebase/identity-broker)](https://www.npmjs.com/package/@samebase/identity-broker)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

identity-broker is a [Convex](https://convex.dev) component that implements
[RFC 7591: OAuth 2.0 Dynamic Client Registration Protocol](https://www.rfc-editor.org/rfc/rfc7591.html).

This allows you to use a single OAuth client (like Google sign-in) for all your apps and for all
your preview and development deploys.

![Google and GitHub refuse preview deployments because each has a new URL. Identity Broker sits in front of them, so each provider sees one client and one URL, and every app and preview registers its exact URL at deploy.](https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/how-it-works.gif)

## Standards

| Request                     | Standard                                                                                                                                                                | Main differences                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Sign a user in              | [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html) and Discovery, with the OAuth 2.0 code flow                                                | PKCE (`S256`) is required. The broker has no sessions, so no `prompt=none`, no logout, and no refresh token.    |
| Register a deployment       | [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591.html) and [OpenID Connect Dynamic Client Registration](https://openid.net/specs/openid-connect-registration-1_0.html) | Each request needs an initial access token: there is no open registration. Only `web` clients, with RS256.      |
| Read or delete a client     | [RFC 7592](https://www.rfc-editor.org/rfc/rfc7592.html)                                                                                                                 | No update: `PUT` answers `405`. A read does not return the client secret, because the hub stores only its hash. |
| Token errors of those calls | [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html)                                                                                                                 | The token goes in the `Authorization` header only.                                                              |

RFC 7591 leaves one decision to the server: who may register. A hub accepts GitHub's signed token of
the deploy as the initial access token, and checks a file on the site
([What the hub checks](#what-the-hub-checks)).

The broker is not OpenID Certified.
[docs/standards.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/standards.md)
lists each standard with its sections and the results of the OpenID conformance suite.
[docs/design.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/design.md#named-departures-from-the-specifications)
lists every difference.

## How it works

A **hub** is a Convex deployment that runs this component.

- **At deploy**, the app's GitHub Actions workflow registers its callback URL at the hub. The hub
  [checks](#what-the-hub-checks) that the repository controls that URL, and returns a client ID and
  secret for that deployment.
- **At sign-in**, the app runs the OpenID Connect code flow against the hub. The hub's page names
  the app, and the user picks Google or GitHub.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/sign-in-page-dark.png">
    <img width="460" src="https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/sign-in-page-light.png" alt="The hub's sign-in page for a preview deployment. It names the host pr-12.weather-app.example.com, the preview pr-12, and the GitHub repository octo-org/weather-app, and offers Continue with Google and Continue with GitHub.">
  </picture>
</p>

The `id_token`:

```json
{
  "iss": "https://id.samebase.com",
  "aud": "<the client ID of the deployment>",
  "sub": "google:104325678901234567890",
  "connector": "google",
  "email": "ada@example.com",
  "email_verified": true,
  "name": "Ada Lovelace",
  "picture": "https://lh3.googleusercontent.com/a/photo",
  "auth_time": 1794412800,
  "iat": 1794412800,
  "exp": 1794413100
}
```

`sub` is the provider's name and the provider's ID of the user. It is the same in every app and at
every hub, so an app can move to another hub and keep its users. The broker stores no users and no
sessions. Your app keeps both.

## Pick a setup

- **Use the public hub**, `https://id.samebase.com`. Any GitHub repository can use it under
  [Samebase's terms](https://samebase.com/terms), with no account and nothing to run. Google's
  screen says "Samebase", and the hub's page names your app. Read
  [Use a hub from your app](#use-a-hub-from-your-app), or start from
  [samebase/base](https://github.com/samebase/base), which has it from the first deploy.
- **Run your own hub** for your name on Google's screen, your Google project, and your rules for who
  may register. Start from the [samebase/identity-hub](https://github.com/samebase/identity-hub)
  template. It takes about 15 minutes.
- **Mount the component** in your own Convex app. Read [Mount it](#mount-it).

## Use a hub from your app

The examples use the public hub. For another hub, use its issuer in place of
`https://id.samebase.com`.

### 1. Serve the verification file

Serve `/samebase-verification.json` at the root of the site that has your callback URL:

```json
{ "repository": "123456789" }
```

The value is the numeric ID of your GitHub repository: `GITHUB_REPOSITORY_ID` in a workflow, or
`gh api repos/<owner>/<name> --jq .id`. The hub reads the file when you register, so the site must
be live first. The hub follows no redirect.

### 2. Register each deployment when it deploys

Register from a GitHub Actions workflow with `permissions: id-token: write`. A run on a pull request
gets a preview client. A run on `main` gets a production client.

With [Alchemy](https://alchemy.run), use `IdentityHub.Client` of
[`@samebase/alchemy-convex`](https://github.com/samebase/samebase/tree/main/packages/alchemy-convex#resources):

```ts
IdentityHub.Client("IdentityHubClient", {
  hub: { issuer: "https://id.samebase.com" },
  connectors: ["google", "github"],
  redirectUris: [Output.interpolate`${deployment.siteUrl}/auth/hub/callback`],
  deploymentType: stage === "prod" ? "production" : "preview",
});
```

Without Alchemy, send two requests. The first gets a GitHub token with this hub as its audience. The
second is the registration request of
[RFC 7591](https://www.rfc-editor.org/rfc/rfc7591.html#section-3.1), with that token as the initial
access token:

```sh
token=$(curl -sS -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://id.samebase.com" | jq -r .value)

curl -sS https://id.samebase.com/register -o client.json \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["https://pr-12.weather-app.example.com/auth/hub/callback"],
    "software_id": "weather-app",
    "software_version": "1.4.0",
    "connectors": ["google", "github"],
    "token_endpoint_auth_method": "client_secret_post"
  }'
```

A standard client library can send this request. The package's tests use
[`openid-client`](https://github.com/panva/openid-client).

| Member                       | Value                                                                                  | If you leave it out                              |
| ---------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `redirect_uris`              | 1 to 8 callback URLs of this deployment. The hub matches each exactly at `/authorize`. | The hub refuses the request                      |
| `software_id`                | Your name for the app, 1 to 64 characters. One repository can hold several apps.       | `app`                                            |
| `software_version`           | Any text up to 256 characters, such as the commit.                                     | `unknown`                                        |
| `connectors`                 | The providers that this client signs in through. This member is the hub's own.         | Each provider that the hub gives your repository |
| `token_endpoint_auth_method` | `client_secret_post` or `client_secret_basic`. Convex Auth needs `client_secret_post`. | `client_secret_basic`                            |

The hub ignores other members, such as `client_name` and `logo_uri`.

The `201` answer:

```json
{
  "client_id": "cl_...",
  "client_secret": "...",
  "client_id_issued_at": 1794412800,
  "client_secret_expires_at": 0,
  "registration_access_token": "...",
  "registration_client_uri": "https://id.samebase.com/register/cl_...",
  "redirect_uris": ["https://pr-12.weather-app.example.com/auth/hub/callback"],
  "client_name": "pr-12",
  "software_id": "gh-123456789/weather-app",
  "software_version": "1.4.0",
  "token_endpoint_auth_method": "client_secret_post",
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "application_type": "web",
  "subject_type": "public",
  "id_token_signed_response_alg": "RS256",
  "connectors": ["github", "google"],
  "issuer": "https://id.samebase.com",
  "terms": "https://samebase.com/terms"
}
```

Two values come from GitHub's token, so a request cannot fake them: `client_name`, which is the
deployment (`prod` or `pr-12`), and the repository ID at the start of `software_id`.

Register once for each deployment and keep the answer. At each later deploy, send a `GET` to
`registration_client_uri` with `registration_access_token` as the Bearer
([RFC 7592](https://www.rfc-editor.org/rfc/rfc7592.html#section-2.1)). The read keeps a preview
client from its [removal](#a-clients-lifetime). A `401` means that the client is gone: register
again. `IdentityHub.Client` does all of this.

To change a client's callback URLs or connectors, register a new client.

### 3. Point your sign-in at the hub

Use any OpenID Connect client library. Discovery is at
`https://id.samebase.com/.well-known/openid-configuration`.

- Flow: authorization code with PKCE (`S256`).
- Scopes: `openid email profile`.
- Client authentication at `/token`: the method that the client registered.
- `connector=google` on the `/authorize` URL offers only that provider. With no `connector`, the
  page offers every provider of the client.

For Convex Auth, the
[consumer guide](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/consumers.md)
has the code.

Key each account by `sub`.

### On a development machine

A development machine has no GitHub token. The answer to a production registration has one more
member for this, `initial_access_token`. Send it as the Bearer of `POST /register`, with the same
`software_id`, to get a development client. A development client may use loopback callbacks such as
`http://localhost:3000/auth/hub/callback`, with no verification file.

Keep this token secret: its holder can register development clients for the app. Each new production
registration replaces it. With Alchemy,
`IdentityHub.Client.read("IdentityHubClient", { stage: "prod" })` reads it from the production
stage's state.

### What the hub checks

The token proves which repository asks. The file proves that the repository controls the site that
users return to. The hub's page shows both to the user.

The hub refuses a registration at the first check that fails:

| Check                                                                                                     | Status and `error`            | `reason`                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| GitHub signed the token for a workflow run, and its audience is this hub's issuer                         | `401 invalid_token`           |                                                                                                     |
| The run is a `pull_request`, or a `push` or `workflow_dispatch` on `main`                                 | `403 insufficient_scope`      | `run_not_allowed`                                                                                   |
| Each member that the hub reads has a value that the hub can register                                      | `400 invalid_client_metadata` |                                                                                                     |
| There are 1 to 8 callback URLs, each `https` on a DNS name, with no fragment                              | `400 invalid_redirect_uri`    |                                                                                                     |
| The hub's policy has not paused the app                                                                   | `403 insufficient_scope`      | `paused`                                                                                            |
| The hub's rules give this repository each connector that it asks for                                      | `400 invalid_client_metadata` | `invalid_connectors`, with the names that are `allowed`                                             |
| The hub's administrator has not blocked the repository or its owner                                       | `403 insufficient_scope`      | `blocked`                                                                                           |
| The repository and its owner are inside their hourly limits                                               | `429 rate_limited`            |                                                                                                     |
| Each site in `redirect_uris` serves the verification file, and the file names the repository of the token | `400 invalid_redirect_uri`    | `verification_file_missing`, `host_unreachable`, `verification_file_invalid`, `repository_mismatch` |

A refusal is a JSON object with `error` and `error_description` (RFC 7591 section 3.2.2). `reason`
is the hub's own member. A `401` or a `403` has the `WWW-Authenticate` header of
[RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html#section-3).

A token names one hub as its audience, so no other hub accepts it.

## Mount it

You need a Convex app, and an OAuth client at each provider that you offer.

1. Install the package.

   ```sh
   npm install @samebase/identity-broker
   ```

2. Add the component.

   ```ts
   // convex/convex.config.ts
   import { defineApp } from "convex/server";
   import identityBroker from "@samebase/identity-broker/convex.config";

   const app = defineApp();
   app.use(identityBroker);
   export default app;
   ```

3. Write the hub's config. This file is the whole hub.

   ```ts
   // convex/broker.ts
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
     registration: {
       // The name on the sign-in page, and the two links under it.
       name: "Example",
       terms: "https://example.com/terms",
       privacy: "https://example.com/privacy",
       // The Bearer of the administrator's API.
       moderationKey: () => process.env.IDENTITY_HUB_MODERATION_KEY,
       // What each registration may do. See "The policy" below.
       policy: () => ({
         connectors: ["github", "google"],
         resources: [],
         paused: process.env.APPS_PAUSED === "true",
       }),
     },
   });

   // For `npx convex run broker:<name>`, and for the cron below.
   export const { deleteClient, deleteApp, listApps, listClients, cleanup } = broker.admin();
   ```

4. Add the routes and the daily cleanup.

   ```ts
   // convex/http.ts
   import { httpRouter } from "convex/server";
   import { broker } from "./broker";

   const http = httpRouter();
   broker.addHttpRoutes(http);
   export default http;
   ```

   ```ts
   // convex/crons.ts
   import { cronJobs } from "convex/server";
   import { internal } from "./_generated/api";

   const crons = cronJobs();
   crons.daily(
     "identity broker cleanup",
     { hourUTC: 4, minuteUTC: 17 },
     internal.broker.cleanup,
     {},
   );
   export default crons;
   ```

5. Make the signing keys. `npx identity-broker keys` prints the value of the variable
   `IDENTITY_BROKER_KEYS`.
6. At each provider, set the redirect URL of your OAuth client to the hub's callback:
   `<issuer>/connectors/google/callback` and `<issuer>/connectors/github/callback`.

The issuer is a URL with no path, such as `https://auth.example.com`. The hub serves `/authorize`,
`/token`, and its other routes at the root of that host.

More that you can use:

- **Other providers.** Add any OpenID Connect provider to `connectors` as a plain object. An OAuth
  2.0 provider that publishes RFC 8414 metadata works too, with a function that reads the user's
  identity from its API.
- **Key rotation.** `npx identity-broker keys --rotate` reads the current value on stdin and prints
  the next one. After a key leak, add `--no-overlap` to stop the old key at once. The key set holds
  nothing about users, so you can replace a lost one with a new one.
- **Key checks before a deploy.** `parseKeySet` checks the shape of a value. `assertKeySetUsable`
  signs a test token with it and verifies that token.
- **Tests.** `register` from `@samebase/identity-broker/test` adds the component to a `convex-test`
  backend.
- **Your own registration.** Without `registration`, the hub has no `/register` and no
  `/moderation`. Create each client in your own mutation, with `newClientCredentials` and
  `component.registration.register`, after your own check of who asks.

## Operate a hub

### The policy

`registration.policy` is your function. The broker gives it facts that the broker checked, and the
function answers what that app may do.

```ts
policy: ({ ownerId }) => ({
  // Google for the repositories of one organization, GitHub for every repository.
  connectors: ownerId === "9919" ? ["github", "google"] : ["github"],
  resources: [],
  paused: false,
}),
```

| Fact             | Value                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `repositoryId`   | GitHub's numeric ID of the repository                                |
| `repository`     | `owner/name` at registration                                         |
| `ownerId`        | GitHub's numeric ID of the account that owns the repository          |
| `app`            | The app's name                                                       |
| `deploymentType` | `production`, `preview`, or `development`                            |
| `redirectUris`   | The client's callback URLs                                           |
| `proof`          | `github-actions`, or `initial-access-token` for a development client |

| Answer       | Meaning                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| `connectors` | The connectors that the client may register for and sign in through                           |
| `resources`  | The provider APIs that the client may authorize ([Provider API access](#provider-api-access)) |
| `paused`     | `true` stops registration, sign-in, code exchange, and refresh for the client                 |

The broker calls the policy at registration and at each step of each sign-in, so a change of the
policy applies to existing clients at their next request. TypeScript rejects a connector or resource
name that the hub does not have. If the function throws or returns a malformed answer, the broker
refuses the request.

### The administrator's API

These endpoints change what the hub allows with no deploy. Each request needs the moderation key as
the Bearer.

| Endpoint                                   | Use                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GET`, `POST /moderation/blocks`           | Block a repository or an owner. A block stops every request at once, whatever the policy says.         |
| `GET`, `POST /moderation/connector-grants` | Give one repository a connector that the policy does not give it.                                      |
| `GET`, `POST /moderation/sign-in-page`     | Let one repository, or every app, skip the hub's page. The browser then goes straight to the provider. |
| `GET /moderation/clients?owner=<id>`       | List every client, or with `?owner=<id>` the clients of one GitHub account's repositories.             |
| `DELETE /moderation/clients/<client id>`   | Delete one client.                                                                                     |
| `GET /moderation/counts`                   | Read the registration counts.                                                                          |

A grant or a skip covers every app and deployment of the repository. It is bound to the repository's
owner at the time you set it, so a repository that moves to another owner loses it.

### A client's lifetime

A production client stays until you delete it.

The hub deletes a preview or development client 14 days after its last use. A use is a sign-in, a
read of `/register/<client id>`, a provider API authorization, or a provider token refresh. A
deployment that still deploys or still has users keeps its client.

A preview or development client can delete itself with `DELETE /register/<client id>` and its
registration access token. `deleteClient` of `broker.admin()` deletes any client.

### Logs

The broker writes one console line for each completed sign-in, each refused sign-in, and each answer
to a registration:

```
hub_event {"event":"sign_in","repository":"octo-org/weather-app","app":"weather-app","deployment":"preview","connector":"google","reason":null}
```

`event` is `sign_in`, `sign_in_refused`, `registration`, or `registration_refused`. `reason` says
why the hub refused a request. The line names no user, token, or callback URL. A Convex log stream
sends the lines to your log service.

### What is stored

| Row                                      | Kept for                              |
| ---------------------------------------- | ------------------------------------- |
| Apps and clients                         | Until deleted, as above               |
| Authorization requests                   | 10 minutes                            |
| Authorization codes                      | 60 seconds, one use                   |
| One audit row for each issued `id_token` | 90 days                               |
| Provider refresh tokens                  | Until revoked, or 90 days with no use |

The audit row holds the app, the client, the connector, the `sub`, and the time. The broker keeps
nothing else about a user after the sign-in request ends.
[docs/design.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/design.md)
describes each table and each decision.

## Provider API access

A hub can also get your app an access token for a provider's API on behalf of a user. An app that
deploys to its user's Convex team or Cloudflare account uses this. A preview gets it through the
client that it registered.

Add `resources` beside `connectors` in `defineIdentityBroker`. Each credential is a function that
reads a secret of the hub:

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

| Provider   | The `resource` an app asks for          | Redirect URL to set at the provider        | Token endpoint method of your client there |
| ---------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Convex     | `https://api.convex.dev`                | `<issuer>/connections/convex/callback`     | `client_secret_post`                       |
| Cloudflare | `https://api.cloudflare.com/client/v4/` | `<issuer>/connections/cloudflare/callback` | `client_secret_basic`                      |
| GitHub App | `https://api.github.com`                | `<issuer>/connections/github/callback`     | `client_secret_post`                       |

The policy's `resources` names the providers that a client may use.

The app's side:

1. Add the callback URL that receives the answer to the client's `redirect_uris`, beside the sign-in
   callback.
2. Send the user to `/authorize` with PKCE (`S256`), one `resource` from the table, and no `openid`
   scope. The broker asks the provider for the scope that the hub configured.
3. Exchange the code at `/token` with the client's credentials, `redirect_uri`, and `code_verifier`.
   The answer is an OAuth bearer token response for that provider's API. It has no `id_token`.
4. Where the answer has a `refresh_token`, use the standard `refresh_token` grant at `/token`, and
   `/revoke` when the user disconnects.

Cloudflare gives a refresh token. The broker keeps it in the component and gives the app an opaque
token of its own, bound to the client. Convex's team token has no refresh grant and no stated
expiry. `/revoke` stops later refreshes. It does not revoke an access token that the provider
already issued.
[docs/design.md](https://github.com/samebase/samebase/blob/main/packages/identity-broker/docs/design.md#api-authorization)
describes how long grants stay and what happens when a refresh fails.

## License

Apache-2.0.
