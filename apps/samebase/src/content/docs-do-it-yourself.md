# Do it yourself

Samebase's templates are public repositories. You can use them with no Samebase account: create a
repository from one, set its settings in GitHub, and push. Each repository deploys itself from
GitHub Actions with [Alchemy](https://alchemy.run).

| Template                                                          | What it makes                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| [samebase/base](https://github.com/samebase/base)                 | A web app on Convex, with sign-in and a preview per pull request   |
| [samebase/identity-hub](https://github.com/samebase/identity-hub) | Your own sign-in hub, for your name on the page and your own rules |

## Web app

[samebase/base](https://github.com/samebase/base): React, TanStack Start, and Convex. Guests, Google
accounts, and GitHub accounts can sign in through Samebase's public hub at `id.samebase.com`, with
no Samebase account. An idle app costs [$0/month](/docs/receipts).

| Setting               | Kind   | Value                      | With Samebase                  |
| --------------------- | ------ | -------------------------- | ------------------------------ |
| `CONVEX_ACCESS_TOKEN` | secret | A Convex team access token | Your Convex connection's token |

### 1. Copy the starter

Open [samebase/base](https://github.com/samebase/base), select **Use this template**, and create
your repository.

### 2. Add the token

In the [Convex dashboard](https://dashboard.convex.dev/), open your team's **Settings**, then
**Access Tokens**, and create a token. Then, in your repository:

```sh
gh secret set CONVEX_ACCESS_TOKEN
```

The token names its team, so the app deploys to that team.

### 3. Push to main

Push a commit, or run the **alchemy** workflow from the Actions tab. The first run creates the
Convex project and deploys the site in about 90 seconds. The log ends with its URL.

From then on, `main` deploys to production and each pull request gets its own preview with its own
data.

### After that

- **Run it locally:** `pnpm run dev`, after the first deploy. The
  [starter README](https://github.com/samebase/base#local-development) has the details.
- **Delete it:** `pnpm exec alchemy destroy --stage prod` from a clone. It deletes the Convex
  project and its data. The repository stays.
- **Use another hub:** set `HUB` in `alchemy.run.ts` to that hub's issuer. The next deploy registers
  there, and your users keep their accounts.

Samebase does these steps with one click, connects Convex by OAuth instead of a pasted token, and
shows what every app deployed.

## Identity hub

[samebase/identity-hub](https://github.com/samebase/identity-hub): the hub that apps register with
when they deploy. Samebase runs it unchanged at `id.samebase.com`, so you need your own only for
your name on the sign-in page, your own Google project, or your own rule on who may register.
Samebase does not create hubs yet.

You need a Convex team, a Google Cloud project, and a GitHub account. The
[README](https://github.com/samebase/identity-hub#run-your-own-hub) has the seven steps in order.

### Before the first run

| Setting                       | Kind     | Value                                                                                                 |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `CONVEX_ACCESS_TOKEN`         | secret   | A Convex team access token                                                                            |
| `HUB_OWNERS`                  | variable | `any`, or the numeric ids of the GitHub accounts whose repositories may register, separated by commas |
| `HUB_NAME`                    | variable | The name on the sign-in page                                                                          |
| `HUB_TERMS_URL`               | variable | Your terms for the sign-in service                                                                    |
| `HUB_PRIVACY_URL`             | variable | Your privacy notice for the sign-in service                                                           |
| `HUB_PROJECT`                 | variable | Optional. The Convex project name. Default: the repository name                                       |
| `IDENTITY_HUB_MODERATION_KEY` | secret   | Optional. A long random key for the moderation API                                                    |

The first run creates the Convex project and an empty deployment, and prints the deployment's URL.
That URL is the issuer, unless you give the hub a custom domain and set the variable `ISSUER` to
`https://<domain>`.

### After the first run

| Setting                                              | Kind    | Value                                                                           |
| ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`           | secrets | A Google web client with the redirect URI `<issuer>/connectors/google/callback` |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET` | secrets | A GitHub OAuth App with the callback URL `<issuer>/connectors/github/callback`  |

Then create the signing keys once on the deployment, from a clone (step 6 of the README), and run
the workflow again.
