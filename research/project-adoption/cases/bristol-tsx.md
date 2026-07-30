# Bristol TSX Project Adoption Case

## Status

- Application: [nicu-chiciuc/bristol_tsx](https://github.com/nicu-chiciuc/bristol_tsx)
- Production gate: [Bristol pull request 15](https://github.com/nicu-chiciuc/bristol_tsx/pull/15)
- State: implementation and preview validation complete, production cutover pending
- Reviewed head: `d2e193ab9597f92c1a64fd9459b355434dd2d3a7`
- Initial hosting case:
  [Netlify to Cloudflare Workers](../../2026-07-29-bristol-tsx-netlify-to-cloudflare-workers.md)

## Result

Bristol moved its branch implementation from Next.js and OpenNext to TanStack Start on Cloudflare
Workers. The result preserves private server rendering, Convex authentication, routes, browser
behavior, and the Netlify rollback target.

The production pull request is still draft. Its exact head passed the clean provider build,
application and contract tests, authenticated Worker acceptance, two linked-worktree cycles, and the
public preview route contract. Preview inspection now reports a complete source-to-Worker-to-Convex
join.

The production gate requires an explicit check for `AUTH_LOG_LEVEL=ERROR`. The cutover also needs
operator approval.

## What The First Process Missed

The manager first focused on framework, authentication, privacy, preview, and provider safety. It
did not compare the complete authored source model and toolchain before delegation.

As a result:

- the first test copied the repository's `.mjs` convention
- later workers treated handwritten JavaScript as an established project rule
- the TanStack migration kept direct Vite, ESLint, Prettier, and Vitest commands
- reviews proved that those commands worked, but did not ask whether they were the selected tools
- package-script review checked names and callers, but not the owner behind each command

The same narrow review touched Samebase Remotion lint and initially preserved direct ESLint. The
operator had to identify that the command conflicted with the accepted Vite+ and Oxlint contract.

This was a manager failure, not a need for more file scanners. The corrected process requires one
toolchain preflight before the first commit and one independent repeat after integration.

## Corrections

Bristol now uses:

- Node 24, ESM, and normal TypeScript for handwritten application and Node source
- separate strict type checks for browser and Node surfaces
- npm as its deliberate existing-project package manager
- Vite+ as the installed application tool owner
- Oxlint, Oxfmt, and the Vite+ test API
- the real Cloudflare build as part of normal validation

The broad source-extension guard and its tests were removed. TypeScript project inclusion, workflow
checks, and review now own the source rule.

One clean-worktree test found an important boundary in Vite+ `0.1.24`. `vp run` loads
`vite.config.ts` before it selects a task, so it cannot be the first process when the configuration
dependencies are not installed. Bristol keeps npm at that clean-root boundary, starts a Node
TypeScript bootstrap, and uses Vite+ after installation.

## Knowledge Requests That Mattered

| Question                                                     | Source                        | Result                                                                     |
| ------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------- |
| Must an anonymous worktree use an isolated backend?          | Samebase                      | Bristol uses an owned local backend and synthetic identity.                |
| Is there an official TanStack Start path for Cloudflare SSR? | Current primary documentation | The team used a bounded runtime spike before migration.                    |
| Can Vite+ start the first clean-root process?                | Bristol empty-worktree test   | The package manager starts the bootstrap, then Vite+ owns installed tools. |

## Bidirectional Results

| Destination  | Result                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bristol      | Data functions require authentication, sign-out clears private caches, and the TanStack Worker path has synthetic SSR and browser tests.                                                         |
| Bristol      | Public scripts describe operator actions. Unused aliases and spike scripts were removed after the runtime decision.                                                                              |
| Bristol      | One draft promotion pull request contains the reviewed stack, so the default branch gets one production cutover.                                                                                 |
| Samebase app | [samebase/app pull request 23](https://github.com/samebase/app/pull/23) added Node automation type checks to normal checks and the real Cloudflare build.                                        |
| Samebase     | [Samebase pull request 1317](https://github.com/samebase/samebase/pull/1317) made TypeScript source and the Vite+ and Oxlint toolchain explicit, and moved Remotion checks to the root contract. |
| Shared       | The manager preflight now covers package manager, source model, scripts, tool ownership, framework, providers, validation, and version pins.                                                     |

## Deliberate Reduction

This case does not keep:

- provider build journals and temporary resource identifiers
- historical checkpoint commands that the final Bristol branch replaced
- a general preview-cleanup design
- a source-extension or tool-name guard
- stack rules that now live in merged Samebase guidance

Preview cleanup was a special Samebase need because Samebase provisioning created many temporary
resources. It is not a general adoption requirement. A project needs cleanup only for resources that
its own workflow creates.

The initial hosting record owns the reusable Cloudflare cutover sequence. The production pull
request owns Bristol's current commands, exact provider evidence, and release gate.

## Next Experiment

Give the next project only the [portable rules](../portable-rules.md) and its own repository. Do not
expose private Samebase source at first.

Ask the worker to state each missing fact. Route each question to Samebase, public primary sources,
or the target project. The questions that still need private knowledge identify the next useful rule
or extraction.
