# CI task standard

Samebase uses pnpm for dependencies, Vite Task for workspace tasks, and GitHub Actions for runners
and merge checks. Task dependencies belong in `vite.config.ts` and package manifests.

## Task order

`pnpm check:ci` starts the `ci:workspace` task. The app check, layout typecheck, Remotion checks,
and example check can run together. Vite Task uses its default limit of four concurrent tasks.

Package checks run after these tasks. The plugin check reads files that the app's action-docs
verification can generate. Independent package checks then run through workspace filters.
`--fail-if-no-match` rejects a stale package name. Root script and template-export checks run last.

Package scripts remain the entry points for `pnpm check:workspace:ci`, `pnpm check:remotion-studio`,
and `pnpm typecheck:remotion-studio`.

## Cache scope

Package scripts are uncached by default. The layout typecheck has an existing cached task. Remotion
typechecking and linting also use task caching. Audits, Convex bootstrap, deployments,
generated-file verification, and the root test suite run on each configured invocation.

The native `tsgo` command needs explicit source and configuration inputs. Its automatic tracking did
not invalidate a cached success when a new source file contained a type error. The Remotion task
includes shared package sources, script sources, TypeScript configuration, and dependency manifests.
It restores no output files because this check uses `noEmit`.

Before a task can use cached results, verify an unchanged repeat and deliberate failures caused by a
new source file, an existing source file, and a shared input. Verify output restoration for tasks
that produce files. Keep external state out of cached tasks.

The workflow does not yet restore task results across GitHub Actions runs. Vite+ documents that
feature as experimental. Add it when measured task savings exceed cache-transfer time.

## Workflow behavior

A newer PR run cancels an older CI run for the same PR. Push runs have unique concurrency groups.
The required `ci (24.x)` check keeps its existing job dependencies and result validation. Dependency
audits retain their current scope. Playwright keeps its current push-only condition.

## Test retirement

Use `.agents/skills/samebase-test-policy/SKILL.md`. For each proposed removal, name the current
contract, retained owner, observed runtime, and failure-history limits. Introduce a deliberate
defect to prove the retained owner before removing duplicate coverage. Measure the focused result. A
passing history alone is insufficient evidence to remove a test.

## References

- [Vite Task execution and dependencies](https://viteplus.dev/guide/run)
- [Explicit cache inputs and outputs](https://viteplus.dev/config/run)
- [Experimental GitHub Actions cache reuse](https://viteplus.dev/guide/github-actions-cache)
- [Samebase adoption evidence and test candidates](../research/2026-10-31-ci-vite-task.md)
