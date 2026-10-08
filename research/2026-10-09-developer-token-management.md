# Developer token management for the Samebase team

Status: research, 2026-10-09. Question from Nicu: before more stacks land, what is a good way for
us, two developers with two apps (samebase/samebase and the Mail app), to store, mint, deliver,
rotate, and audit the tokens that CI and laptops need. Theoretically only Cloudflare and Convex
tokens, but it must extend to other providers. Samebase users are out of scope here.

## Where we are

Every CI credential is a hand-made long-lived token pasted into GitHub repository secrets:

- samebase/samebase: `REPOSITORY_EXPORTS_APP_PRIVATE_KEY`, and `CLOUDFLARE_API_TOKEN` plus
  `CLOUDFLARE_ACCOUNT_ID` arriving with PR #1705.
- convex-cloudflare-email-inbox (Mail): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `CONVEX_ACCESS_TOKEN` (a team-wide token).
- Five `tmp-alchemy-*` test repositories with the same three secrets each.
- The Cloudflare account holds more than twenty API tokens, created one dashboard link at a time.
  Nobody can say from code which token serves which repository with which permissions.

Laptops already have what they need without tokens: `alchemy login` (OAuth profile) and
`npx convex login`. The sprawl is in CI.

## What each provider can do

- Cloudflare. Account-owned API tokens are created by API: `POST /accounts/{id}/tokens` with
  `policies` (permission groups and resources), optional `expires_on`, `not_before`, and an IP
  condition. `PUT .../tokens/{id}/value` rolls the secret, `DELETE` destroys it. The caller needs
  `Account > Account API Tokens > Edit`. Permissions are capped by the creating member's own. No
  OIDC or workload identity for the API.
- Convex. Deploy keys are scoped to one deployment or one project with explicit actions such as
  `deployment:deploy`, `deployment:env:write`, `deployment:data:view`, and "carry their own
  permissions independent of the creator's current role". No expiry. Team access tokens are
  team-wide, belong to a member ("If this user leaves the team, that also deletes all of their dev
  deployments"; Convex recommends a service-account member), and are the only way to manage projects
  and mint keys by API. No OIDC.
- GitHub. Repository secrets are written by API; the automatic `GITHUB_TOKEN` covers the rest.

## What Alchemy ships

Alchemy's own CI guide is the answer to the minting half. `stacks/github.ts` mints a scoped
account-owned token with `Cloudflare.ApiToken.AccountApiToken` and writes it with `GitHub.Secret`;
it runs from a separate `admin` profile on a laptop whose credential is a token with
`Account API Tokens Write` ("Treat it like root"); CI receives only the scoped token. "You only need
to re-run this stack when you want to rotate credentials or change permissions", and a policy edit
is "a clean update against the same token ID". The token value never prints.

Around it: profiles on a laptop (`~/.alchemy/credentials/<profile>/`, OAuth with self-refresh, or a
pasted token; a profile per purpose, `--profile admin`), environment variables in CI (no profiles
when `CI=true`), `effect/Config` for the stack's own secrets with sources `DotEnv`, `ProcessEnv`,
`Doppler.Secrets`, Infisical, and built-in GitHub OIDC exchange for Doppler and Infisical identities
"so CI never holds a long-lived credential". 1Password is not a config source; the docs use
`op read ... | alchemy profile edit --set` to seed a profile.

Our own providers fit the same shape: alchemy-convex mints `DeployKey` and `PreviewDeployKey` with
allowed actions from a team token, and the Mail stack already does that for its Builds variables.

## The landscape

| Option                              | Root secret                                                                                                  | CI authenticates with                                                           | Laptop          | Rotation                                                                                          | Other providers                                                                | Cost                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| A. Pasted GitHub secrets (today)    | every token is root-like, pasted by hand                                                                     | static secrets                                                                  | OAuth logins    | by hand, per repository                                                                           | by hand                                                                        | free, and the sprawl we have          |
| B. Tokens stack (Alchemy CI recipe) | one admin credential per provider on a laptop profile, values in 1Password                                   | scoped minted tokens in GitHub secrets, with expiry                             | OAuth profiles  | re-run the stack                                                                                  | every provider whose API mints tokens; the rest by hand or read from 1Password | free                                  |
| C. Infisical with GitHub OIDC       | the hand-made provider tokens stored in Infisical; CI holds nothing static                                   | OIDC exchange, free                                                             | `infisical run` | values by hand; Cloudflare and Convex rotation only on Advanced, about $40 per identity per month | any secret                                                                     | free for 5 identities, or self-hosted |
| D. Doppler                          | same as C                                                                                                    | OIDC only on Team, $21 per user per month; free tier uses static service tokens | `doppler run`   | Cloudflare rotation on Team, with a managing token and two tokens                                 | any secret                                                                     | free for 3 users                      |
| E. 1Password service account        | `OP_SERVICE_ACCOUNT_TOKEN` as a GitHub secret; OIDC only through the Business-only Credential Broker preview | `load-secrets-action`                                                           | `op run`        | service account token rotation; values by hand                                                    | any secret                                                                     | the Teams plan we have                |
| F. Cloudflare Secrets Store         | needs a Cloudflare token to read it                                                                          | not applicable                                                                  | not applicable  | not applicable                                                                                    | Workers only                                                                   | included                              |

C, D, and E store secrets. None of them mints a Cloudflare or Convex token; rotation of those is a
paid add-on in C and D and absent in E. B mints and scopes but still delivers through GitHub
secrets. F is where Alchemy keeps its state-store credentials and is not a root.

## Trade-offs that matter for two people

- Minting beats storing. A stored token is still a hand-made token with team-wide or account-wide
  reach. A minted token has the exact permission groups and an `expires_on`, and the file that mints
  it is the inventory.
- GitHub secrets are static, but a static secret that is scoped, expiring, and rewritten by a re-run
  is a different thing from a pasted one. OIDC into a secret manager removes the static secret from
  CI at the price of a third system, and it changes nothing about how the provider tokens themselves
  come to exist.
- Convex is the weak spot. Only a team access token can manage projects and mint keys, it has no
  scopes and no expiry, and it dies with its member. Whatever stack touches Convex projects needs
  one.
- We already run 1Password. It is the right home for the two or three root values and for the
  hand-made secrets of providers that cannot mint (PostHog, Polar, the GitHub App key). It is not a
  delivery mechanism for CI on our plan.

## Recommendation

Option B, as Alchemy documents it, with 1Password as the vault for the roots:

1. One private repository, `samebase/account-tokens`, with one stack. For each repository it lists
   the Cloudflare permission groups, mints an account-owned token with an expiry, mints the Convex
   deploy keys the repository's CI needs, and writes them as GitHub secrets. The stack file is the
   inventory of every CI credential in the account. Hand-made secrets that nothing can mint are read
   from 1Password with `op read` and written by the same stack, so no GitHub secret is ever pasted
   again.
2. It runs only from a laptop, from an `admin` profile: a Cloudflare token with
   `Account API Tokens Edit` and `Secrets Store Edit`, and a Convex team access token. Both values
   live in 1Password. GitHub writes use the `gh` login. Nothing of this reaches CI.
3. Rotation and permission changes are a re-run. Expiry on every minted Cloudflare token forces the
   re-run before anything can rot silently.
4. Convex: create a service-account member in the team for the team token, so the token does not
   belong to a person. Whether the app stacks keep managing Convex projects in CI with that token,
   or only the tokens stack holds it and the app stacks receive keys, is the one design question
   left open below.

First step, concrete: the repository with the stack and two entries, samebase/samebase and the Mail
app, replacing the tokens PR #1705 and the Mail workflow use today. Then delete the five
`tmp-alchemy-*` repositories and the tokens behind them.

When this stops being enough, Infisical is the next layer, not Doppler and not the 1Password broker:
free OIDC for CI, a GitHub sync, self-hosting, and rotation for both Cloudflare and Convex on its
paid tier. Alchemy already reads it as a secrets source with OIDC.

## Open questions

- Convex team token in CI: keep it in the app stacks that manage projects (Mail today, Samebase
  next) with a service-account member, or move project management into the tokens stack so CI holds
  only deploy keys. The second is cleaner and changes the Mail stack.
- Does a Convex service-account member cost a seat on our plan. Not verified.
- Alchemy's `AccountApiToken` on rotation: the docs say re-run; whether it rolls the value in place
  or replaces the token is not verified.
- The Alchemy state store token in Secrets Store is a credential too; which stack owns it.
- Rate of expiry for minted tokens; 90 days is the proposal.

## Sources

Alchemy: [CI](https://alchemy.run/environments/ci),
[Part 5](https://alchemy.run/cloudflare/tutorial/part-5),
[Profiles](https://alchemy.run/environments/profiles),
[Secrets](https://alchemy.run/environments/secrets),
[Secret providers](https://alchemy.run/environments/secret-providers). Cloudflare:
[Create tokens via API](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/),
[Account tokens API](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/).
Convex: [Deploy key types](https://docs.convex.dev/cli/deploy-key-types),
[Management API](https://docs.convex.dev/management-api). Doppler:
[GitHub Actions](https://docs.doppler.com/docs/github-actions),
[Rotation](https://docs.doppler.com/docs/secrets-rotation),
[Pricing](https://www.doppler.com/pricing). Infisical:
[GitHub OIDC](https://infisical.com/docs/documentation/platform/identities/oidc-auth/github),
[Cloudflare rotation](https://infisical.com/docs/documentation/platform/secret-rotation/cloudflare-api-token),
[Pricing](https://infisical.com/pricing). 1Password:
[Service accounts](https://www.1password.dev/service-accounts/),
[GitHub Actions](https://www.1password.dev/ci-cd/github-actions/).
