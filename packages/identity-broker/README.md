# @samebase/identity-broker

[![Convex Component](https://www.convex.dev/components/badge/samebase/identity-broker)](https://www.convex.dev/components/samebase/identity-broker)
[![npm](https://img.shields.io/npm/v/@samebase/identity-broker)](https://www.npmjs.com/package/@samebase/identity-broker)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

An OpenID Provider (a **hub**) that holds one OAuth client at Google and GitHub for all your apps
and for each of their preview and development deploys. Each deploy registers its exact callback URL
at the hub ([RFC 7591](https://www.rfc-editor.org/rfc/rfc7591.html)), and its users sign in with the
OpenID Connect code flow and PKCE. The hub keeps no user accounts: `sub` is the provider's name and
the provider's id of the user, such as `google:104325678901234567890`.

The hub runs on Convex, as a component of your app, or on Cloudflare, as a Worker with one Durable
Object.

![Google and GitHub refuse preview deployments because each has a new URL. Identity Broker sits in front of them, so each provider sees one client and one URL, and every app and preview registers its exact URL at deploy.](https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/how-it-works.gif)

0.35.0 replaces the implementation of 0.34.0 and earlier. Their tables, their moderation API and the
`identity-broker keys` command are gone, and no data moves: each client registers again on its next
deploy.

## Registration

A hub mounts one registration layer, which decides who may register a client:

- `github(allowList)`: a GitHub Actions workflow of an allowed repository registers with its OIDC
  token. Each entry is `{ repositoryId, ownerId }`, GitHub's numeric ids.
- `stack({ keys })`: a client registers with one of the hub's keys, as `IdentityHub.Client` of
  [`@samebase/alchemy-convex`](https://www.npmjs.com/package/@samebase/alchemy-convex) does. A key
  with `permanent: true` may make production clients; the clients of other keys get a removal date.

## On Convex

```sh
npm install @samebase/identity-broker convex effect
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
// convex/hub.ts
import { Config } from "effect";
import { convexHub, github, hubSettings } from "@samebase/identity-broker/convex";
import { components } from "./_generated/api";

export const hub = convexHub(
  components.identityBroker,
  hubSettings({
    // The deployment's site URL, or a custom domain in front of it.
    issuer: "https://happy-animal-123.convex.site",
    connectors: {
      google: {
        clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
        clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
      },
    },
    service: {
      name: "Example",
      terms: "https://example.com/terms",
      privacy: "https://example.com/privacy",
    },
  }),
  github([{ repositoryId: "123456789", ownerId: "987654321" }]),
);

export const cleanup = hub.cleanup;
```

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { hub } from "./hub";

const http = httpRouter();
hub.addHttpRoutes(http);
export default http;
```

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.cron("identity hub cleanup", "17 4 * * *", internal.hub.cleanup, {});
export default crons;
```

The hub answers every path of the site that the app's own routes do not.

## On Cloudflare

```sh
npm install @samebase/identity-broker effect alchemy @alchemy.run/cloudflare
```

```ts
// src/hub.ts
import { Config } from "effect";
import { hubWorker } from "@samebase/identity-broker/cloudflare";
import { stack } from "@samebase/identity-broker/stack";

export default hubWorker({
  main: import.meta.url,
  name: "example-identity-hub",
  // A domain in a Cloudflare zone of the account. Or `issuer`, for the workers.dev address.
  domain: "auth.example.com",
  connectors: {
    google: {
      clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
      clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
    },
  },
  registration: stack({
    keys: {
      preview: { key: Config.Redacted("HUB_PREVIEW_KEY") },
      production: { key: Config.Redacted("HUB_PRODUCTION_KEY"), permanent: true },
    },
  }),
  service: {
    name: "Example",
    terms: "https://example.com/terms",
    privacy: "https://example.com/privacy",
  },
});
```

```ts
// alchemy.run.ts
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import Hub from "./src/hub.ts";

export default Alchemy.Stack(
  "example-identity-hub",
  { providers: Cloudflare.providers() },
  Effect.gen(function* () {
    const hub = yield* Hub;
    return { url: hub.url };
  }),
);
```

`alchemy deploy` deploys the Worker. The Worker's name, the object's class `Hub` and its one
instance are the address of all the hub's data: a new name starts with empty storage.

## Environment variables

- `IDENTITY_BROKER_KEYS`: the signing keys. This prints a key set with one RS256 key:

  ```sh
  node -e 'crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]).then((pair) => crypto.subtle.exportKey("jwk", pair.privateKey)).then((jwk) => { const kid = crypto.randomUUID(); console.log(JSON.stringify({ version: 1, keys: [{ kid, status: "current", privateJwk: { ...jwk, kid, use: "sig" } }] })); })'
  ```

- Each name of a `Config` in your settings, such as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
  the keys of `stack`.

On Convex, set them on the deployment, for example
`npx convex env set IDENTITY_BROKER_KEYS < keys.json`. On Cloudflare, `alchemy deploy` binds each
one to the Worker as a secret, with the value of the deploying shell's variable of that name, or
from the account's Secrets Store for a name in `secretsStore`.

At each provider, set the redirect URL of the OAuth client to `<issuer>/connectors/google/callback`
or `<issuer>/connectors/github/callback`.
