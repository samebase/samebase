# Repository exports

Repository exports publish selected monorepo directories as complete external Git repositories. The
monorepo directory is the source of truth. The external repository is generated output.

## Exportable package contract

Each configured source directory must work in two contexts:

- as a package in this pnpm workspace
- as the root of its exported repository

The source directory owns its complete standalone setup. This includes its `package.json`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, TypeScript and Vite Plus configuration, domain checks, and
external CI workflow. The package-local workspace file makes the source directory the tool root, so
Vite Plus does not select the outer monorepo configuration. These files must not read configuration
from a parent monorepo path. The package's `check` script is the one check command in both contexts.

The root `package.json` is the source of truth for:

- the pnpm version in `packageManager`
- versions of installed dependencies that are also declared by an exportable package

Peer dependency ranges and dependencies that exist only in an exportable package remain
package-owned. An exportable package cannot depend on a root `workspace:`, `file:`, or `link:`
version because that version cannot install after export.

Each exportable package has a nested lockfile because the monorepo lockfile does not become the root
lockfile of the exported repository. The nested lockfile is generated output. Do not edit it by
hand.

Run `pnpm sync:repository-exports` after an intentional package manifest change when you want an
immediate update. Normal `pnpm check` also runs the synchronization automatically. It:

1. copies shared versions from the root manifest
2. regenerates each nested lockfile outside workspace resolution
3. performs a standalone frozen install without lifecycle scripts
4. runs the package's own `check`
5. fails when it had to update a manifest or lockfile, so the generated files cannot be omitted from
   a commit

This means a normal root dependency upgrade and the required root check update the exportable
package and its lockfile. CI verifies the same result before the publisher can run.

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

Make the source directory satisfy the exportable package contract above. Then run
`pnpm sync:repository-exports` and `pnpm check:repository-exports`.

Install the publisher GitHub App on the new target repository. The workflow derives its target
repository list from the same configuration, so the workflow file does not need a second list.

The target branch must exist before the first publish. Protect it from manual writes and allow the
publisher App to update it.

Before a private target becomes public, audit all branches, tags, commits, pull requests, comments,
and author metadata. Repository exports preserve existing target history.
