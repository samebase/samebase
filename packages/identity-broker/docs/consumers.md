# Consuming the broker from a Convex Auth v2 app

The broker is a plain OpenID Provider, so Convex Auth v2's generic OAuth method is the whole
integration.

```ts
// convex/convex.config.ts
app.use(oauth, {
  name: "authHub",
  httpPrefix: "/oauth/hub",
  env: { CLIENT_ID: app.env.HUB_CLIENT_ID, CLIENT_SECRET: app.env.HUB_CLIENT_SECRET },
});
```

```ts
// convex/auth.ts
import { setupOauth } from "@convex-dev/auth/methods/oauth/server";

const HUB = "https://auth.example.com";

export const { startSignIn: startSignInWithHub, completeSignIn: completeSignInWithHub } =
  setupOauth(
    auth,
    "hub",
    {
      authorizationEndpoint: `${HUB}/authorize`,
      tokenEndpoint: `${HUB}/token`,
      issuer: HUB,
      scopes: ["openid", "email", "profile"],
      profile: (claims) => ({
        id: claims.sub,
        email:
          claims.email_verified === true && typeof claims.email === "string"
            ? claims.email
            : undefined,
        name: typeof claims.name === "string" ? claims.name : undefined,
      }),
    },
    { createUser: internal.users.createUser, onSignIn: internal.users.onSignIn },
    { component: components.authHub, allowedRedirectOrigins: [process.env.SITE_URL!] },
  );
```

Each deployment gets its client from the hub. `POST /hub-clients`
([`src/client/hubClients.ts`](../src/client/hubClients.ts)) gives one to a GitHub Actions run with
GitHub's OIDC token, and to a laptop with the app's own token. In an Alchemy v2 stack, the
`Convex.SharedHubClient` resource of `@samebase/alchemy-convex` asks for it at deploy time, renews
it at each deploy at `/register/<client>`, and deletes a preview client on destroy. The `env` of
`Convex.Deployment` stores the client on the deployment as `HUB_ISSUER`, `HUB_CLIENT_ID`, and
`HUB_CLIENT_SECRET`. Each client uses `client_secret_post`, because Convex Auth's generic OAuth
method posts the client credentials in the body.

The `connector` query parameter on `/authorize` (`connector=github`) skips the chooser for a
first-party app. `sub` is the provider's own id with the provider in front, such as
`github:4076804`: for GitHub and Google the id an app saw when it signed users in to GitHub or
Google directly, the same in every app and every broker. An app that needs the provider's id reads
it from `sub`.

The id_token also carries `connector`, the connector's name.

Each app owns admission and account linking by email. `connector=google` in the authorize URL
selects a connector for the chooser skip and does not enforce a Google-only policy; the app's
admission does.
