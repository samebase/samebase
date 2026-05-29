# Convex Manual Deployment Connection

## Document Control

- Status: Accepted
- Owner: Noter provider resources, vault dashboard
- Created: 2026-05-23
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/103_CONVEX_API_VALIDATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `research/2026-05-19-existing-app-resource-adoption.md`
  - `research/2026-05-22-provider-resource-discovery-and-configuration.md`

## Summary

Convex deployment connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment wiring.

The dashboard resource rail should let a ready GitHub-connected vault:

- connect an existing Convex project from the connected Convex team
- create a new Convex project with a production deployment

Both flows attach the selected or created project's default production deployment to `vault.convex`
and record enough `vaultInfrastructure` metadata for dashboard links and later provider wiring.

## Goals

- Let an existing GitHub vault attach an existing Convex project.
- Let an existing GitHub vault create a new Convex project and attach its production deployment.
- Store the attached Convex identity on the vault as the durable product state.
- Store Convex dashboard/link metadata in `vaultInfrastructure`.
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

`vault.convex` owns the attached Convex production resource identity:

```ts
type VaultConvexState =
  | { state: "not_configured" }
  | { state: "provisioning"; runId: Id<"appProvisioningRuns">; startedAt: number }
  | {
      state: "connected";
      projectId: string;
      projectSlug: string;
      deploymentName: string;
      origin: "provisioned" | "selected_existing";
      connectedAt: number;
    }
  | { state: "failed"; runId: Id<"appProvisioningRuns">; failedAt: number };
```

During the initial rollout, code may tolerate older connected rows without `origin`; new writes must
set it. Rows without `origin` should be treated as provisioned only when existing Noter-created
infrastructure already proves Noter created the resource. Destructive cleanup must otherwise fail
closed.

`origin` answers how this vault attached to the Convex production deployment:

- `provisioned` means Noter created the project/deployment during an explicit create flow.
- `selected_existing` means the user chose an existing project from Convex inventory.

Cleanup ownership is derived from `origin`: `provisioned` projects can be removed by managed cleanup
flows, while `selected_existing` projects are external.

`vaultInfrastructure` stores dashboard and later wiring metadata:

```ts
type VaultInfrastructureConvexFields = {
  convexProjectId: string;
  convexTeamSlug: string;
  convexProjectSlug: string;
  convexDeploymentName: string;
  convexDeploymentType: "prod";
  convexCloudUrl: string;
  convexSiteUrl: string;
  convexDeployKeys: {
    production: { state: "not_created" };
    preview: { state: "not_created" };
  };
};
```

Manual connection does not create deploy keys, so both deploy-key states start as `not_created`.

## Provider Scope

The Convex provider connection owns credentials and the currently connected team. It does not own a
vault resource.

Manual Convex connection uses the connected provider team's `teamId`. If the user needs a different
team, they must reconnect or switch the Convex provider connection before starting this flow.

When a project read returns `teamSlug`, Noter should persist it to the Convex provider connection
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
3. create the project with a production deployment
4. immediately record the created project id on the Workflow run
5. read the project and default production deployment back from Convex
6. attach the resulting deployment with `origin: "provisioned"`

If a created project cannot be attached after the provider create call, the workflow should fail
closed with the created project id retained on the run. Automatic rollback deletion is not part of
this slice because project deletion is more destructive than deleting an empty Worker; cleanup
remains available through the explicit vault delete path for provisioned resources.

## Durable Execution

Manual Convex attach/create uses `appProvisioningRuns` with trigger `connect_convex_deployment`.

The run is intentionally narrow:

1. claim provider work for the vault
2. verify or create the Convex project/deployment
3. record `vaultInfrastructure`
4. attach the deployment to `vault.convex`
5. mark the run complete

The modal submit action should return after the Workflow is queued. The modal closes by clearing
`add-convex`, and the vault header/resource rail shows the Convex row as running, failed, or ready
from subscribed dashboard state.

A failed manual Convex run should keep the Convex row failed while offering the same connection
dialog again, so the operator can choose an existing project or create a new project without waiting
for hidden state cleanup.

## Route Semantics

`/home?add-convex#vault-name` opens the Convex project connection dialog for the vault matched by
the dashboard hash.

The dialog closes by clearing `add-convex` while preserving the hash.

Provider credential connect/disconnect work belongs on `/providers`; this route only attaches or
creates a Convex deployment resource for the selected vault.

## Deployment Wiring

Deployment wiring is a later state model. The two separate wiring relationships are:

- repository source to Convex functions/schema deployment
- Cloudflare Workers Builds to Convex build access through deploy keys

Attaching or creating a Convex production deployment does not imply either wiring relationship
exists.
