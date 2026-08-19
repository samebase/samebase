# Do it yourself: deploy the Samebase stack for $0/month

You can deploy the Samebase starter without a Samebase account. The repository, database, and Worker
stay in your provider accounts.

## 1. Create the provider accounts

Create or sign in to these three accounts:

- [GitHub](https://github.com/), for the code
- [Convex](https://dashboard.convex.dev/), for the backend and database
- [Cloudflare](https://dash.cloudflare.com/), for the Worker and public URL

You can create all three accounts from a phone. The Cloudflare setup in step 4 is easier on a wider
screen.

## 2. Copy the starter to your GitHub account

1. Open the [samebase/app starter](https://github.com/samebase/app).
2. Select **Use this template**, then **Create a new repository**.
3. Select your GitHub account or organization.
4. Enter the repository name. Select public or private visibility.
5. Select **Create repository**.

This gives the new repository its own history. Use **Fork** only if you want to keep the starter's
full history and send changes back to it.

## 3. Create the Convex deployments and keys

1. Open the [Convex dashboard](https://dashboard.convex.dev/) and create a project.
2. Open its production deployment, then open **Settings** and **General**.
3. Under **Deploy keys**, generate a key named `Cloudflare production`.
4. Enable only the `deployment:deploy` permission. Copy the key when Convex shows it.
5. Open the project settings and generate a preview deploy key named `Cloudflare previews`. Copy
   this key too.

Keep both keys secret. Do not put them in the repository. You will add them to Cloudflare in the
next step.

## 4. Import the repository into Cloudflare Workers

Create a Worker, not a Pages project. The starter deploys its frontend and Worker as one unit.

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Workers & Pages**.
2. Select **Create application**.
3. Select **Get started** next to **Import a repository**.
4. Connect GitHub if Cloudflare asks, then select the repository from step 2.
5. Use `main` as the production branch.
6. Set the build commands:

   | Field                                | Value                     |
   | ------------------------------------ | ------------------------- |
   | Build command                        | `pnpm run build`          |
   | Deploy command                       | `pnpm run deploy`         |
   | Non-production branch deploy command | `pnpm run deploy:preview` |
   | Root directory                       | `/`                       |

7. Add both keys under **Build variables and secrets**:

   | Name                        | Value                          |
   | --------------------------- | ------------------------------ |
   | `CONVEX_DEPLOY_KEY`         | the production key from step 3 |
   | `PREVIEW_CONVEX_DEPLOY_KEY` | the preview key from step 3    |

Do not add `VITE_CONVEX_URL`. The starter gets the correct URL from Convex during each build.

Enable builds for non-production branches under **Settings**, **Build**, and **Branch control**.
Then save the configuration and start the first deployment.

## 5. Check the first deployment

Wait for the production build to finish, then open the `workers.dev` URL from the Worker page. You
should see the starter todo app.

Create a branch and open a pull request to check the preview path. Cloudflare runs
`pnpm run deploy:preview` and gives the branch a preview URL. The preview key gives that branch its
own Convex deployment and data.

After setup:

- a push to `main` updates production
- a push to another branch updates its preview
- the production and preview deployments do not share data

## 6. Run the app on your computer

Clone your repository. Install [Vite+](https://viteplus.dev/guide/), then run:

```bash
vp install
vp run dev
```

On the first run, Convex asks you to sign in and select or create a development deployment. This
local deployment is separate from production and the pull-request previews.

## 7. Delete the app

Delete each resource from the provider that owns it:

1. Delete the Worker in Cloudflare.
2. Delete the project in Convex.
3. Delete the repository in GitHub.

Nothing in this manual path depends on a Samebase account.

## What costs $0/month

An idle or small app fits inside the free tiers for GitHub, Convex, and Cloudflare Workers. Static
asset requests on Workers are free and unlimited. Worker code, Convex usage, storage, and build
minutes have free-tier limits.

See [Receipts](/docs/receipts) for the current limits and provider sources.

## What Samebase adds

Samebase performs steps 2 through 4 for you. It creates the repository, Convex project, Worker,
build configuration, and deploy keys, then keeps their provider locations together. The resources
remain in your GitHub, Convex, and Cloudflare accounts.
