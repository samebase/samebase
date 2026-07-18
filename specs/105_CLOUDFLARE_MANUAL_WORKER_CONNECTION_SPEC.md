# Cloudflare Manual Worker Connection

## Document Control

- Status: Accepted
- Owner: Samebase Cloudflare Worker attachment
- Last updated: 2026-07-18
- Resource graph source of truth: `specs/115_VAULT_APP_RESOURCE_OWNERSHIP_SPEC.md`

Cloudflare Worker connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment wiring. Spec 115 supersedes this document wherever older
text treats a root string as resource identity or nests deployment wiring inside a Worker.

## Goals

- Let a vault attach an existing Cloudflare Worker from a selected Cloudflare account.
- Let a vault create a new Cloudflare Worker in a selected Cloudflare account.
- Store the attached Worker beneath the selected stable app as durable source of truth.
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

`vaultCloudflareWorkers` owns the attached Worker identity beneath one stable app:

```ts
type VaultCloudflareWorker = {
  vaultId: Id<"vaults">;
  userId: Id<"users">;
  appId: Id<"vaultApps">;
  accountId: string;
  workerName: string;
  workerTag: string;
  workersDev: { state: "available"; url: string } | { state: "disabled" } | { state: "unknown" };
  origin: "provisioned" | "selected_existing";
  upstream: { state: "present" } | { state: "missing_upstream" };
  builds:
    | { state: "not_connected" }
    | {
        state: "connected";
        buildCommand: string;
        deployCommand: string;
        previewDeployCommand: string;
        pathIncludes: string[];
        pathExcludes: string[];
        production: { triggerUuid: string; buildTokenUuid: string };
        preview: { triggerUuid: string; buildTokenUuid: string };
      };
  connectedAt: number;
  lastObservedAt: number;
};
```

Workers.dev availability is explicit. `disabled` means Cloudflare confirmed that the Worker does not
publish a workers.dev URL. `unknown` means Samebase could not obtain a conclusive provider answer.
Neither state is represented by an omitted URL.

The app must not require the account-level workers.dev subdomain endpoint before attaching or
creating a Worker. The real Cloudflare MCP OAuth grant can verify accounts and Worker identity while
that specific endpoint can return an authentication error; attachment should still succeed with
`workersDev.state === "unknown"` until a later verification obtains a conclusive answer.

The referenced `vaultApps` row owns the exact `rootDirectory`. That value has Cloudflare's
`root_directory` meaning and spelling. It is app location, not Worker identity.

The stable Worker identity is `accountId` plus immutable `workerTag`. `workerName` is the current
mutable provider name and the account-scoped name reserved before creation returns a stable ID.

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

## Provisioning Target Model

`vaultInfrastructureTargets.cloudflare` starts as full-app creation intent. After attachment it
points at the stable Samebase Worker row so a composed retry never rediscovers that Worker by its
mutable provider name. It is not provider resource inventory or the checkpoint for a provider create
response.

The desired target shape is:

```ts
type VaultInfrastructureTargetCloudflare =
  | {
      state: "planned";
      accountId: string;
      workerName: string;
    }
  | {
      state: "attached";
      accountId: string;
      workerName: string;
      workerId: Id<"vaultCloudflareWorkers">;
    };
```

Full-app provisioning can use this target to keep retries deterministic. The target keeps the
planned name and selected account even after it records the attached Worker row ID. A
`vaultCloudflareWorkerCreationClaims` row is written before the provider create request and records
the response-confirmed immutable provider ID. Once a Worker is attached, its provider identity
belongs in `vaultCloudflareWorkers` and the claim is consumed.

Because existing data is not a compatibility constraint for this slice, full-app Cloudflare
provisioning should fail closed if the target is missing instead of reconstructing a target from
legacy provider defaults.

Manual account selection updates the Cloudflare provider connection's default account. That default
is only a convenience for the next flow; each attached vault still stores its own account identity.

## Worker Selection

Existing Worker attachment should verify the requested account belongs to the current Cloudflare
connection, then re-list Workers server-side and attach the selected Worker by its immutable
provider ID. Later verification reads that immutable ID directly and refreshes the current name.

Manual Worker creation should check that the vault is still attachable before making the Cloudflare
create call. The external create must not be the first operation that discovers the vault is already
attached or unavailable.

## Durable Execution

Manual Worker attach/create uses `appProvisioningRuns` with trigger `connect_cloudflare_worker`. The
run is intentionally narrow: it claims Cloudflare provider work, ensures the selected or newly
created Worker, writes `vaultCloudflareWorkers`, consumes any creation claim, and marks the run
complete in the same mutation.

Do not add a separate vault Cloudflare `provisioning` or `failed` variant for this flow. While the
run is active or failed, dashboard state is derived from `vaultInfrastructureOwnership` plus the run
events. Once the Worker is attached, `vaultCloudflareWorkers` remains the only durable resource
inventory. An unresolved creation claim is an operational checkpoint, not an attached Worker.

The modal submit action should return after the Workflow is queued. The modal then closes by
clearing `add-cloudflare`, and the vault header/resource rail shows the Cloudflare row as running,
failed, or ready from subscribed dashboard state.

Samebase never automatically deletes a Worker merely because attachment failed. A confirmed create
response remains in a `created` claim for exact recovery. An unanswered response remains `creating`;
finding a same-named Worker during recovery attaches it as selected existing because Samebase cannot
prove who created it. A failed manual Cloudflare run should keep the Cloudflare row failed while
offering the same connection dialog again.

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
not connected to the vault's GitHub repository through Cloudflare Workers Builds. A separate
Worker-to-Convex dependency may point to any Convex deployment in the vault, regardless of root
directory. Its explicit deployment action owns deploy keys and trigger variables.

Samebase-generated build commands and path filters are one managed configuration. If verification
finds different provider configuration, it reports the mismatch rather than adopting the custom
settings as managed state. The user may keep operating the custom configuration directly in
Cloudflare, or run the explicit wiring action to restore Samebase's generated configuration.
