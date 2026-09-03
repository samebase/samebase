# WT-001: Anonymous Worktree Isolation Smoke

## Purpose

Verify that two linked worktrees use separate anonymous local Convex backends. Each backend must
seed a valid GitHub-backed organization from the same development GitHub App installation.

## Preconditions

- Run from a Samebase checkout root.
- The shared development Convex deployment has the required GitHub App settings, GitHub owner seed
  facts, GitHub installation seed fact, and Convex and Cloudflare seed credentials.
- `pnpm` can install dependencies.
- `/tmp/samebase-wt-a` and `/tmp/samebase-wt-b` do not exist.
- No `pnpm dev` process runs in the two temporary test worktrees.

## Steps

1. Create two test worktrees on new temporary branches:

```bash
git worktree add /tmp/samebase-wt-a -b codex-wt-isolation-a
git worktree add /tmp/samebase-wt-b -b codex-wt-isolation-b
```

2. In each worktree, set up anonymous development mode and exit:

```bash
(cd /tmp/samebase-wt-a && pnpm dev --once)
(cd /tmp/samebase-wt-b && pnpm dev --once)
```

3. Compare the backend URLs that each worktree writes:

```bash
grep -E '^(CONVEX_DEPLOYMENT|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' /tmp/samebase-wt-a/apps/samebase/.env.local
grep -E '^(CONVEX_DEPLOYMENT|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' /tmp/samebase-wt-b/apps/samebase/.env.local
```

4. Print only the copied environment variable names. Do not print their values:

```bash
sed -E 's/=.*$//' /tmp/samebase-wt-a/apps/samebase/.env.anon-seed.local | sort
sed -E 's/=.*$//' /tmp/samebase-wt-b/apps/samebase/.env.anon-seed.local | sort
```

5. In the outputs from step 2, confirm that each first run prints:

```txt
"created": true
```

6. Start `pnpm dev` in each worktree in a separate terminal. Keep each process running while you
   inspect its local data:

```bash
(cd /tmp/samebase-wt-a && pnpm dev)
(cd /tmp/samebase-wt-b && pnpm dev)
```

7. In another terminal, print only non-secret organization model fields. Repeat these commands for
   both worktree paths:

```bash
cd /tmp/samebase-wt-a/apps/samebase

npx convex data organizations --limit 20 --format json | node -e '
const rows = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
console.log(rows.map((row) => ({
  id: row._id,
  githubOwnerId: row.githubOwnerId,
  githubOwnerType: row.githubOwnerType,
  githubOwnerLogin: row.githubOwnerLogin,
  githubInstallationId: row.githubInstallationId,
  convexTeamId: row.convexTeam?.teamId,
  cloudflareAccountId: row.cloudflareAccount?.accountId,
})));
'

npx convex data organizationMemberships --limit 20 --format json | node -e '
const rows = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
console.log(rows.map((row) => ({
  id: row._id,
  organizationId: row.organizationId,
  userId: row.userId,
  role: row.role,
})));
'

npx convex data organizationBillingAccounts --limit 20 --format json | node -e '
const rows = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
console.log(rows.map((row) => ({
  id: row._id,
  organizationId: row.organizationId,
  plan: row.plan,
  status: row.status,
})));
'

npx convex data organizationProviderCredentials --limit 20 --format json | node -e '
const rows = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
console.log(rows.map((row) => ({
  id: row._id,
  organizationId: row.organizationId,
  convex: row.convex && {
    connectedByUserId: row.convex.connectedByUserId,
    method: row.convex.auth.method,
  },
  cloudflare: row.cloudflare && {
    connectedByUserId: row.cloudflare.connectedByUserId,
    method: row.cloudflare.auth.method,
  },
})));
'
```

8. Sign in with the local worktree password shortcut. Confirm these pages load:

- Repositories shows an empty repository list.
- Providers shows connected Convex and Cloudflare credentials.
- New App shows the repository name input.
- Connect repository lists repositories from the seeded GitHub App installation.

## Expected Results

1. Both `pnpm dev --once` commands complete successfully.
2. The two `VITE_CONVEX_URL` values are different.
3. Both environment files include the GitHub App deployment settings, GitHub owner seed facts,
   GitHub installation seed fact, and provider seed credentials.
4. Each first setup output reports `"created": true`.
5. Each worktree has one organization, one `owner` membership, one Free billing account, and one
   `organizationProviderCredentials` document with Convex and Cloudflare slots.
6. Each organization stores its seeded `convexTeam` and `cloudflareAccount`. Its credential document
   stores the matching `organizationId`.
7. Both credential slots use the seeded user as `connectedByUserId` and use `api_key`
   authentication.
8. Local document IDs are different between worktrees. The GitHub owner and installation facts are
   the same.
9. The credential document has no GitHub slot. GitHub repository access uses the organization App
   installation.
10. The normal development pages load without a cross-worktree data or authentication conflict.

## Optional Evidence

Save command output only to a local untracked file:

```bash
mkdir -p manual-tests/.runs
# (cd /tmp/samebase-wt-a && pnpm dev --once) | tee manual-tests/.runs/wt-001-a.log
# (cd /tmp/samebase-wt-b && pnpm dev --once) | tee manual-tests/.runs/wt-001-b.log
```

Do not save raw `npx convex data` output. It can contain provider credentials.

## Cleanup

Stop both `pnpm dev` processes. Then remove the temporary worktrees and branches:

```bash
git worktree remove /tmp/samebase-wt-a
git worktree remove /tmp/samebase-wt-b
git branch -d codex-wt-isolation-a codex-wt-isolation-b
```
