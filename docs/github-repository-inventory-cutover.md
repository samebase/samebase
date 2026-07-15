# GitHub Repository Inventory Production Cutover

Use this runbook once, immediately before the narrow repository inventory schema is deployed. It
deletes only retired derived cache. It preserves vaults, provider connections, credentials, file
staging, infrastructure records, and every other product table.

Do not run these commands while a production Samebase tab is open. Do not deploy the narrow schema
until every preflight and verification below succeeds.

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

## 2. Prove the retired workers are idle

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

## 3. Clear only the five retired cache tables

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

Do not add `vaults`, `providerConnections`, or any other table to this list.

## 4. Independently verify every table is empty

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

Immediately deploy the narrow snapshot schema and runtime after this succeeds. Keep production tabs
closed until that deployment is complete. If deployment does not start, leave the tabs closed and
investigate instead of restoring the retired cache or widening the new schema.
