# Cross-Platform Script Orchestration Research

Date: 2026-04-01

## Why This Document Exists

Native Windows setup work surfaced a second layer of portability problems in the
repo: Git hooks and package scripts can still fail on Windows even when the app
itself starts correctly.

The immediate trigger was the `husky` pre-commit hook. Husky itself ran on
Windows, but one of the scripts it invoked failed because the script body used
POSIX-only inline environment-variable syntax.

This memo evaluates the realistic options for making local scripts, hooks, and
developer entrypoints work well on Windows without making the repo harder to
understand.

## Why This Lives In `research`

This is a current-state architecture memo, not an accepted implementation plan.
It compares alternatives and recommends a direction, but it is not yet the
repo's final scripting contract.

## Repo Findings At The Time

The findings below capture the repo state that triggered this memo on
2026-04-01. They are historical context, not the current hook/config contract.

The main issue is not Husky itself. The problem is the shell language used by
the commands Husky calls.

Current examples in the repo:

1. `.husky/pre-commit` is simple and portable:
   - `pnpm lint-staged`
   - `pnpm lint`
   - `pnpm test`
2. `apps/noter/package.json` still contains a Windows-hostile script:
   - `lint` uses `cd ../.. && NODE_OPTIONS=... eslint ...`
3. `apps/noter/package.json` has the same issue in `lint:ci`.
4. Root `package.json` still contains shell-sensitive scripts such as:
   - `ci:convex-bootstrap` with `CONVEX_AGENT_MODE=anonymous ...`
   - `test:ci` with `PLAYWRIGHT_VITE_PORT=43121 ...`
   - `daytona:refresh` with `node scripts/daytona-refresh.ts`
5. The repo already has examples of the pattern that worked well:
   - `scripts/bootstrap-worktree.ts`
   - `apps/noter/scripts/run-vite-dev.ts`
   - `apps/noter/scripts/convex-dev.ts`

The practical lesson from the Windows work is:

- `cmd.exe` can run many npm scripts just fine.
- Husky can trigger hooks on Windows just fine.
- Inline POSIX env assignment, Bash-only wrappers, shell parameter expansion,
  and cwd-sensitive shell choreography are the fragile parts.

## Design Goals

Any approach we adopt should optimize for these constraints:

1. Node is already guaranteed in this repo and works well on Windows.
2. The default contributor path should not require Bash, WSL, Bun, Deno, or
   another task runner binary just to run hooks and core scripts.
3. The source of truth should be easy to read in code review.
4. Scripts should work the same in hooks, CI, Codex, and normal terminals.
5. We should avoid hiding important logic inside long `package.json` strings.

## Evaluation Criteria

I used these questions to compare options:

1. Does it work on native Windows without depending on shell quirks?
2. Does it keep the repo conceptually simple for contributors?
3. Does it add a new required runtime or binary?
4. Is it good for orchestration only, or also for real scripting logic?
5. Does it fit the repo's existing Node-first direction?

## Options

### Option A: `cross-env` For Small Env Injection

What it is:

- Keep package scripts mostly as they are.
- Use `cross-env` where a script only needs portable env-variable injection.

What it solves well:

- `NODE_OPTIONS=... eslint ...`
- `PLAYWRIGHT_VITE_PORT=43121 pnpm --filter noter test:visual`
- `CONVEX_AGENT_MODE=anonymous ...`

What it does not solve:

- `cd ../..` choreography
- shell parameter expansion
- Bash-only scripts
- complex multi-step fallback logic
- Windows process-management edge cases

Fit for this repo:

- Good as a small utility.
- Not good as the main scripting architecture.

Assessment:

- `cross-env` is not a bad tool. It is stable and focused.
- It is best treated as a tactical helper, not the foundation.

### Option B: `npm-run-all` / `run-s` / `run-p` For Composition

What it is:

- Use `run-s` for sequential composition and `run-p` for parallel composition.
- Keep real logic in smaller child scripts.

What it solves well:

- clearer composition than giant script strings
- portable sequential and parallel orchestration
- easier decomposition of `lint`, `test`, and `dev` flows

What it does not solve:

- shell-specific child scripts still stay shell-specific
- env injection still needs another approach
- cwd handling and process spawning still need another approach

Repo fit:

- Already partially adopted in `apps/noter`.
- Good as orchestration glue.

Assessment:

- Good companion to a better underlying scripting model.
- Not enough by itself.

### Option C: Node Wrapper Scripts As The Source Of Truth

What it is:

- Move non-trivial logic into small JavaScript files under `scripts/` or the
  owning package.
- Use `pnpm --dir ...` or `child_process.spawn` instead of `cd ... && ...`.
- Let package scripts become short entrypoints that call those Node files.

What it solves well:

- cross-platform env setup
- cwd handling
- process spawning and fallback logic
- structured error messages
- real Windows-specific process handling when needed

What it does not solve:

- nothing by magic; it still requires writing good scripts
- some very tiny env-only cases may feel slightly heavier than necessary

Repo fit:

- Excellent.
- This matches the repo's existing working examples and the broader
  Node-first/Windows-first direction.

Assessment:

- Best default foundation.
- Most consistent with the repo's current guarantees.

### Option D: `zx`

What it is:

- Write scripts in JavaScript with a nicer shell-flavored API.

What it solves well:

- more ergonomic scripting than raw `child_process`
- better readability than long shell scripts for some workflows

What it does not solve cleanly:

- it still keeps the repo mentally in the "shell scripting" model
- its compatibility story still assumes Bash or PowerShell availability
- it adds another dependency even though Node already gives us enough power

Repo fit:

- Possible, but not ideal.

Assessment:

- Better than Bash if the team strongly prefers shell-like scripts.
- Worse than plain Node wrappers if the goal is maximum clarity and minimum
  dependency surface.

### Option E: Bun Shell

What it is:

- Use Bun's built-in shell features or `bun run`-style scripting for
  cross-platform scripts.

What it solves well:

- Bun's shell story is more capable than plain npm scripts.
- Bun Shell is explicitly positioned as cross-platform and can replace some
  helper packages.

What it costs:

- it introduces a second required JavaScript runtime
- it overlaps with Node's role instead of complementing it
- it makes repo setup and contributor expectations less clear
- Windows support would now depend on two runtimes, not one

Repo fit:

- Poor as a required foundation.
- Acceptable only as an optional experiment, not as the default path.

Assessment:

- Interesting technology.
- Not a good default for this repo because Node is already the guaranteed and
  trusted runtime.

### Option F: Taskfile / `task`

What it is:

- Introduce a dedicated cross-platform task runner binary and express workflows
  in `Taskfile.yml`.

What it solves well:

- portable task orchestration
- clearer task structure than many `package.json` scripts
- good operator ergonomics

What it costs:

- one more required binary to install
- one more DSL to learn
- logic still has to live somewhere, usually shell snippets or called scripts

Repo fit:

- Reasonable for operator-heavy workflows.
- Weak as the base requirement for every contributor.

Assessment:

- Viable if the repo wanted a dedicated task-runner culture.
- Not the simplest option when Node is already guaranteed.

### Option G: PowerShell-First Scripts

What it is:

- Move logic into `.ps1` scripts and standardize on PowerShell.

What it solves well:

- native Windows ergonomics
- better scripting than `cmd.exe`

What it does not solve:

- it weakens the macOS/Linux default path
- it makes Windows the scripting source of truth instead of Node
- PowerShell is not a better cross-platform baseline than Node in this repo

Assessment:

- Useful for local operator helpers.
- Not a good primary repo-wide contract.

## Recommendation

The best default architecture is:

1. Keep Husky.
2. Keep `npm-run-all` or `run-s` / `run-p` only for orchestration.
3. Use small Node scripts as the source of truth for any non-trivial workflow.
4. Allow `cross-env` only for truly tiny env-only cases where a Node wrapper
   would be noisier than the problem.

In other words:

- Node-first for logic
- `run-s` / `run-p` for composition
- `cross-env` as a small helper, not as the platform strategy

This keeps the model simple:

- contributors only need Node and PNPM
- scripts stay debuggable
- Windows support does not depend on extra runtimes
- the repo avoids growing a second scripting language or task DSL

## Recommended Repo Conventions

If this direction is adopted, these conventions would keep it clear:

1. `package.json` scripts should be short entrypoints, not long shell programs.
2. Prefer `pnpm --dir apps/noter ...` over `cd apps/noter && ...`.
3. Use Node wrappers for env setup, cwd changes, process spawning, retries, and
   fallback logic.
4. Reserve `cross-env` for single-command env injection only.
5. Avoid `cross-env-shell` unless the command truly needs shell interpretation.
6. Keep Bash-only scripts as optional operator tools, not the required default
   path for hooks or core contributor workflows.

## Suggested Migration Order

If we want the smallest high-leverage follow-up, this would be the order:

1. Fix `apps/noter/package.json` `lint` and `lint:ci`.
   - These currently break native Windows hooks.
2. Fix root `package.json` scripts that use inline env assignment.
   - `ci:convex-bootstrap`
   - `test:ci`
3. Review `bash`-only repo entrypoints and classify them.
   - keep as operator-only if appropriate
   - replace with Node if they are meant to be normal contributor workflows
4. Only add `cross-env` if the remaining tiny env-only scripts are still noisy.

## Example Shape

Instead of:

```json
"lint": "convex codegen && tsc --noEmit && cd ../.. && NODE_OPTIONS=--max-old-space-size=4096 eslint apps/noter --ext ts,tsx --report-unused-disable-directives --config .eslintrc.cjs"
```

Prefer:

```json
"lint": "run-s lint:convex lint:types lint:eslint",
"lint:convex": "pnpm --dir apps/noter exec convex codegen",
"lint:types": "pnpm --dir apps/noter exec tsc --noEmit",
"lint:eslint": "node scripts/run-noter-eslint.js"
```

That split is easier to read, easier to reuse in hooks and CI, and much easier
to make Windows-safe.

## Bottom Line

- `cross-env` is good, but too small to be the strategy.
- `npm-run-all` is good, but only for composition.
- Bun Shell is interesting, but not worth adding a second runtime.
- `task` is viable, but heavier than necessary.
- Plain Node wrappers are the clearest and safest source of truth for this repo.

## External References

- [cross-env README](https://github.com/kentcdodds/cross-env)
- [cross-env maintenance note](https://github.com/kentcdodds/cross-env/issues/257)
- [npm-run-all README](https://github.com/mysticatea/npm-run-all)
- [Bun Shell docs](https://bun.sh/docs/runtime/shell)
- [zx README](https://github.com/google/zx)
- [Task docs](https://taskfile.dev/)
