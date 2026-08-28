# Sidebars package publishing

Date: 2026-08-28

Status: Decision record

## Use a private Git mirror now

`packages/sidebars` remains the source of truth. The exact mirror target is the private
[`samebase/sidebars`](https://github.com/samebase/sidebars) repository on its `main` branch. The
repository exporter copies the committed `packages/sidebars` tree after the required `main` checks
pass. The mirror is generated source output. It is not the package install source.

Each Sidebars public subpath export has a `samebase-source` condition that points to its file under
`src`. The JavaScript entry points use compiled files under `dist` for their normal `types`,
`import`, and `default` conditions. The stylesheet uses `dist/structure.css` for its normal
`default` condition. Monorepo TypeScript and Vite configurations enable `samebase-source`, so local
work does not require a prior package build. A consumer outside the monorepo does not enable that
condition and receives compiled files.

`pnpm run test:package` is the release proof. It builds the package, then runs
`packages/sidebars/scripts/check-packed-consumer.ts`. The script creates the same tarball format
that a registry stores and installs that tarball in an isolated consumer. The consumer must
type-check and build through the public package subpaths. It must not read the monorepo source tree.
npm documents that a registry package resolves to a
[package tarball](https://docs.npmjs.com/cli/v11/using-npm/package-spec/).

## Publish one private npm package later

This machine is not authenticated to npm. Its unauthenticated lookup for `@samebase/sidebars`
returns 404. That response does not prove that the name is available. Before the first publish, an
authenticated Samebase maintainer must confirm the package name and paid private-package access for
the `@samebase` npm organization.

The next distribution step is a private `@samebase/sidebars` package on npmjs.com. Publish the first
verified tarball manually with `npm publish <tarball> --access restricted` and a maintainer's
two-factor authentication. Scoped packages use restricted access by default, as described in the
[npm organization package guide](https://docs.npmjs.com/creating-and-publishing-an-organization-scoped-package/).
Remove the package manifest's workspace-only `private: true` guard only when this registry phase
starts.

This first publish is the only manual bootstrap publish. npm requires the package to exist before a
maintainer can configure a trusted publisher. After the bootstrap publish, configure npm trusted
publishing for the release workflow in `samebase/sidebars`. The workflow then publishes with OIDC
and no long-lived write token. See the
[`npm trust` prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/) and the
[trusted publishing guide](https://docs.npmjs.com/trusted-publishers/).

While the package is private, Scout gets a granular npm token with read-only access to
`@samebase/sidebars`. The token must not have write access or the option to bypass two-factor
authentication. npm recommends a read-only granular token for a CI system that only installs private
packages. See
[Using private packages in a CI workflow](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow/).

## Make both outputs public together

Before the public release, audit every branch, tag, commit, pull request, comment, workflow log, and
artifact in `samebase/sidebars`. GitHub states that the code and Actions history become visible when
a private repository becomes public. See
[Setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

After the audit, make `samebase/sidebars` public. Then run
`npm access set status=public @samebase/sidebars` and remove Scout's install token and private npm
configuration. The package name and registry do not change. The
[`npm access` reference](https://docs.npmjs.com/cli/v12/commands/npm-access/) defines the visibility
change. Future trusted publishes can include npm provenance after both the repository and the
package are public. Private repositories do not meet npm's provenance requirements.

## Do not use GitHub Packages

GitHub Packages adds a second npm registry and another authentication model before the package can
be public on npmjs.com. GitHub's npm registry requires a personal access token with the classic
`read:packages` scope to install a package outside an authorized GitHub Actions workflow. The same
authentication requirement applies to public packages. See
[Working with the npm registry on GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

That choice would make Scout keep GitHub package credentials and scope-specific registry
configuration. A later move to npmjs.com would also change the install source. The private npmjs.com
package reaches the intended public registry without that extra move.

## Do not use a Git dependency

A Git dependency makes the private mirror an install source. npm then needs Git and repository
credentials on each private consumer. A dependency without an exact Git reference follows the
repository's default branch. If the repository has a `prepare` script, npm installs its development
dependencies and runs that script before installation. See the
[Git dependency behavior in `npm install`](https://docs.npmjs.com/cli/v11/commands/npm-install/).

That process proves a source checkout and a consumer-side build. It does not prove the compiled
tarball that will ship through npmjs.com. Keep the mirror for source access and use the checked
tarball for package installation.

## No specification change

This decision changes package distribution and monorepo resolution only. It does not change the
sidebar runtime, public API behavior, product data, authorization, or compliance rules. The current
sidebar specifications remain unchanged. This research record holds the publishing evidence and the
transition decision.

## Risks and controls

- A private npm install token is still a secret. Give Scout the shortest practical token lifetime
  and only read access to the package.
- npm does not generate provenance for a package from a private repository. Accept that limit only
  during the private phase.
- The Git mirror and the npm tarball can drift. Build and check the tarball from the exact mirror
  commit selected for release.
- A public repository exposes its complete reachable history and its Actions logs. Complete the
  audit before the visibility change.
