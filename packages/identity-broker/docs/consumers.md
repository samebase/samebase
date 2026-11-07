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
GitHub's OIDC token, and to a development server with the app's own token. In an Alchemy v2 stack,
the `Convex.SharedHubClient` resource of `@samebase/alchemy-convex` asks for it at deploy time,
renews it at each deploy at `/register/<client>`, and deletes a preview client on destroy. The `env`
of `Convex.Deployment` stores the client on the deployment as `HUB_ISSUER`, `HUB_CLIENT_ID`, and
`HUB_CLIENT_SECRET`. Each client uses `client_secret_post`, because Convex Auth's generic OAuth
method posts the client credentials in the body.

A client enrolls in connectors at registration: `connectors: ["google-apps", "github-apps"]` on
`Convex.SharedHubClient` at our hub, which the hub checks against its connectors
(`connectors_supported` in discovery), its policy, and the connectors its administrator granted the
app, and which the client cannot change. The `connector` query parameter on `/authorize` is a
space-delimited list of the enrolled names (`connector=google-apps+github-apps` in a URL). One name
goes straight to that connector when the hub's administrator exempted the app, or every app, from
the sign-in page, and otherwise shows the hub's page with that one button; no parameter offers every
connector the client may use; several names offer those. A name the client is not enrolled in is a
request error. `sub` is the provider's own id with the provider in front, such as `github:4076804`:
for GitHub and Google the id an app saw when it signed users in to GitHub or Google directly, the
same in every app and every broker. An app that needs the provider's id reads it from `sub`.

The id_token also carries `connector`, one string: the connector the user signed in with. It can
differ from the provider in `sub`: a sign-in through `google-apps` has `connector: "google-apps"`
and `sub: "google:<id>"`. Key an account by `sub`, and check `connector` against the method's
connector name, never against the provider.

Each app owns admission and account linking by email. `connector=google-apps` in the authorize URL
selects the connector of that sign-in and does not enforce a Google-only policy; the app's admission
does.
