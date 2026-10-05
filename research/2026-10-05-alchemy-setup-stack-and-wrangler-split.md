# Alchemy setup stacks next to Workers Builds: what we built, learned, and decided

Date: October 5, 2026. Status: research. It records one day of dogfooding Alchemy on Score Four and
Mail, the two provider packages that came out of it, the split rules we landed on, and the mental
model of Workers and Wrangler that the rules rest on. It informs future provisioning work; it does
not define product behavior. The question it continues is in
[Workers Builds and infrastructure as code](./2026-10-05-workers-builds-and-iac-split.md).

## Summary

- Workers Builds keeps deploying each commit. An Alchemy stack owns the setup around the Worker
  version: the Worker shell, the Builds link, the Convex project and keys, generated secrets, and
  the glue between providers. The stack never uploads code. The Wrangler file stays the source of
  truth for the Worker version.
- Three split rules: the stack owns wiring, not settings; Wrangler owns everything that belongs to
  one Worker, including resources only that Worker uses; one owner per field.
- Two public packages make the split possible: `@samebase/alchemy-cloudflare-workers-builds` and
  `@samebase/alchemy-convex`. Both publish from `main` through npm trusted publishing.
- Score Four and Mail run their stacks from GitHub Actions against Alchemy's Cloudflare state store.
  A fresh install from an empty repository worked with two tokens and one command.
- Wrangler has grown into much of this space: it provisions KV, R2, D1, and Queues on deploy, it
  manages inbound Email Routing rules from the config file, and it writes preview-only secrets. The
  stack shrinks as Wrangler grows, and that is the intended direction.

## Architecture

```text
repository ──push──▶ Workers Builds ──wrangler deploy──▶ Worker version (code, bindings, vars, routes)
     │                                                        ▲
     └──alchemy.run.ts (GitHub Actions: plan on PR, deploy on main)
            Worker shell · Builds link · Builds variables · Worker secrets
            Convex project · deploy keys · Convex variables · glue (bridge secret, URLs)
            state: Cloudflare state store (one Durable Object per account, bootstrapped once)
```

The research note linked above calls this pattern B plus C: the infrastructure tool owns the
repository link and the resources outside the Worker, and the platform builds each push. Samebase
does the same today through OAuth. The Alchemy stack is the same job as a file in the repository,
with a plan, drift detection, and state.

What the stack gives that the dashboard flow does not: a fork is a full install, a plan on every
pull request that touches the file, drift repair from CI, and generated secrets that two providers
must share. What it leaves to Workers Builds: previews per branch, the pull request comment, the
Builds tab, and a dashboard that works without the tool.

## Split rules

1. **Wiring, not settings.** The stack declares only values that two systems must agree on and that
   nobody edits by hand: deploy keys, a bridge secret from `Alchemy.Random`, a Worker URL, bucket
   names, a routing rule. Anything a person would open a dashboard to check stays in that dashboard
   and is a manual step in the README: owner email, setup secret, sending token, recovery address.
   Reason: GitHub secrets are write-only, Convex variables are readable and editable, and a declared
   value turns a dashboard edit into drift that the next deploy overwrites. Routing operator values
   through repository secrets into Convex rebuilt the GitHub-to-CI-to-server chain that was painful
   before.
2. **Wrangler owns one Worker's own things.** Bindings, variables, routes, custom domains, crons,
   assets, observability, the resources only that Worker uses, and its inbound email addresses. The
   stack owns what must exist before the first build (the Worker shell, the Builds link), what spans
   providers (Convex, the bridge secret), and what spans Workers (a shared bucket, a zone, a token).
3. **One owner per field.** The provider patches only the fields the run file declares. A run file
   that declares only the Worker name leaves observability, tags, and routes to Wrangler. The
   catch-all rule is the live example: Alchemy owns it in Mail today, and Wrangler's `addresses`
   would take it over and fail the CI deploy as a conflict. Pick one.

Ordering between the stack and the builds is not a problem. The newer Workers API separates the
Worker (name, settings, secrets) from its versions (code, bindings, variables). Wrangler writes
versions; the stack writes the Worker. Secrets attach to the Worker, every version inherits them,
and Wrangler never deletes them. A secret written by the stack becomes a new version of the current
code at once. The one coupling is the Worker name: the shell and the `name` in the Wrangler file
must match, or the build deploys a second Worker. Reading the name from the Wrangler file in the run
file removes the risk. Untested corner: a secret written to a shell that never had a version.

## What a Worker is, for this discussion

- A Worker is a named service with versions, not a function. Its code exports handlers: `fetch`,
  `scheduled`, `email`, `queue`, Durable Object classes, Workflows, RPC entrypoints. A version is
  code plus bindings plus variables, which is why previews and rollbacks work per version.
- Bindings give a Worker its resources by capability, not by credentials: `env.MAIL_STORAGE` is the
  bucket. Every new Cloudflare product arrives as a binding.
- The Wrangler file is the manifest of one Worker: one `name`, one `main`. Environments inside it
  are variants of the same Worker. It reaches into zones only when the object is a trigger of this
  Worker (routes create DNS records, `addresses` writes Email Routing rules). It cannot hold what is
  shared, what has a lifecycle that needs state, or what runs the file (Workers Builds).
- Durable Objects are classes in the Worker. The binding is the namespace; a name picks one object;
  the runtime constructs the instance on first use, keeps one instance per id worldwide, and gives
  it a SQLite database. `migrations` in the Wrangler file is the append-only log of class additions,
  renames, and deletions, so object data survives renames. Data Studio in the dashboard reads and
  writes an object's SQL tables. Alchemy's state store is one such Worker.
- Worker secrets are write-only encrypted variables on the Worker. Variables in the Wrangler file
  are plain text and are overwritten on deploy. Preview versions have their own secrets. Secrets
  Store is the separate account-level product for one secret shared by many Workers.
- Pages is the older shape. Workers with static assets has the broader feature set and is where
  Cloudflare points new projects.

## What Wrangler can do today (4.147)

| Capability               | Detail                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provision on deploy      | KV, R2, D1, Queues, Dispatch Namespaces, AI Search, Agent Memory, Flagship. Omit the id or bucket name; the resource is created as `<worker>-<binding>` (binding lowercased, `_` to `-`). Works from Workers Builds; ids are not written back to the repository. A 403 skips that resource with a warning. No provisioning for the `previews` block. |
| Inbound Email Routing    | Top-level `addresses`, including `*@zone`. Added in 4.112, applied on deploy since 4.113. Wrangler plans the rules, tags them as owned by the Worker, applies additive plans, and hard-fails deletes and takeovers in CI. It does not enable Email Routing on a zone.                                                                                |
| Required secret names    | `secrets.required` fails a deploy when a secret is missing. Names only. `wrangler deploy --secrets-file` covers the first deploy of a new Worker.                                                                                                                                                                                                    |
| Preview-only secrets     | `wrangler preview base-config secret put`, `delete`, `list`, `bulk` write the Worker's `previews_base_config.env` (4.121).                                                                                                                                                                                                                           |
| Generated configuration  | A build step can write a modified config and a `.wrangler/deploy/config.json` with `configPath` pointing at it. `wrangler deploy`, `dev`, and `versions upload` follow the redirect. This is the sanctioned way to inject generated names into the Worker version.                                                                                   |
| Source-of-truth behavior | Overwrites variables and routes on deploy, keeps secrets. `keep_vars` keeps dashboard variables.                                                                                                                                                                                                                                                     |
| Workers Builds token     | Default build token: Account Settings read, Workers Scripts edit, KV edit, R2 edit, Zone Workers Routes edit, User details read. No D1, no Email Routing. `addresses` from a build needs Email Routing Rules edit added.                                                                                                                             |

Consequence for Mail: the storage bucket can move into the Wrangler file with no name, and the
catch-all can move to `addresses` once the build token has the permission. The stack then keeps the
Worker shell, the Builds link, the Convex project and keys, the bridge secret, and the Worker URL.

## The packages

### `@samebase/alchemy-cloudflare-workers-builds` (0.4.0)

Repository:
[samebase/alchemy-cloudflare-workers-builds](https://github.com/samebase/alchemy-cloudflare-workers-builds).
Alchemy v2 resources for Workers that Workers Builds deploys. Import as `WorkersBuilds`.

- `WorkersBuilds.Worker`: the shell, through the newer Workers API that creates a Worker without
  code. Props are the name and optional settings; it patches only declared settings; an existing
  Worker reads as `Unowned` and adopts with `--adopt`; destroy deletes the Worker, as Alchemy's own
  Worker does, so retain it with `Alchemy.RemovalPolicy.retain()` for a live app.
- `WorkersBuilds.Repository`: the Builds link. Build, deploy, and preview deploy commands, root
  directory, path filters, caching, previews, build variables and preview variables (secret values
  stay secret), a build token. The repository defaults to the current one: `GITHUB_REPOSITORY` in
  Actions, else the `origin` remote, then the GitHub API for ids and the default branch. The diff
  compares repository ids first, so a repository rename is an update, not a replacement. The build
  token resolves to an explicit one, else the first existing one, else it registers the stack's own
  token under `alchemy-<stack>`.
- `WorkersBuilds.Secret`: a Worker secret from a `Redacted` value.
- The Builds API accepts only user tokens with the Workers CI Write permission (deep-link key
  `workers_ci`). The Wrangler OAuth login cannot call it. The generated Cloudflare client in Alchemy
  lacks the Builds endpoints for Workers, so those are hand-written.

### `@samebase/alchemy-convex` (0.1.0)

Repository: [samebase/alchemy-convex](https://github.com/samebase/alchemy-convex). Resources on the
Convex Management API: `Project` (by team and name; creates when absent; a prop change is a
replacement, so retain it), `DeployKey`, `PreviewDeployKey`, `EnvironmentVariable`,
`DefaultEnvironmentVariable`. A team access token authenticates CI; the Convex CLI login works
locally.

- The team must be the numeric id when CI runs with a team access token. The slug path uses the
  unofficial dashboard team list and gets HTTP 403. A local plan passes with a slug because the user
  login can list teams, so a local plan does not catch this.
- The deploy key resources keep a key that still exists, so a plan that shows an update because the
  deployment is "known after apply" does not rotate the key.

### Release and alignment

Both packages publish from `main` when `package.json` holds a version that npm does not have,
through npm trusted publishing (OIDC, `id-token: write`, provenance), then tag `v<version>`. The
trusted publisher is registered on each npm package. Both use Vite+
(`vp pack --dts --publint --attw`), a Node 24 `.node-version`, `prepare: vp config --no-agent`,
`AGENTS.md`, `SECURITY.md`, and a `scripts/test-live.ts` for live runs.

## Dogfood state

### Score Four

[nicu-chiciuc/score-four](https://github.com/nicu-chiciuc/score-four). The run file declares the
Worker shell, the two Convex keys, and the Builds link with `CONVEX_DEPLOY_KEY` and
`SAMEBASE_CONVEX_PROJECT` as build variables. `.github/workflows/infra.yml` runs
`alchemy plan --adopt` and `alchemy drift` on pull requests that touch the file, and
`alchemy deploy --detect-drift` on `main`, with `workflow_dispatch` and an `adopt` input. State is
in the Cloudflare state store under stage `prod`. Laptop state and laptop keys were retired.

### Mail

[samebase/convex-cloudflare-email-inbox](https://github.com/samebase/convex-cloudflare-email-inbox).
Same workflow. [Pull request 13](https://github.com/samebase/convex-cloudflare-email-inbox/pull/13)
cuts the run file to wiring: four constants (Worker name, Convex team id, Convex project, mail
zone), no other inputs, the project adopted by name, and the inbox wiring in
`packages/convex-cloudflare-email-inbox/alchemy.ts` as one function, `EmailInbox`, under the `Mail`
namespace in state: the generated production `MAIL_BRIDGE_SECRET` on the Worker and in Convex,
`MAIL_WORKER_URL` in Convex, the two buckets, and the catch-all. The function sits next to the
component to try the idea that a component ships its own wiring; the package does not export it.
`Alchemy.renamedFrom({ fqn })` moved the existing bucket and catch-all rows under the namespace with
a clean "renamed from" plan; the three calls go away after the first deploy.

Still manual, by rule 1: owner email, setup secret, sending token and account id in Convex,
`MAIL_RECOVERY_ADDRESS` on the Worker, the preview bridge secret in both preview places, the GitHub
App install, Email Routing enablement, and the destination address verification.

### Fresh install

A generic base run file (names from the stack and the repository, `Convex.Project` with a team, zero
ids) installed a full stack into an empty repository with two tokens and `alchemy deploy`, then one
push deployed it through Workers Builds. The stack was destroyed and the account cleaned.

## Lessons, in the order they cost time

- Never delete the shared `alchemy-state-store` Worker. It holds every stack's state for the
  account. Recreate it with `npx alchemy provider cloudflare bootstrap` if it is gone.
- `--no-input` without `--yes` cannot prompt and fails. Use `alchemy deploy --yes --no-input`.
- `alchemy plan` has no drift flag. Run `alchemy drift` as a separate step.
- Retain-by-default is not Alchemy's convention. Most resources destroy; retain explicitly.
- Alchemy's generated Cloudflare client does not cover the Builds API for Workers.
- The Convex key list has no creation time. Record key ids before deleting a pair.
- The setup-node pnpm cache post-step fails when the install step is skipped.
- A team access token cannot look up a Convex team by slug. Use the id.
- Workers Builds needs a user token with Workers CI Write. One token named `alchemy` now serves the
  stacks; the earlier per-step tokens were deleted. Seventeen other tokens remain to review.
- `pnpm add` in a workspace root needs `-w`.
- Wrangler config values cannot read environment variables. A generated name must reach the build
  through Builds variables and a script, or through Wrangler's own provisioning.

## Parked and open

- Durable Objects as the state store: understood now; the alternative is a Samebase-hosted HTTP
  state store.
- Token sprawl and credentials as code: a bootstrap stack that mints per-purpose tokens.
- Samebase's role once stacks exist: run the file, generate it, or observe it. Decide after more
  dogfood.
- Components that ship their infrastructure: the `EmailInbox` function is the first try.
- MCP shape: imperative tools collapse into propose, plan, apply, observe.
- `scripts/test-live.ts` in both packages exists only for the Windows-without-Bash rule.
- Templates RFC #1646 assumed Alchemy as the deployer and is parked.
- A preview-aware Worker secret in the provider is no longer needed: Wrangler has it.
- Mail follow-ups: bucket and catch-all into the Wrangler file; remove the `renamedFrom` calls;
  generated names with a second stage as the proof, minding one catch-all per zone.

## Direction: `cf` and `cloudflare.config.ts`

Cloudflare released `cf`, "the agentic CLI for the entire Cloudflare API", as an open beta on
2026-09-28. It has more than 2,900 generated commands, prints JSON by default, and has a command
search. It changes the configuration story:

- `cloudflare.config.ts` is the typed configuration of a Workers project. Its default export,
  through `defineConfig()`, can define one Worker, Container applications, and account settings.
  Modes selected with `--mode` replace `env` blocks: a function returns one complete configuration
  per mode. Bindings are builder calls under `worker.env`, and binding types are inferred into the
  Worker's `Env`. A Worker can import another Worker's `defineWorker()` definition for typed
  cross-Worker bindings, with export names checked at compile time.
- Cloudflare's stated intention: this file is "how you manage Cloudflare as a whole", with policies,
  zones, and DNS to follow. The per-Worker boundary of the Wrangler file is kept for the Worker
  part, but account-level objects are planned for the same file.
- Multiple Workers stay one configuration file per Worker. A monorepo is several Workers projects
  that import each other's definitions. The Workers Builds monorepo guidance is unchanged: one
  Builds connection per Worker, a root directory, and watch paths.
- Vite is the default build. `cf` delegates to Wrangler for esbuild, Rust, and Python Workers.
  `cf migrate` converts a Wrangler configuration and keeps names, ids, routes, and triggers. Build
  Output in `.cloudflare/output/v0/` allows build once and deploy later. Not yet covered: live logs
  and setting a single secret.

Consequence for the split: on the Cloudflare side, the planned `cloudflare.config.ts` scope overlaps
what the stack owns today (zones, DNS, routing). The cross-provider glue stays ours. Watch `cf`
before adding more Cloudflare-only resources to the stack. The template and the three apps still use
`wrangler.jsonc`; `cf migrate` exists for when we move.

## Direction: tokens created through OAuth

Cloudflare's fundamentals changelog of 2026-10-01 adds delegated creation of Account API tokens: a
member with the **API Token Provisioning** role can create account-owned tokens from the dashboard,
the API, Terraform, or `cf`, and "OAuth clients that request the `account_api_tokens:create` scope,
starting with Cloudflare CLI, can create Account API tokens". A token created this way is limited to
the creator's access and, for OAuth, to the scopes granted at authorization. The `cf auth login`
consent screen shows it as a sensitive scope, "Account API Token Provisioning", off by default.

As of 2026-10-05 the public scope catalogue (`GET /oauth/scopes`, 392 scopes) has no such scope, so
a third-party client such as Samebase cannot request it yet. Workers Builds also still accepts only
user tokens as build tokens, with account-owned tokens "coming soon". When both land, Samebase can
mint the stack's CI token and the build token through its existing OAuth connection instead of
asking the user to paste tokens. That is the answer to the token sprawl question. Until then, the
"alchemy" user token stays a manual step.

## Aside: OpenSend

[OpenSend](https://opensend.cc/docs/self-host-in-10-minutes) is a Resend alternative on Convex and
AWS SES. Its self-host is a shell installer that writes a `.env` with generated secrets and runs a
Compose stack: the official self-hosted Convex backend image, a one-shot migrate container that runs
the Convex CLI with the admin key, the Next.js app, and Caddy. Same ideas as ours (secrets generated
once and preserved, settings reapplied on every start), opposite promise (one box, data on the box,
release images, no source checkout). Its one-command install is the bar for our manual steps.

## Sources

- [Fundamentals changelog: Account API token provisioning](https://developers.cloudflare.com/changelog/product/fundamentals/),
  [Create your OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/),
  [cloudflare/mcp issue 243](https://github.com/cloudflare/mcp/issues/243).

- [Introducing cf](https://blog.cloudflare.com/cloudflare-cf-cli-launch/),
  [Cloudflare CLI docs](https://developers.cloudflare.com/cf/),
  [Programmatic configuration](https://developers.cloudflare.com/cf/projects/cloudflare-config/),
  [cf for Wrangler users](https://developers.cloudflare.com/cf/wrangler/).
- [Workers Builds advanced setups: monorepos](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/),
  [Developing with multiple Workers](https://developers.cloudflare.com/workers/local-development/multi-workers/),
  [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/):
  automatic provisioning, `addresses`, `secrets`, source of truth.
- [Wrangler changelog](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/CHANGELOG.md):
  `addresses` in 4.112 and 4.113, `secrets` stable in 4.88, preview base-config secrets in 4.121,
  provisioning 403 tolerance in 4.129.
- [`autoProvisionedResourceName`](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/deployment-bundle/auto-provisioned-name.ts)
  and
  [`provision-bindings.ts`](https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/provision-bindings.ts).
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/):
  default API token permissions.
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/).
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) and
  [Data Studio](https://developers.cloudflare.com/durable-objects/observability/data-studio/).
- Alchemy 2.0.0-beta.80 sources: `Namespace.ts`, `Rename.ts`, `AdoptPolicy.ts`, `Random.ts`.
