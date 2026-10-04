# Provisioning landscape and where Samebase's value sits

Date: 2026-10-05

Status: Research note

This file records external evidence and repository findings. It does not define product behavior. It
answers the questions from the Codex thread of 2026-10-04: is `@convex-dev/static-hosting`
production ready, should Samebase keep a fork, is a generic repository configuration a reinvented
wheel next to Alchemy and similar tools, and what Samebase actually is next to the rest of the
market.

## Summary for the product owner

1. **There is no engine to adopt.** Alchemy is alpha by its own README, ships breaking v2 betas
   about weekly, has no Convex resource, cannot create a repository from a template repository, has
   no Workers Builds resource, and needs a Node or Bun process with a filesystem and child
   processes. It cannot run inside a Convex action. Pulumi Automation API and OpenTofu can execute
   the resource-creation subset, but they need a binary runner and the only Convex provider is a
   community 0.x package with zero stars and no acceptance tests. No surveyed tool models the
   Samebase join (GitHub repository, Convex project, Git-connected Worker, per-branch deploy keys).
2. **There is no manifest to copy for a multi-provider repository.** The only "describe the parts,
   then provision" files are single-host: Render Blueprints, Railway config, Heroku `app.json`.
   Cloudflare's new `cf` CLI (beta) has a typed `cloudflare.config.ts` that provisions missing
   bindings, but it describes one Worker per config and knows nothing about Convex. The schema ideas
   are worth borrowing. The tools are not.
3. **Convex-only hosting means owning a fork.** Upstream `static-hosting` has had no maintainer
   activity on external PRs since 2026-07-28. The published CLI deletes replaced chunks in the same
   run that publishes, and Cloudflare caches the resulting 404 for up to four hours per PoP. Preview
   deployments do not work without PR 41. Custom domains need Convex Pro at 25 USD per developer per
   month. Convex's own docs still send frontends to Netlify or Vercel.
4. **The build runner and the frontend host are separate decisions.** GitHub Actions can replace
   Workers Builds while the frontend stays on Cloudflare Workers Static Assets. Moving the frontend
   to Convex is a second, independent change.
5. **What Samebase is, from the evidence.** Every single provider call is a commodity. No
   first-party MCP server, CLI, or app builder gives an agent one flow that ends with a user-owned
   repository, a user-owned Convex project, Git-connected hosting with PR previews, and one status
   record across the three providers. Samebase does. That join is thin: an agent with the Cloudflare
   API MCP, the Convex CLI, and two one-time browser steps can rebuild it. The durable value is the
   tested recipe, the repair operations that run after setup, the monorepo mapping, and the status
   record.
6. **The clear question** is not "which infrastructure engine". It is: which resource operations do
   the two real templates (`samebase/base`, `samebase/mail`) and a shared-backend monorepo need, and
   can each operation be created, checked, and repaired on its own? The templates proposal already
   decided that a general resource graph waits until a real template needs one. Mail is that test:
   it adds R2, Email Routing, a domain check, owner setup, and a shared Worker and Convex secret.

## 1. Alchemy

Facts checked on 2026-10-04 against the GitHub API, npm, and the source trees.

- Two repositories. v1 is [alchemy-run/alchemy-async](https://github.com/alchemy-run/alchemy-async)
  ("Infrastructure as TypeScript"), last release v0.94.0 on 2026-08-01, 2,209 stars. v2 is
  [alchemy-run/alchemy](https://github.com/alchemy-run/alchemy) ("Infrastructure as Effects", Effect
  4), 1,495 stars, 365 open issues, 91 contributors. Both Apache 2.0. Author Sam Goodwin; the site
  footer names Functionless Corp. A reported 1.06M USD raise is secondhand and unverified.
- npm `alchemy@latest` is 2.0.0-beta.80, published 2026-10-02. Thirty v2 betas shipped between
  2026-06-02 and 2026-10-02. The beta.80 changelog opens with breaking changes. The v2 README says
  "alchemy is in alpha. Expect breaking changes." The phrase "production beta" appears nowhere.
- [v1 to v2 migration](https://alchemy.run/migrating-from-v1): "Your v1 state is not compatible with
  v2". The path is to name each v2 resource after the v1 physical name and run `deploy --adopt`.
- Providers in v2 source: about 100 Cloudflare resources (Worker, assets, DO, KV, R2, D1, DNS,
  custom hostnames, Worker Previews), GitHub (Repository, Secrets, Variables, Environments,
  Webhooks, PR comments, rulesets), Stripe, Neon, PlanetScale, AWS, GCP, Fly, Railway, Kubernetes.
  Missing: Convex (zero hits in the organization), Workers Builds (zero hits in v1 and v2), Netlify,
  and `GitHub.Repository` cannot create from a template repository
  ([source](https://github.com/alchemy-run/alchemy/blob/main/packages/alchemy/src/GitHub/Repository.ts)).
- State ([docs](https://alchemy.run/state-store)): local `.alchemy/` by default with no lock; a
  Cloudflare Worker plus Durable Object store in the user's account; Postgres with an advisory lock;
  S3 where [issue 1967](https://github.com/alchemy-run/alchemy/issues/1967) (2026-10-04) shows two
  concurrent deploys corrupting state. No hosted state service. v2 dropped `ALCHEMY_PASSWORD`
  encryption in favor of `.env`, Doppler, or Infisical.
- Monorepo model ([single stack](https://alchemy.run/project-structure/monorepo-single-stack),
  [multi stack](https://alchemy.run/project-structure/monorepo-multi-stack)): one `alchemy.run.ts`
  per workspace or per package, typed cross-stack handles, backend outputs injected into frontend
  builds. Alchemy runs the builds itself with content-hashed `Command.Build`.
- Embedding: needs Node 22+ or Bun, imports `node:fs`, `node:net`, spawns child processes, and binds
  one credential profile per process. It cannot run in a Convex action or a Worker. A programmatic
  `deploy(Stack)` exists only through the test harness. No MCP server for operating Alchemy itself.
- Cloudflare relationship: no partnership, sponsorship, or official Cloudflare page found.

Verdict: strong prior art for a configuration model (stages, outputs, adopt, drift, build
memoization). Not an execution engine for Samebase in 2026. The only defensible use would be
user-side: generate an `alchemy.run.ts` and workflow into the user's repository, which replaces
Workers Builds rather than fitting it.

## 2. Infrastructure engines

| Tool                                                      | Repository parts and environments    | GitHub, Convex, Workers                                                                                        | Embeddable                                                                         | License, latest                                          |
| --------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [SST v4](https://sst.dev/docs/cloudflare/)                | Stages yes, no repository-part model | GitHub via raw Pulumi provider, Convex none, Workers yes but "Do not include any Wrangler configuration files" | CLI only, state bucket in the user's AWS or Cloudflare account                     | MIT, v4.17.1 on 2026-07-12                               |
| [Pulumi](https://www.pulumi.com/docs/iac/automation-api/) | Stacks yes, a program not a manifest | GitHub and Cloudflare yes, Convex only through a bridged Terraform provider                                    | Automation API in Node, but "the CLI must be available to your program at runtime" | Apache 2.0, v3.267.0 on 2026-10-01                       |
| [OpenTofu](https://opentofu.org/docs/)                    | Generated roots per app              | Same providers, `github_repository.template` exists                                                            | Binary in Actions or a container, state in R2 or an HTTP backend                   | MPL 2.0, v1.13.1 on 2026-10-01                           |
| Terraform                                                 | Same                                 | Same                                                                                                           | Same                                                                               | BUSL 1.1 since 2023, embedded competitive use restricted |

- CDKTF is archived (2025-12-10). Nitric has no Cloudflare and no commits since 2026-02-04. Wing's
  company shut down. Serverless Framework v4 is AWS only. Encore, Ampt, and Architect are AWS or GCP
  platforms with their own backend model.
- Convex providers on the Terraform registry are all community tier:
  [srs/convex](https://github.com/srs/terraform-provider-convex) 0.2.0 covers projects, deployments,
  deploy keys, preview deploy keys, custom domains, env vars, and log streams, with "no acceptance
  test suite yet", zero stars, last push 2026-08-03. `mbokinala/convex` 0.0.4 only manages env vars.
- SST's Workers Builds conflict matters: Builds needs a wrangler file in the repository, SST forbids
  one.

Verdict: Pulumi Automation API or OpenTofu could execute the resource subset from a GitHub Actions
job or a container, never from a Convex function. Both would make Samebase own per-app state and
passphrases and depend on a 0.x Convex provider. Samebase would use a small fraction of either tool
and still write the Convex, template-seed, Builds, status, and repair code itself.

## 3. Platform manifests, the prior art worth reading

These describe the parts of a repository and derive deploy steps, but only for one host each.

- [Render Blueprints](https://render.com/docs/blueprint-spec): `services[]` with `type`, `rootDir`,
  `buildFilter`, `buildCommand`, `startCommand`, `envVars` with
  `fromService {name, property, envVarKey}`, `sync: false` to prompt at setup,
  `previews.generation`, `previews.expireAfterDays`. A preview is created only when changed files
  match a service's `rootDir` or `buildFilter`.
- [Railway](https://docs.railway.com/reference/config-as-code): one `railway.json` per service with
  `build.watchPatterns` and `environments.pr` overrides. Templates deploy from the template
  repository by default; an `Eject` button mirrors it into the user's GitHub account.
- [Heroku `app.json`](https://devcenter.heroku.com/articles/app-json-schema): `env.required`,
  `generator: secret`, `addons`, `environments.review` that replaces the base manifest.
- Netlify and Vercel: a base or install root plus an app root per project; Vercel Related Projects
  (max 3) expose sibling preview hosts through an env var.
- Cloudflare Workers Builds
  ([configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
  [advanced setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/)):
  build, deploy, and preview commands, root directory, watch paths, one Worker per root directory,
  no repository-level manifest. Free 3,000 build minutes a month, Paid 6,000.
- [Deploy to Cloudflare button](https://developers.cloudflare.com/workers/platform/deploy-buttons/):
  clones the source repository into the user's GitHub or GitLab account, reads the wrangler config,
  provisions KV, D1, R2, DO, Queues, and writes the new IDs back, attaches Workers Builds with PR
  previews. Limits: the source repository must be public, one isolated Worker per button, no
  non-Cloudflare resources.
- [Cloudflare `cf` CLI](https://developers.cloudflare.com/cf/), beta: typed `cloudflare.config.ts`
  so "editors and agents can autocomplete bindings and triggers"; "cf deploy can provision missing
  resources for bindings that omit resource identifiers"; modes for environments; preview names read
  from Workers Builds, GitHub Actions, or Git. One `worker` per config plus containers. No Git
  connection, no Convex.
- Convex: `convex.json` describes one project. `npx convex deploy --cmd` sets `VITE_CONVEX_URL`,
  runs the frontend build, then pushes. Previews come from a project-level preview deploy key.
- Turborepo and Nx declare the package and task graph with no deploy or environment concept.
- Better T Stack ([compatibility](https://www.better-t-stack.dev/docs/cli/compatibility)) forces
  Convex to `--server-deploy none` and allows one web frontend. Its programmatic `create`, `add`,
  and `createVirtual` are a generator for a different stack, not a replacement for the hand-built
  template.

What to borrow if Samebase describes repository parts: a flat list of parts keyed by name with a
type discriminant; an install root and an app root per part; env wiring between parts as references
(Render `fromService`), which for Samebase is the backend URL per environment; three commands per
hosting target (build, deploy, preview); explicit preview rules (create only when a part's filter
matches, expiry); setup-time inputs with secret classification; bindings read from `wrangler.jsonc`
instead of restated.

## 4. Who else gives the Samebase outcome

Checked on 2026-10-04 and 2026-10-05 against official docs, READMEs, and public OpenAPI schemas.

- Code in the user's GitHub is now table stakes: Lovable, Bolt, v0, Base44, Emergent, Softgen,
  Google AI Studio Build, and Netlify all create or sync a repository in the user's account.
- Owned backend plus owned hosting is rarer. Softgen (Supabase or Firebase plus Vercel), v0 plus
  Vercel, Bolt with its Supabase and Netlify integrations switched on, Google AI Studio Build (the
  user's Cloud Run project), Netlify Agent Runners (no backend), and VibeSDK exports pass the
  Leaving Test. Lovable, Base44, Replit, and Emergent keep the backend or the hosting.
- None of the passing products provisions Convex or Workers Builds.
- Convex Chef is being replaced ("a new incarnation"), hosted frontends on `*.convex.app`, exports a
  zip, and `chef.convex.dev` now redirects to `convex.dev/ai`
  ([docs](https://docs.convex.dev/chef)). GitHub Spark shut down on 2026-08-31. Firebase Studio
  sunsets on 2027-03-22.
- Agent entry points: Lovable MCP is GA with `create_project` and `deploy_project` to lovable.app.
  Vercel MCP has `create_git_project` and `deploy_to_vercel`. Netlify MCP creates a site and uploads
  a zip. The v0 Platform API went GA on 2026-08-13.

First-party tools an agent could use instead of Samebase:

- GitHub MCP `create_repository` has no template parameter and no secrets tool;
  `gh repo create --template` and `gh secret set` cover both.
- Convex MCP has twelve inspect-only tools and cannot create a project, deployment, or key
  ([docs](https://docs.convex.dev/ai/convex-mcp-server)). The CLI can create projects, deployments,
  and deployment tokens after a browser login. The
  [Management API](https://docs.convex.dev/platform-apis) covers everything including preview deploy
  keys; team-scoped OAuth tokens may create projects, unverified apps are capped at 100 teams, and
  the named audience is "AI app builders, such as Bloom, A0, or Macaly".
- Cloudflare Workers Bindings MCP cannot create Workers; Workers Builds MCP is read only; the
  Cloudflare API MCP (`search`, `execute`) reaches the 28 `/builds/` endpoints in the public schema,
  but "you must first install the Cloudflare GitHub App through the dashboard"
  ([Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)).

What that agent can reproduce today: the repository from a template, the Convex project and
production key, the Worker, and the Builds connection, each after a one-time browser step per
provider. What it cannot get: one record of which Worker, project, root directory, and keys belong
together, a status read across the three providers, and repair operations that know the recipe.
Samebase's `repository_create`, `repository_cloudflare_configureBuilds`,
`repository_cloudflare_rotateConvexDeployKeys`, and `repository_getStatus` encode exactly that.

Only Render Blueprints offers "describe the parts, then provision" for a monorepo, and only on
Render. No platform lets an agent declare several apps in one repository and get backend projects
plus Git-connected Workers for each.

## 5. Convex static hosting, claims checked

Read with `gh` and live header probes on 2026-10-04.

- Latest npm version is 0.2.1, published 2026-07-28. Upstream `main` is one non-functional commit
  past the tag. The improvements exist only in open PRs. The last functional upstream merge was
  2026-07-28.
- Limits: `MAX_ASSETS_PER_DEPLOYMENT = 1800` and a 2 MiB manifest, set in
  [`src/component/lib.ts`](https://github.com/get-convex/static-hosting/blob/main/src/component/lib.ts)
  lines 31 to 34. They come from `publishDeployment`, one mutation that reads and rewrites the full
  manifest inside one transaction under Convex's 4,096 document-read ceiling.
- Serving path: `serveStaticFile` is an HTTP action that runs `resolveAsset` and then
  `ctx.storage.get`. Correction to the Codex pass: Cloudflare proxies `*.convex.site`. A live probe
  showed HTML as `cf-cache-status: DYNAMIC` (every HTML request is a billed action plus query), a
  hashed JS chunk as `MISS` then `HIT` per PoP, and a missing `/assets/*.js` path cached as a 404
  for `max-age=14400`. The `--cdn` mode is documented as legacy: "Do not use `--cdn` for a new
  integration".
- Deploy safety: `publishDeployment` deletes the old asset rows in the publish transaction and the
  CLI deletes their storage in the same run. With the cached 404 above, a PoP can serve a missing
  chunk to an open page for hours. [PR 42](https://github.com/get-convex/static-hosting/pull/42)
  (seven-day retention) is open since 2026-10-02 with no review.
  [PR 41](https://github.com/get-convex/static-hosting/pull/41) (custom asset serving,
  `--preview-name` forwarding) is open since 2026-09-26 with no maintainer review. PR 39 and PR 19
  are open and idle.
- [Issue 38](https://github.com/get-convex/static-hosting/issues/38): preview deploy fails with a
  project preview deploy key. Open since 2026-08-27, no maintainer reply. PR 41 is the only proposed
  fix.
- Custom domains require Convex Pro at 25 USD per developer per month
  ([docs](https://docs.convex.dev/production/custom-domains),
  [pricing](https://www.convex.dev/pricing)). Since May 2026, data egress at 0.12 USD per GB on Pro
  replaced file bandwidth. Each uncached request costs one HTTP action call plus one query call,
  action compute, database I/O, and egress.
- The fork [samebase/static-hosting](https://github.com/samebase/static-hosting) `main` is identical
  to upstream `main`; the PR heads live on `nicu-retain-assets-seven-days` and
  `nicu-serve-static-asset-custom-routing`.
- Convex's [hosting docs](https://docs.convex.dev/production/hosting/) list Vercel, Netlify, and
  custom hosting and never mention the component. The Chef docs say "The Convex platform doesn't
  natively support hosting frontend code". No first-party general frontend hosting exists or is
  announced; the `*.convex.app` gateway is locked to Chef projects.
- [convex-js issue 172](https://github.com/get-convex/convex-js/issues/172) (OAuth-minted preview
  keys rejected) closed as fixed on 2026-07-09. The key is still the OAuth token re-prefixed, so it
  keeps the OAuth token's scope.
- GitHub Actions as the runner: 2,000 free private minutes a month on Free, 3,000 on Pro and Team.
  The workflow needs `CONVEX_DEPLOY_KEY` as a repository secret. A GitHub App needs Secrets write,
  Actions write, and the Workflows permission to write under `.github/workflows`. A Convex action
  can call `workflow_dispatch` with `fetch`.

## 6. Samebase today, from the source at a31f1d5ed

- App creation is one admission mutation that inserts the repository, a run, an active write lock,
  and a single-item plan, then a durable workflow with eleven steps: validate connections, create
  the GitHub repository, connect it, seed the template, sync the tree, claim infra, attach Convex,
  attach the Worker, configure Workers Builds, rotate deploy keys and start the first build, finish.
  Entry:
  [`records.ts`](https://github.com/samebase/samebase/blob/a31f1d5ed40c3e5abbc4b045fb21f81e128436d6/apps/samebase/convex/repository/records.ts#L599)
  and
  [`repositoryProvisioningWorkflow.ts`](https://github.com/samebase/samebase/blob/a31f1d5ed40c3e5abbc4b045fb21f81e128436d6/apps/samebase/convex/repositoryProvisioningWorkflow.ts#L695).
- Fixed per create: one Convex project at `convex.json`, one Worker at `/`, one template compiled
  into the deployment, fixed `pnpm run build`, `deploy`, and `deploy:preview` commands, one
  credential slot per organization per provider.
- The attachment tables already allow many Workers and many Convex projects per repository. The
  single-resource assumption lives only in the plan schema
  ([`provisioningModel.ts`](https://github.com/samebase/samebase/blob/a31f1d5ed40c3e5abbc4b045fb21f81e128436d6/apps/samebase/convex/repository/provisioningModel.ts#L124)),
  the plan insert, the `.first()` plan read, and the composed workflow. Correction to the Codex
  pass: `model.ts` line 227 is the multi-row Worker table, not a limit.
- Spec 115 (accepted 2026-08-30): "Samebase has no durable app, folder, or root-group entity."
  Groups are derived at read time from equal root paths. No spec, RFC, or research proposes a
  repository manifest or infrastructure-as-code.
- The template's build runs Convex deploy inside Workers Builds. Production and preview
  `CONVEX_DEPLOY_KEY` are Builds secrets. The template's GitHub Actions workflow only checks; it
  does not deploy.
- The
  [templates proposal](https://github.com/samebase/samebase/blob/nicu-templates-proposal/rfcs/2026-09-30-templates-and-components.md)
  (PR [#1646](https://github.com/samebase/samebase/pull/1646)) already decided: keep resource
  creation in Samebase's Convex workflows, add a small checked template definition, and "A general
  resource graph or action language would add a second platform to maintain. Reconsider it only
  after real templates require dependencies that the typed workflow cannot express clearly." Mail
  needs R2, Email Routing, domain checks, owner setup, and a shared Worker and Convex secret.
- The landing page claims "Full monorepo support, by design" and "One place to manage GitHub,
  Convex, and Cloudflare across all your apps." The July positioning research found that for one
  healthy app with no inventory need, direct provider tools can win; Samebase wins with several
  apps, mixed provider state, monorepo roots, central visibility, or repair needs.

## 7. What this means

**A working definition.** Samebase is a tested recipe for one stack (GitHub, Convex, Cloudflare),
run as independent operations that create, check, and repair an app in the user's own accounts, with
one status record across the providers, callable by agents and people. The recipe and the operations
after setup are the product. The provider calls are not.

**The clear question.** Replace "which engine or configuration language" with: for `samebase/base`,
`samebase/mail`, and a second frontend sharing one backend, what are the parts, which operation
creates each part, what check proves it is correct, and which operation repairs it? The answer is a
plan with N parts instead of one Convex project and one Worker. That is the only generic change the
source needs, and the templates proposal already points there.

**Three decisions that are separable and should stay separate.**

- Build runner per hosting target: Workers Builds or GitHub Actions. GitHub Actions removes the
  Builds token and the Cloudflare GitHub App from onboarding while the frontend stays on Cloudflare.
- Frontend host per part: Workers Static Assets or Convex static hosting. The Convex path needs a
  fork that carries PR 41 and PR 42 and a rebase story on a quiet upstream, plus Pro for custom
  domains.
- Plan shape: N typed parts with per-part operations and checks. Not a language, not an engine.

**What the evidence argues against.** Adopting Alchemy, Pulumi, OpenTofu, or SST as the executor:
Samebase would use a small subset, still write every Convex, template, Builds, status, and repair
operation, and add a binary runner plus per-app state outside Convex. Replacing the hand-built
template with Better T Stack or the Deploy to Cloudflare button: both force a different stack shape
and neither knows Convex. Treating Convex static hosting as a drop-in: the published package breaks
open pages on deploy and cannot target previews.

## Method and limits

Five research lanes ran on 2026-10-04 and 2026-10-05: Alchemy, infrastructure engines and platform
manifests, app builders and first-party provider tools, static-hosting claim checks, and a read-only
map of the Samebase source. Sources were official docs, source trees, the GitHub API, npm, the
Terraform registry, public OpenAPI schemas, and live header probes. Nothing was deployed or
benchmarked; latency and real charges for Convex static hosting remain unmeasured.

Unverified items: Alchemy's funding amount; Chef's hosting mechanism; agent entry points for Bolt,
Base44, Replit, Emergent, Softgen, and Databutton; Convex CLI creation of project-level preview
deploy keys; absence of a `wrangler` command that connects Git; whether the Pulumi Cloudflare
provider can attach Workers Builds to a repository.
