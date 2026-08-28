# Sidebars package publishing

Date: 2026-08-28

Status: Decision record

## Use a private repository export now

`packages/sidebars` remains the source of truth. The exact export target is the private
[`samebase/sidebars`](https://github.com/samebase/sidebars) repository on its `main` branch. The
repository exporter copies the committed `packages/sidebars` tree after the required `main` checks
pass. The external repository is generated output. It is not the package install source.

Each Sidebars public subpath export has a `samebase-source` condition that points to its file under
`src`. The JavaScript entry points use declarations and compiled files under `dist` for their normal
`types` and `default` conditions. The stylesheet uses `dist/structure.css` for its normal `default`
condition. Monorepo TypeScript and Vite configurations enable `samebase-source`, so local work does
not require a prior package build. A consumer outside the monorepo does not enable that condition
and receives compiled files.

`pnpm run test:package` is the release proof. It builds the package, then runs
`packages/sidebars/scripts/check-packed-consumer.ts`. The script creates the same tarball format
that a registry stores and installs that tarball in an isolated consumer. The consumer must
type-check and build through the public package subpaths. It must not read the monorepo source tree.
npm documents that a registry package resolves to a
[package tarball](https://docs.npmjs.com/cli/v11/using-npm/package-spec/).

The package does not declare consumer `engines`. Its browser output targets ES2020. `.node-version`
and `packageManager` select the tools used to develop, verify, and publish the package without
claiming that consuming applications need the same Node or pnpm versions.

## Publish the first public npm package

This machine is not authenticated to npm. Its unauthenticated lookup for `@samebase/sidebars`
returns 404. That response does not prove that the name is available. Before the first publish, an
authenticated Samebase maintainer must confirm the package name and access to the `@samebase` npm
organization. Public organization-scoped packages do not require a paid private-package plan. npm
requires an npm account and organization for an organization-scoped public package. See
[Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

The first `@samebase/sidebars` release on npmjs.com is public version `0.1.0-canary.0` under the
`canary` tag. Its release pull request removes `private: true` and sets npmjs.com plus public access
in `publishConfig`. Publish the verified tarball with
`npm publish <tarball> --access public --tag canary` and a maintainer's two-factor authentication.
npm requires explicit public access when publishing a scoped public package. The release pull
request must also remove the README link to the example in the private monorepo so every published
link is available to public npm users.

This first publish is the only manual bootstrap publish. npm requires the package to exist before a
maintainer can configure a trusted publisher. After the bootstrap publish, configure npm trusted
publishing for the release workflow in `samebase/sidebars`. The workflow then publishes with OIDC
and no long-lived write token. See the
[`npm trust` prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/) and the
[trusted publishing guide](https://docs.npmjs.com/trusted-publishers/).

Trusted publishing works while the GitHub repository is private. npm will not create provenance for
a package published from a private source repository, even when the package is public. Trusted
publishing still provides short-lived workflow authentication. It needs npm 11.5.1 or later, Node
22.14.0 or later, a GitHub-hosted runner, and `id-token: write` permission.

Scout installs an exact public npm version without an npm token or private registry configuration.

## Keep the source repository private at first

The public npm package and private GitHub repository have independent visibility. The public npm
tarball exposes every packed file. The current package includes compiled output, declarations,
source files, the README, and the MIT License. The private repository still hides unreleased
commits, branches, pull requests, comments, workflows, logs, and other repository data.

Before making the repository public, audit every branch, tag, commit, pull request, comment,
workflow log, and artifact in `samebase/sidebars`. GitHub states that the code and Actions history
become visible when a private repository becomes public. See
[Setting repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

After the audit, make `samebase/sidebars` public. The npm package remains public and Scout's install
configuration does not change. Future trusted publishes can include npm provenance after the source
repository is public.

## Use the MIT License

Sidebars is a reusable public library under the MIT License. MIT permits use, modification,
distribution, sublicensing, and sale when copies or substantial portions retain the copyright and
license notice. The app template keeps its existing Apache-2.0 license. Apache-2.0 adds an explicit
patent grant and more redistribution requirements. Sidebars does not need those additional terms for
its first release.

## Do not use GitHub Packages

GitHub Packages adds a second npm registry and another authentication model before the package can
be public on npmjs.com. GitHub's npm registry requires a personal access token with the classic
`read:packages` scope to install a package outside an authorized GitHub Actions workflow. The same
authentication requirement applies to public packages. See
[Working with the npm registry on GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

That choice would make Scout keep GitHub package credentials and scope-specific registry
configuration. The public npmjs.com package needs no consumer credential and is already the intended
long-term install source.

## Do not use a Git dependency

A Git dependency makes the private repository export an install source. npm then needs Git and
repository credentials on each private consumer. A dependency without an exact Git reference follows
the repository's default branch. If the repository has a `prepare` script, npm installs its
development dependencies and runs that script before installation. See the
[Git dependency behavior in `npm install`](https://docs.npmjs.com/cli/v11/commands/npm-install/).

That process proves a source checkout and a consumer-side build. It does not prove the compiled
tarball that will ship through npmjs.com. Keep the repository export for source access and use the
checked tarball for package installation.

## No specification change

This decision changes package distribution and monorepo resolution only. It does not change the
sidebar runtime, public API behavior, product data, authorization, or compliance rules. The current
sidebar specifications remain unchanged. This research record holds the publishing evidence and the
transition decision.

## Risks and controls

- A public npm package exposes every packed file. Inspect the exact tarball before the first
  publish.
- A published name and version cannot be reused. The first release uses version `0.1.0-canary.0`
  under the `canary` tag. The first `latest` release uses version `0.1.0` only after trusted
  publishing and external installation pass.
- npm does not generate provenance for a package from a private repository. Accept that limit while
  the source repository remains private.
- The repository export and the npm tarball can drift. Build and check the tarball from the exact
  exported commit selected for release.
- A public repository exposes its complete reachable history and its Actions logs. Complete the
  audit before the visibility change.
