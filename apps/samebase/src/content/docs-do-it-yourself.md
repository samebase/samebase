# Do it yourself: deploy the Samebase stack for $0/month

You do not need a Samebase account to use the stack Samebase recommends. The stack is ordinary
provider infrastructure:

- GitHub for the repository
- Convex for the backend and database
- Cloudflare Workers for delivery, with static assets served by Workers

Samebase exists to make the provider joins one action, keep a truthful registry, and expose the same
operations to coding agents over MCP. The providers are still yours.

## What costs $0/month

An idle or small app can fit inside the providers' free tiers:

- GitHub Free includes private repositories.
- Convex Free & Starter includes a real deployment with included function calls and storage.
- Cloudflare Workers serves static assets for free and unlimited requests. Dynamic Worker requests
  use the Workers request and CPU limits.
- Workers Builds includes free monthly build minutes for deploying from Git.

The receipt ledger has the source links and current limits: [Receipts](/docs/receipts).

## Manual path

This is the provider-direct path. It is more work than Samebase, but it leaves you with the same
ownership shape.

## 1: Create provider accounts

Create or sign in to:

- [GitHub](https://github.com/)
- [Convex](https://www.convex.dev/)
- [Cloudflare](https://www.cloudflare.com/)

Use whatever login method you prefer. Samebase does not own these accounts.

## 2: Put the app code in GitHub

Create a GitHub repository for your app. Until the Samebase starter repository is public, start from
the official provider templates or from your own Vite app:

```bash
pnpm create cloudflare@latest my-app --framework=react
```

That Cloudflare starter creates a Workers project with static assets. Add Convex to the app from the
project checkout:

```bash
cd my-app
pnpm add convex
pnpm exec convex dev
```

Commit the project and push it to GitHub.

## 3: Create a Convex project

In the Convex dashboard, create a project for the app. Convex gives the app its backend functions,
database, and realtime sync. The database is reached through Convex functions, not directly from the
browser.

For Cloudflare builds, create a Convex deploy key for production. If you want pull-request previews
with their own Convex deployment, create a separate preview deploy key too.

## 4: Deploy on Cloudflare Workers

Use Cloudflare Workers, not a new Cloudflare Pages project. Cloudflare's own guidance for new
projects is to start on Workers, and Workers can deploy both the Worker code and the static assets
as one unit.

Connect the GitHub repository to Workers Builds. Configure the build command your app uses, then add
the Convex deploy key as `CONVEX_DEPLOY_KEY` in the production build environment. If you created a
preview deploy key, add it as `PREVIEW_CONVEX_DEPLOY_KEY` for preview builds.

After the first successful build, Cloudflare serves the app from your Worker. Pushes to the default
branch deploy production; pull requests can deploy previews when previews are configured.

## 5: Operate it provider-direct

Use the provider tools directly:

- GitHub owns the code, pull requests, and repository settings.
- Convex owns backend logs, data, functions, deploy keys, and deployments.
- Cloudflare owns Worker deploys, request logs, routes, and domains.

Samebase's operate docs give the provider-direct commands for logs and domains:

- [Production logs](/docs/operate/production-logs)
- [Custom domain](/docs/operate/custom-domain)

## What the Samebase account adds

The account adds convenience and coordination, not lock-in:

- `create_repository` creates the GitHub repository, seeds the app, provisions Convex, provisions a
  Cloudflare Worker, wires Workers Builds, and installs the Convex deploy keys in one action.
- `connect_existing_repository` imports a repository without touching Convex or Cloudflare.
- `connect_convex_deployment` and `connect_cloudflare_worker` attach provider resources you created
  yourself.
- `get_user_vaults` returns the current registry state and names the next repair action when
  infrastructure is degraded.

Those are the same operations the dashboard buttons run and the Samebase MCP server exposes to
coding agents.

## Deleting Samebase

If you created the app through Samebase, deleting the Samebase account does not stop the running
app. The repository is in your GitHub account, the backend is in your Convex team, and the Worker is
in your Cloudflare account. Remove those provider resources directly when you want the app gone.
