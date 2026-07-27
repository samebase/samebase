# Repository exports

Repository exports publish selected monorepo directories as complete external Git repositories. The
monorepo directory is the source of truth. The external repository is generated output.

## Source directory contract

The publisher is path-based. A source directory can be a package, an application, or another
committed directory.

The exported repository root is the exact Git tree at that source directory. Put only public files
that belong in the external repository in the source directory.

The monorepo owns formatting, lint, type, and other development checks. An exported repository does
not need a second package manager workspace or a second tool configuration. It can include a small
dependency-free check when that check is useful to external users. For example, `agent-plugins`
checks its plugin contract with Node.js in both the monorepo and the external repository.

## Automatic workflow

The publisher runs only for a push to `main`, after the aggregate CI job succeeds.

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
and author metadata. Repository exports preserve existing target history.
