# Developer token management for the Samebase team

Status: research, 2026-10-09, reviewed by Codex (gpt-6-astra), corrections folded in. Question from
Nicu: before more stacks land, what is a good way for us, two developers with two apps
(samebase/samebase and the Mail app), to store, mint, deliver, rotate, and audit the tokens that CI
and laptops need. Theoretically only Cloudflare and Convex tokens, but it must extend to other
providers. Samebase users are out of scope here.

## Where we are

Every CI credential is a hand-made long-lived token pasted into GitHub repository secrets:

- samebase/samebase: `REPOSITORY_EXPORTS_APP_PRIVATE_KEY`, and `CLOUDFLARE_API_TOKEN` plus
  `CLOUDFLARE_ACCOUNT_ID` arriving with PR #1705.
- convex-cloudflare-email-inbox (Mail): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `CONVEX_ACCESS_TOKEN` (a team-wide token). The Mail stack also writes production and preview
  Convex deploy keys into Workers Builds variables, a second delivery path.
- Five `tmp-alchemy-*` test repositories with the same three secrets each.
- The Cloudflare account holds more than twenty API tokens, created one dashboard link at a time.
  Nobody can say from code which token serves which repository with which permissions.
- Both infra workflows define the secrets at workflow level, so the pull request `plan` job runs
  with production credentials. Code in a pull request, including agent-written code, can use them.

Laptops already have what they need without tokens: `alchemy login` (OAuth profile) and
`npx convex login`. The sprawl is in CI.

## What each provider can do

- Cloudflare. Account-owned API tokens are created by API: `POST /accounts/{id}/tokens` with
  `policies` (permission groups and resources), optional `expires_on`, `not_before`, and an IP
  condition. `PUT .../tokens/{id}/value` rolls the secret, `DELETE` destroys it. The caller needs
  `Account > Account API Tokens > Edit`. User-owned tokens use `POST /user/tokens` and need
  `User > API Tokens > Edit`. Permissions are capped by the creating member's own. No OIDC or
  workload identity for the API.
- Cloudflare Workers Builds accepts only user-owned tokens, for the Builds API ("Account-scoped
  tokens are not supported and will return Invalid token errors") and for the build token that
  deploys ("Currently, only user tokens are supported, with account-owned token support coming
  soon"). Every stack that uses our Builds provider, Mail today and the samebase Worker next,
  therefore runs on a user-owned token.
- Convex. Deploy keys are scoped to one deployment or one project with explicit actions such as
  `deployment:deploy`, `deployment:env:write`, `deployment:data:view`, and "carry their own
  permissions independent of the creator's current role". No expiry. Team access tokens are
  team-wide, belong to a member ("If this user leaves the team, that also deletes all of their dev
  deployments"; Convex recommends a service-account member), and are the only way to manage projects
  and mint keys by API. No OIDC.
- GitHub. Repository and environment secrets are written by API; the automatic `GITHUB_TOKEN` covers
  the rest. An environment can require a reviewer before a job runs or sees its secrets, and can be
  limited to the main branch. Both of our repositories are public, so this is on the free plan.

## What Alchemy ships

Alchemy's own CI guide is the minting half. `stacks/github.ts` mints a scoped account-owned token
with `Cloudflare.ApiToken.AccountApiToken` and writes it with `GitHub.Secret`; it runs from a
separate `admin` profile on a laptop whose credential is a token with `Account API Tokens Write`
("Treat it like root"); CI receives only the scoped token. The same module has `UserApiToken` for
`POST /user/tokens`. A policy edit is "a clean update against the same token ID"; the token value
never prints.

Two facts from the installed library (2.0.0-beta.80) that the guide does not say:

- An update keeps the secret. The resource preserves the value from creation, because Cloudflare
  returns it once, and never calls the roll endpoint. Changing `expiresOn` extends the same secret.
  Rotation is a replacement: a new token, delivered to every consumer, proven with a real run, then
  the old one revoked.
- Secret values live in the stack state. The Cloudflare state store encrypts them with a key in
  Secrets Store, and one bearer serves every stack in the account. A minting stack that shares the
  state store with app CI puts every minted value within reach of any CI token that can read Secrets
  Store. The minting stack needs state of its own.

Around it: profiles on a laptop (`~/.alchemy/credentials/<profile>/`, OAuth with self-refresh, or a
pasted token; a profile per purpose, `--profile admin`), environment variables in CI (no profiles
when `CI=true`), `effect/Config` for the stack's own secrets with sources `DotEnv`, `ProcessEnv`,
`Doppler.Secrets`, Infisical, and built-in GitHub OIDC exchange for Doppler and Infisical identities
"so CI never holds a long-lived credential". 1Password is not a config source; the docs use
`op read ... | alchemy profile edit --set` to seed a profile.

Our own providers fit the same shape: alchemy-convex mints `DeployKey` and `PreviewDeployKey` with
allowed actions from a team token, and the Mail stack already does that for its Builds variables.

## The landscape

| Option                              | Root secret                                                                                                  | CI authenticates with                                                           | Laptop          | Rotation                                                                                                                                                                        | Other providers                                                                | Cost                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| A. Pasted GitHub secrets (today)    | every token is root-like, pasted by hand                                                                     | static secrets                                                                  | OAuth logins    | by hand, per repository                                                                                                                                                         | by hand                                                                        | free, and the sprawl we have          |
| B. Tokens stack (Alchemy CI recipe) | one issuer credential per provider on a laptop profile, values in 1Password                                  | scoped minted tokens in GitHub secrets, with expiry                             | OAuth profiles  | a replacement run per token                                                                                                                                                     | every provider whose API mints tokens; the rest by hand or read from 1Password | free                                  |
| C. Infisical with GitHub OIDC       | the hand-made provider tokens stored in Infisical; CI holds nothing static                                   | OIDC exchange, free                                                             | `infisical run` | values by hand; Cloudflare and Convex rotation only on Advanced, about $40 per identity per month, and its Convex rotation mints personal access tokens, not scoped deploy keys | any secret                                                                     | free for 5 identities, or self-hosted |
| D. Doppler                          | same as C                                                                                                    | OIDC only on Team, $21 per user per month; free tier uses static service tokens | `doppler run`   | Cloudflare rotation on Team, with a managing token and two tokens                                                                                                               | any secret                                                                     | free for 3 users                      |
| E. 1Password service account        | `OP_SERVICE_ACCOUNT_TOKEN` as a GitHub secret; OIDC only through the Business-only Credential Broker preview | `load-secrets-action`                                                           | `op run`        | service account token rotation; values by hand                                                                                                                                  | any secret                                                                     | the Teams plan we have                |
| F. Cloudflare Secrets Store         | needs a Cloudflare token to read it                                                                          | not applicable                                                                  | not applicable  | not applicable                                                                                                                                                                  | Workers only                                                                   | included                              |

C, D, and E store secrets. None of them mints a Cloudflare or Convex token the way we need it;
rotation of those is a paid add-on in C and D and absent in E. B mints and scopes but still delivers
through GitHub secrets. F is where Alchemy keeps its state-store credentials and is not a root.

## Trade-offs that matter for two people

- Minting and storing solve different problems. A stored token is still a hand-made token, and a
  minted token is only as narrow as its policy. The win of minting is that the file that mints is
  the inventory of intent; it does not prove actual use, and it does not see tokens made outside it.
- GitHub secrets are static, but a static secret that is scoped, expiring, written by a run, and
  released only to approved jobs is a different thing from a pasted one. OIDC into a secret manager
  removes the static secret from CI at the price of a third system, and changes nothing about how
  the provider tokens come to exist.
- Convex is the weak spot. Only a team access token can manage projects and mint keys, it has no
  scopes and no expiry, and it dies with its member. Whatever touches Convex projects holds one.
- We already run 1Password. It is the right home for the issuer credentials and for the hand-made
  secrets of providers that cannot mint (PostHog, Polar, the GitHub App key). It is not a delivery
  mechanism for CI on our plan.

## Recommendation

Option B, revised after the review, with 1Password as the vault for the roots:

1. One private repository, `samebase/account-tokens`, with one stack. For each repository it lists
   the Cloudflare permission groups and mints a token with an expiry: user-owned for repositories
   whose stack uses Workers Builds (Mail, samebase next), account-owned for the rest (the #1705
   stack). It mints the Convex deploy keys the repository's CI needs, and writes everything as
   GitHub environment secrets. Hand-made secrets that nothing can mint are read from 1Password with
   `op read` and written by the same stack. The stack file is the inventory of intent for every CI
   credential.
2. Its state is local on the laptop that runs it, with an encrypted backup in 1Password, not the
   shared Cloudflare state store. One operator at a time; recovery proven once on the second laptop.
3. It runs only from an `admin` profile: a Cloudflare token with `User > API Tokens > Edit` and
   `Account > Account API Tokens > Edit`, and a Convex team access token of a service-account
   member. Both values live in 1Password. GitHub writes use the `gh` login. Nothing of this reaches
   CI.
4. Rotation is a handoff, not a re-run: mint the replacement, write it to every consumer (GitHub
   environments and the Workers Builds variables the Mail stack writes), run one real deploy on it,
   let running jobs finish, revoke the old token. Cloudflare tokens expire at 90 days and are
   replaced at 60. Convex keys do not expire, so the same calendar applies by rule.
5. Convex project management moves into the admin operation: the app stacks adopt their project and
   receive keys; CI holds deploy keys, never the team token.
6. The infra workflows get GitHub environments: `infra-plan` with a required reviewer for the pull
   request `plan` job, `infra` limited to `main` for the `deploy` job. Secrets move from the
   repository into the environments. A pull request can no longer run with production credentials
   without a click.

First step, concrete: the two environments on both repositories and the job-level `environment`
lines in both infra workflows, with the current tokens moved into them. Second: the tokens
repository with Mail as the pilot, through one full mint, deliver, deploy, rotate, and second-laptop
recovery. Third: samebase/samebase joins, the five `tmp-alchemy-*` repositories and their tokens go,
and the dashboard's token list gets reconciled against the inventory.

When this stops being enough, Infisical is the next layer, not Doppler and not the 1Password broker:
free OIDC for CI, a GitHub sync, self-hosting, and Alchemy already reads it as a secrets source. Its
paid rotation is not a reason: its Convex rotation mints personal access tokens without deployment
or allowed-action scoping.

## Root credentials that remain

| Root                                                                        | Where                                 | Why it stays                                                         |
| --------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| Cloudflare token issuer (`User API Tokens Edit`, `Account API Tokens Edit`) | 1Password, admin profile              | mints every CI token                                                 |
| Convex team access token of the service-account member                      | 1Password, admin profile              | manages projects, mints keys                                         |
| Each developer's `gh` login                                                 | laptop                                | writes the environment secrets                                       |
| Alchemy state store token and encryption key                                | Cloudflare Secrets Store              | app-stack state; any CI token with Secrets Store access reaches them |
| `REPOSITORY_EXPORTS_APP_PRIVATE_KEY`                                        | GitHub environment, copy in 1Password | a GitHub App signing key, nothing mints it                           |

`CLOUDFLARE_ACCOUNT_ID` is configuration, not a secret. Human logins, MFA, and the 1Password
recovery kit sit above all of this.

## Open questions

- Does a Convex service-account member cost a seat on our plan. Not verified.
- Which Builds build token Mail deploys with today, and its owner and permissions. Not verified; the
  pilot reads it.
- The actual permissions, owners, and consumers of the twenty-plus existing Cloudflare tokens. The
  pilot's reconciliation lists them.
- Whether `alchemy plan` can run on a token narrower than the deploy token. The Cloudflare state
  store refresh uploads an edge-preview Worker, so plan needs Workers Scripts Edit and Secrets Store
  Edit too; the environment approval is the control, not a smaller token.

## Sources

Alchemy: [CI](https://alchemy.run/environments/ci),
[Part 5](https://alchemy.run/cloudflare/tutorial/part-5),
[Profiles](https://alchemy.run/environments/profiles),
[Secrets](https://alchemy.run/environments/secrets),
[Secret providers](https://alchemy.run/environments/secret-providers); installed
`alchemy@2.0.0-beta.80`, `lib/Cloudflare/ApiToken/AccountApiToken.js`. Cloudflare:
[Create tokens via API](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/),
[Account tokens API](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/),
[Workers Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/),
[Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
Convex: [Deploy key types](https://docs.convex.dev/cli/deploy-key-types),
[Management API](https://docs.convex.dev/management-api). GitHub:
[Manage environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
Doppler: [GitHub Actions](https://docs.doppler.com/docs/github-actions),
[Rotation](https://docs.doppler.com/docs/secrets-rotation),
[Pricing](https://www.doppler.com/pricing). Infisical:
[GitHub OIDC](https://infisical.com/docs/documentation/platform/identities/oidc-auth/github),
[Cloudflare rotation](https://infisical.com/docs/documentation/platform/secret-rotation/cloudflare-api-token),
[Pricing](https://infisical.com/pricing). 1Password:
[Service accounts](https://www.1password.dev/service-accounts/),
[GitHub Actions](https://www.1password.dev/ci-cd/github-actions/).
