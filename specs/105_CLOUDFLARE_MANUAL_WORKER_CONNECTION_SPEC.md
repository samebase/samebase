# Cloudflare Manual Worker Connection

Cloudflare Worker connection is a vault resource attachment. It is separate from provider credential
connection and separate from deployment wiring.

## Goals

- Let a vault attach an existing Cloudflare Worker from a selected Cloudflare account.
- Let a vault create a new Cloudflare Worker in a selected Cloudflare account.
- Store the attached Worker identity on the vault as the durable source of truth.
- Keep the stored state brand-neutral so a future product rename does not leave product names in DB
  literals.

## Non-goals

- Do not configure Workers Builds in this slice.
- Do not connect GitHub to Cloudflare in this slice.
- Do not set Convex deploy keys in Workers Builds in this slice.
- Do not auto-delete Cloudflare resources from manual connection state.

## State Model

`vault.cloudflare` owns the attached Worker identity:

```ts
type VaultCloudflareState =
  | { state: "not_configured" }
  | {
      state: "connected";
      accountId: string;
      workerName: string;
      workerTag: string;
      workersDevUrl?: string;
      origin: "provisioned" | "selected_existing";
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

## Provisioning Target Model

`vaultInfrastructureTargets.cloudflare` is only a full-app provisioning plan/checkpoint. It should
not be the durable connected Worker identity.

The desired target shape is:

```ts
type VaultInfrastructureTargetCloudflare = {
  state: "planned";
  accountId: string;
  workerName: string;
};
```

Full-app provisioning can use this target to keep retries deterministic. The target keeps the
planned name and selected account, not the created Worker identity. Once a Worker is attached, the
Worker identity belongs in `vault.cloudflare`.

Because existing data is not a compatibility constraint for this slice, full-app Cloudflare
provisioning should fail closed if the target is missing instead of reconstructing a target from
legacy provider defaults.

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

## Route Semantics

`?connect-cloudflare#vault-name` opens the Cloudflare Worker connection dialog for the vault matched
by the dashboard hash.

The dialog closes by clearing `connect-cloudflare` while preserving the hash.

## Deployment Wiring

Deployment wiring is a later state model. The two separate wiring relationships are:

- GitHub to Cloudflare Workers Builds.
- Cloudflare Workers Builds to Convex build access through deploy keys.

Attaching a Worker does not imply either wiring relationship exists.
