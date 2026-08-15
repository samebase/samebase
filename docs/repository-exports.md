# Repository exports

Repository exports publish selected monorepo directories as complete external Git repositories. The
monorepo directory is the source of truth. The external repository is generated output.

## Source directory contract

The publisher is path-based. A source directory can be a package, an application, or another
committed directory.

The exported repository root is the exact Git tree at that source directory. Put only public files
that belong in the external repository in the source directory.

An export can use the root workspace or remain a standalone package manager boundary. The plugin
uses root tooling and includes a small dependency-free public check. The app template must work as
an independent repository, so `templates/app` owns its own `package.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, and public workflow. It is intentionally outside the root workspace globs.

The monorepo must run the checks that protect each export before publication. Run standalone export
checks in a fresh job so root dependencies cannot hide an undeclared dependency.

## Automatic workflow

The publisher runs only for a push to `main`, after the standard checks and unit tests succeed.
Supply-chain validation runs before those checks. The app export also requires its isolated
supply-chain and build checks. Playwright and Windows smoke tests continue in parallel, but they do
not block repository exports because exported packages do not depend on Samebase browser behavior.

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

## Starter app export

`templates/app` is the maintained starter source. A template change has three outputs in one pull
request:

1. the standalone app tree and its lockfile under `templates/app`
2. the committed `starterSeedManifest.generated.ts` used by runtime app creation
3. the public `samebase/app` tree published after merge

Stage template changes before running `pnpm run template:export`, then stage the generated manifest.
The generator reads the staged Git blobs so the seed bytes match the future public export exactly.
It rejects unstaged source changes and new non-ignored files. Untracked ignored files, including
local environment files, dependencies, and build output, cannot enter the seed. The generated
version uses the content hash. Required root checks regenerate the manifest and reject a diff.

Runtime app creation imports the committed manifest. It does not fetch the public repository or read
the template directory. A public export failure therefore cannot stop Samebase from creating a new
app from the last accepted snapshot.

Root CI installs and audits the template through its nested lockfile, then builds it in a separate
fresh job. A daily workflow audits both the monorepo and template lockfiles so a new advisory can
fail even when no source commit changed.

## Agent plugin versions

Every change under `packages/plugin` must increase its numeric `major.minor.patch` version. Pull
request CI compares the package with the pull request base commit. Main CI repeats the check against
the package state before the latest package-changing commit. A failed package change stays failed
across later unrelated commits, so the publisher cannot release it.

Update the version manually. `packages/plugin/scripts/check.ts` requires the package, Codex
manifest, and Claude manifest versions to match. The Claude marketplace reads the version from the
Claude plugin manifest, which prevents two version fields from drifting.

Rebase a package-changing pull request onto current `main` before merging it. This catches another
package pull request that already used the same next version. Main CI remains the final fail-closed
gate and will not publish a duplicate or missing version increase.

## GitHub App

Use a dedicated GitHub App installed only on the target repositories.

Grant these repository permissions:

- Contents: read and write
- Workflows: read and write

The Workflows permission is required when an exported directory contains `.github/workflows`.

Configure the private monorepo with:

- Actions variable `REPOSITORY_EXPORTS_APP_CLIENT_ID`
- Actions secret `REPOSITORY_EXPORTS_APP_PRIVATE_KEY`

The workflow creates a short-lived installation token. It does not store that token in Git config or
pass it as a command argument.

## Add an export

Add one entry to `repositoryExports` in `scripts/publish-repository-exports.ts`. Each entry defines:

- the monorepo source directory
- the external repository name under the Samebase organization
- the target branch

Make the source directory satisfy the source directory contract above. Add its checks to the normal
monorepo validation path.

Install the publisher GitHub App on the new target repository. The workflow derives its target
repository list from the same configuration, so the workflow file does not need a second list.

The target branch must exist before the first publish. Protect it from manual writes and allow the
publisher App to update it.

Before a private target becomes public, audit all branches, tags, commits, pull requests, comments,
and author metadata. Repository exports preserve existing target history. Enable GitHub private
vulnerability reporting and verify the exported security-reporting link before announcing the public
repository.
