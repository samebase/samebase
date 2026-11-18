# Changelog

## 0.3.0

- Breaking: needs `alchemy@2.0.0-beta.87` (was `2.0.0-beta.85`) and `effect` 4.1.4 or later.
- The layer of `GitHubState.state()` needs `SecureRandom` as well as `HttpClient`. An Alchemy stack
  provides both, so a stack does not change. Alchemy's `BucketState` makes its lease tokens with
  `SecureRandom` since beta.86.

## 0.2.2

- A preview that reads a resource of `prod` no longer fails with
  `another deploy holds the GitHub state lock` when a deploy of `prod` runs at the same time. Two
  previews that read `prod` also run at the same time now. `get` and `getOutput` take no lock on a
  stage that the run has not locked: they read the one file from the state branch. Everything else
  locks its stage as before, so a deploy holds the lock of its stage from its first `list`. A run
  gives the first answer of each such read again. A run that later locks a stage it read from stops
  with an error if another deploy changed those records in between.

## 0.2.1

- The GitHub state store lists a stack whose name has a `/`, such as `owner/name`, with its whole
  name, and lists only the stages of that stack. Before, the list of stacks gave `owner`, so the
  `alchemy state` commands and a tool that lists the stacks found no stack with such a name.

## 0.2.0

- New entry `@samebase/alchemy-kit/run-record`: `withRunRecord` adds the record of the run to each
  stage output, over any state layer. It moved from `@samebase/alchemy-convex`, which now takes it
  from this package.

## 0.1.2

- No code change. A new README: a diagram of the store, a quick start, the options, the laptop
  setup, and the shape of a state file.

## 0.1.1

- No code change. The first release that the release workflow publishes, through npm trusted
  publishing.

## 0.1.0

- First release: `@samebase/alchemy-kit/github-state`, an Alchemy state store on a branch of a
  GitHub repository, with each secret sealed with AES-256-GCM under the key in
  `ALCHEMY_GITHUB_STATE_KEY`.
