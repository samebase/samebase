# @samebase/identity-broker

[![Convex Component](https://www.convex.dev/components/badge/samebase/identity-broker)](https://www.convex.dev/components/samebase/identity-broker)
[![npm](https://img.shields.io/npm/v/@samebase/identity-broker)](https://www.npmjs.com/package/@samebase/identity-broker)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

An OpenID Provider (an **identity broker**) that holds one OAuth client at Google and GitHub for all
your apps and for each of their preview and development deploys. Each deploy registers its exact
callback URL at the broker ([RFC 7591](https://www.rfc-editor.org/rfc/rfc7591.html)), and its users
sign in with the OpenID Connect code flow and PKCE. The broker keeps no user accounts: `sub` is the
provider's name and the provider's id of the user, such as `google:104325678901234567890`.

The broker runs on any platform that can answer a `Request` with a `Response`, over storage that you
bring. The package has two ready hosts: Convex, as a component of your app, and Cloudflare, as a
Worker with one Durable Object.

![Google and GitHub refuse preview deployments because each has a new URL. Identity Broker sits in front of them, so each provider sees one client and one URL, and every app and preview registers its exact URL at deploy.](https://raw.githubusercontent.com/samebase/samebase/main/packages/identity-broker/docs/how-it-works.gif)

0.35.0 replaces the implementation of 0.34.0 and earlier. Their tables and the
`identity-broker keys` command are gone, and no data moves: each client registers again on its next
deploy. The moderation API is back since 0.37.0 ([Moderation](#moderation)), with the same requests
and answers, and the errors of RFC 6750.

## Registration

A broker mounts one registration layer, which decides who may register a client:

- `github(allowList, options)`: a GitHub Actions workflow registers with its OIDC token. The
  allow-list is `"any"`, or entries `{ ownerId, repositoryId? }` of GitHub's numeric ids: an entry
  without `repositoryId` covers every repository of that owner. A repository it covers gets every
  connector of the broker; another one gets only what a connector grant gives it
  ([Moderation](#moderation)). `options.paused`, a `Config<boolean>` read in each request, refuses
  every registration and every sign-in step while it is `true`.
- `stack({ keys })`: a client registers with one of the broker's keys, as `IdentityBroker.Client`
  with `key` does ([An app that uses a broker](#an-app-that-uses-a-broker)). A key with
  `permanent: true` may make production clients; the clients of other keys get a removal date.

Both are exports of `@samebase/identity-broker`.

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
// convex/broker.ts
import { Config } from "effect";
import { github, identityBroker } from "@samebase/identity-broker";
import * as Connectors from "@samebase/identity-broker/connectors";
import { convexBroker } from "@samebase/identity-broker/convex";
import { components } from "./_generated/api";

export const broker = convexBroker(
  components.identityBroker,
  identityBroker({
    // The deployment's site URL, or a custom domain in front of it.
    issuer: "https://happy-animal-123.convex.site",
    connectors: [
      Connectors.google({
        clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
        clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
      }),
    ],
    registration: github([{ repositoryId: "123456789", ownerId: "987654321" }]),
    service: {
      name: "Example",
      terms: "https://example.com/terms",
      privacy: "https://example.com/privacy",
    },
  }),
);

export const cleanup = broker.cleanup;
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
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.cron("identity broker cleanup", "17 4 * * *", internal.broker.cleanup, {});
export default crons;
```

The broker answers every path of the site that the app's own routes do not.

Each command of the broker is its own function of the component, such as
`authRequests:exchangeCode`.

## On Cloudflare

```sh
npm install @samebase/identity-broker effect alchemy @alchemy.run/cloudflare
```

```ts
// src/broker.ts
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import { identityBroker, stack } from "@samebase/identity-broker";
import { DurableObjectStore, brokerWorkerProps } from "@samebase/identity-broker/cloudflare";
import * as Connectors from "@samebase/identity-broker/connectors";

export default class Broker extends Cloudflare.Worker<Broker>()(
  "Broker",
  {
    ...brokerWorkerProps,
    main: import.meta.url,
    name: "example-identity-broker",
    // A domain in a Cloudflare zone of the account. Without it, the workers.dev address.
    domain: "auth.example.com",
    workersDev: false,
  },
  identityBroker({
    issuer: "https://auth.example.com",
    connectors: [
      Connectors.google({
        clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
        clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
      }),
    ],
    registration: stack({
      keys: {
        preview: { key: Config.Redacted("BROKER_PREVIEW_KEY") },
        production: { key: Config.Redacted("BROKER_PRODUCTION_KEY"), permanent: true },
      },
    }),
  }).pipe(Effect.provide(DurableObjectStore)),
) {}
```

```ts
// alchemy.run.ts
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { Config, Effect } from "effect";
import Broker from "./src/broker.ts";

export default Alchemy.Stack(
  "example-identity-broker",
  { providers: Cloudflare.providers() },
  Effect.gen(function* () {
    const broker = yield* Broker;
    // The broker reads `stack`'s keys in each request, so the stack binds them.
    yield* broker.bind("RegistrationKeys", {
      env: {
        BROKER_PREVIEW_KEY: yield* Config.Redacted("BROKER_PREVIEW_KEY"),
        BROKER_PRODUCTION_KEY: yield* Config.Redacted("BROKER_PRODUCTION_KEY"),
      },
    });
    return { url: broker.url };
  }),
);
```

`alchemy deploy` deploys the Worker. The Worker's name, the object's class (`BROKER_STORE_CLASS_ID`)
and its one instance (`BROKER_STORE_INSTANCE_NAME`) are the address of all the broker's data: a new
name starts with empty storage.

A secret can also be another Effect, such as a Secrets Store secret through
`Cloudflare.SecretsStore.ReadSecret`. The broker then builds at its first request.

## An app that uses a broker

An app's Alchemy stack gets its client of a broker from `@samebase/identity-broker/client`. Merge
`IdentityBroker.providers()` with the providers of the hosts that the stack uses:

```ts
// alchemy.run.ts
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as IdentityBroker from "@samebase/identity-broker/client";
import * as Alchemy from "alchemy";
import { Effect, Layer } from "effect";

export default Alchemy.Stack(
  "example-app",
  { providers: Layer.mergeAll(Cloudflare.providers(), IdentityBroker.providers()) },
  Effect.gen(function* () {
    const client = yield* IdentityBroker.Client("BrokerClient", {
      broker: { issuer: "https://auth.example.com" },
      redirectUris: ["https://app.example.com/auth/broker/callback"],
      deploymentType: "production",
      connectors: ["google"],
    });
    // Give these to the app's deployment as IDENTITY_BROKER_ISSUER, _CLIENT_ID and _CLIENT_SECRET.
    const variables = IdentityBroker.Client.variables(client);
    return { clientId: variables.clientId };
  }),
);
```

`IdentityBroker.providers()` holds the client's provider and Alchemy's `Random` provider, for
`IdentityBroker.registrationKey`. A host's collection can hold `Random` too, such as
`Cloudflare.providers()`; Alchemy takes the first one that holds it, and both are the same.

- `IdentityBroker.Client`:
  `{ broker, redirectUris, deploymentType, connectors, app?, initialAccessToken?, key?, softwareVersion? }`
  gets a client of an identity broker, for an app that deploys in its own GitHub Actions run, on any
  host, and for development as a stage of the same stack. `deploymentType` is `production`,
  `preview`, or `development`. A production or preview client needs `permissions: id-token: write`
  in the workflow, and no key and no Samebase account. `redirectUris` lists every return address of
  the deployment, one to eight, one per handler that receives the broker's answers. The origin of
  each https address must serve `/samebase-verification.json` with the numeric GitHub id of the
  repository, `{ "repository": "123" }`, which `gh api repos/<owner>/<name> --jq .id` prints. The
  broker reads it before it registers the client, so the site must be live first. Outputs `status`,
  `issuer`, `clientId`, `clientSecret`, `registrationAccessToken`, `registrationClientUri`,
  `deploymentType`, `app`, `redirectUris`, `connectors`, `initialAccessToken`, and `repository`.
  - `app` is the app's name on the broker, at most 64 characters. Its default is the stack's path in
    the repository, `apps/web` for the stack `owner/repo/apps/web`, and `app` for a stack named
    `owner/repo`. A stack with another name, or a path over 64 characters, sets `app`. The name
    groups the clients of one deployable thing, their budgets, and the initial access token; it
    plays no part in user ids.
  - `connectors` names the broker's connectors the client signs in through, such as
    `["google", "github"]`: at least one name of `[a-z0-9-]{1,64}`. The broker's discovery document
    lists what it offers in `connectors_supported`, and its policy decides what a repository may
    enroll in; a name outside that is refused, and the log names the allowed ones. The set is
    recorded on the client for good, sorted, each once. The app sends `connector=<name>` to
    `/authorize` to skip the broker's page, or nothing to let the user choose among the set.
  - A production registration also gets the app's initial access token (RFC 7591) and the numeric
    repository id, which the state keeps. A renewal keeps both. They are empty for a preview, for a
    development client, and for the off values.
  - A development client needs `initialAccessToken`, and only a development client takes it. The
    client asks the broker with this token in place of the GitHub OIDC token, so it works in
    development. With an empty token, the client gets the off values, and the log says "deploy to
    main once for broker sign-in in development". See
    [The development stage](#the-development-stage).
  - A client of any `deploymentType` with `key` asks a broker on the stack layer with that key, from
    any run, with no GitHub token and no verification file. It waits up to about three minutes for
    the broker to answer discovery, so the run that deploys the broker registers its own client. The
    broker decides whether the key may register a production client. An undefined key gives the off
    values, or fails a `required` client.
  - `IdentityBroker.registrationKey(id, { stage })` gives the key `id` as a redacted Output: in the
    stage that deploys the broker it is an `Alchemy.Random`, kept in state; in any other stage it is
    read from that stage's row, and it is `undefined` before that stage ran. Bind it to the broker
    as a secret, and give it to `key`.
  - Each deploy reads the saved client on the broker with its own token. A client that is gone gets
    a new one, and a client with other `redirectUris`, another `app`, another `deploymentType`, or
    other `connectors` too. A replaced production client stays valid on the broker until its
    administrator deletes it, and a new production client replaces the app's initial access token,
    so a development stage reads the latest state of `prod` before its next registration. A saved
    row whose attributes this version cannot read stops the run with a fixed message, which holds no
    value of the row.
  - A new client logs the broker's issuer. A refusal logs its reason, such as a host that does not
    serve the file, a block, a token of another app, a connector the broker does not offer or allow,
    or the hourly limit it reached.
  - No failure of the broker stops a deploy or a destroy. A failed renewal keeps the saved values.
    Without saved values, `status` is `off`, and `issuer`, `clientId`, and `clientSecret` are the
    off values of a checkout without a broker: `http://127.0.0.1:1`, and `IdentityBroker.DISABLED`
    (`broker-disabled`) for the client ID and the secret. A production or preview run without a
    GitHub OIDC token, such as on a development machine, does the same, and logs no warning.
  - `required: true` makes the run fail unless the broker confirms the client in this run: a
    refusal, a broker that does not answer a registration or a renewal, or a suspended client fails
    it. Set it where sign-in is the product, so a deploy never ships guest sign-in, or a client that
    the broker stopped, with a green run. A failed run saves nothing, and the next run asks the
    broker again.
  - `status` is `suspended` when the broker suspended the client. The state keeps the client and its
    values, so the client works again when the broker lifts the suspension.
  - `IdentityBroker.Client.variables(client)` gives `issuer`, `clientId`, and `clientSecret` for the
    app's deployment: the client's values when `status` is `on`, and the off values when it is `off`
    or `suspended`. Give these to the deployment, not the outputs of the client.
  - `IdentityBroker.Client.read(id, { stage })` gives the attributes of the client `id` in another
    stage of the same stack, from the state store of the stack. When that stage has no row, it gives
    the off attributes and does not fail. `IdentityBroker.Client.ref` fails when the row is missing,
    and a development stage before the first deploy to main has no `prod` row.
  - The resource type is `IdentityBroker.Client`. A row that an earlier version saved as
    `IdentityHub.Client` or `IdentityHub.SharedClient` is the same client: the next deploy updates
    it in place and saves it with the new type, and `read` reads it.
  - A destroy deletes a preview or development client. It does nothing to a production client,
    because the production deployment can stay.
  - `broker` is the identity broker to register at, required: `{ issuer }`, such as
    `{ issuer: "https://auth.example.com" }`. The run registers at `<issuer>/register`, the client
    registration endpoint of RFC 7591, with a GitHub token whose audience is the issuer, and the
    answer must name that issuer. The request sends `redirect_uris`, `software_id` (the app name),
    `software_version`, `token_endpoint_auth_method` (`client_secret_post`), and the broker's own
    `connectors`. The broker must run `@samebase/identity-broker` 0.33.0 or later. An earlier broker
    answers 404, and the client gets the off values. A client is renewed only at the broker that
    issued it: a changed broker registers a new client there, and the old one stays at the old
    broker.

### The development stage

A development checkout gets its client from a stage `dev-<name>` of the app's stack, run on purpose,
not at each dev start. On Convex, `npx convex dev` has made and selected the dev deployment and
pushed the code, and then `alchemy deploy --stage dev-<name>` gives that deployment its variables.
The stage creates nothing and pushes nothing. It has three rows on the deployment that `.env.local`
selects, taken over by its Convex name, with `Convex.Deployment` of
[`@samebase/alchemy-convex`](https://www.npmjs.com/package/@samebase/alchemy-convex):

```ts
// `selected` is the name in CONVEX_DEPLOYMENT of .env.local, such as happy-animal-123, and
// `project` is the project of stage `prod`.
const prod = IdentityBroker.Client.read("BrokerClient", { stage: "prod" });
const site =
  yield *
  Convex.Deployment("Verification", {
    project,
    type: "dev",
    name: selected,
    env: { SAMEBASE_REPOSITORY_ID: prod.repository },
  }).pipe(adopt(true));
const client =
  yield *
  IdentityBroker.Client("BrokerClient", {
    broker: { issuer: "https://auth.example.com" },
    redirectUris: [Output.interpolate`${site.siteUrl}/auth/broker/callback`],
    deploymentType: "development",
    connectors: ["google", "github"],
    initialAccessToken: prod.initialAccessToken,
  });
const variables = IdentityBroker.Client.variables(client);
yield *
  Convex.Deployment("Site", {
    project,
    type: "dev",
    name: selected,
    env: {
      IDENTITY_BROKER_ISSUER: variables.issuer,
      IDENTITY_BROKER_CLIENT_ID: variables.clientId,
      IDENTITY_BROKER_CLIENT_SECRET: variables.clientSecret,
    },
  }).pipe(adopt(true));
```

The imports are `alchemy/AdoptPolicy` for `adopt`, `alchemy/Output` for `Output`,
`@samebase/alchemy-convex` for `Convex`, and `@samebase/identity-broker/client` for
`IdentityBroker`.

1. `read` gives the initial access token and the repository id from the `BrokerClient` row of stage
   `prod`.
2. "Verification" sets `SAMEBASE_REPOSITORY_ID`, which the site serves as
   `/samebase-verification.json`. `adopt` takes over the deployment and the variables that the dev
   start set before.
3. "BrokerClient" asks the broker for a development client on the deployment's site URL with the
   token. A later run renews it. A sign-in renews it too, so a development server in use never needs
   the stage again; a development client expires 14 days after its last run or sign-in.
4. "Site" writes the three variables. It removes only a name that leaves its own `env`, so
   `SAMEBASE_REPOSITORY_ID` stays.

Both deployment rows keep the default removal policy `retain`. `alchemy destroy --stage dev-<name>`
deletes the development client and keeps the deployment.

## Connectors and connections

`connectors` are the providers that users sign in with, in the order that the sign-in page and
discovery name them. `@samebase/identity-broker/connectors` has `google` and `github`, `oidc` for
any OpenID Connect provider found through discovery, and `oauth` for a plain OAuth 2.0 provider with
your own `identity` function. Each connector's callback is `<issuer>/connectors/<name>/callback`.

```ts
import * as Connectors from "@samebase/identity-broker/connectors";

Connectors.oidc({
  name: "okta",
  label: "Okta",
  issuer: "https://example.okta.com",
  clientId: Config.Redacted("OKTA_CLIENT_ID"),
  clientSecret: Config.Redacted("OKTA_CLIENT_SECRET"),
});
```

The broker keeps no session, so the provider answers an app's `prompt=login` and `max_age`. Set
`promptLogin: true` when the provider documents `prompt=login`: a request with `prompt=login` or
`max_age=0` then goes upstream as a forced login. Set `maxAge: true` when the provider obeys
`max_age` and returns `auth_time`: a positive `max_age` then goes upstream as itself, and the broker
accepts the provider's login when its `auth_time` is within that age. With only `promptLogin`, a
positive `max_age` is a forced login. A connector with neither answers such a request with
`login_required`. Both are off by default, and `google` and `github` have neither.

`connections` are optional. Each one lets a client get the provider's own tokens for an API, with
the `resource` of RFC 8707. `@samebase/identity-broker/connections` has `convex`, `cloudflare` and
`github`, and `oauth` for another OAuth 2.0 server. Each connection's callback is
`<issuer>/connections/<name>/callback`.

```ts
import * as Connections from "@samebase/identity-broker/connections";

const connections = [
  Connections.cloudflare({
    clientId: Config.Redacted("CLOUDFLARE_CLIENT_ID"),
    clientSecret: Config.Redacted("CLOUDFLARE_CLIENT_SECRET"),
    scopes: ["workers-scripts.read"],
  }),
  Connections.oauth({
    name: "example",
    resource: "https://api.example.com",
    // The provider's `iss` (RFC 9207), or else the origin of its token endpoint.
    issuer: "https://auth.example.com",
    authorizationEndpoint: "https://auth.example.com/authorize",
    tokenEndpoint: "https://auth.example.com/token",
    scopes: ["read"],
    clientId: Config.Redacted("EXAMPLE_CLIENT_ID"),
    clientSecret: Config.Redacted("EXAMPLE_CLIENT_SECRET"),
  }),
];
```

`oauth` sends the client secret with HTTP Basic authentication unless `tokenEndpointAuthMethod` is
`client_secret_post`.

Give them to `identityBroker(options)` as `connections`. The broker checks the names, providers,
issuers and resources of both lists at its start.

## Moderation

The GitHub layer can mount the moderation API, for the broker's administrator page. Every request
needs the moderation key as a Bearer token.

```ts
import { Config } from "effect";
import { github } from "@samebase/identity-broker";
import { moderation } from "@samebase/identity-broker/moderation";

const registration = github("any", {
  moderation: moderation({ key: Config.Redacted("IDENTITY_BROKER_MODERATION_KEY") }),
});
```

Give `registration` to `identityBroker(options)`. A broker without `moderation` has no `/moderation`
route. The broker reads the key in each request, and refuses every request while it is unset or
empty. On Cloudflare, bind it to the Worker in your stack, as `stack`'s keys are bound.

| Request                                    | Answer                                                               |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `GET /moderation/counts`                   | The registrations of the last day and of the last week               |
| `GET`, `POST /moderation/blocks`           | The blocks and their history; block or unblock a repository or owner |
| `GET`, `POST /moderation/sign-in-page`     | The exemptions from the sign-in page; set or remove one              |
| `GET`, `POST /moderation/connector-grants` | The connector grants; grant or revoke one                            |
| `GET /moderation/clients`                  | The newest clients, or with `?owner=` those of one GitHub owner      |
| `DELETE /moderation/clients/<client id>`   | Deletes one client                                                   |

A change applies at once: a block refuses the next step of each sign-in, and a grant or an exemption
rewrites the clients it covers.

`@samebase/identity-broker/moderation/api` declares the API with `HttpApi` of `effect/http-api` and
imports no server code, so a browser or a Convex action can import it alone. The same declaration
gives a typed client and the OpenAPI document:

```ts
import { Effect } from "effect";
import { FetchHttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient, HttpApiMiddleware, OpenApi } from "effect/http-api";
import { ModerationApi, ModerationKey } from "@samebase/identity-broker/moderation/api";

const blockRepository = (key: string, repositoryId: string) =>
  Effect.gen(function* () {
    const { moderation } = yield* HttpApiClient.make(ModerationApi, {
      baseUrl: "https://auth.example.com",
    });
    return yield* moderation.changeBlock({
      payload: {
        action: "block",
        kind: "repository",
        githubId: repositoryId,
        reason: "Spam",
        adminEmail: "admin@example.com",
      },
    });
  }).pipe(
    Effect.provide(
      HttpApiMiddleware.layerClient(ModerationKey, ({ next, request }) =>
        next(HttpClientRequest.bearerToken(request, key)),
      ),
    ),
    Effect.provide(FetchHttpClient.layer),
  );

const openApi = OpenApi.fromApi(ModerationApi);
```

An error answer is a JSON object with `error` and `error_description`
([RFC 6749 section 5.2](https://www.rfc-editor.org/rfc/rfc6749.html#section-5.2)), and every answer
has `Cache-Control: no-store`. The typed client fails with the error's class.

| Status | `error`             | When                                                                                          |
| ------ | ------------------- | --------------------------------------------------------------------------------------------- |
| 401    |                     | No Bearer token: no body, and `WWW-Authenticate: Bearer realm="moderation"`                   |
| 401    | `invalid_token`     | Not the key, with `WWW-Authenticate: Bearer error="invalid_token"` (RFC 6750 section 3.1)     |
| 400    | `invalid_request`   | A path, query or body that does not decode                                                    |
| 400    | `unknown_connector` | A grant of a connector that the broker does not have                                          |
| 409    | `owner_changed`     | A grant or an exemption for an owner while the broker records another owner of the repository |

## Write your own host

`makeHandle(registration)` of `@samebase/identity-broker` is the whole broker: an Effect program
from a `Request` to a `Response`. It never fails; an error answers 500. A host provides its
services:

- `Store`: your storage (below).
- `brokerSettings(settings)`: the issuer, the connectors, the service (optional) and the signing
  keys (`keys`, by default `IDENTITY_BROKER_KEYS` read with Effect's `Config`).
- `Random.layer`, `Fetch.layer` and `brokerLogger`: `crypto.getRandomValues`, `fetch` with no
  redirects, and one JSON log line per entry. Time is Effect's `Clock`.

For connections, give `makeHandle` the part that `makeConnections(connections)` of
`@samebase/identity-broker/connections` makes.

The `Store` has one method, `run(name, args)`: one command of a closed list, with its arguments and
its result as JSON values. The host decodes it with `decodeCommand(name, args)` and runs it as one
transaction:

- `command.run(now, tx)` runs it over `tx`, a `TxShape<Tables>` of your storage, and returns the
  result. `now` is Effect's `Clock` when the command arrives. A throw means the transaction must
  roll back. `command.runAsync` is the same for a `Tx` whose calls are async.
- One command sees one consistent state and its own writes, and nothing else writes meanwhile. When
  `command.readOnly` is true, the `Tx` may refuse writes.
- The database may retry a transaction after a write conflict, as Convex does. The `Store` never
  sends a command again after a lost answer, because it may have committed: it fails with
  `StoreUnavailable`, and the broker answers 500.
- For SQLite, `sqlTx(exec, isOpen, readOnly)` is the `Tx`, and `ensureLayout(exec)` makes the
  tables. Other storage implements `TxShape` over `tables`, each table's schema and indexes.

Run `cleanupBatch(cutoff)` once a day through the `Store` until it answers `false`. It deletes
expired rows, each batch its own commands.

A host on Node with `node:sqlite`:

```ts
// broker.ts
import type { DatabaseSync } from "node:sqlite";
import { Clock, Config, Effect, Layer } from "effect";
import {
  cleanupBatch,
  decodeCommand,
  ensureLayout,
  Fetch,
  brokerLogger,
  brokerSettings,
  makeHandle,
  Random,
  sqlTx,
  stack,
  Store,
  type Exec,
  type Tables,
  type TxShape,
} from "@samebase/identity-broker";
import * as Connectors from "@samebase/identity-broker/connectors";

export const makeStore = (database: DatabaseSync) => {
  const exec: Exec = (sql, params) => database.prepare(sql).all(...params);
  /** Runs `body` as one transaction, over a `Tx` that closes when it ends. */
  const transaction = <A>(body: (tx: TxShape<Tables>) => A, readOnly = false): A => {
    let open = true;
    database.exec("BEGIN");
    try {
      const result = body(sqlTx(exec, () => open, readOnly));
      open = false;
      database.exec("COMMIT");
      return result;
    } catch (error) {
      open = false;
      database.exec("ROLLBACK");
      throw error;
    }
  };
  transaction(() => ensureLayout(exec));
  const store = Store.of({
    run: (name, args) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        const command = decodeCommand(name, args);
        return transaction((tx) => command.run(now, tx), command.readOnly);
      }),
  });
  return { store, transaction };
};

export const makeBroker = (database: DatabaseSync) => {
  const { store } = makeStore(database);
  const handle = makeHandle(
    stack({ keys: { preview: { key: Config.Redacted("BROKER_PREVIEW_KEY") } } }),
  );
  const services = Layer.mergeAll(
    brokerSettings({
      issuer: "https://auth.example.com",
      connectors: [
        Connectors.google({
          clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
          clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
        }),
      ],
    }),
    Random.layer,
    Fetch.layer,
    Layer.succeed(Store, store),
    brokerLogger,
  );
  return {
    /** A fetch handler, for `Deno.serve`, `Bun.serve` or any server of `Request` and `Response`. */
    fetch: (request: Request) => Effect.runPromise(handle(request).pipe(Effect.provide(services))),
    /** Once a day. */
    cleanup: () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const cutoff = yield* Clock.currentTimeMillis;
          while (yield* cleanupBatch(cutoff)) {}
        }).pipe(Effect.provideService(Store, store)),
      ),
  };
};
```

### Test your storage

`checkStore` of `@samebase/identity-broker/testing` checks a host's storage against the package's
memory store: random inserts, replaces, deletes and index queries, rollback of a failed transaction,
and a sign-in and a connection through the `Store`. It needs `fast-check`, and runs in any test
runner. With Vitest:

```ts
// broker.test.ts
import { DatabaseSync } from "node:sqlite";
import { Effect } from "effect";
import { test } from "vitest";
import { checkStore } from "@samebase/identity-broker/testing";
import { makeStore } from "./broker.ts";

test("the broker's storage passes the host test kit", async () => {
  await checkStore(() => {
    const { store, transaction } = makeStore(new DatabaseSync(":memory:"));
    return { store, transaction: async (body) => transaction((tx) => Effect.runSync(body(tx))) };
  });
}, 60_000);
```

`make` gives a fresh, empty store on each call. `checkStore` rejects with the first difference.

## Environment variables

- `IDENTITY_BROKER_KEYS`: the signing keys. This prints a key set with one RS256 key:

  ```sh
  node -e 'crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]).then((pair) => crypto.subtle.exportKey("jwk", pair.privateKey)).then((jwk) => { const kid = crypto.randomUUID(); console.log(JSON.stringify({ version: 1, keys: [{ kid, status: "current", privateJwk: { ...jwk, kid, use: "sig" } }] })); })'
  ```

- Each name of a `Config` in your settings, such as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
  the keys of `stack`.

On Convex, set them on the deployment, for example
`npx convex env set IDENTITY_BROKER_KEYS < keys.json`. On Cloudflare, `alchemy deploy` binds each
`Config` secret that the broker reads at its start to the Worker as a secret, with the value of the
deploying shell's variable of that name. These are the secrets of `connectors`, `connections` and
`keys` that are a bare `Config`, not one inside another Effect. The broker reads the other `Config`
values in each request: the keys of `stack`, the moderation `key` and `paused` of `github`. The
stack binds those, as `broker.bind(...)` in `alchemy.run.ts` shows
([On Cloudflare](#on-cloudflare)).

At each provider, set the redirect URL of the OAuth client to `<issuer>/connectors/<name>/callback`
for a connector, such as `<issuer>/connectors/google/callback`, and
`<issuer>/connections/<name>/callback` for a connection.
