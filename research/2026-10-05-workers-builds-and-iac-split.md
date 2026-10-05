# Workers Builds and infrastructure as code: where the split is standard

Date: October 5, 2026. Status: research. It informs the Alchemy decision; it does not define product
behavior.

## Question

Nicu's hypothesis: an infrastructure tool such as Alchemy should make sure the Workers and the other
resources exist and are configured, while Cloudflare Workers Builds keeps deploying each commit.
Workers Builds gives the pull request comment with the preview URL, the check run, the Builds tab
with commit-linked builds, and a dashboard that works without the tool. Is that split a standard
pattern, and does Alchemy support it?

## Answer

The split is standard on other platforms. On Workers it exists only in parts, and Alchemy is built
for the opposite pattern.

- Render and Cloudflare Pages ship the split first party: Terraform owns the repository link, the
  branch, the build command, and the preview setting, and the platform builds each push. Railway has
  it through a community provider. Netlify has it only for settings, because linking a repository
  needs its GitHub App flow in the UI.
- On Workers, no Terraform, Pulumi, or Alchemy resource can connect a Worker to Workers Builds. The
  Builds API can, but it needs a user-scoped token and a one-time GitHub App install in the
  dashboard. One team runs the split today with Terraform plus a sync script against that API.
- Cloudflare documents a different split for Terraform: declare the Worker in Terraform, keep the
  configuration in `wrangler.jsonc`, and let Wrangler ship versions. Bindings are version settings,
  so they travel with the code.
- Alchemy v2 cannot play the "set up the Worker, let Builds deploy it" role. Its Worker resource is
  one unit for code and configuration, every reconcile uploads Alchemy's own bundle, there is no
  configuration-only mode, and v2 neither reads nor writes a Wrangler file. Alchemy can own
  everything except the Worker; its author accepted that use in 2025.

## Findings

### Cloudflare's rules

1. `wrangler deploy` rewrites vars, bindings, and routes from the Wrangler file on each commit. Only
   secrets survive. `keep_vars` protects vars and nothing else. Cloudflare's position on a Terraform
   plus Wrangler clash: "there can only be one config source of truth."
2. Wrangler resource provisioning is generally available and on by default. It creates KV, R2, D1,
   Queues, and other resources that the configuration names without an id, and writes the ids back.
   This is Cloudflare's own answer to "make sure resources exist". The Deploy to Cloudflare button
   pairs it with Workers Builds.
3. The Builds API has repository connections, up to two triggers per Worker (`build_command`,
   `deploy_command`, branch and path filters, `build_token_uuid`, `root_directory`), build tokens,
   builds, and logs. A trigger references an existing Worker by its tag. There is no preview command
   field; the preview trigger is a second trigger that excludes `main`.
4. The PR comment reports build status for every build. The preview URL appears only "for builds
   which perform `wrangler preview`", and for Worker Previews "Custom commands must invoke
   `npx wrangler preview`." A deploy command that runs Alchemy instead of Wrangler loses that line.
5. The automatic build token is a user token with Workers Scripts, KV, R2, and Routes edit. A custom
   token can be selected. Builds have a 20-minute limit.

### Alchemy's design

6. `Cloudflare.Worker` sends one script upload with the bundle, the bindings, and the assets. The
   plan compares the local bundle hash with the saved state, so a source change always uploads.
   `Website.StaticSite` runs the build command itself and deploys through `Worker`.
7. Ownership is by script tags. A Worker without Alchemy tags is `Unowned`; the deploy fails unless
   `--adopt` is passed. The plan compares against Alchemy state, not against the cloud, so a
   Wrangler deploy in between is invisible until `alchemy drift`. A v1 user reported that
   `wrangler deploy` stripped a binding that Alchemy had set.
8. The only documented runner is GitHub Actions. The queue docs state that "an ordinary Alchemy
   upload is not a Workers Builds run." There is no resource for Builds triggers or repository
   connections, and no issue requests one.
9. Separate resources exist for KV, R2, D1, Queues, DNS, and routes. Vars, secrets, custom domains,
   crons, and Durable Object migrations are Worker properties only.

### Patterns

| Pattern                                                          | Who uses it                                        | On Workers                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| A. IaC deploys the code; platform CI is not used                 | Alchemy, Pulumi, SST, Fly with `flyctl` in Actions | Proven on `samebase/tmp-alchemy-base`; loses the Builds benefits    |
| B. IaC owns the repository link and settings; platform CI builds | Render, Cloudflare Pages, Railway                  | REST only, user-scoped token, GitHub App installed in the dashboard |
| C. IaC owns resources outside the Worker; Wrangler config refers | Cloudflare docs, community, Alchemy's author       | Works; wrangler provisioning now covers KV, R2, D1, and Queues      |

## What this means for Samebase

Samebase already runs B plus C. It links the repository to Workers Builds and sets the build
commands through the user's OAuth connection, which is the part that no IaC tool can do on Workers
today. It creates the Convex project, the deploy keys, and the build variables, which is C. The
proof on `samebase/tmp-alchemy-base` was pattern A, and A gives up the Builds benefits that Nicu
wants to keep.

Where Alchemy can fit is C: a run file in the app repository that declares the resources outside the
Worker. For the base template that is the Convex project, its keys, its environment variables, and
the GitHub secrets, which `@samebase/alchemy-convex` covers. On the Cloudflare side, wrangler
provisioning already creates the buckets and namespaces a Worker binds, so the residual Cloudflare
value of a C stack is in resources that Wrangler cannot create: Email Routing, DNS records, and
zones. Mail needs those; Base does not.

Two consequences:

- A Score Four cutover to Alchemy as the deployer answers a question we no longer ask. The useful
  test is a C stack: keep Workers Builds, add a run file for the Convex side, and later the Mail
  resources.
- The "run Alchemy inside Workers Builds" hybrid is weaker than it looked: the preview URL leaves
  the PR comment, and Cloudflare's docs require `wrangler preview` for Worker Previews.

## Recommendation

Keep Workers Builds as the deployer for every Samebase app. Use Alchemy only for the setup stack,
pattern C. First dogfood: Score Four gets an `infra/alchemy.run.ts` that declares the existing
Convex project, a production deploy key, a preview deploy key, the preview auth defaults, and the
GitHub build variables, run from GitHub Actions on changes to that file. Second dogfood: Mail, where
the stack also declares the R2 bucket, Email Routing, and DNS. The template stays untouched until
both pass.

## Unverified

- Whether `wrangler deploy` keeps or removes the `alchemy:*` script tags.
- Whether a deploy command without Wrangler still gets a check run and a Builds entry.
- Whether Workers Builds writes auto-provisioned ids back to the repository.
- Whether any Alchemy user runs Workers Builds. Discord was not searched.

## Sources

- [Workers Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Workers Builds GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build branches and Worker Previews](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Wrangler configuration: source of truth and automatic provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare infrastructure as code](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/)
- [Changelog: new Workers API with Terraform plus Wrangler](https://developers.cloudflare.com/changelog/2025-09-03-new-workers-api)
- [Terraform issue 6924: no Builds resource](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6924)
- [workers-sdk 8871: Wrangler config as source of truth for vars](https://github.com/cloudflare/workers-sdk/issues/8871)
- [workers-sdk 9528: no `keep_bindings`](https://github.com/cloudflare/workers-sdk/issues/9528)
- [Alchemy CI guide](https://alchemy.run/environments/ci)
- [Alchemy resource lifecycle](https://alchemy.run/infrastructure-as-code/resource-lifecycle)
- [Alchemy adopting resources](https://alchemy.run/cli/adopting-resources)
- [Alchemy issue 621: Wrangler replacement](https://github.com/alchemy-run/alchemy/issues/621)
- [Alchemy issue 730: coexistence with Wrangler](https://github.com/alchemy-run/alchemy-async/issues/730)
- [Alchemy issue 1410: Wrangler stripped a binding](https://github.com/alchemy-run/alchemy-async/issues/1410)
- [Render infrastructure as code](https://render.com/docs/infrastructure-as-code)
- [Terraform `cloudflare_pages_project`](https://github.com/cloudflare/terraform-provider-cloudflare/blob/main/docs/resources/pages_project.md)
- [Netlify provider issue 39](https://github.com/netlify/terraform-provider-netlify/issues/39)
- [Railway `railway_service`](https://github.com/terraform-community-providers/terraform-provider-railway/blob/master/docs/resources/service.md)
- [Fly: automation without Terraform](https://docs.fly.io/blueprints/infra-automation-without-terraform)
