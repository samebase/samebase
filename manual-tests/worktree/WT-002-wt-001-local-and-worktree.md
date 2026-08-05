# WT-002: WT-001 Runs From Main And Worktree

## Purpose

Ensure `WT-001` can be executed from both the main checkout and a worktree, verifying worktree
discovery and worktree seed setup behave consistently.

## Preconditions

- Main checkout is available.
- No existing `/tmp/samebase-wt-a` or `/tmp/samebase-wt-b` worktrees.
- No long-running `pnpm dev` processes in temporary worktrees.

## Steps

1. From the main checkout root, run `manual-tests/worktree/WT-001-anon-worktree-isolation.md` and
   complete its cleanup.
2. Create a runner worktree:

```bash
git worktree add /tmp/samebase-wt-runner -b codex-wt-meta-runner
```

3. From `/tmp/samebase-wt-runner`, re-run `manual-tests/worktree/WT-001-anon-worktree-isolation.md`
   exactly as written, then complete its cleanup.
4. Remove the runner worktree:

```bash
git worktree remove /tmp/samebase-wt-runner
git branch -d codex-wt-meta-runner
```

## Expected Results

1. `WT-001` passes when executed from the main checkout.
2. `WT-001` passes when executed from `/tmp/samebase-wt-runner`.
3. No cross-worktree conflicts or port collisions are observed.

## Optional Evidence

- A short note in `manual-tests/.runs/` capturing pass/fail for each run.

## Cleanup

- Remove any leftover `/tmp/samebase-wt-a` and `/tmp/samebase-wt-b` worktrees if they still exist.
