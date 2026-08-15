# Cloudflare Worker Root Directory Backfill

Use this runbook between the two schema checkpoints that add required `rootDirectory` to
`vaultCloudflareWorkers`. Checkpoint 1 must already be deployed. It allows the field to be absent on
legacy rows, requires all new writes to include it, and includes the temporary verification and
backfill actions.

Do not deploy checkpoint 2 until the global audit in this runbook reports zero missing roots across
the complete `vaultCloudflareWorkers` table.

## Safety Rules

- Never guess a root.
- Never copy a root from another Worker, a repository folder, an unmatched provisioning plan, or a
  common monorepo layout.
- Accept only one normalized root from an unchanged `created` managed plan that matches the
  provisioned attachment's Worker name and stable `workerTag`, or from a fresh Cloudflare Builds
  read for the exact account, stable `workerTag`, and vault GitHub repository.
- Treat missing provider access, a missing Worker, a repository mismatch, no root, and ambiguous
  roots as unresolved. Do not patch that attachment.
- Run one page at a time. Each action processes at most 20 attachments.
- Use an active Samebase member ID for the target organization. Do not use a removed member or an
  unrelated user.
- Do not copy credentials, provider responses, or secret values into notes or logs.

## Prepare The Production Target

Follow the deployment-selection rules in `docs/convex-production-reads.md`. Prepare the production
target from the primary checkout:

```bash
samebase_primary_checkout="$(
  git worktree list --porcelain |
    awk '$1 == "worktree" { worktree=$2 } $1 == "branch" && $2 == "refs/heads/main" { print worktree; exit }'
)"
cd "$samebase_primary_checkout/apps/samebase"
samebase_prod_deployment="$(
  node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const line = readFileSync(".env.local", "utf8")
  .split(/\n/)
  .find((entry) => entry.trimStart().startsWith("CONVEX_DEPLOYMENT="));

if (!line) process.exit(2);

const raw = line.split("=").slice(1).join("=");
console.log(raw.replace(/\s+#.*$/, "").trim().replace(/^['"]|['"]$/g, ""));
NODE
)"
```

Stop if the Convex CLI says that it ignores `--prod` or selects a deployment from a deploy key.
Replace `<organization-id>` and `<member-id>` with the exact production IDs. Use the same IDs for
the full verification and backfill pass.

## Global Scope Audit

Run the global read-only audit with a null cursor:

```bash
CONVEX_DEPLOYMENT="$samebase_prod_deployment" CONVEX_DEPLOY_KEY= npx convex run \
  vault/cloudflareWorkerRootDirectoryBackfill:auditBatch \
  '{"cursor":null}' \
  --prod
```

The audit scans at most 100 attachments and returns:

```text
{ isDone, continueCursor, scannedCount, missingWorkerIds }
```

If `isDone` is false, run the same command with `cursor` set to the returned `continueCursor`.
Inspect every page. Each ID in `missingWorkerIds` identifies an attachment that needs an
organization-scoped verification and backfill pass. Use a read-only production table inspection to
find its exact `organizationId`. Do not infer the organization from a Worker name or account name.

The initial audit defines the complete work list. It is not the final checkpoint gate because the
rows are still missing roots.

## Checkpoint 1 Product Behavior

All surfaces prefer the saved approved root. The temporary behavior for a legacy attachment with no
saved root is:

- Overview and pull request trees use one verified live Builds root. They use the
  `Cloudflare Workers` group when no verified live root is available.
- Settings shows the row without a root group while Builds is loading or checking. It groups the row
  under a verified live root when one becomes ready. It moves the row to `Needs attention` when no
  verified root is available.
- A verified live root gives the Settings row an `Update root` action. This lets an active member
  approve and store that root without waiting for the operator backfill.
- `Configure Workers Builds` uses a saved root before any live observation. For a legacy row only,
  it uses a verified live root when available and otherwise starts its root input with `/`. On
  submit, repair first calls `Update root`. The backend must verify that exact candidate as the
  current unambiguous Cloudflare root before it stores the root or writes Builds configuration. A
  successful update stores the root and repair then configures Builds with the same saved value. A
  failed verification stops without either write. The `/` input is never authority by itself.

These branches are temporary. Checkpoint 2 removes them after the global audit is clean.

## Dry Verification

Start with a null cursor:

```bash
CONVEX_DEPLOYMENT="$samebase_prod_deployment" CONVEX_DEPLOY_KEY= npx convex run \
  vault/cloudflareWorkerRootDirectoryBackfill:verifyBatch \
  '{"organizationId":"<organization-id>","userId":"<member-id>","cursor":null}' \
  --prod
```

The action returns:

```text
{ isDone, continueCursor, results }
```

Each result identifies one `workerId` and has one of these states:

- `current`: the attachment already has a stored root.
- `ready`: the attachment has no stored root and the action found one approved or verified root.
- `unresolved`: the action could not prove one safe root. The result includes a reason.

A `ready` result includes `source: "managed_plan"` when the exact managed creation checkpoint proves
the approved root. It includes `source: "cloudflare"` when a fresh provider read proves the root.
Both sources use the same normalized-root validator. No other source is accepted.

If `isDone` is false, run the same command again with `cursor` set to the returned `continueCursor`.
Review the result before each next page. Continue until `isDone` is true.

Stop before writes if any result is `unresolved`. Repair provider access or configuration through
the normal product flow, or explicitly remove an attachment that is no longer intended. Then start
dry verification again with a null cursor. Do not substitute a plausible root.

Use the unresolved reason to select the next action:

- `attachment_changed` or `managed_plan_changed`: restart from a null cursor. If it repeats, inspect
  the attachment and plan before any write.
- `infrastructure_busy`: wait for the current provider operation to finish, then restart.
- `provider_connection_required`: reconnect the organization's exact Cloudflare account.
- `provider_request_failed`: retry after Cloudflare access is healthy.
- `repository_root_unavailable`: repair Workers Builds until it reports one root for the exact vault
  repository.
- `vault_unavailable`: inspect the vault lifecycle and organization destinations. Do not backfill
  that row until they are valid.
- `worker_identity_changed` or `worker_missing`: inspect the provider identity. Explicitly remove
  the attachment if that Worker is no longer part of the vault.

## Bounded Backfill

After one complete dry pass has only `current` and `ready` results, run the write action with a null
cursor:

```bash
CONVEX_DEPLOYMENT="$samebase_prod_deployment" CONVEX_DEPLOY_KEY= npx convex run \
  vault/cloudflareWorkerRootDirectoryBackfill:backfillBatch \
  '{"organizationId":"<organization-id>","userId":"<member-id>","cursor":null}' \
  --prod
```

The action uses the same fixed maximum of 20 attachments and returns the same cursor fields. An
`updated` result means that the exact managed plan or a fresh provider read proved the root and the
action stored it. A `current` result means that the row already had a stored root. An `unresolved`
result means that the source state changed or became unavailable before the write. The action does
not patch that row.

Review every page. When `isDone` is false, pass the returned `continueCursor` to the next command.
Do not run an unattended loop. Stop on any `unresolved` result and resolve it before a new pass.

## Final Verification

Run `verifyBatch` again from a null cursor for each organization that you changed. Inspect every
page. The organization pass is clean only when:

- the final page returns `isDone: true`;
- every result is `current`;
- no result is `ready` or `unresolved`.

Then run the global `auditBatch` again from a null cursor and inspect every page. Checkpoint 2 is
clean only when:

- every page has an empty `missingWorkerIds` list;
- the cursors cover the full scan without a skipped page;
- the final page returns `isDone: true`.

If any page reports a missing Worker ID, resolve it and restart the global audit from a null cursor.
An organization-scoped clean result cannot replace this global audit because an omitted organization
would stay invisible.

Keep the verification output with the deployment record. It must contain only the bounded action
result, not raw Cloudflare responses or credentials.

Checkpoint 2 can now make `rootDirectory` required. In the same checkpoint, remove the temporary
organization verification and backfill actions, the global audit, the legacy live-root placement
fallback, and optional-field branches. If the global audit is not clean, do not deploy checkpoint 2.
