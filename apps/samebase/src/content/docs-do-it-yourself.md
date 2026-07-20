# Do it yourself: deploy the Samebase stack for $0/month

You do not need a Samebase account to use the stack Samebase recommends:

- GitHub for the repository
- Convex for the backend and database
- Cloudflare Workers for delivery, static assets included

This page is the manual path. It is more clicks than Samebase, but you end in the same place: every
resource in your own provider accounts.

## What costs $0/month

An idle or small app fits inside the providers' free tiers:

- GitHub Free includes private repositories.
- Convex Free & Starter includes a real deployment with function calls and storage included.
- On Cloudflare Workers, requests to static assets are free and unlimited. Requests that invoke the
  Worker itself use the Workers request and CPU limits.
- Workers Builds includes free monthly build minutes for deploying from Git.

The receipt ledger has the source links and current limits: [Receipts](/docs/receipts).

## 1: Create provider accounts

Create or sign in to:

- [GitHub](https://github.com/)
- [Convex](https://www.convex.dev/)
- [Cloudflare](https://www.cloudflare.com/)

## 2: Put the app code in GitHub

The app Samebase deploys is the starter template `samebase/app`, built by hand, commit by commit, so
it stays small and readable. It is private today and becomes public at release; until then, the
template arrives in your GitHub account through Samebase's `create_repository`.

Without the template, bring your own app: the rest of this guide assumes a repository whose build
outputs static assets and whose backend is Convex. Add Convex from the project checkout:

```bash
pnpm add convex
pnpm exec convex dev
```

Commit the project and push it to GitHub.

## 3: Create a Convex project

In the Convex dashboard, create a project for the app.

For Cloudflare builds, create a Convex deploy key for production. If you want pull-request previews
with their own Convex deployment, create a separate preview deploy key too.

## 4: Deploy on Cloudflare Workers

Use Cloudflare Workers, not a new Cloudflare Pages project: Cloudflare points new projects at
Workers, and one Worker deploys both the code and the static assets.

Connect the GitHub repository to Workers Builds. Configure the build command your app uses, then add
both build variables in Cloudflare's visible build-variable table: `CONVEX_DEPLOY_KEY` for the
production deploy key and `PREVIEW_CONVEX_DEPLOY_KEY` for the preview deploy key. The build script
uses `WORKERS_CI_BRANCH` to choose the branch-appropriate key.

After the first successful build, Cloudflare serves the app from your Worker. Pushes to the default
branch deploy production; pull requests deploy previews when previews are configured.

## 5: Operate it

Use the provider tools directly:

- GitHub owns the code, pull requests, and repository settings.
- Convex owns backend logs, data, functions, deploy keys, and deployments.
- Cloudflare owns Worker deploys, request logs, routes, and domains.

The operate docs give the provider-direct commands for logs and domains:

- [Production logs](/docs/operate/production-logs)
- [Custom domain](/docs/operate/custom-domain)

## What the Samebase account adds

- `create_repository` runs this whole page as one action: it creates the GitHub repository, seeds
  the app, provisions Convex and a Cloudflare Worker, wires Workers Builds, and installs the deploy
  keys.
- `connect_existing_repository` imports a repository without touching Convex or Cloudflare.
- `connect_convex_project` and `connect_cloudflare_worker` attach provider resources you created
  yourself.
- `get_user_vaults` returns the stored vault, app, Worker, and Convex project coordinates. The
  dashboard loads current provider state directly from Cloudflare and Convex.

These are the same operations the dashboard buttons run and the Samebase MCP server exposes to
coding agents.

## Deleting Samebase

If you created the app through Samebase, deleting the Samebase account does not stop the running
app. The repository is in your GitHub account, the backend is in your Convex team, and the Worker is
in your Cloudflare account. Remove those provider resources directly when you want the app gone.
