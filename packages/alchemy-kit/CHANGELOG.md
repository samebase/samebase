# Changelog

## 0.8.0

- The pull request comment moved here from `@samebase/alchemy-convex`: the entry
  `@samebase/alchemy-kit/stack-comment` and the command `alchemy-kit stack-comment`. The command
  reads the state store that the repository's `alchemy.run.ts` configures, opened for the stage
  `pr-<number>`, so a stack in any store gets the comment.

## 0.7.0

- Each box of `stageDiagram` has `bindings`: the resource bindings of its Workers, each with its
  `env` name, the kind as the Cloudflare dashboard names it (such as `Durable Object` or
  `D1 database`), a Lucide icon, the target that its own fields name (such as the class
  `PageStore`), and the other box that it names, if one does. Every binding type that Alchemy writes
  is read, not only R2. A binding that holds a value (plain text, secret, JSON, secret key) is left
  out. A binding to a box that `downstream` does not connect gets a line too.
- A binding names a row only of its target type, by the identifiers of that type: an R2 bucket by
  its name and jurisdiction, a D1 database by its id, a Worker by its name, and so on. A binding
  name that only looks like the logical id of a row no longer names it. A line carries only the
  binding names of the box that uses the other, and two Workers that bind each other get a line each
  way.

## 0.6.0

- The run record is version 2: `repositoryId` and `repositoryOwnerId`, the GitHub ids as digits, and
  `repositoryName` in place of `repository`. A rename of the repository keeps the ids. On GitHub
  Actions they come from `GITHUB_REPOSITORY_ID` and `GITHUB_REPOSITORY_OWNER_ID`. A checkout gets
  them, and the current name, from one request to the GitHub API, with `GITHUB_TOKEN`, `GH_TOKEN`,
  the `gh` login, or no token. Only github.com is supported. A run that cannot get the ids writes no
  record. Samebase must accept version 2 before an app deploys with this release.
- A deploy can now stop. `withRunRecord` stops a run at the first `list` of a stack that has no
  stage when the `prod` output of another stack has a version 2 record with the same `repositoryId`
  and `stackFile`: the repository was renamed, and the run would make a second, empty app. The error
  names the other stack. Write that name as the stack name in the stack file. `renamedStack` is the
  check without a store.

## 0.5.0

- New entry `@samebase/alchemy-kit/stack`: `stageDiagram(rows)` reads the state rows of a stage and
  gives its main resources as boxes, the other rows folded into them, and the lines between the
  boxes with their binding names. `stageTree(diagram)` gives the boxes as a tree, each under the box
  that uses it. Samebase draws its stack diagram, its resource list and its pull request comment
  from them. It keeps no secret of a row.

## 0.4.0

- New entry `@samebase/alchemy-kit/ui`: `resourceTypeUI(type)` gives a name, a Lucide icon, a colour
  and a category for each Alchemy resource type, from alchemy-run/alchemy pull request #1441. It
  imports no Alchemy, Effect or React.

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
