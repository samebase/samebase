# Do it yourself

The Samebase stack with no Samebase account: your GitHub repository, your Convex project, and GitHub
Actions that deploy it with [Alchemy](https://alchemy.run). An idle app costs
[$0/month](/docs/receipts).

## 1. Copy the starter

Open [samebase/base](https://github.com/samebase/base), select **Use this template**, and create
your repository.

## 2. Add a token

In the [Convex dashboard](https://dashboard.convex.dev/), open your team's **Settings**, then
**Access Tokens**, and create a token. Then, in your repository:

```sh
gh secret set CONVEX_ACCESS_TOKEN
```

The token names its team, so the app deploys to that team.

## 3. Push to main

Push a commit, or run the **Alchemy** workflow from the Actions tab. The first run creates the
Convex project and deploys the site in about 90 seconds. The log ends with its URL.

From then on, `main` deploys to production and each pull request gets its own preview with its own
data.

## After that

- **Run it locally:** `pnpm run dev`, after the first deploy. The
  [starter README](https://github.com/samebase/base#local-development) has the details.
- **Delete it:** run the **Destroy app** workflow. It deletes the Convex project and its data. The
  repository stays.
- **Sign-in:** guests and Google accounts can sign in. The first deploy gets Google sign-in from
  Samebase's identity hub, with no Samebase account.

Samebase does the three steps with one click, connects by OAuth instead of a pasted token, and shows
what every app deployed.
