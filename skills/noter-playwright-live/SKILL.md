---
name: noter-playwright-live
description:
  Run Noter-stack apps locally and inspect real UI behavior with Playwright CLI. Use when asked to
  start the site, navigate pages, log in, click through flows, reproduce UI bugs, verify visual
  states, or capture screenshots/snapshots. Applies to this noter monorepo and repositories created
  from noter starter template (React + Vite + Convex).
---

# Noter Playwright Live

## Goal

Use a real browser session (not unit/E2E test runner) to validate behavior and visuals for
Noter-stack apps.

## Packaged Context Relationship

This skill remains the Noter-specific compatibility entrypoint for live browser sessions. For the
portable route-validation checklist, use
`packages/agent-context/skills/route-ui-validation/SKILL.md`. Pair it with
`packages/agent-context/overlays/noter-operator-workflows.md` for context-aware dev startup,
branch-scoped browser sessions, Linux visual baselines, and Noter response rules.

## Core Policy

- Start with the real route first when the bug touches scroll, touch, drag, focus, selection, layout
  ownership, auth wiring, or route shell behavior.
- Prefer the real worktree app flow (`pnpm dev:worktree`) and the shipped bootstrap/sign-in path
  over custom mock pages.
- Only use a fixture when it mounts the exact production component tree without invented wrapper
  chrome, spacing, headers, or placeholder structure.
- For a production interaction bug, add a failing real-route or honest production-component repro
  before adding narrower fixture coverage.
- When scripting touch gestures, anchor on visible rendered content inside the shipped surface
  instead of arbitrary coordinates inside a large auto-height container.

## Workflow

1. Confirm repo and branch context.

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

2. Detect project type.

- Noter monorepo: `apps/noter/package.json` exists.
- Noter starter/generated app: root `package.json` includes Vite + Convex scripts (`dev`,
  `dev:frontend`, `dev:backend`).

3. Start dev server in a long-running session.

- Noter monorepo (preferred): run `pnpm dev:worktree` from repo root.
- Starter/generated app: run `pnpm run dev` from project root.

If dependencies are missing, run `pnpm install` first.

4. Discover active frontend URL.

Probe common Vite ports (5173-5190) and select the first reachable page:

```bash
URL="$(
  for p in $(seq 5173 5190); do
    curl -fsS "http://127.0.0.1:$p" >/dev/null &&
      echo "http://127.0.0.1:$p" &&
      break
  done
)"
[ -n "$URL" ] || { echo "No frontend URL found" >&2; exit 1; }
printf '%s\n' "$URL"
```

5. Open a Playwright CLI session scoped to the current branch.

```bash
if [ -f ./scripts/playwright-branch-browser.ts ]; then
  SESSION="$(node ./scripts/playwright-branch-browser.ts session)"
  node ./scripts/playwright-branch-browser.ts open "$URL"
else
  SESSION="noter-$(basename "$PWD")-$(git rev-parse --abbrev-ref HEAD | tr '/' '-')"
  npx --yes @playwright/cli -s="$SESSION" open "$URL"
fi
```

6. Run the requested UI actions.

- Use `snapshot` to get stable element refs.
- Prefer `fill`, `click`, `type`, and `press` commands over `eval`.
- Re-snapshot after navigation or major DOM changes.
- If reproducing a route bug, keep the repro on the real route until the bug is understood before
  inventing any narrower fixture.

7. Capture evidence.

```bash
if [ -f ./scripts/playwright-branch-browser.ts ]; then
  node ./scripts/playwright-branch-browser.ts cli snapshot
  node ./scripts/playwright-branch-browser.ts cli screenshot --filename=/tmp/noter-<action>-<timestamp>.png
else
  npx --yes @playwright/cli -s="$SESSION" snapshot
  npx --yes @playwright/cli -s="$SESSION" screenshot --filename=/tmp/noter-<action>-<timestamp>.png
fi
```

8. Report outcomes with concrete UI evidence.

- Include URL reached, key state changes, and blockers.
- Include screenshot file paths.

## Noter Monorepo Defaults

Use these defaults when working in this repository.

1. Bootstrap with `pnpm dev:worktree` (sets Convex local env and seeds dev auth).
2. If sign-in is needed, use the seeded password account constants from
   `runtime/localWorktreePasswordAuth.ts`:
   - `LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL`
   - `LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD`
3. Typical smoke flow after sign-in:
   - Open dashboard
   - Fill `New app name`
   - Click `New app`
   - Wait for new vault card and infra status text
4. For UI regressions in shared shells or editors, prefer the shipped route over `/visual-fixture`
   unless the fixture is already an honest production component mount.

## Admin-Only Route Test Triage

When a formerly public route becomes admin-only, do not make it public just to keep tests green.
First check whether the failing Playwright specs are unauthenticated tests hitting app routes.

1. Use the existing test login helper before admin-only navigation:

```ts
import { signInIfNeeded } from "./liveHelpers";

await page.goto("/", { waitUntil: "domcontentloaded" });
await signInIfNeeded(page);
await page.goto("/admin-route", { waitUntil: "networkidle" });
```

2. Keep genuinely public routes unauthenticated. For logo coverage, `/logo` and root query variants
   such as `/logo?light` stay public; `/logo/**` lab routes require sign-in.
3. If a Docker or CI-like run cannot sign in, inspect the bootstrap path before rewriting tests:
   - `scripts/ci-bootstrap-convex.ts`
   - `runtime/localWorktreePasswordAuth.ts`
   - `apps/noter/convex/devAuth.ts`
4. In CI/bootstrap contexts, the Vite-only `Autofill & sign in` shortcut may be absent. Tests should
   fill the seeded email/password and click the exact `Sign in` button through `signInIfNeeded`.

## Test Runner Acceptance

- `pnpm test:visual:linux` with no Playwright flags is the canonical local acceptance command for
  the Playwright visual suite.
- Use focused commands such as `pnpm test:visual:linux -- e2e/foo.spec.ts` only as a triage loop. If
  a full local run failed, rerun the full wrapper after the fix.
- Do not treat PR Playwright rows marked `skipping`, Testbox shards, `--workers=1`, `--shard`, or
  `PLAYWRIGHT_LINUX_FULLY_PARALLEL=0` as equivalent to the default local wrapper.
- Use CI-shaped shards only to diagnose that exact CI surface, and report the command shape in the
  handoff.

## Playwright Session Rules

- In this repo, prefer `node ./scripts/playwright-branch-browser.ts` or `pnpm playwright:open` over
  raw `@playwright/cli open`.
- Use one deterministic session/profile per active branch.
- Reuse the same `-s` session for multi-step flows.
- If the branch session is already open, add a fresh tab instead of navigating a dirty editor tab.
  This avoids Chrome `Leave site?` popups caused by beforeunload handlers.
- Avoid sharing one session across unrelated projects.
- Use `close-all` only when explicitly cleaning up broad stale state.

## Safety Rules

- Never print or copy API keys/tokens from `.env*` files into user-facing output.
- Do not mutate unrelated repositories during UI checks.
- If app startup fails, include the exact failing command and first actionable error lines.

## References

Load these only when needed:

- `references/runbook.md` for project-type startup commands and flow patterns.
- `references/playwright-cli-quickref.md` for common browser commands.
