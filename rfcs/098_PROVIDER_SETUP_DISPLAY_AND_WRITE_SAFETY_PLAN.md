# 098 Provider Setup Display And Write Safety Plan

## Document Control

- Status: Proposed
- Owner: vault provider setup, provider settings, and provider write safety
- Created: 2026-07-29
- Last updated: 2026-07-29
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/090_DASHBOARD_TANSTACK_STORE_STATE_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
- Replaces active guidance in:
  - `archive/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md`
  - `archive/095_INFRASTRUCTURE_VERIFICATION_PLAN.md`

## Decision Request

Approve one vault-level rule:

> Only one operation can change a provider attachment or a provider resource in a vault at one time.

Keep Overview and Settings available during the operation. Show planned resources. Disable
conflicting controls. Enforce the same rule in the backend.

## Evidence

A local New App test on 2026-07-29 showed this sequence:

1. Overview opened about 1.6 seconds after submit.
2. Settings opened about 0.9 seconds later.
3. Settings showed no provider resources for about 6 seconds.
4. The first Convex row used a provider ID instead of a readable project name.
5. The Cloudflare row showed attention while the managed workflow still changed it.
6. The false attention state stayed for about 50 seconds.
7. The next 60-second provider read showed the correct state without a page reload.

The workflow was correct. The dashboard did not show the plan. After completion, the dashboard used
provider data that was older than the workflow.

## Current Model

Keep these facts separate:

| Fact        | Current source                                  | Meaning                                      |
| ----------- | ----------------------------------------------- | -------------------------------------------- |
| Plan        | `workflow_vaultProvisioning_plans`              | Provider names and configuration for retry   |
| Operation   | provisioning runs, write lock, deletion gate    | Work that can change vault or provider state |
| Attachment  | `vaultConvexProjects`, `vaultCloudflareWorkers` | Durable user intent and provider identity    |
| Observation | live provider queries                           | Current provider state                       |

The dashboard query already reads the managed run and write lock. It does not return the plan.
Manual provider actions do not set themselves as the active write owner.

## Proposed Contract

### Active operation

These states conflict with each other:

1. a queued or running managed create or retry
2. a manual provider write that is active or needs recovery
3. an active or failed deletion gate

A plan is not an active operation. A plan stays after completion so that retry uses the same names.
The backend must not block an action only because a plan exists.

### Dashboard data

Keep `getUserVaults` as the dashboard subscription. Do not add an availability query.

Return the managed provider plan in the same vault result. Keep it separate from `sourceSetup` and
`providerSetup`. Return:

- the Convex project name and code location
- the Cloudflare account, Worker name, and build root
- the confirmed provider identity when the plan has one

Add one separate `providerWrite` object to the same vault result. Do not add manual actions to
`sourceSetup` or `providerSetup`. Its `status` field has these variants:

- `idle`
- `active`
- `recovery_required`
- `succeeded`
- `failed`

Each non-idle status returns the owner, affected providers, and update time. A managed owner returns
its run ID. A manual owner returns its action ID and action type. An active manual owner also
returns its expiry time.

The terminal `succeeded` or `failed` status does not block a new write. It stays until the next
managed or manual action replaces it.

The object also returns `lastWriteAt.convex` and `lastWriteAt.cloudflare`. Each time is optional. It
records when Samebase most recently got a known result from an action that could change that
provider. A later write to one provider must not clear or replace the time for the other provider.

Settings uses this row order:

1. Show the attachment when it exists.
2. Add current provider observations when they are available.
3. Show the matching plan item when an active managed run or a failed managed provider run has no
   attachment.
4. Show the empty state only when no attachment and no applicable plan item exist.

A canceled managed run does not keep a plan item visible. If no attachment exists, Settings shows
the empty state.

An attachment replaces its plan item. Do not show both rows. Use the planned project name and Worker
name as the primary labels. Do not use a provider ID as the primary label. An observation can add
facts to an attachment row. An observation must not create a resource row.

While a managed run is active:

- show `Setting up` on its planned or attached targets
- do not show an empty state for a planned target
- do not show attention or repair for a target that the workflow still changes

After provider setup fails on a connected vault, keep a missing target visible with the existing
provider setup failure and managed Retry action. If source setup fails before GitHub connects, show
only the source setup failure. A plan row is not an attachment. It has no provider link or manual
repair action.

### Route and control policy

Do not disable Overview. Do not disable Settings.

Before GitHub connects, Overview shows source setup. Settings can show the planned provider rows,
but provider write controls stay disabled.

After GitHub connects, Overview shows normal repository content with a small `Setting up` status.
Provider setup must not replace the default branch or pull requests.

Disable provider write controls while a managed operation or manual provider write is active or
needs recovery. This includes add, create, attach, detach, repair, change, reconcile, managed Retry,
and Remove vault. Keep safe reads, provider links, and observation reload actions available.

If a direct dialog URL is open, keep the dialog open and disable its confirm action. Show the
active-operation reason. Navigation is not a safety gate.

### Shared backend state

Add one small internal state reader. It reads:

- the deletion gate
- queued or running managed provisioning runs
- the active vault-level write owner or an owner that needs recovery

The dashboard uses this reader to describe the active operation. Backend mutations use the same
reader before they accept a provider change. The frontend decides how to show a disabled control.
The backend decides whether a write can start.

Use this backend table:

| Write command                        | No operation | Managed setup | Manual write or recovery | Delete gate |
| ------------------------------------ | ------------ | ------------- | ------------------------ | ----------- |
| Managed create or retry              | Allow        | Reject        | Reject                   | Reject      |
| Manual attachment or provider change | Allow        | Reject        | Reject                   | Reject      |
| Start vault deletion                 | Eligible     | Reject        | Reject                   | Reject      |

`Add Worker` and `Add Convex project` are manual provider changes. The rule applies to the
dashboard, old browser clients, and MCP. This RFC does not change the existing read policy during
deletion.

For an attachment-only database mutation, check the operation and change the attachment in the same
transaction.

For an external provider write:

1. Set the action as the active write owner in one mutation.
2. Make the provider call.
3. Set the write result and the affected provider `lastWriteAt` in one mutation when the action gets
   a known result.

Generalize the current write-lock owner:

```ts
type VaultInfrastructureWriteOwner =
  | { kind: "managed_run"; runId: Id<"workflow_vaultProvisioning_runs"> }
  | {
      kind: "manual_provider_write";
      actionId: string;
      action: ProviderActionId;
      affectedProviders: ("convex" | "cloudflare")[];
      expiresAt: number;
    };
```

Use this widen-migrate-narrow sequence for persisted lock rows. First deploy a schema and readers
that accept the legacy `runId` shape and the new owner union. Then deploy new writers, backfill the
legacy rows, verify the backfill, and remove the legacy shape in a later deployment. Do not delete
and recreate an active lock. Current run mutations reject a missing lock.

Keep one vault-level lock. Do not add resource-level locks. A manual action does not need a Workflow
run or a history table. The manual owner stores the non-secret target data that it needs to repeat
or complete the same action. It must not store provider credentials. Do not recheck ownership at
checkpoints in a short manual action.

A stopped action must not keep the vault locked:

1. Give each manual provider action a hard five-minute time limit.
2. Give its active-owner record a ten-minute expiry time.
3. Schedule one recovery action when the action becomes the active owner.
4. At expiry, change the status to `recovery_required` only if the same action ID is still active.
5. Keep `recovery_required` in the lock state. It blocks provider writes and deletion.
6. Dispatch on the existing closed action type. Safely repeat or complete the same provider action
   with the same action ID.
7. Set the result to succeeded or failed and set `lastWriteAt` only when recovery gets a known
   result.
8. If recovery fails before it gets a known result, keep `recovery_required` and permit another
   recovery attempt.
9. Reject completion from an expired action or from an action that no longer owns the write.

Only recovery for the same action ID can make a provider call while the status is
`recovery_required`. Do not add a generic recovery framework. Each existing manual action defines
how it can safely repeat or complete its own work.

The action must stop all later provider calls when its five-minute time limit ends. This keeps the
provider write time shorter than the active-owner time.

Deletion uses the same state. It cannot start during a managed setup or manual provider write.
Managed setup cannot start during a manual provider write. A failed deletion gate blocks provider
writes until deletion retry resolves it.

### Fresh observations

Use the provider-specific `lastWriteAt` times to detect out-of-date provider data. If an affected
observation is older than its provider time, mark its query out of date and make one immediate read:

- a managed run refreshes its Convex and Cloudflare targets
- a manual action refreshes only the provider data that it changed
- Settings shows `Checking` until the first read returns
- Settings does not use an old result for attention or repair during `Checking`

The first result becomes the normal state, including a provider read failure. This rule works when
the client did not observe the active state. Do not add continuous polling. Add a bounded retry only
if a later live test proves that a provider returns old data after a successful write.

Use each `lastWriteAt` value in the related provider query key. A new value must cause a new read.

`Checking` is a short frontend state. It is not a durable operation. This rule does not change pull
request query timing or other unrelated 60-second refresh rules.

## Rollout

### Slice 1: Managed setup data and gates

- Return plan and active-operation data from `getUserVaults`.
- Render plan rows and merge them with attachments.
- Keep normal Overview content after GitHub connects.
- Disable conflicting controls from the subscription.
- Reject manual provider changes during managed setup or deletion.

This slice fixes the New App display and blocks writes from an out-of-date browser or MCP client.

### Slice 2: Fresh provider read

- Compare each observation time with its provider-specific `lastWriteAt` time.
- Mark only affected provider queries out of date.
- Show `Checking` during one fresh read.
- Remove the wait for the normal 60-second refresh.

### Slice 3: Complete write ownership

- Set each manual provider action as the active write owner.
- Make managed setup and deletion reject an active manual owner.
- Recover an interrupted manual action while it keeps the same action ID and lock.
- Add the cross-client conflict tests.

All three slices are required.

## Non-Goals

- A command-availability API.
- A generic provider framework.
- Resource-level locks or parallel provider writes in one vault.
- A Workflow run for each short manual action.
- Checkpoint ownership loops for short manual actions.
- Continuous setup polling.
- More global labels than `Setting up` and `Checking`.
- Durable attachments for planned resources that do not exist.
- Disabling Overview or Settings.

## Validation

Tests must prove:

1. A plan without an active run does not block a manual action.
2. A queued or running managed run rejects each manual provider change.
3. An active manual owner rejects managed setup, another manual write, and deletion.
4. An active or failed deletion gate rejects managed and manual provider writes.
5. An old action ID cannot set the result or clear a newer active owner.
6. An unresolved provider request at five minutes still rejects a new write at ten minutes.
7. Recovery keeps the lock until the same action gets a known result.
8. A recovery failure keeps `recovery_required` and can run again.
9. An expired action cannot make a later provider call.
10. Browser and MCP calls receive the same backend rejection.
11. Immediate New App Settings shows readable planned Convex and Cloudflare rows.
12. Active targets do not show empty, attention, repair, or duplicate rows.
13. Provider observations do not create resource rows.
14. Overview keeps repository content after GitHub connects.
15. A direct dialog URL cannot confirm a conflicting write.
16. A client that did not observe the active state still shows `Checking` and fresh data.
17. Two missed writes to different providers cause one fresh read for each provider.
18. An observation that finishes during a write is read again after the write completes.
19. An interrupted deploy-key rotation repeats or completes with the same action ID and lock.
20. A failed fresh read becomes an honest provider read failure.

The implementation must add route-level Playwright tests and dashboard screenshots for active setup,
checking, and completed states.

## After Acceptance

After implementation, move the shipped contract into specs 003, 096, 098, 105, 106, and 115. Keep
spec 097 limited to imported repositories, which have no managed provider plan. Then archive this
RFC.
