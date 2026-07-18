# Convex Manual Deployment Connection

## Document Control

- Status: Accepted
- Owner: Samebase provider resources, vault dashboard
- Created: 2026-05-23
- Last updated: 2026-07-18
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/103_CONVEX_API_VALIDATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/115_VAULT_APP_RESOURCE_OWNERSHIP_SPEC.md`
  - `research/2026-05-19-existing-app-resource-adoption.md`
  - `research/2026-05-22-provider-resource-discovery-and-configuration.md`

## Summary

Convex deployment connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment wiring.

The dashboard resource rail should let a ready GitHub-connected vault:

- connect an existing Convex project from the connected Convex team
- create a new Convex project with a production deployment

Both flows attach the selected or created project's default production deployment to
`vaultConvexDeployments`, beneath a stable `vaultApps` row. That row stores provider identity and
dashboard links. Worker-specific wiring lives in an explicit dependency row defined by spec 115.

## Goals

- Let an existing GitHub vault attach an existing Convex project.
- Let an existing GitHub vault create a new Convex project and attach its production deployment.
- Store the attached Convex identity on the vault as the durable product state.
- Store Convex dashboard/link metadata in `vaultConvexDeployments`.
- Queue attach/create work as a durable Workflow run so the dialog only waits for submission and the
  vault header can show provider-specific progress.
- Preserve per-resource cleanup safety through an explicit resource origin.

## Non-goals

- Do not create deploy keys in this slice.
- Do not push schema, functions, environment variables, or migrations to the selected deployment.
- Do not connect GitHub to Convex.
- Do not connect Cloudflare Workers Builds to Convex deploy keys.
- Do not delete Convex projects that were selected as existing external resources.
- Do not auto-discover or auto-attach Convex projects from fuzzy repository signals.

## State Model

`vaultConvexDeployments` owns the attached Convex production resource identity beneath one stable
app:

```ts
type VaultConvexDeployment = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  appId: Id<"vaultApps">;
  teamId: string;
  projectId: string;
  teamSlug: string;
  projectSlug: string;
  deploymentName: string;
  deploymentType: "prod";
  cloudUrl: string;
  siteUrl: string;
  origin: "provisioned" | "selected_existing";
  upstream: { state: "present" } | { state: "missing_upstream" };
  connectedAt: number;
  lastObservedAt: number;
};
```

No internal backwards-compatibility adapter is kept for older connected-row shapes. Local/operator
data can be cleared instead of carrying old `vault.convex` or `vaultInfrastructure` state forward.

`projectId` is the stable provider identity. `teamId` is its immutable provider ownership and
authorization scope, which must match provider reads and the active credentials before Samebase
writes. Team and project slugs are mutable observations. `origin` answers how this app attached to
the Convex production deployment:

- `provisioned` means Samebase received the create response, recorded its returned project ID, and
  attached that exact project.
- `selected_existing` means the user chose an existing project from Convex inventory, or Samebase
  found a same-named project while recovering an unanswered create request.

Cleanup ownership is derived from `origin`: `provisioned` projects can be removed by managed cleanup
flows, while `selected_existing` projects are external.

Manual connection does not create a Worker dependency or deploy keys. The production and preview
deploy-key identities belong to an explicit Worker-to-Convex dependency instead.

## Provider Scope

The Convex provider connection owns credentials and the currently connected team. It does not own a
vault resource.

Manual Convex connection uses the connected provider team's `teamId`. If the user needs a different
team, they must reconnect or switch the Convex provider connection before starting this flow.

When a project read returns `teamSlug`, Samebase should persist it to the Convex provider connection
for later dashboard links.

## Resource Selection

Existing project connection should:

1. list visible projects for the connected team
2. show deterministic inventory rows with project id, project name, project slug, and team slug
3. re-read the selected project and its default production deployment server-side before attaching

The server must verify:

- the project belongs to the connected Convex team
- the project's default production deployment exists
- the default deployment belongs to the selected project
- the default deployment is a cloud production deployment

The existing-project picker lists every project returned by Convex's team project inventory. The
create flow still creates and attaches the default production deployment for the new project.

Project creation should:

1. validate the requested Convex project name
2. ensure no visible project in the connected team already has that name or slug
3. insert a `creating` project claim before the provider request
4. create the project with a production deployment
5. change the claim to `created` with the response's project ID
6. read the project and default production deployment back from Convex
7. attach the resulting deployment with `origin: "provisioned"` and consume the claim in the same
   mutation

If Samebase never records the create response, the claim remains `creating`. A same-named project
found during recovery is attached as selected existing because ownership is ambiguous. If a
response-confirmed project cannot be attached, its stable ID remains in the `created` claim for
exact recovery. Samebase does not automatically delete projects after attachment failure.

## Durable Execution

Manual Convex attach/create uses `appProvisioningRuns` with trigger `connect_convex_deployment`.

The run is intentionally narrow:

1. claim provider work for the vault
2. verify or create the Convex project/deployment
3. write `vaultConvexDeployments` beneath the target app ID
4. consume any creation claim and mark the run complete in the same mutation

The modal submit action should return after the Workflow is queued. The modal closes by clearing
`add-convex`, and the vault header/resource rail shows the Convex row as running, failed, or ready
from subscribed dashboard state.

A failed manual Convex run should keep the Convex row failed while offering the same connection
dialog again, so the operator can choose an existing project or create a new project without waiting
for hidden state cleanup.

## Route Semantics

`/vault/<org>/<repo>?add-convex` opens the Convex project connection dialog for the selected vault
route.

The dialog closes by clearing `add-convex` while preserving the selected vault route.

## Deployment Wiring

Deployment wiring is separate from Convex attach/create. The two wiring relationships are:

- repository source to Convex functions/schema deployment
- Cloudflare Workers Builds to Convex build access through deploy keys

Attaching or creating a Convex production deployment does not imply either wiring relationship
exists. A later explicit Worker-to-Convex dependency may connect any Worker in the vault to this
deployment, regardless of whether their root directories match. Its deployment action verifies that
the project still belongs to the connected Convex team, mints a production deploy key and a
project-scoped preview deploy key, patches Cloudflare trigger environment variables, and marks the
dependency as wired. The project-scoped key lets a later non-production branch build create or reuse
its branch-named preview. Samebase does not read, create, or store a personal development deployment
as preview infrastructure.
