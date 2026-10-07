# Repository exports

Repository exports publish selected monorepo directories as complete external Git repositories. The
monorepo directory is the source of truth. The external repository is generated output.

## Source directory contract

The publisher is path-based. A source directory can be a package, an application, or another
committed directory.

The exported repository root is the exact Git tree at that source directory. Put only public files
that belong in the external repository in the source directory.

An export can use the root workspace or remain a standalone package manager boundary. The plugin
uses root tooling and includes a small dependency-free public check. Each starter template must work
as an independent repository, so `templates/base` and `templates/base-actions` own their
`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and public workflows. They are
intentionally outside the root workspace globs. The Sidebars example also owns these files because
its directory is both a root workspace member and a standalone export boundary.

The monorepo must run the checks that protect each export before publication. Run standalone export
checks in a fresh job so root dependencies cannot hide an undeclared dependency.

## Automatic workflow

The publisher runs only for a push to `main`, after the standard checks and unit tests succeed.
Supply-chain validation runs before those checks. The two starter templates, the Sidebars package,
and the Sidebars example also require their isolated checks. Playwright and Windows smoke tests
continue in parallel, but they do not block repository exports.

Before it publishes, the job reads every configured target repository with a metadata-only token. If
a target repository does not exist, or the publisher GitHub App cannot access it, the job fails with
the names of those repositories, and no export publishes.

For each configured export, it:

1. confirms that the successful source commit is still the current `main` commit
2. reads the committed Git tree at the configured source directory
3. fetches the current external target branch
4. stops without a new commit when both trees are equal
5. creates a commit whose tree is the source directory and whose parent is the external target head
6. pushes with an explicit lease for the target head

The tree operation preserves file bytes, executable modes, symbolic links, and deletions. Empty
directories are not Git objects and are not exported.

The external commit reuses the complete monorepo commit subject. A final source pull request
reference is qualified with the source repository, so it links to the correct pull request:

```text
v1753: Publish repository exports after CI (samebase/samebase#1293)
```

Its body records the source repository, source commit, and source directory.

The subject identifies the current `main` snapshot that publishes the files. If a newer `main`
commit replaces an older successful run, the older run stops. The newer snapshot then publishes with
its own subject, even when that commit did not change the source directory.

## Starter base export

`templates/base` is the maintained starter source. A template change has three outputs in one pull
request:

1. the standalone base tree and its lockfile under `templates/base`
2. the committed `starterSeedManifest.generated.ts` used by runtime app creation
3. the public `samebase/base` tree published after merge

Stage template changes before running `pnpm run template:export`, then stage the generated manifest.
The generator reads the staged Git blobs so the seed bytes match the future public export exactly.
It rejects unstaged source changes and new non-ignored files. Untracked ignored files, including
local environment files, dependencies, and build output, cannot enter the seed. The generated
version uses the content hash. Required root checks regenerate the manifest and reject a diff.

Runtime app creation imports the committed manifest. It does not fetch the public repository or read
the template directory. A public export failure therefore cannot stop Samebase from creating a new
app from the last accepted snapshot.

Root CI installs and audits each template through its nested lockfile, then builds it in a separate
fresh job.

### GitHub Actions variant

`templates/base-actions` is a second complete starter: `templates/base` plus an Alchemy setup stack
that GitHub Actions runs. The stack creates the Worker shell, the Workers Builds link, and the
Convex project and keys; Workers Builds deploys each commit as it deploys the base. It follows the
same contract as the base: it owns its `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`,
`pnpm run template:export` writes it to `starterSeedManifest.actions.generated.ts`, root CI audits
and builds it, and the publisher sends it to `samebase/base-actions`.

The variant's `alchemy` workflow uploads the artifact `samebase-setup-output` after each deploy and
after a confirmed destroy. `templates/base-actions/scripts/setup-output.ts` defines the file, and
Samebase reads it with one validator per version in
`apps/samebase/convex/repository/setupOutputModel.ts` before it attaches the listed Workers and
Convex projects. Both sides reject a version or a field that they do not define. A change to the
file is a new `version` in both places in the same pull request, and Samebase keeps reading every
older version, because apps keep the template copy that they were created from.

`pnpm run check:template-sync` keeps the two templates in sync. Every path must exist in both
templates with the same bytes and mode, except the deploy files that `templateDeployPaths` in
`scripts/check-template-sync.ts` lists with the reason each one differs. Apply a change to a shared
file in both templates in the same pull request. A dependency change usually changes both
`package.json` files and both lockfiles.

### Existing-app sweep

The
[starter changelog](../packages/plugin/plugins/samebase/skills/samebase/references/starter-changelog.md)
exists to drive updates to existing apps. After any change to that changelog, list every app
available through Samebase. Inspect each connected repository against the changed entries and the
older entries selected by the changelog's starter-build rules. Report each app as `update needed`,
`already current`, `not relevant`, or `unavailable`. Put app changes in separate repository pull
requests. The changelog work is not complete until the sweep is recorded.

## Sidebars package export

`packages/sidebars` publishes to the public `samebase/sidebars` repository on `main`. The package
owns a nested workspace and lockfile. The `sidebars package check` job starts from a fresh checkout,
does not install root workspace dependencies, and runs the package build, checks, and packed-package
consumer test before publication.

Package changes and version increases start in the monorepo. npm publication runs only from the
exported `samebase/sidebars` repository, so the verified external repository commit and npm tarball
have the same source tree.

The first public npm release was version `0.1.0-canary.0` under the `canary` tag. A maintainer
published its verified tarball manually because npm could not configure a trusted publisher before
the package existed.

The exported `publish.yml` workflow runs after the external repository CI accepts a `main` push. It
publishes through npm trusted publishing with no long-lived write token. It accepts only a stable
committed version, skips a version that already exists, and refuses to move `latest` to an older
version. It publishes a new version under `latest`. Release pull requests increase the committed
version in the monorepo before the exporter sends the verified tree to `samebase/sidebars`.

## Sidebars example export

`apps/sidebars-example` publishes to the public `samebase/sidebars-example` repository on `main`.
The exported repository is a normal standalone application. It owns its package manager version,
workspace policy, lockfile, license, and public CI workflow.

The public application installs `@samebase/sidebars` from npm. The root workspace overrides that
dependency with the local workspace package, so package changes still run against the example before
publication. A fresh isolated CI job installs only the exported tree and proves that the public
repository does not depend on monorepo files.

## Agent plugin versions

Every change under `packages/plugin` must increase its numeric `major.minor.patch` version. Pull
request CI compares the Codex plugin manifest with the pull request base commit. Main CI repeats the
check against the plugin state before the latest plugin-changing commit. A failed plugin change
stays failed across later unrelated commits, so the publisher cannot release it.

Update both plugin manifests manually. `scripts/check-samebase-agent-plugin.ts` requires their
versions to match. The Claude marketplace reads the version from the Claude plugin manifest.

Rebase a package-changing pull request onto current `main` before merging it. This catches another
package pull request that already used the same next version. Main CI remains the final fail-closed
gate and will not publish a duplicate or missing version increase.

## GitHub App

Use the dedicated Samebase Repository Publisher GitHub App. Its Samebase organization installation
selects all repositories, so newly created organization repositories are available to the publisher
automatically.

Grant these repository permissions:

- Contents: read and write
- Workflows: read and write

The Workflows permission is required when an exported directory contains `.github/workflows`.

Configure the private monorepo with:

- Actions variable `REPOSITORY_EXPORTS_APP_CLIENT_ID`
- Actions secret `REPOSITORY_EXPORTS_APP_PRIVATE_KEY`

The workflow creates two short-lived installation tokens: a metadata-only token that checks that the
targets exist, and a token with the permissions above that is scoped to the target repositories. It
does not store either token in Git config or pass it as a command argument.

## Add an export

Add one entry to `repositoryExports` in `scripts/publish-repository-exports.ts`. Each entry defines:

- the monorepo source directory
- the external repository name under the Samebase organization
- the target branch

Make the source directory satisfy the source directory contract above. Add its checks to the normal
monorepo validation path.

Verify that the publisher GitHub App can access the new target repository. The workflow derives its
target repository list from the same configuration, so the workflow file does not need a second
list.

Create the target repository and its target branch before the entry reaches `main`. A missing target
stops every export until it exists. Protect the branch from manual writes and allow the publisher
App to update it.

Before a private target becomes public, audit all branches, tags, commits, pull requests, comments,
and author metadata. Repository exports preserve existing target history. Enable GitHub private
vulnerability reporting and verify the exported security-reporting link before announcing the public
repository.
