# Cloudflare Manual Worker Connection

Cloudflare Worker connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment wiring.

## Goals

- Let a vault attach an existing Cloudflare Worker from a selected Cloudflare account.
- Let a vault create a new Cloudflare Worker in a selected Cloudflare account.
- Store the attached Worker identity on the vault as the durable source of truth.
- Queue attach/create work as a durable Workflow run so the dialog only waits for submission and the
  vault header can show progress.
- Keep the stored state brand-neutral so a future product rename does not leave product names in DB
  literals.

## Non-goals

- Do not configure Workers Builds in this slice.
- Do not connect GitHub to Cloudflare in this slice.
- Do not set Convex deploy keys in Workers Builds in this slice.
- Do not delete Cloudflare Workers that were selected as existing external resources.

## State Model

`vaultCloudflareWorkers` owns the attached Worker identity for one vault app root:

```ts
type VaultCloudflareWorker = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  appRoot: string;
  accountId: string;
  workerName: string;
  workerTag: string;
  workersDevUrl?: string;
  origin: "provisioned" | "selected_existing";
  deployment: {
    builds:
      | { state: "not_connected" }
      | {
          state: "connected";
          rootDirectory: string;
          buildCommand: string;
          deployCommand: string;
          previewDeployCommand: string;
          pathIncludes: string[];
          pathExcludes: string[];
          production: { triggerUuid: string; buildTokenUuid: string };
          preview: { triggerUuid: string; buildTokenUuid: string };
        };
    convexBuildAccess: { state: "not_wired" } | { state: "wired" };
  };
  connectedAt: number;
  lastObservedAt: number;
};
```

`workersDevUrl` is optional because selected existing Workers can be configured only through custom
routes/domains or can have the workers.dev subdomain disabled. Created Workers should record it when
Cloudflare exposes enough account subdomain information to compute it.

The app must not require the account-level workers.dev subdomain endpoint before attaching or
creating a Worker. The real Cloudflare MCP OAuth grant can verify accounts and Worker identity while
that specific endpoint can return an authentication error; attachment should still succeed and leave
`workersDevUrl` absent until a later build/domain observation can fill it in.

`appRoot` answers which deployable root inside the repository this Worker serves. Samebase should
show Cloudflare's observed root-directory evidence in the picker before attachment when it is known.

`origin` answers how this vault attached to the Worker.

`connectedAt` answers when this vault attached the Worker.

`lastObservedAt` answers when Cloudflare last confirmed the Worker identity. Cleanup ownership is
derived from `origin`: `provisioned` Workers can be deleted by managed cleanup flows, while
`selected_existing` Workers are external.

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
type VaultProvisioningPlanCloudflare = {
  state: "planned";
  accountId: string;
  workerName: string;
  build: VaultCloudflareBuildConfig;
};
```

Full-app provisioning can use this plan to keep retries deterministic. The plan keeps the planned
name, selected account, and intended build config. Once a Worker is attached, the Worker identity
belongs in `vaultCloudflareWorkers`.

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

## Durable Execution

Manual Worker attach/create uses `workflow_vaultProvisioning_runs` with trigger
`connect_cloudflare_worker`. The run is intentionally narrow: it claims Cloudflare provider work,
ensures the selected or newly created Worker, writes `vaultCloudflareWorkers`, then marks the run
complete.

Do not add a separate vault Cloudflare `provisioning` or `failed` variant for this flow. While the
run is active or failed, dashboard state is derived from `workflow_vaultProvisioning_writeLocks`
plus the run events. Once the Worker is attached, `vaultCloudflareWorkers` remains the only durable
resource identity.

The modal submit action should return after the Workflow is queued. The modal then closes by
clearing `add-cloudflare`, and the vault header/resource rail shows the Cloudflare row as running,
failed, or ready from subscribed dashboard state.

If a created Worker cannot be attached to the vault after the provider create call, the Workflow
must delete that created Worker before surfacing failure unless the vault now points at the same
Cloudflare account and Worker name from a newer run. A failed manual Cloudflare run should keep the
Cloudflare row failed while offering the same connection dialog again, so the operator can pick an
existing Worker or create a new one without waiting for hidden state cleanup.

## Route Semantics

`/vault/<org>/<repo>?add-cloudflare` opens the Cloudflare Worker connection dialog for the selected
vault route.

The dialog closes by clearing `add-cloudflare` while preserving the selected vault route.

## Deployment Wiring

Deployment wiring is separate from Worker attach/create. The two wiring relationships are:

- GitHub to Cloudflare Workers Builds.
- Cloudflare Workers Builds to Convex build access through deploy keys.

Attaching a Worker does not imply either wiring relationship exists. Samebase-provisioned Workers
created by full app provisioning auto-queue `wire_builds`; selected existing Workers require an
explicit user action so Samebase does not mutate a preexisting Cloudflare setup without approval.
After attach, the dashboard exposes that explicit action as `Connect GitHub repo` when the Worker is
not connected to the vault's GitHub repository through Cloudflare Workers Builds. If the same app
root also has an attached Convex deployment after Builds is connected, the dashboard exposes
`Set Convex deploy keys` to run `wire_convex_build_access`.
