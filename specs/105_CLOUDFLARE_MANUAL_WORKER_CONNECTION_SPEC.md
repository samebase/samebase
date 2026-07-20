# Cloudflare Manual Worker Connection

Cloudflare Worker connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment configuration.

## Goals

- Let a vault attach an existing Cloudflare Worker from a selected Cloudflare account.
- Let a vault create a new Cloudflare Worker in a selected Cloudflare account.
- Store the attached Worker identity on the vault as the durable source of truth.
- Keep attach/create as an explicit request whose dialog stays open until the provider operation and
  stable attachment write finish.
- Keep the stored state brand-neutral so a future product rename does not leave product names in DB
  literals.

## Non-goals

- Do not configure Workers Builds in this slice.
- Do not connect GitHub to Cloudflare in this slice.
- Do not rotate or install Convex deploy keys in Workers Builds in this slice.
- Do not delete Cloudflare Workers that were selected as existing external resources.

## State Model

`vaultCloudflareWorkers` owns the attached Worker identity for one vault app root:

```ts
type VaultCloudflareWorker = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  appId: Id<"vaultApps">;
  accountId: string;
  workerName: string;
  workerTag: string;
  origin: "provisioned" | "selected_existing";
  createdAt: number;
};
```

The app must not require the account-level workers.dev subdomain endpoint before attaching or
creating a Worker. The real Cloudflare MCP OAuth grant can verify accounts and Worker identity while
that specific endpoint can return an authentication error; attachment should still succeed.

The attached `vaultApps` row owns the Worker's `rootDirectory`. It has exactly the same meaning and
spelling as Cloudflare's `root_directory`. Samebase should show Cloudflare's observed root-directory
evidence in the picker before attachment when it is known.

`origin` answers how this vault attached to the Worker.

`createdAt` answers when this vault attached the Worker.

Cleanup ownership is derived from `origin`: `provisioned` Workers can be deleted by managed cleanup
flows, while `selected_existing` Workers are external.

Worker existence, workers.dev URLs, repository configuration, build triggers, and Convex deploy-key
variables are read directly from Cloudflare as a bounded live observation. They are not fields on
the attachment row and the observation is not written back to the database.

## Provider Connection Model

The Cloudflare provider connection owns credentials. It does not own a vault resource. It can store
a default account for convenience:

```ts
type CloudflareDefaultAccount =
  | { state: "not_selected" }
  | {
      state: "selected";
      accountId: string;
      accountName: string;
    };
```

Each vault stores its own Cloudflare account identity, so different vaults can target different
accounts.

If OAuth exposes more than one Cloudflare account, the provider connection remains connected with
`defaultAccount.state === "not_selected"` until the user chooses one. New full-app creation must not
start provisioning in that state; the dashboard should block create and offer an account selection
path. Manual Worker attach/create can also choose an account and then stores that choice as the new
default for later flows.

## Provisioning Plan Model

`workflow_vaultProvisioning_plans.cloudflare` is only a full-app provisioning plan/checkpoint. It
should not be the durable connected Worker identity.

The desired plan shape is:

```ts
type VaultProvisioningPlanCloudflare =
  | {
      state: "planned";
      accountId: string;
      workerName: string;
      build: VaultCloudflareBuildConfig;
    }
  | {
      state: "creating";
      accountId: string;
      workerName: string;
      build: VaultCloudflareBuildConfig;
    }
  | {
      state: "created";
      accountId: string;
      workerName: string;
      workerTag: string;
      build: VaultCloudflareBuildConfig;
    };
```

Full-app provisioning uses this plan to keep retries deterministic. `creating` is written before the
external create request. If the action stops before recording the returned immutable Worker tag,
retry stops for operator inspection rather than adopting a same-named Worker. `created` lets retry
reuse the exact confirmed Worker. Samebase records `created` and the stable `provisioned`
`vaultCloudflareWorkers` attachment in one database transaction. Explicit vault deletion derives
ownership only from that attachment.

An exact Cloudflare Worker identity can be attached to only one Samebase app, even across Samebase
users. This keeps a provisioned attachment an exclusive deletion-ownership record rather than a
shared reference that one vault could remove underneath another.

Because existing data is not a compatibility constraint for this slice, full-app Cloudflare
provisioning should fail closed if the plan is missing instead of reconstructing a plan from legacy
provider defaults.

Manual account selection updates the Cloudflare provider connection's default account. That default
is only a convenience for the next flow; each attached vault still stores its own account identity.

## Worker Selection

Existing Worker attachment should verify the requested account belongs to the current Cloudflare
connection, then re-list Workers server-side and attach the selected Worker from that list. The
listed Worker name/tag is enough identity for this slice and avoids depending on a second Worker
detail endpoint that can disagree with inventory for older Worker shapes.

Manual Worker creation should check that the vault is still attachable before making the Cloudflare
create call. The external create must not be the first operation that discovers the vault is already
attached or unavailable.

## Explicit Execution

Manual Worker attach/create runs as one explicit action. The dialog remains open and disabled while
the action reads Cloudflare and writes `vaultCloudflareWorkers`; it closes only after success and
shows the returned error otherwise. It does not create a provisioning run or persist intermediate
provider state.

If Samebase creates a Worker and the stable attachment write then fails, the action reports that the
provider create may have succeeded and leaves inspection or cleanup to Cloudflare. It must not
automatically delete the Worker because another concurrent request may already have attached that
identity. Attaching a Worker selected from existing Cloudflare inventory never deletes or otherwise
changes that Worker when the local attachment fails.

## Missing Worker Recovery

When a live Cloudflare observation reports that the recorded Worker name is absent or now has a
different Worker tag, the resource row offers `Remove from Samebase`. The action reads Cloudflare
again and deletes only the unchanged `vaultCloudflareWorkers` attachment after it confirms the
recorded identity is still missing. It never deletes a Cloudflare Worker.

A failed or unavailable provider read does not authorize attachment removal. After removal, the
ordinary `?add-cloudflare` flow can attach or create a Worker without a replacement-specific state
machine.

## Route Semantics

`/vault/<org>/<repo>?add-cloudflare` opens the Cloudflare Worker connection dialog for the selected
vault route.

The dialog closes by clearing `add-cloudflare` while preserving the selected vault route.

## Deployment Configuration

Deployment configuration is separate from Worker attach/create. The two provider configurations are:

- GitHub to Cloudflare Workers Builds.
- Cloudflare Workers Builds to Convex build access through deploy keys.

Attaching a Worker does not imply either provider configuration exists. Samebase-provisioned Workers
created by full app provisioning continue through `configure_workers_builds_for_github`; selected
existing Workers require an explicit user action so Samebase does not mutate a preexisting
Cloudflare setup without approval. After attach, the dashboard exposes that explicit action as
`Configure Workers Builds for GitHub` when the Worker is not connected to the vault's GitHub
repository through Cloudflare Workers Builds.

After Builds is connected, `Rotate Convex deploy keys for Workers Builds` takes one explicitly
selected attached Convex project. Samebase writes both secret deploy-key variables and the readable
`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>` marker to the production
and preview triggers. That Cloudflare configuration is the live relationship. Attaching resources
does not create a Worker-to-project relationship, and Samebase does not persist a completed
dependency row.
