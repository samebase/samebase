# TypeScript Script Runner Package Research

Date: 2026-05-23

Question: if we want Bun-style command ergonomics in TypeScript scripts, should Noter use `execa`,
`zx`, or `dax`?

## Conclusion

Use `execa` selectively for repo scripts that already model commands as an argv array plus `cwd`,
`env`, and `stdio`.

Keep native `node:child_process` for scripts that need detached process groups, direct stream
parsing, child PIDs, or detailed shutdown control. `scripts/worktree-share.ts` is the current
example of a script that should stay mostly native because it owns dev-server and `cloudflared`
lifecycles.

## Implementation Spikes

Three isolated worktree spikes tested the packages against the new dev-runner surface in this PR.

| Package | Tested version                                  | Fit in Noter scripts                                                                                                         | Result                                                                          |
| ------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `execa` | `9.6.1`                                         | Best fit for `{ command, args, cwd, env, stdio }` command specs. Supports sync and async subprocesses without shell parsing. | Recommended for simple command runners and sync probes.                         |
| `zx`    | `8.8.5`                                         | Good `$` syntax for operator-style scripts. The shell-oriented model is less ideal for exact process supervision.            | Useful for standalone script authoring, not for broad migration of dev runners. |
| `dax`   | `0.46.1` in the spike; latest observed `0.47.0` | Pleasant short-command API, but async-first and less aligned with Node `ChildProcess` semantics.                             | Do not adopt broadly for this repo.                                             |

## Package Health Snapshot

Source snapshot: npm registry, npm download API, GitHub repository metadata, and GitHub GraphQL
activity as of 2026-05-23.

| Package                                                                                                        | npm / release signal                                                                                             | GitHub signal                                                                                    | Maintenance read                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [`execa`](https://www.npmjs.com/package/execa) / [`sindresorhus/execa`](https://github.com/sindresorhus/execa) | Latest `9.6.1`, published 2025-11-29. Around 138M weekly npm downloads observed.                                 | Around 7.5k stars, 252 forks, 64 contributors. npm maintainers: `sindresorhus`, `ehmicky`.       | Mature, very widely adopted, and stable. Lower recent churn looks like maturity rather than neglect. |
| [`zx`](https://www.npmjs.com/package/zx) / [`google/zx`](https://github.com/google/zx)                         | Latest `8.8.5`, published 2025-10-19. Around 1.8M weekly npm downloads observed.                                 | Around 45.5k stars, 1.3k forks, 73 contributors. Active PR flow in the last 90 days.             | Strongest active scripting-tool maintenance profile, with low runtime dependency surface.            |
| [`dax`](https://www.npmjs.com/package/dax) / [`dsherret/dax`](https://github.com/dsherret/dax)                 | Latest `0.47.0`, published 2026-05-16. `dax-sh` is older package naming and should not be used for new installs. | Around 1.5k stars, 38 forks, 25 contributors. Recent activity is concentrated in one maintainer. | Healthy and active, but bus-factor risk is higher than `execa` or `zx`.                              |

## Repo Guidance

- Prefer `execa(command, args, options)` over `execa`'s `$` tag when a script already has argv
  arrays.
- Use `execaSync()` for small synchronous probes only.
- Pass `reject: false` when preserving existing explicit exit-code handling.
- Set `extendEnv: false` when passing a complete env object that should replace `process.env`.
- Do not migrate stream-parsing, detached-process, or signal-heavy code unless the target API
  clearly preserves that behavior.

## Sources

- [`execa` npm package](https://www.npmjs.com/package/execa)
- [`execa` GitHub repository](https://github.com/sindresorhus/execa)
- [`zx` npm package](https://www.npmjs.com/package/zx)
- [`zx` documentation](https://google.github.io/zx/)
- [`zx` GitHub repository](https://github.com/google/zx)
- [`dax` npm package](https://www.npmjs.com/package/dax)
- [`dax` documentation](https://dax.land/)
- [`dax` GitHub repository](https://github.com/dsherret/dax)
