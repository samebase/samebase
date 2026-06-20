# Convex Production Reads

Safe recipe for reading production Convex state (`logs`, `run`, `data`, `env`) from a machine that
also has worktrees and deploy keys configured. Moved from `AGENTS.md` so the always-loaded file
stays within agent context budgets; `AGENTS.md` keeps the fail-closed core rule and points here.

## The deploy-key trap

When checking production from a worktree, do not pass `--env-file` pointing at the primary checkout.
If that file provides `CONVEX_DEPLOY_KEY`, the Convex CLI will ignore `--prod` and use the deploy
key's deployment instead. If the CLI prints
`Ignoring --prod ... and using deployment from CONVEX_DEPLOY_KEY`, stop and rerun with
`CONVEX_DEPLOY_KEY=` cleared from the primary checkout.

## The recipe

Run prod commands from the primary local checkout's `apps/samebase` directory, derive a comment-free
`CONVEX_DEPLOYMENT` value from that checkout's `.env.local`, and clear the deploy-key env in the
same command:

```bash
primary_checkout="$(
  git worktree list --porcelain |
    awk '$1 == "worktree" { worktree=$2 } $1 == "branch" && $2 == "refs/heads/main" { print worktree; exit }'
)"
cd "$primary_checkout/apps/samebase"
CONVEX_DEPLOYMENT="$(
  node <<'NODE'
const fs = require("fs");
const line = fs.readFileSync(".env.local", "utf8").split(/\n/).find((entry) => entry.trimStart().startsWith("CONVEX_DEPLOYMENT="));
if (!line) process.exit(2);
const raw = line.split("=").slice(1).join("=");
console.log(raw.replace(/\s+#.*$/, "").trim().replace(/^['"]|['"]$/g, ""));
NODE
)" CONVEX_DEPLOY_KEY= npx convex logs --prod --history 50
```

Use that same `CONVEX_DEPLOYMENT=... CONVEX_DEPLOY_KEY= npx convex ... --prod` prefix for
`convex run`, `convex data`, and `convex env` production reads. Do not manually copy the raw
`.env.local` line when it contains an inline `# team/project` comment; strip the comment first or
the CLI can target the wrong deployment name before the query even runs.
