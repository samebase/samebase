# WT-001: Anonymous Worktree Isolation Smoke

## Purpose

Verify that two linked worktrees use separate anonymous local Convex backends. Each backend must
seed a valid GitHub-backed organization from the same development GitHub App installation, and
register its own clients with the identity hub.

## Preconditions

- Run from a Samebase checkout root.
- The Convex CLI is logged in (`npx convex login`) as a member of the team `nicu`.
- The development deployment of the project `samebase-com` has the GitHub App settings, GitHub owner
  seed facts, and GitHub installation seed fact.
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

4. Print the identity hub client ids of each backend. Do not print the secrets:

```bash
(cd /tmp/samebase-wt-a/apps/samebase && npx convex env get HUB_CLIENT_ID && npx convex env get RESOURCE_HUB_CLIENT_ID)
(cd /tmp/samebase-wt-b/apps/samebase && npx convex env get HUB_CLIENT_ID && npx convex env get RESOURCE_HUB_CLIENT_ID)
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
- Providers offers Connect for Convex and Cloudflare.
- New App shows the repository name input.
- Connect repository lists repositories from the seeded GitHub App installation.

9. Sign out, and sign in with Continue with GitHub. Confirm that the identity hub returns to the
   worktree signed in.

## Expected Results

1. Both `pnpm dev --once` commands complete successfully.
2. The two `VITE_CONVEX_URL` values are different.
3. The two worktrees print four different client ids.
4. Each first setup output reports `"created": true`.
5. Each worktree has one organization, one `owner` membership, and one Free billing account. No
   `organizationProviderCredentials` document holds a Convex or Cloudflare credential.
6. Local document IDs are different between worktrees. The GitHub owner and installation facts are
   the same.
7. GitHub sign-in returns to the worktree that started it.
8. The normal development pages load without a cross-worktree data or authentication conflict.

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
