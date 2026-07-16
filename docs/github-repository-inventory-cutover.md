# GitHub Repository Inventory Production Cutover

Use this runbook once, immediately before the narrow repository inventory schema is deployed. It
performs an explicit no-compatibility reset: every current vault is deleted through the old
dashboard, GitHub is disconnected, then the retired repository-derived tables are cleared. It
preserves users plus non-GitHub `providerConnections` and their credentials. The old GitHub
connection cannot survive because its row lacks the required stable numeric GitHub account ID. Leave
every optional external-resource removal choice unchecked so the reset still leaves GitHub
repositories, Convex resources, Cloudflare resources, and Codespaces intact.

The external provider objects survive, but their Samebase vault associations do not. Vault deletion
removes the app, Convex deployment, Cloudflare Worker, domain, ownership, target, and Codespaces
rows that told Samebase how those objects belonged together. After reconnecting a repository as a
new vault, reattach or recreate each provider integration that the new vault still needs.

Do not clear the `vaults` table directly. The old dashboard deletion workflow owns the bounded
cleanup of vault-scoped product state. Do not deploy the narrow schema until every preflight and
verification below succeeds.

## 1. Target production safely

Run from the primary `main` checkout so `--prod` resolves through its project configuration. This
follows `docs/convex-production-reads.md` and clears any deploy key that could override `--prod`.

```bash
set -euo pipefail

primary_checkout="$(
  git worktree list --porcelain |
    awk '$1 == "worktree" { worktree=$2 } $1 == "branch" && $2 == "refs/heads/main" { print worktree; exit }'
)"
cd "$primary_checkout/apps/samebase"

production_deployment="$(
  node <<'NODE'
const fs = require("fs");
const line = fs
  .readFileSync(".env.local", "utf8")
  .split(/\n/)
  .find((entry) => entry.trimStart().startsWith("CONVEX_DEPLOYMENT="));
if (!line) process.exit(2);
const raw = line.split("=").slice(1).join("=");
process.stdout.write(raw.replace(/\s+#.*$/, "").trim().replace(/^['"]|['"]$/g, ""));
NODE
)"

prod_convex() {
  CONVEX_DEPLOYMENT="$production_deployment" CONVEX_DEPLOY_KEY= npx convex "$@"
}
```

Keep that shell open for the remaining steps.

## 2. Delete every vault through the old dashboard

Keep the old production runtime deployed for this step. Open the production `/vault` dashboard and
remove every vault, including provisioning, setup-failed, connected, and deletion-failed rows. For
each removal:

1. Open `Remove Vault`.
2. Leave every `Also remove` option unchecked. This cutover removes the Samebase vault only, not its
   GitHub repository, Convex resource, Cloudflare resource, or Codespaces.
3. Confirm the removal and wait until the vault disappears from the directory.
4. If the row enters deletion-failed state, use the dashboard retry until deletion completes. Do not
   bypass the workflow with a direct table delete.

Continue loading directory pages and deleting rows until `/vault` is empty. Then open the provider
connection UI, disconnect GitHub, and wait until GitHub shows as disconnected. Confirm that every
non-GitHub provider connection that should survive still shows as connected. Close every production
Samebase tab after this verification so the retired client cannot request more work.

## 3. Prove the vault reset boundary

Verify the authoritative table is empty without printing any vault data:

```bash
vault_output="$(prod_convex data vaults --prod --limit 1 2>&1)"
if [ "$vault_output" != "There are no documents in this table." ]; then
  printf 'vaults is not empty; return to the old dashboard and finish deletion.\n' >&2
  exit 1
fi
printf 'The production vaults table is empty.\n'
```

The provider-connection UI check from the previous step is both the credential-safe GitHub removal
check and the non-GitHub preservation check. Do not dump `providerConnections` through the CLI
because those rows contain credentials. Never add `providerConnections` to an import or replacement
command in this runbook. A forgotten old GitHub row must make the narrow schema deployment fail; do
not widen the schema to bypass that failure.

## 4. Prove the retired workers are idle

The retired queue must contain no `queued`, `scheduled`, or `running` request. The command also
fails if it reaches the 10,000-row audit bound instead of proving the complete current table.

```bash
queue_audit="$(mktemp -t samebase-repository-refresh-queue)"
prod_convex data repositoryRefreshRequests --prod --limit 10000 --format jsonArray \
  > "$queue_audit" 2>&1

node - "$queue_audit" <<'NODE'
const fs = require("fs");
const raw = fs.readFileSync(process.argv[2], "utf8").trim();
const rows = raw === "There are no documents in this table." ? [] : JSON.parse(raw);
if (rows.length === 10_000) {
  throw new Error("Queue audit reached its bound and did not prove the whole table idle.");
}
const active = rows.filter(({ lifecycle }) =>
  lifecycle.state === "queued" ||
  lifecycle.state === "scheduled" ||
  lifecycle.state === "running"
);
if (active.length > 0) {
  throw new Error(`Retired repository refresh queue still has ${active.length} active rows.`);
}
console.log(`Retired repository refresh queue is idle across ${rows.length} rows.`);
NODE

workpool_audit="$(mktemp -t samebase-repository-refresh-workpool)"
prod_convex data runStatus --prod --component repositoryRefreshWorkpool --limit 10 \
  > "$workpool_audit" 2>&1

node - "$workpool_audit" <<'NODE'
const fs = require("fs");
const raw = fs.readFileSync(process.argv[2], "utf8");
const kinds = [...raw.matchAll(/"kind": "([^"]+)"/g)].map((match) => match[1]);
if (kinds.length !== 1 || kinds[0] !== "idle") {
  throw new Error(`Retired Workpool is not idle: ${raw.trim()}`);
}
console.log("Retired repository refresh Workpool is idle.");
NODE
```

Then verify that `pendingStart`, `pendingCancelation`, `pendingCompletion`, and `work` each report
no documents:

```bash
for table in pendingStart pendingCancelation pendingCompletion work; do
  output="$(
    prod_convex data "$table" --prod --component repositoryRefreshWorkpool --limit 1 2>&1
  )"
  if [ "$output" != "There are no documents in this table." ]; then
    printf '%s is not empty:\n%s\n' "$table" "$output" >&2
    exit 1
  fi
done
```

Stop if any check fails. Do not try to repair active work by deleting its rows.

## 5. Clear only the five retired derived tables

Convex supports clearing a table by replacing it with an empty JSON array. The confirmation is
non-interactive because the table names are fixed and the preflight already proved the writers are
idle.

```bash
empty_table="$(mktemp -t samebase-empty-convex-table)"
printf '[]\n' > "$empty_table"

for table in \
  githubCommitCheckItems \
  githubCommitCheckSnapshots \
  vaultRemoteBranches \
  vaultBranchFilters \
  repositoryRefreshRequests
do
  prod_convex import --prod --table "$table" --replace --yes --format jsonArray "$empty_table"
done
```

Do not add `vaults`, `providerConnections`, or any other table to this list. GitHub connection
removal belongs to the authenticated provider UI, not a credential-bearing table replacement.

## 6. Independently verify every retired table is empty

These are fresh reads after the replacement imports. Any document blocks the deployment.

```bash
for table in \
  repositoryRefreshRequests \
  vaultBranchFilters \
  vaultRemoteBranches \
  githubCommitCheckSnapshots \
  githubCommitCheckItems
do
  output="$(prod_convex data "$table" --prod --limit 1 2>&1)"
  if [ "$output" != "There are no documents in this table." ]; then
    printf '%s still contains data:\n%s\n' "$table" "$output" >&2
    exit 1
  fi
done

rm -f "$queue_audit" "$workpool_audit" "$empty_table"
```

## 7. Deploy the narrow runtime

Immediately deploy the narrow snapshot schema and runtime after the empty-table verification
succeeds. Keep production tabs closed until that deployment is complete. Reconnect GitHub first so
the new provider row records the stable numeric account ID, then reconnect repositories as new
vaults and reattach or recreate their external provider integrations. If deployment does not start,
leave the tabs closed and investigate instead of restoring old vault or derived data or widening the
new schema.
