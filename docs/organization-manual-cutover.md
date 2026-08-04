# Organization Manual Cutover

Use this runbook once for the first production organization deployment. The procedure preserves
retained users and their sign-in records. It does not migrate vault or MCP access data.

## Stop Conditions

Stop the cutover if one of these conditions is true:

- The two operator user IDs are not known and different.
- The current operator Polar state was not captured and checked against Polar.
- The second operator or another retained user has a different Polar customer or an active or
  past-due plan.
- Any retained user has a pending or open checkout attempt.
- A user has an active account-deletion state.
- An account-deletion run has state `queued`, `running`, or `needs_attention`.
- A vault-deletion run has state `queued` or `running`.
- A vault provisioning run or provider write lock is active.
- A pending scheduled function can write to a table in the clear list.
- A relevant action, workflow, or scheduled function is still running.
- Any sign-in, account update, new account creation, product request, Polar checkout, Polar webhook,
  MCP client, or MCP authorization can still write to production.
- The target deployment is not confirmed with the production-read procedure in
  [Convex production reads](./convex-production-reads.md).

Do not continue a failed cutover by changing rows one at a time. Use this rollback order:

1. Keep all traffic and webhooks stopped.
2. Redeploy the previous code and schema.
3. Restore the production backup.
4. Verify the expected table counts and file storage.
5. Resume traffic.

Then find the cause and start the complete procedure again. A Convex backup does not contain code,
the schema, environment variables, or pending scheduled functions.

## Data To Preserve

Preserve these rows:

- `users`, including approved users and waitlist users
- All Convex Auth tables: `authSessions`, `authAccounts`, `authRefreshTokens`,
  `authVerificationCodes`, `authVerifiers`, and `authRateLimits`
- `providerConnections` and `providerOAuthCallbackStates`
- Personal preferences without a vault reference: `ui_user_settings`, `ui_workspaceSidebar_layouts`,
  and `ui_vaultFolders`
- MCP client registrations and audit history: `mcpOauthClients` and `audit_mcpAccess_events`

Create a recoverable production backup with **Include file storage** enabled before changing data. A
normal data export without file storage cannot restore staged uploads and observed blobs. See the
[Convex backup and restore documentation](https://docs.convex.dev/database/backup-restore).

## Capture Operator Billing

Before the reset, record the two operator user IDs and the selected operator billing state outside
the repository. Compare the customer and subscription with Polar. Do not copy the second operator's
billing state. Resolve every checkout attempt and verify that its field is absent. Stop if the
second operator or another retained user has separate Polar state that the bootstrap would replace
with Free and inactive.

Map the old `users` fields to the bootstrap input as follows:

| Old user field                           | `operatorBilling` field           |
| ---------------------------------------- | --------------------------------- |
| `billingProvider`                        | `provider`                        |
| `billingPlan`                            | `plan`                            |
| `billingStatus`                          | `status`                          |
| `billingUpdatedAt`                       | `updatedAt`                       |
| `billingCurrentPeriodEndAt`              | `currentPeriodEndAt`              |
| `billingCancelAtPeriodEnd`               | `cancelAtPeriodEnd`               |
| `billingPolarExternalCustomerId`         | `polarExternalCustomerId`         |
| `billingPolarStateChangedAt`             | `polarStateChangedAt`             |
| `billingPolarObservationRevision`        | `polarObservationRevision`        |
| `billingPolarAppliedObservationRevision` | `polarAppliedObservationRevision` |

The input must include `plan` and `status`. Keep each optional field absent when the old value is
absent. Do not include `polarCheckoutAttempt`. For a user without Polar billing, use `plan: "free"`
and `status: "inactive"`.

## Freeze And Drain Writes

Block all sign-in and account-update entry points. Block new accounts, product traffic, MCP clients,
MCP authorization, and Polar checkout. Pause Polar webhook delivery. Keep these controls active from
before the clear until the bootstrap count and billing verification are complete.

Open the production deployment's
[Schedules page](https://docs.convex.dev/dashboard/deployments/schedules). Cancel each relevant
pending function. Wait for each relevant in-progress action and workflow to finish. Deployment pause
is not sufficient because paused deployments queue scheduled functions. See the
[scheduled functions documentation](https://docs.convex.dev/scheduling/scheduled-functions).

Confirm again that no active account deletion, vault deletion, provisioning run, provider write,
action, workflow, or scheduled function can write to the tables or file storage in the clear list.

## Clear Product Data

After the backup and write drain complete, clear the following tables in the listed child-first
groups. These are the exact production tables removed by this cutover.

1. Clear account-deletion history:
   - `workflow_accountDeletion_events`
   - `workflow_accountDeletion_runs`
2. Clear vault-linked UI and observations:
   - `ui_vaultPullRequests_filters`
   - `ui_vaultResourceLinks_settings`
   - `ui_vaultFolderAssignments`
   - `ui_vaultFileTree_folderExpansions`
   - `ui_vaultConvexSchemaGraph_nodeLayouts`
   - `observations_vaultRepository_branchTrees`
   - `observations_vaultConvexSchema_snapshots`
   - `observations_vaultFiles_blobs`
3. Clear staged changes and workflow history:
   - `vaultStagedFileUpdates`
   - `vaultStagedFiles`
   - `workflow_vaultProvisioning_events`
   - `workflow_vaultProvisioning_writeLocks`
   - `workflow_vaultProvisioning_plans`
   - `workflow_vaultProvisioning_runs`
   - `workflow_vaultDeletion_events`
   - `workflow_vaultDeletion_runs`
4. Clear vault resources:
   - `vaultCloudflareWorkers`
   - `vaultConvexProjects`
   - `vaults`
5. Clear MCP credentials and pending authorization state:
   - `mcpBrowserLoginTokens`
   - `mcpRefreshTokens`
   - `mcpAccessTokens`
   - `mcpAuthorizationCodes`
   - `mcpAuthorizationRequests`
   - `mcpGrants`
6. Confirm that the final organization tables are absent. If an earlier preview or manual deploy
   created them in production, clear them in this order and confirm that they are empty:
   - `organizationBillingAccounts`
   - `organizationMemberships`
   - `organizations`

After all listed tables are empty, delete all Samebase file-storage objects. An upload can exist
before a database row refers to it, so deleting only referenced objects can leave abandoned data.
Use the production deployment's
[File Storage page](https://docs.convex.dev/dashboard/deployments/file-storage). Confirm that file
storage is empty immediately before deployment. Do not delete provider resources. Users will
reconnect those resources as new vaults.

After the Polar state is recorded, remove these old fields from every retained `users` row:

- `accountDeletion`
- `billingProvider`
- `billingPlan`
- `billingStatus`
- `billingUpdatedAt`
- `billingCurrentPeriodEndAt`
- `billingCancelAtPeriodEnd`
- `billingPolarExternalCustomerId`
- `billingPolarStateChangedAt`
- `billingPolarObservationRevision`
- `billingPolarAppliedObservationRevision`
- `billingPolarCheckoutAttempt`

Confirm that no retained `users` row contains any field in this list before schema deployment.
Confirm that every table in the clear list and file storage is empty. Confirm that the preserve list
still has the expected rows.

## Deploy And Bootstrap

Deploy the approved revision through the normal production release. The final schema requires an
organization on each vault, vault resource, and MCP grant. The cleared tables make this schema
change valid without compatibility fields.

Run `organizationBootstrap:bootstrapOrganizationOwnership` once with this input shape:

```json
{
  "operatorUserIdA": "<first retained user ID>",
  "operatorUserIdB": "<second retained user ID>",
  "operatorBilling": {
    "provider": "polar",
    "plan": "pro",
    "status": "active",
    "currentPeriodEndAt": 1788134400000,
    "cancelAtPeriodEnd": false,
    "polarExternalCustomerId": "<captured Polar external customer ID>"
  }
}
```

Use the complete captured billing object except `polarCheckoutAttempt`, not only the example fields.
Free billing without a Polar customer must use `plan: "free"` and `status: "inactive"`; only
`updatedAt` can also be present. Free billing with a Polar customer must also include
`provider: "polar"` and its external customer ID. It can include the captured update and Polar
observation fields, but it must not include a subscription period or cancellation state. Pro billing
must use `provider: "polar"`, `plan: "pro"`, an `active` or `past_due` status, the external customer
ID, `currentPeriodEndAt`, and `cancelAtPeriodEnd`. The Polar external customer ID must exactly equal
the old `billingPolarExternalCustomerId` value, including its `samebase_` prefix. Do not use the
Polar internal customer ID. The function fails when the operator IDs are equal or missing, when the
billing state is inconsistent, when the external customer ID is empty or untrimmed, when an operator
checkout attempt is present, when more than 500 users are retained, or when an organization table is
not empty. It has no rerun or recovery behavior.

## Verify And Reconnect

The function result must have these counts for `N` retained users:

- `users`: `N`
- `organizations`: `N - 1`
- `memberships`: `N`
- `billingAccounts`: `N - 1`

Verify the same table counts in production. Verify that the two operator memberships use one
organization and that its billing row exactly matches the captured state. Verify that each other
user has one separate organization with `plan: "free"` and `status: "inactive"`.

After this billing verification succeeds, allow only controlled test traffic. Keep public traffic
and Polar webhooks stopped. Then complete these user-visible checks in order:

1. Confirm that both operator accounts and one waitlist account can sign in with their existing
   identity.
2. Reconnect each MCP client. Confirm that new grants contain the current organization ID.
3. Reconnect each vault through the normal product flow. Existing provider connections stay in
   place, so users do not reconnect provider accounts.
4. Confirm that each new vault and resource row contains its organization ID.
5. Stop the controlled test traffic.

Resume Polar webhook delivery, then remove the public write and traffic freeze.
