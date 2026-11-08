# identity-hub

The sign-in hub of Samebase on [Convex](https://convex.dev): the code of the production deployment
of the project `identity-hub`. It mounts `identityBroker` from
[`@samebase/identity-broker`](../../packages/identity-broker), holds the public Google and GitHub
clients of Samebase once, and signs users in to every app that registers with it, samebase.com and
apps built with Samebase alike. It also brokers Convex, Cloudflare, and GitHub API authorization for
samebase.com. It keeps no user accounts; each app creates its own user from the `id_token` it gets.

This folder holds no secrets. The values of the team are the constants in `alchemy.run.ts` and the
connectors, API resources, and policy in `convex/broker.ts`, so a copy of it with other values runs
another team's hub. To start one, ask your agent to copy this folder.

## Deploy

`alchemy.run.ts` is the stack, in the shape of every app of the team with one stage: `prod` is the
production deployment of the Convex project `identity-hub`, and the push is the `deploy` package
script, which checks the key set and pushes the functions. The stack is named after the repository
and this folder, `samebase/samebase/apps/identity-hub`. Its state is in the Convex project
`alchemy-state-store`, with the state of the other stacks of the team. The hub has no previews: no
app points at one, and Google cannot sign in on one, since only the production callback is
registered at Google. `.github/workflows/identity-hub.yml` runs on each push to `main`, and the
stack skips the push when nothing of the hub changed. Pull requests run the checks only.

1. Set `CONVEX_ACCESS_TOKEN`, the team's Convex access token, as a repository secret. The run mints
   the deploy key with it. In the GitHub environment `identity-hub`, which only `main` can use, set
   `GOOGLE_CLIENT_ID` with `GOOGLE_CLIENT_SECRET` and `AUTH_GITHUB_CLIENT_ID` with
   `AUTH_GITHUB_CLIENT_SECRET`, the operator's private Google client and GitHub OAuth App;
   `GOOGLE_APPS_CLIENT_ID` with `GOOGLE_APPS_CLIENT_SECRET` and `AUTH_GITHUB_APPS_CLIENT_ID` with
   `AUTH_GITHUB_APPS_CLIENT_SECRET`, the public Google client and GitHub OAuth App named "Samebase";
   and `PROVIDER_CONVEX_OAUTH_CLIENT_ID` with `PROVIDER_CONVEX_OAUTH_CLIENT_SECRET` and
   `PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID` with `PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET`, and
   `PROVIDER_GITHUB_APP_CLIENT_ID` with `PROVIDER_GITHUB_APP_CLIENT_SECRET`, the team's API OAuth
   applications. Register `https://auth.samebase.com/connections/convex/callback`,
   `https://auth.samebase.com/connections/cloudflare/callback`, and
   `https://auth.samebase.com/connections/github/callback` on those applications.
2. The stack hands the clients from `alchemy.run.ts` to the deployment it pushes: no connector
   variable is set by hand.
3. Create the keys of production once, by hand, with the Convex CLI login:
   `pnpm run keys:init --prod` writes `IDENTITY_BROKER_KEYS`, the signing key, and refuses a
   deployment that has the variable. Every deploy then checks the variable before the push and stops
   when it is missing or holds anything that is not a key set; no deploy ever creates or replaces
   it. `APPS_PAUSED=true`, set by hand, is the emergency brake: it pauses every app but
   samebase.com's production (`convex/broker.ts`).
4. Merge to `main`. The stack adopts the project and its production deployment, so no run needs
   `--adopt`, and it retains both on destroy. Adoption replaces the code and sets the variables of
   the stack. It does not change other variables, the data, or the project. From a development
   machine, `pnpm exec alchemy deploy --stage prod` runs the same stack with the Convex CLI login.

`IDENTITY_BROKER_KEYS` holds the signing keys and no user identity: a user's `sub` is the provider's
own id, such as `google:104325...`. A hub that lost the variable gets a new key set by hand with
`pnpm run keys:init`; its deploys stop until then, and tokens signed before stop verifying.

## Issuer

The hub answers at the deployment's `.convex.site` URL and at the custom domain `auth.samebase.com`.
The stack sets `ISSUER` to that domain: the issuer is the name every app trusts, in discovery, in
every `id_token`, and in the callback URLs registered with GitHub and Google. Changing it later
means changing `IDENTITY_HUB_ISSUER` on every app's deployments and the callback URLs at every
provider in one go; a user's `sub` does not depend on the issuer, so it does not change. An app
reads the issuer from the reply of its registration, so it needs no setting of its own.

## Connectors

`convex/broker.ts` lists four, two per provider:

| Connector     | Credentials                                  | Callback                                   |
| ------------- | -------------------------------------------- | ------------------------------------------ |
| `google`      | The operator's private Google client         | `<issuer>/connectors/google/callback`      |
| `github`      | The operator's private GitHub OAuth App      | `<issuer>/connectors/github/callback`      |
| `google-apps` | The public Google client named "Samebase"    | `<issuer>/connectors/google-apps/callback` |
| `github-apps` | The public GitHub OAuth App named "Samebase" | `<issuer>/connectors/github-apps/callback` |

The variables are the repository secrets of setup step 1, which the stack hands to the deployment.
Each connector always asks the provider for its account screen. A user's `sub` comes from the
provider, so it is `google:<id>` through `google` and through `google-apps` alike; an app that
switches between them keeps its users. Another provider is one more wrapper line, its variables
declared in `convex/convex.config.ts` and handed down the same way, and a name in the policy's
`connectors`.

## Register an app

An app needs no step on the hub. Every app gets its clients at `POST /hub-clients`, from the
`IdentityHub.Client` resource of `@samebase/alchemy-convex/identity-hub` in its Alchemy stack, which
also writes the client into the deployment's variables:

```ts
const client =
  yield *
  IdentityHub.Client("SignInClient", {
    app: "my-app",
    redirectUri: Output.interpolate`${deployment.siteUrl}/auth/hub/callback`,
    deploymentType: stage === "prod" ? "production" : "preview",
    connectors: ["google-apps", "github-apps"],
  });
```

A production or preview deployment asks in its own GitHub Actions run, with GitHub's OIDC token. The
hub checks the token, the `/samebase-verification.json` file of the site, the policy, the hourly
limits, and the blocks. No Samebase account is needed. The answer to a production registration holds
the app's initial access token, and a development server asks with it for a development client. Each
client reads and deletes its own record at `/register/<client>`, and the broker serves no
`/register`.

`connectors` is the client's enrollment: the connectors its sign-ins may use, which the policy
intersects at each sign-in and which never changes on a client. The policy in `convex/broker.ts`
gives the operator, the samebase repository under the samebase organization, every connector in
code, so no mistake on the admin page can lock samebase.com out, and every other registration the
public pair, `google-apps` and `github-apps`. It gives the API resources to the
`samebase-connections` app of the samebase repository alone, and pauses every app but samebase.com's
production while `APPS_PAUSED` is `true`. Connectors… on a client's menu in samebase.com's admin
page grants that client's app a private connector (`google` or `github`), bound to the repository's
recorded owner; its clients use it once they enroll in it at their next deploy, and every step of a
sign-in reads the grant again, so removing it stops the next step. It has no say in the sign-in
page, which shows for every client, samebase.com's production included, unless the admin exempts it.
samebase.com's admin page at `/admin/hub-clients` lists the registrations and every client, with
`IDENTITY_HUB_MODERATION_KEY`, which is set by hand on both deployments. Block repository and Block
owner there are the switches of one repository or owner. Skip the sign-in page there exempts one app
(a repository's production app, or its preview app with its development servers) for as long as the
repository's recorded owner stays the one the admin saw, and Skip the sign-in page for every app
exempts all of them, new ones included. samebase.com's production skips the page through such an
exemption, set once on the admin page. Each change is recorded with the admin's email and reason.
Turning the page back on reaches new sign-ins only: what an app got while its page was off stays
with it.

See the component's [consumer guide](../../packages/identity-broker/docs/consumers.md).

## Operate

The admin functions are internal: `npx convex run --prod broker:<name>`, from a checkout that
selects the project `identity-hub`. The deploy key of the hub is an administrator credential: it can
read and replace the keys and run every internal function. The team's Convex token reaches the hub,
so treat it as an administrator credential too. The Convex CLI ignores `--prod` when
`CONVEX_DEPLOY_KEY` names another deployment, so unset it before an admin command. A cron runs the
broker's cleanup daily: expired requests and codes, sign-in records older than 90 days, and preview
and development clients past their removal date. Every preview and development client gets a removal
date 14 days ahead, and each deploy's read of `/register/<client>` moves it. A deployment whose
client is gone registers a new one. A production client never expires: remove a dead one with
`broker:deleteClient`.

Never run `npx convex import --replace-all` on this deployment, also not with `--component`: it also
deletes the rows of the other components. To restore the tables of one component, import a ZIP of
that component with `--component <name> --replace`.

## License

Apache-2.0.
