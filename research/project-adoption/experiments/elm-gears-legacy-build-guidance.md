# Elm Gears Legacy-Build Guidance Canary

Date: 2026-08-16

## Outcome

Neither instruction bundle passed. The candidate plugin must not be released from this result.

The installed plugin kept the real Elm build, but its provider plan did not match the current
Samebase command contract and selected an old build token. The candidate plugin chose a no-op build
even though the real compiler still worked. It also caused an unauthorized standalone Cloudflare
deployment while it tried to validate a deploy package script.

The useful result is narrow: preserve a required legacy compiler when a small installer repair makes
it reproducible, and call the provider CLI directly for safe validation.

## Test Shape

Three fresh agents used separate temporary clones and did not receive prior migration findings:

1. The control used installed Samebase plugin `0.2.20`.
2. The treatment used only the candidate `0.2.21` public skill and its routed references.
3. The ground-truth agent did not use Samebase guidance.

The target was `nicu-chiciuc/elm-gears-challenge` at commit
`360b6af53731226d8f762ac1dcd4f59c817d4df7`. The control and treatment were told to stop after a
read-only preflight. The ground-truth agent supplied evidence only after both subjects had worked.

## Ground Truth

The repository has four tracked files. Its application source is `Main.elm`, and its package file
requires Elm 0.18. It has no checked-in HTML, package manifest, lock file, CI, host, or provider
configuration.

The normal `elm@0.18.0` npm installer fails because its retired Bintray URL returns 404. The
`elm@0.18.0-exp5` package downloads the same Elm release from GitHub. With `graceful-fs` 4.2.11
pinned, it installs in Linux with the current Workers Builds runtime and tool versions and compiles
the application.

The local Linux proof used Node 24.18.0, npm 10.9.2, and pnpm 10.11.1. These are the current
documented Workers Builds defaults. It passed:

1. native `npm ci` with lifecycle scripts enabled
2. the exact `pnpm run build` command
3. direct Wrangler production deploy dry run
4. direct Wrangler preview upload dry run
5. a check that installation and build created no unexpected repository file

This was not a Cloudflare branch build. The first real Workers Build remains an acceptance gate
after the source pull request.

Elm compiled 53 modules into only `dist/index.html`. Its SHA-256 hash was
`0daa35741c29aaceff1500917982d8fd4722032c581551e6fb273cc4b2244acd`. A browser rendered six circles
without an error. Dragging one circle changed its position, path, and displayed state.

The smallest validated source contract changes four files:

1. add `package.json` with the real Elm build and direct production and preview deploy scripts
2. add the npm lock file
3. add static-assets Wrangler configuration for `dist`
4. ignore dependencies, build output, and Wrangler state

It does not change Elm source, add a helper program, commit generated HTML, add a development
command, or modernize the application.

## Control Result

The `0.2.20` control found the working `elm@0.18.0-exp5` repair and proposed four changed files.
This was closer to the source ground truth than the candidate.

It still failed the Samebase provider contract:

- it proposed `npm run build` and `npx wrangler` trigger commands instead of the current Samebase
  `pnpm run` command layer
- it did not prove the build on the current Node 24.18.0 Workers Builds image
- it selected the old named build token after the operator had already rejected that token in an
  earlier migration

The control did not make a provider write.

## Candidate Result

The `0.2.21` treatment proved that Elm could compile and that the browser interaction worked. It
then rejected the real build because the normal npm installer was broken, even though a small
installer repair was available. It proposed a no-op build, committed generated output, a new output
directory, Node and pnpm markers, and package-manager policy. This was larger and less maintainable
than the validated real-build contract.

The treatment tried to validate its deploy script with:

```sh
pnpm run deploy -- --dry-run
```

Pnpm kept the standalone separator. Wrangler did not parse the later flag as its dry-run option and
created a standalone active Worker deployment. The manager stopped the agent. No GitHub or Samebase
write occurred, and no cleanup was attempted without operator approval.

The candidate reference already warned about package deploy scripts and final provider arguments.
The warning was too indirect and too deep in a long list to control the action. This is a failed
instruction result, not proof that the warning was sufficient.

## Instruction Decision

Keep these rules in the public plugin:

1. A no-op build is valid only when complete browser assets are checked in.
2. If generated output is absent, keep the existing compiler or bundler.
3. A broken old installer requires a small pinned-repair test before a no-op or committed artifact.
4. Samebase uses three exact package command names, but the `pnpm run` layer does not select the
   dependency installer.
5. A deploy package script is a provider write.
6. Safe validation calls the provider CLI directly. It does not forward flags through a package
   runner.

Remove the long pitfall list. It repeated these ideas but did not make the safety boundary more
effective.

## Reduced Candidate Retest

A fourth fresh agent used the reduced candidate and received no ground-truth findings. It made no
provider call. Its provider plan used all three Samebase command names, required operator token
selection when more than one token exists, and stopped when the intended Worker name already
existed. These results improved on both first plans.

Its source plan still failed the smallest-diff gate. The agent tested `elm@0.18.0-exp5` on Node 25,
saw the `primordials` error, and did not test a transitive dependency override. It proposed a
committed generated page, a `public` directory, Node and pnpm markers, and a no-op validation build.
The independent Linux proof showed that the real build works with one dependency override.

This is a partial pass. Keep the shorter reusable rules, but do not add the Elm repair to the public
plugin. A manager must compare an uncertain legacy build plan with independent technical evidence
before source or provider writes.

## Next Step

Delete the accidental standalone Worker after operator approval. Merge and install the reduced
candidate, then start a new task for the real migration. Give the implementation task the reviewed
four-file contract and require a real Workers Build before it reports deployment success.

## Summary

More detailed instructions did not improve this migration. Two short rules are the useful output:
preserve a reproducible real build, and never convert a deploy package script into a dry run with
forwarded flags. Independent manager evidence remains necessary when a legacy tool failure is not
explained.
