# WT-001: Anonymous Worktree Isolation Smoke

## Purpose

Verify two worktrees can run anonymous local Convex independently, with separate
backend URLs/ports and isolated seed data.

## Preconditions

- Run from the main checkout root.
- `pnpm` dependencies can install.
- No long-running `make anon` processes in the two temporary test worktrees.

## Steps

1. Create two test worktrees on new temporary branches:

```bash
git worktree add /tmp/noter-wt-a -b codex/wt-isolation-a
git worktree add /tmp/noter-wt-b -b codex/wt-isolation-b
```

2. In each worktree, bootstrap anonymous mode:

```bash
make -C /tmp/noter-wt-a anon-once
make -C /tmp/noter-wt-b anon-once
```

3. Compare backend URLs written by each worktree:

```bash
grep -E '^(CONVEX_DEPLOYMENT|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' /tmp/noter-wt-a/apps/noter/.env.local
grep -E '^(CONVEX_DEPLOYMENT|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' /tmp/noter-wt-b/apps/noter/.env.local
```

4. Confirm each worktree captured allowlisted env vars in `.env.anon-seed.local`
   and applied seed API keys to provider connections (auth method is `api_key`).
   Cloudflare should appear when `DEV_SEED_CLOUDFLARE_API_KEY` is set on the
   cloud dev deployment. The AI key should appear when `ANTHROPIC_API_KEY` is
   set on the cloud dev deployment:

```bash
grep -E '^(DEV_SEED_[^=]+|ANTHROPIC_API_KEY)=' /tmp/noter-wt-a/apps/noter/.env.anon-seed.local | cut -d= -f1
grep -E '^(DEV_SEED_[^=]+|ANTHROPIC_API_KEY)=' /tmp/noter-wt-b/apps/noter/.env.anon-seed.local | cut -d= -f1

(cd /tmp/noter-wt-a/apps/noter && \
  CONVEX_AGENT_MODE=anonymous node convex-dev.js --tail-logs=disable --typecheck=disable --codegen=disable & \
  pid=$!; sleep 5; \
  npx convex data providerConnections --limit 50 --format json | node -e 'const rows=JSON.parse(require(\"fs\").readFileSync(0,\"utf8\")); console.log(rows.map(row => ({ kind: row.kind, method: row.auth?.method, accountId: row.accountId })));'; \
  kill $pid; wait $pid 2>/dev/null || true)

(cd /tmp/noter-wt-b/apps/noter && \
  CONVEX_AGENT_MODE=anonymous node convex-dev.js --tail-logs=disable --typecheck=disable --codegen=disable & \
  pid=$!; sleep 5; \
  npx convex data providerConnections --limit 50 --format json | node -e 'const rows=JSON.parse(require(\"fs\").readFileSync(0,\"utf8\")); console.log(rows.map(row => ({ kind: row.kind, method: row.auth?.method, accountId: row.accountId })));'; \
  kill $pid; wait $pid 2>/dev/null || true)
```

5. In the `make ... anon-once` outputs from step 2, confirm each worktree
   prints:

```txt
"created": true
```

## Expected Results

1. Both `make ... anon-once` commands complete successfully.
2. `VITE_CONVEX_URL` values differ between `/tmp/noter-wt-a` and
   `/tmp/noter-wt-b`.
3. Each worktree can run seed/auth setup without cross-worktree admin/auth
   conflicts.
4. Each `.env.anon-seed.local` includes `DEV_SEED_*` entries from the dev seed
   env (API keys present), plus `ANTHROPIC_API_KEY` when it is set on the cloud
   dev deployment.
5. Each worktree's `providerConnections` includes the seeded providers
   (GitHub/Convex/Netlify, plus Cloudflare if `DEV_SEED_CLOUDFLARE_API_KEY` is
   set) with `auth.method: "api_key"`.
6. On first clean run, both step 2 outputs report `"created": true` (if shared
   DB, second worktree would typically report `"created": false`).

## Optional Evidence

- Save command transcript to local file (not committed):

```bash
mkdir -p manual-tests/.runs
# Use tee while running step 2:
# make -C /tmp/noter-wt-a anon-once | tee manual-tests/.runs/wt-001-a.log
# make -C /tmp/noter-wt-b anon-once | tee manual-tests/.runs/wt-001-b.log
```

- Avoid saving `npx convex data ...` outputs to disk unless you redact API keys.

## Cleanup

```bash
git worktree remove --force /tmp/noter-wt-a
git worktree remove --force /tmp/noter-wt-b
git branch -D codex/wt-isolation-a codex/wt-isolation-b
```
